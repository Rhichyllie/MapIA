import { inferDependentSideFromCardinality, isOneToOne } from "./cardinality";
import { suggestFieldName } from "./naming";
import type {
  ErdCardinality,
  ErdEntityRef,
  ErdField,
  ErdNamingStyle,
  ErdRelationRef,
} from "./types";

function countFields(entity: ErdEntityRef | undefined) {
  return entity?.payload.fields.length ?? 0;
}

function hasPrimaryKey(entity: ErdEntityRef | undefined) {
  return Boolean(entity?.payload.fields.some((field) => field.flags.includes("PK")));
}

function normalizeKey(value: string) {
  return value.replace(/[^a-zA-Z0-9]+/g, "").toLowerCase();
}

export function inferDependentSide(input: {
  relation: Pick<ErdRelationRef, "sourceEntityId" | "targetEntityId" | "payload">;
  sourceEntity?: ErdEntityRef;
  targetEntity?: ErdEntityRef;
}): "source" | "target" {
  const fromCardinality = inferDependentSideFromCardinality(input.relation.payload.cardinality);
  if (fromCardinality) {
    return fromCardinality;
  }

  if (isOneToOne(input.relation.payload.cardinality)) {
    const sourceFields = countFields(input.sourceEntity);
    const targetFields = countFields(input.targetEntity);

    if (!hasPrimaryKey(input.sourceEntity) && hasPrimaryKey(input.targetEntity)) {
      return "source";
    }
    if (!hasPrimaryKey(input.targetEntity) && hasPrimaryKey(input.sourceEntity)) {
      return "target";
    }

    if (sourceFields !== targetFields) {
      return sourceFields <= targetFields ? "source" : "target";
    }
  }

  return "target";
}

export function inferFkFieldName(input: {
  referencesEntityLabel?: string;
  namingStyle: ErdNamingStyle;
}) {
  return suggestFieldName({
    sourceEntityLabel: input.referencesEntityLabel,
    namingStyle: input.namingStyle,
  });
}

export function findExistingFkField(input: {
  entity: ErdEntityRef;
  referencesEntityId: string;
  desiredName?: string;
}) {
  const desiredKey = input.desiredName ? normalizeKey(input.desiredName) : undefined;

  return input.entity.payload.fields.find((field) => {
    const byReference = field.references?.entityId === input.referencesEntityId;
    const byName = desiredKey ? normalizeKey(field.name) === desiredKey : false;
    return byReference || byName;
  });
}

export function buildNewFkField(input: {
  fieldId: string;
  fieldName: string;
  type: string;
  referencesEntityId: string;
  relationEdgeId: string;
  required: boolean;
}): ErdField {
  return {
    id: input.fieldId,
    name: input.fieldName,
    type: input.type,
    flags: ["FK", input.required ? "NOT_NULL" : "NULLABLE"],
    references: {
      entityId: input.referencesEntityId,
      relationEdgeId: input.relationEdgeId,
    },
  };
}

export function reconcileExistingFkField(input: {
  field: ErdField;
  relationEdgeId: string;
  referencesEntityId: string;
  required: boolean;
  unique: boolean;
}) {
  const flags = new Set(input.field.flags);
  flags.add("FK");

  if (input.required) {
    flags.add("NOT_NULL");
    flags.delete("NULLABLE");
  } else if (!flags.has("NOT_NULL")) {
    flags.add("NULLABLE");
  }

  if (input.unique) {
    flags.add("UQ");
  }

  return {
    ...input.field,
    flags: [...flags],
    references: {
      entityId: input.referencesEntityId,
      ...(input.field.references?.fieldId ? { fieldId: input.field.references.fieldId } : {}),
      relationEdgeId: input.relationEdgeId,
    },
  };
}

export function relationRequiredByCardinality(input: {
  side: "source" | "target";
  cardinality: ErdCardinality | undefined;
}) {
  if (!input.cardinality) {
    return false;
  }

  if (input.side === "source") {
    return input.cardinality.minSource === 1;
  }

  return input.cardinality.minTarget === 1;
}
