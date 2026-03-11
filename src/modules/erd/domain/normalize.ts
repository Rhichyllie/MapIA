import { erdCardinalityFromPreset, type ErdCardinalityPreset } from "./cardinality";
import { DEFAULT_ERD_POLICY } from "./types";
import type {
  ErdCardinality,
  ErdEntityPayload,
  ErdField,
  ErdFieldFlag,
  ErdPolicyConfig,
  ErdRelationMaterialization,
  ErdRelationPayload,
  ErdReferentialAction,
} from "./types";

type SemanticNodeLike = {
  id: string;
  kind: string;
  label?: string;
  payload?: Record<string, unknown>;
};

type SemanticEdgeLike = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  kind: string;
  label?: string;
  payload?: Record<string, unknown>;
};

function readRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);

  return normalized.length > 0 ? normalized : undefined;
}

function toFieldFlag(value: string): ErdFieldFlag | undefined {
  if (
    value === "PK" ||
    value === "FK" ||
    value === "UQ" ||
    value === "NOT_NULL" ||
    value === "NULLABLE" ||
    value === "INDEX" ||
    value === "AUTO_INCREMENT" ||
    value === "DEFAULT" ||
    value === "DERIVED" ||
    value === "VIRTUAL"
  ) {
    return value;
  }

  return undefined;
}

function normalizeFieldFlags(input: {
  rawFlags: unknown;
  legacyIsId?: boolean;
  legacyIsUnique?: boolean;
  legacyIsOptional?: boolean;
}) {
  const next = new Set<ErdFieldFlag>();
  const rawFlags = Array.isArray(input.rawFlags) ? input.rawFlags : [];

  for (const value of rawFlags) {
    if (typeof value !== "string") {
      continue;
    }

    const normalized = toFieldFlag(value.trim().toUpperCase());
    if (normalized) {
      next.add(normalized);
    }
  }

  if (input.legacyIsId === true) {
    next.add("PK");
  }
  if (input.legacyIsUnique === true) {
    next.add("UQ");
  }
  if (input.legacyIsOptional === false) {
    next.add("NOT_NULL");
    next.delete("NULLABLE");
  }

  return [...next];
}

function normalizeFieldReference(
  raw: Record<string, unknown> | undefined,
): ErdField["references"] | undefined {
  if (!raw) {
    return undefined;
  }

  const entityId = readString(raw.entityId)?.trim();
  if (!entityId) {
    return undefined;
  }

  return {
    entityId,
    ...(readString(raw.fieldId)?.trim() ? { fieldId: readString(raw.fieldId)?.trim() } : {}),
    ...(readString(raw.relationEdgeId)?.trim()
      ? { relationEdgeId: readString(raw.relationEdgeId)?.trim() }
      : {}),
  };
}

function normalizeLegacyField(
  raw: unknown,
  input: { entityId: string; index: number },
): ErdField | null {
  if (typeof raw === "string") {
    const [rawName, rawType] = raw.split(":");
    return {
      id: `${input.entityId}-field-${input.index + 1}`,
      name: rawName?.trim() || `field_${input.index + 1}`,
      type: rawType?.trim() || "",
      flags: [],
    };
  }

  const parsed = readRecord(raw);
  if (!parsed) {
    return null;
  }

  const legacyIsId = parsed.isId === true;
  const legacyIsUnique = parsed.isUnique === true;
  const legacyIsOptional = parsed.isOptional === true ? true : parsed.isOptional === false ? false : undefined;
  const legacyNotNull = parsed.notNull === true;
  const fieldId = readString(parsed.id)?.trim() || `${input.entityId}-field-${input.index + 1}`;
  const name = readString(parsed.name)?.trim() || `field_${input.index + 1}`;
  const type = readString(parsed.type)?.trim() ?? "";
  const description = readString(parsed.description)?.trim();
  const defaultValue = readString(parsed.default)?.trim();
  const references = normalizeFieldReference(readRecord(parsed.references));
  const flags = normalizeFieldFlags({
    rawFlags: parsed.flags,
    legacyIsId,
    legacyIsUnique,
    legacyIsOptional: legacyNotNull ? false : legacyIsOptional,
  });

  return {
    id: fieldId,
    name,
    type,
    flags,
    ...(description ? { description } : {}),
    ...(defaultValue ? { default: defaultValue } : {}),
    ...(references ? { references } : {}),
  };
}

