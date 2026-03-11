import { erdCardinalityToPreset, isManyToMany, isOneToOne } from "./cardinality";
import {
  buildConvertToAssociativeFix,
  buildMaterializeFkFix,
  buildMissingPrimaryKeyFix,
  buildOneToOneUniqueFix,
} from "./autofix";
import { makeErdDiagnostic, severityByValidationLevel } from "./diagnostics";
import type {
  ErdAffectedSubgraph,
  ErdDiagnostic,
  ErdEntityRef,
  ErdGraph,
  ErdIndexes,
  ErdPolicyConfig,
  ErdRelationRef,
} from "./types";

function getEntityDisplayName(entity: ErdEntityRef) {
  const label = entity.label?.trim();
  if (label) {
    return label;
  }

  const tableName = entity.payload.tableName?.trim();
  if (tableName) {
    return tableName;
  }

  return entity.id;
}

export function buildErdIndexes(graph: ErdGraph): ErdIndexes {
  const entityById = new Map(graph.entities.map((entity) => [entity.id, entity]));
  const fieldsByEntityId = new Map(
    graph.entities.map((entity) => [entity.id, entity.payload.fields]),
  );
  const relationsByEntityId = new Map<string, ErdRelationRef[]>();
  const adjacency = new Map<string, Set<string>>();

  for (const entity of graph.entities) {
    relationsByEntityId.set(entity.id, []);
    adjacency.set(entity.id, new Set());
  }

  for (const relation of graph.relations) {
    relationsByEntityId.get(relation.sourceEntityId)?.push(relation);
    relationsByEntityId.get(relation.targetEntityId)?.push(relation);
    adjacency.get(relation.sourceEntityId)?.add(relation.targetEntityId);
    adjacency.get(relation.targetEntityId)?.add(relation.sourceEntityId);
  }

  return {
    entityById,
    fieldsByEntityId,
    relationsByEntityId,
    adjacency,
  };
}

export function computeAffectedSubgraph(input: {
  indexes: ErdIndexes;
  changedEntityIds?: Iterable<string>;
  changedRelationIds?: Iterable<string>;
}) {
  const relationById = new Map<string, ErdRelationRef>();
  for (const relations of input.indexes.relationsByEntityId.values()) {
    for (const relation of relations) {
      relationById.set(relation.id, relation);
    }
  }

  const entityIds = new Set<string>();
  const relationIds = new Set<string>();

  for (const entityId of input.changedEntityIds ?? []) {
    if (!input.indexes.entityById.has(entityId)) {
      continue;
    }
    entityIds.add(entityId);
  }

  for (const relationId of input.changedRelationIds ?? []) {
    const relation = relationById.get(relationId);
    if (!relation) {
      continue;
    }
    relationIds.add(relation.id);
    entityIds.add(relation.sourceEntityId);
    entityIds.add(relation.targetEntityId);
  }

  for (const entityId of [...entityIds]) {
    const relations = input.indexes.relationsByEntityId.get(entityId) ?? [];
    for (const relation of relations) {
      relationIds.add(relation.id);
      entityIds.add(relation.sourceEntityId);
      entityIds.add(relation.targetEntityId);
    }
  }

  return {
    entityIds,
    relationIds,
  } satisfies ErdAffectedSubgraph;
}

function relationMaterializedAsFk(relation: ErdRelationRef) {
  return relation.payload.materialization?.mode === "fk";
}

