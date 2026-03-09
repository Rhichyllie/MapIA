import { createHash } from "node:crypto";
import type { ExternalRef } from "@/src/domain";

export type PrismaSchemaFileExternalRefLocator = {
  sourceKind: "prisma-schema-file";
  filePath: string;
  modelName?: string;
  fieldName?: string;
  relationName?: string;
};

export type PostgresLiveExternalRefLocator = {
  sourceKind: "postgres-live";
  schema: string;
  table: string;
  column?: string;
  constraint?: string;
};

export type ImportExternalRefLocator =
  | PrismaSchemaFileExternalRefLocator
  | PostgresLiveExternalRefLocator;

export type PrismaSchemaFileImportExternalRefContext = {
  sourceKind: "prisma-schema-file";
  filePath: string;
};

export type PostgresLiveModelExternalOrigin = {
  schema: string;
  table: string;
};

export type PostgresLiveRelationExternalOrigin = {
  schema: string;
  table: string;
  column?: string;
  constraint?: string;
};

export type PostgresLiveImportExternalRefContext = {
  sourceKind: "postgres-live";
  modelsByModelName: Record<string, PostgresLiveModelExternalOrigin>;
  relationsByRelationName: Record<string, PostgresLiveRelationExternalOrigin>;
};

export type ImportExternalRefContext =
  | PrismaSchemaFileImportExternalRefContext
  | PostgresLiveImportExternalRefContext;

export type ImportedExternalSystem = "prisma" | "postgres";

export type ImportedExternalRef = ExternalRef & {
  system: ImportedExternalSystem;
  locator: ImportExternalRefLocator;
};

export function buildPostgresImportedRelationName(params: {
  schema: string;
  table: string;
  constraint: string;
}) {
  return `fk_${params.schema}_${params.table}_${params.constraint}`;
}