function parseReferentialAction(value: unknown): ErdReferentialAction | undefined {
  if (value === "restrict") {
    return "restrict";
  }
  if (value === "cascade") {
    return "cascade";
  }
  if (value === "setNull" || value === "setnull" || value === "set_null") {
    return "setNull";
  }
  if (value === "noAction" || value === "noaction" || value === "no_action") {
    return "noAction";
  }

  return undefined;
}

export function normalizeErdCardinality(raw: unknown): ErdCardinality | undefined {
  if (raw === "1:1" || raw === "1:N" || raw === "N:1" || raw === "N:N") {
    return erdCardinalityFromPreset(raw);
  }

  const parsed = readRecord(raw);
  if (!parsed) {
    return undefined;
  }

  const minSource = parsed.minSource === 1 ? 1 : parsed.minSource === 0 ? 0 : undefined;
  const minTarget = parsed.minTarget === 1 ? 1 : parsed.minTarget === 0 ? 0 : undefined;
  const maxSource =
    parsed.maxSource === "N" || parsed.maxSource === "n"
      ? "N"
      : parsed.maxSource === 1
        ? 1
        : undefined;
  const maxTarget =
    parsed.maxTarget === "N" || parsed.maxTarget === "n"
      ? "N"
      : parsed.maxTarget === 1
        ? 1
        : undefined;

  if (
    minSource === undefined ||
    minTarget === undefined ||
    maxSource === undefined ||
    maxTarget === undefined
  ) {
    return undefined;
  }

  return {
    minSource,
    maxSource,
    minTarget,
    maxTarget,
  };
}

function normalizeLegacyCardinality(value: unknown): ErdCardinality | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim().toUpperCase() as ErdCardinalityPreset;
  if (trimmed === "1:1" || trimmed === "1:N" || trimmed === "N:1" || trimmed === "N:N") {
    return erdCardinalityFromPreset(trimmed);
  }

  return undefined;
}

function normalizeMaterialization(
  raw: Record<string, unknown> | undefined,
  relationDefaults: { sourceEntityId: string; targetEntityId: string },
): ErdRelationMaterialization {
  const parsed = readRecord(raw?.materialization) ?? raw;

  if (!parsed) {
    return { mode: "conceptual" };
  }

  const mode = readString(parsed.mode)?.trim();
  if (mode === "conceptual") {
    return { mode: "conceptual" };
  }

  if (mode === "fk") {
    const fk = readRecord(parsed.fk);
    const dependentSideRaw = readString(parsed.dependentSide);
    const dependentSide =
      dependentSideRaw === "source" || dependentSideRaw === "target"
        ? dependentSideRaw
        : "source";
    const dependentEntityId =
      readString(fk?.dependentEntityId) ??
      (dependentSide === "source"
        ? relationDefaults.sourceEntityId
        : relationDefaults.targetEntityId);
    const referencesEntityId =
      readString(fk?.referencesEntityId) ??
      (dependentSide === "source"
        ? relationDefaults.targetEntityId
        : relationDefaults.sourceEntityId);
    const fkFieldIds =
      readStringArray(fk?.fkFieldIds) ??
      readStringArray(parsed.fkFieldIds) ??
      [];
    const referencesFieldIds =
      readStringArray(fk?.referencesFieldIds) ??
      readStringArray(parsed.referencesFieldIds) ??
      [];

    return {
      mode: "fk",
      dependentSide,
      fk: {
        dependentEntityId,
        fkFieldIds,
        referencesEntityId,
        referencesFieldIds,
        ...(fk?.unique === true || parsed.unique === true ? { unique: true } : {}),
      },
    };
  }

  if (mode === "associative") {
    const join = readRecord(parsed.join);
    const pkMode = readString(join?.pkMode) === "surrogate" ? "surrogate" : "composite";

    return {
      mode: "associative",
      join: {
        joinEntityId: readString(join?.joinEntityId) ?? "",
        sourceFkFieldIds: readStringArray(join?.sourceFkFieldIds) ?? [],
        targetFkFieldIds: readStringArray(join?.targetFkFieldIds) ?? [],
        pkMode,
      },
    };
  }

  const legacyFkFields = readStringArray(parsed.fkFields);
  const legacyReferences = readStringArray(parsed.references);
  if (legacyFkFields || legacyReferences) {
    return {
      mode: "fk",
      dependentSide: "source",
      fk: {
        dependentEntityId: relationDefaults.sourceEntityId,
        fkFieldIds: legacyFkFields ?? [],
        referencesEntityId: relationDefaults.targetEntityId,
        referencesFieldIds: legacyReferences ?? [],
      },
    };
  }

  return { mode: "conceptual" };
}