function validateEntities(input: {
  graph: ErdGraph;
  policy: ErdPolicyConfig;
  diagnostics: ErdDiagnostic[];
  indexes: ErdIndexes;
}) {
  for (const entity of input.graph.entities) {
    const entityName = entity.label?.trim() || entity.payload.tableName?.trim() || "";
    if (!entityName) {
      input.diagnostics.push(
        makeErdDiagnostic({
          index: input.diagnostics.length,
          code: "ERD_ENTITY_MISSING_NAME",
          severity: severityByValidationLevel({
            level: input.policy.validationLevel,
            guided: "warning",
            strict: "error",
            draft: "info",
          }),
          message: "Entidade sem nome definido.",
          explanation: "Defina um nome para manter navegacao e exportacao consistentes.",
          target: { type: "entity", entityId: entity.id },
        }),
      );
    }

    const hasPk = entity.payload.fields.some((field) => field.flags.includes("PK"));
    if (!hasPk) {
      const strictRequiresPk =
        input.policy.validationLevel === "strict" &&
        input.policy.requirePrimaryKeyInStrict;
      input.diagnostics.push(
        makeErdDiagnostic({
          index: input.diagnostics.length,
          code: "ERD_ENTITY_MISSING_PK",
          severity: strictRequiresPk
            ? "error"
            : severityByValidationLevel({
                level: input.policy.validationLevel,
                guided: "warning",
                strict: "warning",
                draft: "info",
              }),
          message: `Entidade '${getEntityDisplayName(entity)}' sem chave primaria.`,
          explanation: "Entidades sem PK dificultam materializacao de FKs e exportacao.",
          target: { type: "entity", entityId: entity.id },
          suggestedFixes: [buildMissingPrimaryKeyFix({ entity })],
        }),
      );
    }

    for (const field of entity.payload.fields) {
      if (!field.type?.trim()) {
        input.diagnostics.push(
          makeErdDiagnostic({
            index: input.diagnostics.length,
            code: "ERD_FIELD_MISSING_TYPE",
            severity: severityByValidationLevel({
              level: input.policy.validationLevel,
              guided: "warning",
              strict: "error",
              draft: "info",
            }),
            message: `Campo '${field.name}' sem tipo em '${getEntityDisplayName(entity)}'.`,
            explanation: "Campos sem tipo impedem materializacao segura e exportacao formal.",
            target: { type: "field", entityId: entity.id, fieldId: field.id },
          }),
        );
      }

      if (!field.flags.includes("FK")) {
        continue;
      }

      const referencesEntityId = field.references?.entityId;
      if (!referencesEntityId) {
        input.diagnostics.push(
          makeErdDiagnostic({
            index: input.diagnostics.length,
            code: "ERD_FIELD_FK_REFERENCE_MISSING",
            severity: severityByValidationLevel({
              level: input.policy.validationLevel,
              guided: "warning",
              strict: "error",
              draft: "info",
            }),
            message: `Campo FK '${field.name}' sem entidade de referencia.`,
            explanation: "Campos FK devem apontar para uma entidade valida do grafo.",
            target: { type: "field", entityId: entity.id, fieldId: field.id },
          }),
        );
        continue;
      }

      const referencedEntity = input.indexes.entityById.get(referencesEntityId);
      if (!referencedEntity) {
        input.diagnostics.push(
          makeErdDiagnostic({
            index: input.diagnostics.length,
            code: "ERD_FIELD_FK_REFERENCE_INVALID",
            severity: "error",
            message: `Campo FK '${field.name}' aponta para entidade inexistente.`,
            explanation: "A referencia precisa apontar para uma entidade presente no snapshot.",
            target: { type: "field", entityId: entity.id, fieldId: field.id },
          }),
        );
      }
    }
  }
}