export function deterministicUuidFromParts(parts: readonly string[]): string {
  const bytes = createHash("sha256").update(parts.join("::")).digest().subarray(0, 16);

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

function toImportedExternalSystem(
  sourceKind: ImportExternalRefLocator["sourceKind"],
): ImportedExternalSystem {
  switch (sourceKind) {
    case "prisma-schema-file":
      return "prisma";
    case "postgres-live":
      return "postgres";
  }
}

function normalizeFilePathForLocator(filePath: string) {
  return filePath.replace(/\\/g, "/");
}

function serializeLocator(locator: ImportExternalRefLocator) {
  // Field order is intentionally stable to preserve deterministic externalId/id generation.
  // Reordering keys here changes import traceability identifiers for the same source element.
  const entries =
    locator.sourceKind === "prisma-schema-file"
      ? [
          ["sourceKind", locator.sourceKind],
          ["filePath", locator.filePath],
          ["modelName", locator.modelName],
          ["fieldName", locator.fieldName],
          ["relationName", locator.relationName],
        ]
      : [
          ["sourceKind", locator.sourceKind],
          ["schema", locator.schema],
          ["table", locator.table],
          ["column", locator.column],
          ["constraint", locator.constraint],
        ];

  return entries
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");
}

function dedupeExternalRefs(refs: readonly ExternalRef[]): ExternalRef[] {
  const seenExternalIds = new Set<string>();
  const deduped: ExternalRef[] = [];

  for (const ref of refs) {
    if (seenExternalIds.has(ref.externalId)) {
      continue;
    }

    seenExternalIds.add(ref.externalId);
    deduped.push(ref);
  }

  return deduped;
}

function isOptionalString(value: unknown): value is string | undefined {
  return typeof value === "undefined" || typeof value === "string";
}

function isImportExternalRefLocator(value: unknown): value is ImportExternalRefLocator {
  if (!value || typeof value !== "object") {
    return false;
  }

  const locator = value as Record<string, unknown>;

  if (locator.sourceKind === "prisma-schema-file") {
    return (
      typeof locator.filePath === "string" &&
      isOptionalString(locator.modelName) &&
      isOptionalString(locator.fieldName) &&
      isOptionalString(locator.relationName)
    );
  }

  if (locator.sourceKind === "postgres-live") {
    return (
      typeof locator.schema === "string" &&
      typeof locator.table === "string" &&
      isOptionalString(locator.column) &&
      isOptionalString(locator.constraint)
    );
  }

  return false;
}

export function isImportedExternalRef(
  ref: ExternalRef | null | undefined,
): ref is ImportedExternalRef {
  if (!ref) {
    return false;
  }

  const isSupportedSystem = ref.system === "prisma" || ref.system === "postgres";
  if (!isSupportedSystem) {
    return false;
  }

  if (!ref.externalId.startsWith("import:")) {
    return false;
  }

  if (!isImportExternalRefLocator(ref.locator)) {
    return false;
  }

  return ref.system === toImportedExternalSystem(ref.locator.sourceKind);
}

export function isImportedExternalRefFromSystem<TSystem extends ImportedExternalSystem>(
  ref: ExternalRef | null | undefined,
  system: TSystem,
): ref is ImportedExternalRef & { system: TSystem } {
  return isImportedExternalRef(ref) && ref.system === system;
}

export function findPrimaryImportedExternalRef(
  externalRefs: readonly ExternalRef[] | null | undefined,
): ImportedExternalRef | undefined {
  if (!Array.isArray(externalRefs)) {
    return undefined;
  }

  return externalRefs.find((ref): ref is ImportedExternalRef =>
    isImportedExternalRef(ref),
  );
}

function buildExternalRef(locator: ImportExternalRefLocator): ExternalRef {
  const system = toImportedExternalSystem(locator.sourceKind);
  const externalId = `import:${locator.sourceKind}?${serializeLocator(locator)}`;

  return {
    id: deterministicUuidFromParts(["import-external-ref", system, externalId]),
    system,
    externalId,
    locator,
    metadata: {},
  };
}

export function buildImportedNodeExternalRefs(params: {
  modelName: string;
  context?: ImportExternalRefContext;
}): ExternalRef[] {
  const { context } = params;

  if (!context) {
    return [];
  }

  if (context.sourceKind === "prisma-schema-file") {
    return dedupeExternalRefs([
      buildExternalRef({
        sourceKind: "prisma-schema-file",
        filePath: normalizeFilePathForLocator(context.filePath),
        modelName: params.modelName,
      }),
    ]);
  }

  const origin = context.modelsByModelName[params.modelName];
  if (!origin) {
    return [];
  }

  return dedupeExternalRefs([
    buildExternalRef({
      sourceKind: "postgres-live",
      schema: origin.schema,
      table: origin.table,
    }),
  ]);
}

export function buildImportedEdgeExternalRefs(params: {
  sourceModelName: string;
  sourceFieldName: string;
  relationName?: string;
  context?: ImportExternalRefContext;
}): ExternalRef[] {
  const { context } = params;

  if (!context) {
    return [];
  }

  if (context.sourceKind === "prisma-schema-file") {
    return dedupeExternalRefs([
      buildExternalRef({
        sourceKind: "prisma-schema-file",
        filePath: normalizeFilePathForLocator(context.filePath),
        modelName: params.sourceModelName,
        fieldName: params.sourceFieldName,
        ...(params.relationName ? { relationName: params.relationName } : {}),
      }),
    ]);
  }

  if (!params.relationName) {
    return [];
  }

  const origin = context.relationsByRelationName[params.relationName];
  if (!origin) {
    return [];
  }

  return dedupeExternalRefs([
    buildExternalRef({
      sourceKind: "postgres-live",
      schema: origin.schema,
      table: origin.table,
      ...(origin.column ? { column: origin.column } : {}),
      ...(origin.constraint ? { constraint: origin.constraint } : {}),
    }),
  ]);
}