function dedupeFieldFlags(field: ErdField): ErdField {
  const flags = [...new Set(field.flags)];
  if (flags.includes("NOT_NULL") && flags.includes("NULLABLE")) {
    return {
      ...field,
      flags: flags.filter((flag) => flag !== "NULLABLE"),
    };
  }

  return {
    ...field,
    flags,
  };
}

export function normalizeErdEntityPayload(
  raw: Record<string, unknown> | undefined,
  input: { entityId: string; fallbackLabel?: string },
): ErdEntityPayload {
  const payload = readRecord(raw) ?? {};
  const rawFields = Array.isArray(payload.fields) ? payload.fields : [];
  const fields = rawFields
    .map((field, index) => normalizeLegacyField(field, { entityId: input.entityId, index }))
    .filter((field): field is ErdField => Boolean(field))
    .map(dedupeFieldFlags);
  const hasPk = fields.some((field) => field.flags.includes("PK"));
  const pkCount = fields.filter((field) => field.flags.includes("PK")).length;
  const semanticRecord = readRecord(payload.semantic);
  const normalizedName =
    readString(semanticRecord?.normalizedName) ??
    input.fallbackLabel?.trim();
  const tableName = readString(payload.tableName)?.trim();

  return {
    ...(readString(payload.description)?.trim()
      ? { description: readString(payload.description)?.trim() }
      : {}),
    ...(readStringArray(payload.tags) ? { tags: readStringArray(payload.tags) } : {}),
    ...(tableName ? { tableName } : {}),
    fields,
    semantic: {
      ...(normalizedName ? { normalizedName } : {}),
      pkKind:
        readString(semanticRecord?.pkKind) === "composite"
          ? "composite"
          : readString(semanticRecord?.pkKind) === "single"
            ? "single"
            : hasPk
              ? pkCount > 1
                ? "composite"
                : "single"
              : "none",
      hasPk,
    },
  };
}

export function normalizeErdRelationPayload(
  raw: Record<string, unknown> | undefined,
  relationDefaults: { sourceEntityId: string; targetEntityId: string },
): ErdRelationPayload {
  const outer = readRecord(raw) ?? {};
  const payload = readRecord(outer.payload) ?? outer;
  const cardinality =
    normalizeErdCardinality(payload.cardinality) ??
    normalizeLegacyCardinality(payload.cardinality);
  const rolesRaw = readRecord(payload.roles);
  const referentialRaw = readRecord(payload.referentialActions);
  const fkLegacy = readRecord(payload.fk);
  const materialization = normalizeMaterialization(payload, relationDefaults);
  const onDelete =
    parseReferentialAction(referentialRaw?.onDelete) ??
    parseReferentialAction(payload.onDelete) ??
    parseReferentialAction(fkLegacy?.onDelete);
  const onUpdate =
    parseReferentialAction(referentialRaw?.onUpdate) ??
    parseReferentialAction(payload.onUpdate) ??
    parseReferentialAction(fkLegacy?.onUpdate);

  return {
    ...(readString(payload.name)?.trim() ? { name: readString(payload.name)?.trim() } : {}),
    ...(readString(payload.description)?.trim()
      ? { description: readString(payload.description)?.trim() }
      : {}),
    ...(cardinality ? { cardinality } : {}),
    ...(payload.identifying === true ? { identifying: true } : {}),
    roles: {
      ...(readString(rolesRaw?.sourceRole)?.trim()
        ? { sourceRole: readString(rolesRaw?.sourceRole)?.trim() }
        : readString(payload.sourceRole)?.trim()
          ? { sourceRole: readString(payload.sourceRole)?.trim() }
          : {}),
      ...(readString(rolesRaw?.targetRole)?.trim()
        ? { targetRole: readString(rolesRaw?.targetRole)?.trim() }
        : readString(payload.targetRole)?.trim()
          ? { targetRole: readString(payload.targetRole)?.trim() }
          : {}),
    },
    materialization,
    referentialActions: {
      ...(onDelete ? { onDelete } : {}),
      ...(onUpdate ? { onUpdate } : {}),
    },
  };
}