function validateRelations(input: {
  graph: ErdGraph;
  policy: ErdPolicyConfig;
  diagnostics: ErdDiagnostic[];
  indexes: ErdIndexes;
}) {
  for (const relation of input.graph.relations) {
    const sourceEntity = input.indexes.entityById.get(relation.sourceEntityId);
    const targetEntity = input.indexes.entityById.get(relation.targetEntityId);
    if (!sourceEntity || !targetEntity) {
      input.diagnostics.push(
        makeErdDiagnostic({
          index: input.diagnostics.length,
          code: "ERD_REL_ENDPOINT_MISSING",
          severity: "error",
          message: "Relacao aponta para entidade inexistente.",
          explanation: "Atualize a relacao ou restaure as entidades antes de exportar.",
          target: { type: "relation", relationId: relation.id },
        }),
      );
      continue;
    }

    const preset = erdCardinalityToPreset(relation.payload.cardinality);
    if (!relation.payload.cardinality) {
      input.diagnostics.push(
        makeErdDiagnostic({
          index: input.diagnostics.length,
          code: "ERD_REL_MISSING_CARDINALITY",
          severity: severityByValidationLevel({
            level: input.policy.validationLevel,
            guided: "warning",
            strict: "error",
            draft: "info",
          }),
          message: "Relacao sem cardinalidade formal.",
          explanation: "Defina min/max para origem e destino (ex.: 0..1 - 1..N).",
          target: { type: "relation", relationId: relation.id },
        }),
      );
      continue;
    }

    if (preset === "1:N" || preset === "N:1") {
      if (!relationMaterializedAsFk(relation)) {
        input.diagnostics.push(
          makeErdDiagnostic({
            index: input.diagnostics.length,
            code: "ERD_REL_1N_MISSING_FK",
            severity: severityByValidationLevel({
              level: input.policy.validationLevel,
              guided: "warning",
              strict: "error",
              draft: "info",
            }),
            message: `Relacao ${preset} sem FK materializada.`,
            explanation: "Materialize FK no lado dependente para refletir a cardinalidade.",
            target: { type: "relation", relationId: relation.id },
            suggestedFixes: [
              buildMaterializeFkFix({
                relation,
                sourceEntity,
                targetEntity,
                policy: input.policy,
              }),
            ],
          }),
        );
      }
    }

    if (isOneToOne(relation.payload.cardinality) && relationMaterializedAsFk(relation)) {
      const uniqueMissing = relation.payload.materialization?.mode === "fk"
        ? relation.payload.materialization.fk.unique !== true
        : false;
      if (uniqueMissing) {
        const uniqueFix = buildOneToOneUniqueFix({
          relation,
          sourceEntity,
          targetEntity,
        });

        input.diagnostics.push(
          makeErdDiagnostic({
            index: input.diagnostics.length,
            code: "ERD_REL_11_MISSING_UNIQUE",
            severity: severityByValidationLevel({
              level: input.policy.validationLevel,
              guided: "warning",
              strict: "error",
              draft: "info",
            }),
            message: "Relacao 1:1 sem UNIQUE no FK.",
            explanation: "Sem UNIQUE, a relacao vira 1:N na camada fisica.",
            target: { type: "relation", relationId: relation.id },
            suggestedFixes: uniqueFix ? [uniqueFix] : [],
          }),
        );
      }
    }

    if (isManyToMany(relation.payload.cardinality)) {
      const isAssociative = relation.payload.materialization?.mode === "associative";
      const isExplicitConceptual =
        relation.payload.materialization?.mode === "conceptual";

      if (!isAssociative) {
        const strictAllowsConceptual =
          input.policy.validationLevel === "strict" &&
          input.policy.allowConceptualRelations &&
          isExplicitConceptual;

        const severity = strictAllowsConceptual
          ? "warning"
          : severityByValidationLevel({
              level: input.policy.validationLevel,
              guided: "suggestion",
              strict: "error",
              draft: "suggestion",
            });
        const code =
          input.policy.validationLevel === "strict" && !strictAllowsConceptual
            ? "ERD_REL_NN_STRICT_REQUIRES_ASSOCIATIVE"
            : "ERD_REL_NN_ASSOCIATIVE_SUGGESTED";

        const associativeFix = buildConvertToAssociativeFix({
          relation,
          sourceEntity,
          targetEntity,
          policy: input.policy,
        });
        input.diagnostics.push(
          makeErdDiagnostic({
            index: input.diagnostics.length,
            code,
            severity,
            message: "Relacao N:N direta detectada.",
            explanation:
              "Considere converter para entidade associativa para modelagem e exportacao mais explicitas.",
            target: { type: "relation", relationId: relation.id },
            suggestedFixes: associativeFix ? [associativeFix] : [],
          }),
        );
      }
    }

    if (relation.payload.materialization?.mode === "fk") {
      const fk = relation.payload.materialization.fk;
      const dependentEntity = input.indexes.entityById.get(fk.dependentEntityId);
      const referencesEntity = input.indexes.entityById.get(fk.referencesEntityId);

      if (!dependentEntity || !referencesEntity) {
        input.diagnostics.push(
          makeErdDiagnostic({
            index: input.diagnostics.length,
            code: "ERD_REL_FK_ENTITY_MISSING",
            severity: "error",
            message: "Materializacao FK referencia entidade inexistente.",
            explanation: "Revise os IDs de entidade no bloco de materializacao.",
            target: { type: "relation", relationId: relation.id },
          }),
        );
        continue;
      }

      for (const fkFieldId of fk.fkFieldIds) {
        const fkField = dependentEntity.payload.fields.find((field) => field.id === fkFieldId);
        if (!fkField) {
          input.diagnostics.push(
            makeErdDiagnostic({
              index: input.diagnostics.length,
              code: "ERD_REL_FK_FIELD_MISSING",
              severity: severityByValidationLevel({
                level: input.policy.validationLevel,
                guided: "warning",
                strict: "error",
                draft: "info",
              }),
              message: "FK materializada aponta para campo inexistente.",
              explanation: "Crie ou mapeie o campo FK no lado dependente.",
              target: { type: "relation", relationId: relation.id },
            }),
          );
          continue;
        }

        if (!fkField.flags.includes("FK")) {
          input.diagnostics.push(
            makeErdDiagnostic({
              index: input.diagnostics.length,
              code: "ERD_REL_FK_FIELD_FLAG_MISSING",
              severity: severityByValidationLevel({
                level: input.policy.validationLevel,
                guided: "warning",
                strict: "error",
                draft: "info",
              }),
              message: `Campo '${fkField.name}' deve ter flag FK.`,
              explanation: "Mantenha flag FK para coerencia entre payload e materializacao.",
              target: { type: "relation", relationId: relation.id },
            }),
          );
        }
      }
    }
  }
}

