import { erdCardinalityFromPreset, erdCardinalityToPreset, isManyToMany, isOneToOne } from "./cardinality";
import { inferDependentSide, inferFkFieldName, relationRequiredByCardinality, findExistingFkField, buildNewFkField, reconcileExistingFkField } from "./inference";
import { suggestAssociativeEntityName } from "./naming";
import { normalizeErdEntityPayload, normalizeErdRelationPayload } from "./normalize";
import type {
  ErdDiagnostic,
  ErdEditorCommand,
  ErdEntityRef,
  ErdField,
  ErdFieldFlag,
  ErdPolicyConfig,
  ErdRelationPayload,
  ErdRelationRef,
  ErdSuggestedFix,
} from "./types";

function createId() {
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `erd-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function withMetaRepairApplied(commands: ErdEditorCommand[]): ErdEditorCommand[] {
  return commands.map((command) => ({
    ...command,
    meta: {
      ...(command.meta ?? {}),
      repairApplied: true,
    },
  }));
}

function replaceFieldInEntity(entity: ErdEntityRef, nextField: ErdField) {
  return entity.payload.fields.map((field) => (field.id === nextField.id ? nextField : field));
}

export function buildMissingPrimaryKeyFix(input: {
  entity: ErdEntityRef;
  fieldName?: string;
}): ErdSuggestedFix {
  const payload = normalizeErdEntityPayload(input.entity.payload as unknown as Record<string, unknown>, {
    entityId: input.entity.id,
    fallbackLabel: input.entity.label,
  });
  const idFieldName = input.fieldName?.trim() || "id";
  const idFieldId = `${input.entity.id}-pk-id`;
  const nextField: ErdField = {
    id: idFieldId,
    name: idFieldName,
    type: "uuid",
    flags: ["PK", "NOT_NULL"],
  };
  const nextPayload = {
    ...payload,
    fields: [...payload.fields, nextField],
  };

  return {
    id: `fix:entity-missing-pk:${input.entity.id}`,
    label: "Criar PK padrao",
    description: `Adicionar ${idFieldName} uuid como PK em ${input.entity.label ?? input.entity.id}.`,
    safety: "safe",
    commands: withMetaRepairApplied([
      {
        type: "updateNode",
        nodeId: input.entity.id,
        patch: {
          data: nextPayload as unknown as Record<string, unknown>,
        },
      },
    ]),
  };
}

function resolveReferencedPkFieldIds(entity: ErdEntityRef) {
  const pkFields = entity.payload.fields.filter((field) => field.flags.includes("PK"));
  if (pkFields.length > 0) {
    return pkFields.map((field) => field.id);
  }

  return [];
}

function buildRelationPatchData(payload: ErdRelationPayload) {
  return normalizeErdRelationPayload(payload as unknown as Record<string, unknown>, {
    sourceEntityId: "",
    targetEntityId: "",
  }) as unknown as Record<string, unknown>;
}

export function buildMaterializeFkFix(input: {
  relation: ErdRelationRef;
  sourceEntity: ErdEntityRef;
  targetEntity: ErdEntityRef;
  policy: ErdPolicyConfig;
  preferredDependentSide?: "source" | "target";
}): ErdSuggestedFix {
  const dependentSide =
    input.preferredDependentSide ??
    inferDependentSide({
      relation: input.relation,
      sourceEntity: input.sourceEntity,
      targetEntity: input.targetEntity,
    });
  const dependentEntity =
    dependentSide === "source" ? input.sourceEntity : input.targetEntity;
  const referencesEntity =
    dependentSide === "source" ? input.targetEntity : input.sourceEntity;
  const referencesPkFieldIds = resolveReferencedPkFieldIds(referencesEntity);
  const suggestedFkName = inferFkFieldName({
    referencesEntityLabel: referencesEntity.label,
    namingStyle: input.policy.namingStyle,
  });
  const existingField = findExistingFkField({
    entity: dependentEntity,
    referencesEntityId: referencesEntity.id,
    desiredName: suggestedFkName,
  });
  const fkFieldId = existingField?.id ?? `${dependentEntity.id}-fk-${createId()}`;
  const required = relationRequiredByCardinality({
    side: dependentSide,
    cardinality: input.relation.payload.cardinality,
  });
  const unique = isOneToOne(input.relation.payload.cardinality);
  const fkField = existingField
    ? reconcileExistingFkField({
        field: existingField,
        relationEdgeId: input.relation.id,
        referencesEntityId: referencesEntity.id,
        required,
        unique,
      })
    : buildNewFkField({
        fieldId: fkFieldId,
        fieldName: suggestedFkName,
        type: referencesEntity.payload.fields.find((field) => field.flags.includes("PK"))?.type || "uuid",
        referencesEntityId: referencesEntity.id,
        relationEdgeId: input.relation.id,
        required,
      });
  const nextDependentPayload = {
    ...dependentEntity.payload,
    fields: existingField
      ? replaceFieldInEntity(dependentEntity, fkField)
      : [...dependentEntity.payload.fields, fkField],
  };
  const nextRelationPayload = {
    ...input.relation.payload,
    materialization: {
      mode: "fk" as const,
      dependentSide,
      fk: {
        dependentEntityId: dependentEntity.id,
        fkFieldIds: [fkField.id],
        referencesEntityId: referencesEntity.id,
        referencesFieldIds: referencesPkFieldIds,
        ...(unique ? { unique: true } : {}),
      },
    },
  };

  return {
    id: `fix:materialize-fk:${input.relation.id}:${dependentEntity.id}`,
    label: "Materializar como FK",
    description: `Criar FK em ${dependentEntity.label ?? dependentEntity.id}.${fkField.name}.`,
    safety: "safe",
    commands: withMetaRepairApplied([
      {
        type: "updateNode",
        nodeId: dependentEntity.id,
        patch: {
          data: nextDependentPayload as unknown as Record<string, unknown>,
        },
      },
      {
        type: "updateEdge",
        edgeId: input.relation.id,
        patch: {
          data: buildRelationPatchData(nextRelationPayload),
        },
      },
    ]),
  };
}

export function buildOneToOneUniqueFix(input: {
  relation: ErdRelationRef;
  sourceEntity: ErdEntityRef;
  targetEntity: ErdEntityRef;
}): ErdSuggestedFix | null {
  if (!isOneToOne(input.relation.payload.cardinality)) {
    return null;
  }

  const materialization = input.relation.payload.materialization;
  if (materialization?.mode !== "fk") {
    return null;
  }

  const dependentEntity =
    materialization.dependentSide === "source" ? input.sourceEntity : input.targetEntity;
  const fkFieldId = materialization.fk.fkFieldIds[0];
  if (!fkFieldId) {
    return null;
  }

  const field = dependentEntity.payload.fields.find((candidate) => candidate.id === fkFieldId);
  if (!field) {
    return null;
  }
  if (field.flags.includes("UQ")) {
    return null;
  }

  const nextField: ErdField = {
    ...field,
    flags: [...new Set<ErdFieldFlag>([...field.flags, "UQ"])],
  };
  const nextPayload = {
    ...dependentEntity.payload,
    fields: replaceFieldInEntity(dependentEntity, nextField),
  };
  const nextRelationPayload = {
    ...input.relation.payload,
    materialization: {
      ...materialization,
      fk: {
        ...materialization.fk,
        unique: true,
      },
    },
  };

  return {
    id: `fix:1-1-unique:${input.relation.id}:${fkFieldId}`,
    label: "Aplicar UNIQUE no FK",
    description: `Marcar ${field.name} como UNIQUE para manter relacao 1:1.`,
    safety: "safe",
    commands: withMetaRepairApplied([
      {
        type: "updateNode",
        nodeId: dependentEntity.id,
        patch: {
          data: nextPayload as unknown as Record<string, unknown>,
        },
      },
      {
        type: "updateEdge",
        edgeId: input.relation.id,
        patch: {
          data: buildRelationPatchData(nextRelationPayload),
        },
      },
    ]),
  };
}

export function buildConvertToAssociativeFix(input: {
  relation: ErdRelationRef;
  sourceEntity: ErdEntityRef;
  targetEntity: ErdEntityRef;
  policy: ErdPolicyConfig;
}): ErdSuggestedFix | null {
  if (!isManyToMany(input.relation.payload.cardinality)) {
    return null;
  }

  const joinEntityId = createId();
  const joinEntityName = suggestAssociativeEntityName({
    sourceLabel: input.sourceEntity.label,
    targetLabel: input.targetEntity.label,
  });
  const sourceFkFieldId = createId();
  const targetFkFieldId = createId();
  const useSurrogatePk = input.policy.preferSurrogateKeyInAssociative;
  const joinEntityFields: ErdField[] = [];

  if (useSurrogatePk) {
    joinEntityFields.push({
      id: createId(),
      name: "id",
      type: "uuid",
      flags: ["PK", "NOT_NULL"],
    });
  }

  const sourceFlags: ErdFieldFlag[] = useSurrogatePk
    ? ["FK", "NOT_NULL", "INDEX"]
    : ["PK", "FK", "NOT_NULL"];
  const targetFlags: ErdFieldFlag[] = useSurrogatePk
    ? ["FK", "NOT_NULL", "INDEX"]
    : ["PK", "FK", "NOT_NULL"];

  joinEntityFields.push(
    {
      id: sourceFkFieldId,
      name: `${(input.sourceEntity.label ?? "source").toLowerCase()}Id`,
      type:
        input.sourceEntity.payload.fields.find((field) => field.flags.includes("PK"))?.type ||
        "uuid",
      flags: sourceFlags,
      references: {
        entityId: input.sourceEntity.id,
        relationEdgeId: input.relation.id,
      },
    },
    {
      id: targetFkFieldId,
      name: `${(input.targetEntity.label ?? "target").toLowerCase()}Id`,
      type:
        input.targetEntity.payload.fields.find((field) => field.flags.includes("PK"))?.type ||
        "uuid",
      flags: targetFlags,
      references: {
        entityId: input.targetEntity.id,
        relationEdgeId: input.relation.id,
      },
    },
  );

  const joinPayload = {
    description: `Entidade associativa gerada de ${input.sourceEntity.label ?? input.sourceEntity.id} x ${input.targetEntity.label ?? input.targetEntity.id}.`,
    tableName: joinEntityName,
    fields: joinEntityFields,
  };
  const relationSourceToJoinId = createId();
  const relationTargetToJoinId = createId();
  const sourceToJoinPayload: ErdRelationPayload = {
    name: `${(input.sourceEntity.label ?? "Source").toLowerCase()}To${joinEntityName}`,
    cardinality: erdCardinalityFromPreset("1:N"),
    roles: {
      sourceRole: "hasMany",
      targetRole: "belongsTo",
    },
    materialization: {
      mode: "fk",
      dependentSide: "target",
      fk: {
        dependentEntityId: joinEntityId,
        fkFieldIds: [sourceFkFieldId],
        referencesEntityId: input.sourceEntity.id,
        referencesFieldIds: resolveReferencedPkFieldIds(input.sourceEntity),
      },
    },
  };
  const targetToJoinPayload: ErdRelationPayload = {
    name: `${(input.targetEntity.label ?? "Target").toLowerCase()}To${joinEntityName}`,
    cardinality: erdCardinalityFromPreset("1:N"),
    roles: {
      sourceRole: "hasMany",
      targetRole: "belongsTo",
    },
    materialization: {
      mode: "fk",
      dependentSide: "target",
      fk: {
        dependentEntityId: joinEntityId,
        fkFieldIds: [targetFkFieldId],
        referencesEntityId: input.targetEntity.id,
        referencesFieldIds: resolveReferencedPkFieldIds(input.targetEntity),
      },
    },
  };

  return {
    id: `fix:convert-associative:${input.relation.id}`,
    label: "Converter em associativa",
    description: `Criar ${joinEntityName} e substituir N:N por duas relacoes 1:N.`,
    safety: "safe",
    commands: withMetaRepairApplied([
      {
        type: "addNode",
        node: {
          id: joinEntityId,
          kind: "entity",
          label: joinEntityName,
          position: { x: 0, y: 0 },
          data: joinPayload as unknown as Record<string, unknown>,
        },
      },
      {
        type: "removeEdge",
        edgeId: input.relation.id,
      },
      {
        type: "addEdge",
        edge: {
          id: relationSourceToJoinId,
          sourceNodeId: input.sourceEntity.id,
          targetNodeId: joinEntityId,
          kind: "references",
          label: sourceToJoinPayload.name,
          data: buildRelationPatchData(sourceToJoinPayload),
        },
      },
      {
        type: "addEdge",
        edge: {
          id: relationTargetToJoinId,
          sourceNodeId: input.targetEntity.id,
          targetNodeId: joinEntityId,
          kind: "references",
          label: targetToJoinPayload.name,
          data: buildRelationPatchData(targetToJoinPayload),
        },
      },
    ]),
  };
}

export function collectSafeFixesFromDiagnostics(diagnostics: ErdDiagnostic[]) {
  const seen = new Set<string>();
  const safeFixes: ErdSuggestedFix[] = [];

  for (const diagnostic of diagnostics) {
    for (const fix of diagnostic.suggestedFixes) {
      if (fix.safety !== "safe" || seen.has(fix.id)) {
        continue;
      }

      seen.add(fix.id);
      safeFixes.push(fix);
    }
  }

  return safeFixes;
}

export function buildBatchSafeFixCommands(diagnostics: ErdDiagnostic[]) {
  const safeFixes = collectSafeFixesFromDiagnostics(diagnostics);
  const commands: ErdEditorCommand[] = [];
  const seenCommands = new Set<string>();

  for (const fix of safeFixes) {
    for (const command of fix.commands) {
      const signature = JSON.stringify(command);
      if (seenCommands.has(signature)) {
        continue;
      }
      seenCommands.add(signature);
      commands.push(command);
    }
  }

  return {
    safeFixes,
    commands,
  };
}

export function describeRelationForFix(relation: ErdRelationRef) {
  const preset = erdCardinalityToPreset(relation.payload.cardinality);
  if (preset) {
    return preset;
  }

  return "relacao";
}