export function normalizeErdPolicyFromCustomRules(
  customRulesJson: Record<string, unknown> | undefined,
): ErdPolicyConfig {
  const customRules = readRecord(customRulesJson);
  const erd = readRecord(customRules?.erd);

  return {
    validationLevel:
      readString(erd?.validationLevel) === "draft" ||
      readString(erd?.validationLevel) === "guided" ||
      readString(erd?.validationLevel) === "strict"
        ? (readString(erd?.validationLevel) as ErdPolicyConfig["validationLevel"])
        : DEFAULT_ERD_POLICY.validationLevel,
    namingStyle:
      readString(erd?.namingStyle) === "snake"
        ? "snake"
        : DEFAULT_ERD_POLICY.namingStyle,
    entityCase:
      readString(erd?.entityCase) === "PascalCase"
        ? "PascalCase"
        : DEFAULT_ERD_POLICY.entityCase,
    requirePrimaryKeyInStrict:
      typeof erd?.requirePrimaryKeyInStrict === "boolean"
        ? erd.requirePrimaryKeyInStrict
        : DEFAULT_ERD_POLICY.requirePrimaryKeyInStrict,
    allowConceptualRelations:
      typeof erd?.allowConceptualRelations === "boolean"
        ? erd.allowConceptualRelations
        : DEFAULT_ERD_POLICY.allowConceptualRelations,
    preferSurrogateKeyInAssociative:
      typeof erd?.preferSurrogateKeyInAssociative === "boolean"
        ? erd.preferSurrogateKeyInAssociative
        : DEFAULT_ERD_POLICY.preferSurrogateKeyInAssociative,
  };
}

export function mergeErdPolicyIntoCustomRules(input: {
  customRulesJson: Record<string, unknown> | undefined;
  policyPatch: Partial<ErdPolicyConfig>;
}) {
  const base = readRecord(input.customRulesJson) ?? {};
  const erd = readRecord(base.erd) ?? {};
  const merged = {
    ...normalizeErdPolicyFromCustomRules(base),
    ...input.policyPatch,
  };

  return {
    ...base,
    erd: {
      ...erd,
      ...merged,
    },
  };
}

export function normalizeErdGraphFromSemantic(input: {
  nodes: SemanticNodeLike[];
  edges: SemanticEdgeLike[];
}) {
  const entities = input.nodes
    .filter((node) => node.kind === "entity")
    .map((node) => ({
      id: node.id,
      label: node.label,
      kind: "entity" as const,
      payload: normalizeErdEntityPayload(node.payload, {
        entityId: node.id,
        fallbackLabel: node.label,
      }),
    }));
  const entityIdSet = new Set(entities.map((entity) => entity.id));
  const relations = input.edges
    .filter(
      (edge) =>
        edge.kind === "references" &&
        entityIdSet.has(edge.sourceNodeId) &&
        entityIdSet.has(edge.targetNodeId),
    )
    .map((edge) => ({
      id: edge.id,
      sourceEntityId: edge.sourceNodeId,
      targetEntityId: edge.targetNodeId,
      kind: "references" as const,
      label: edge.label,
      payload: normalizeErdRelationPayload(edge.payload, {
        sourceEntityId: edge.sourceNodeId,
        targetEntityId: edge.targetNodeId,
      }),
    }));

  return {
    entities,
    relations,
  };
}