export function validateErdGraphFull(input: {
  graph: ErdGraph;
  policy: ErdPolicyConfig;
}) {
  const indexes = buildErdIndexes(input.graph);
  const diagnostics: ErdDiagnostic[] = [];

  validateEntities({
    graph: input.graph,
    policy: input.policy,
    diagnostics,
    indexes,
  });
  validateRelations({
    graph: input.graph,
    policy: input.policy,
    diagnostics,
    indexes,
  });

  return {
    diagnostics,
    indexes,
  };
}

export function validateErdGraphIncremental(input: {
  graph: ErdGraph;
  policy: ErdPolicyConfig;
  changedEntityIds?: Iterable<string>;
  changedRelationIds?: Iterable<string>;
}) {
  const full = validateErdGraphFull({
    graph: input.graph,
    policy: input.policy,
  });
  const affected = computeAffectedSubgraph({
    indexes: full.indexes,
    changedEntityIds: input.changedEntityIds,
    changedRelationIds: input.changedRelationIds,
  });

  const diagnostics = full.diagnostics.filter((diagnostic) => {
    if (diagnostic.target.type === "graph") {
      return true;
    }
    if (diagnostic.target.type === "relation") {
      return affected.relationIds.has(diagnostic.target.relationId);
    }
    if (diagnostic.target.type === "entity") {
      return affected.entityIds.has(diagnostic.target.entityId);
    }

    return affected.entityIds.has(diagnostic.target.entityId);
  });

  return {
    diagnostics,
    indexes: full.indexes,
    affected,
  };
}
