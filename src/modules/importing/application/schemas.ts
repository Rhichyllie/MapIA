import { z } from "zod";
import { GraphSnapshotSchema } from "@/src/domain";
import type { ImportExternalRefContext } from "@/src/modules/importing/domain";
import type { ImportIntrospectionArtifact } from "./ports";

export const ImportPrismaSchemaToSnapshotInputSchema = z.object({
  projectId: z.string().uuid(),
  schemaText: z.string(),
});

export const ImportPrismaSchemaFileToSnapshotInputSchema = z.object({
  projectId: z.string().uuid(),
  filePath: z.string().trim().min(1),
  workspaceRoot: z.string().trim().min(1).optional(),
});

export const ImportPostgresToSnapshotInputSchema = z.object({
  projectId: z.string().uuid(),
  schema: z.string().trim().min(1).optional(),
});

export const PrismaSchemaImportSummarySchema = z.object({
  modelsCount: z.number().int().nonnegative(),
  relationsCount: z.number().int().nonnegative(),
  scalarFieldsCount: z.number().int().nonnegative(),
});

export const ImportPrismaSchemaToSnapshotResultSchema = z.object({
  snapshot: GraphSnapshotSchema,
  summary: PrismaSchemaImportSummarySchema,
});

export type ImportPrismaSchemaToSnapshotInput = z.infer<
  typeof ImportPrismaSchemaToSnapshotInputSchema
> & {
  // Campo interno usado pelos adapters de importacao (arquivo/postgres) para gerar ExternalRef.
  externalRefContext?: ImportExternalRefContext;
};
export type ImportPrismaSchemaFileToSnapshotInput = z.infer<
  typeof ImportPrismaSchemaFileToSnapshotInputSchema
>;
export type ImportPostgresToSnapshotInput = z.infer<
  typeof ImportPostgresToSnapshotInputSchema
>;
export type PrismaSchemaImportSummary = z.infer<
  typeof PrismaSchemaImportSummarySchema
>;
export type ImportPrismaSchemaToSnapshotResult = z.infer<
  typeof ImportPrismaSchemaToSnapshotResultSchema
>;

export type ImportToSnapshotSourceInfo = Omit<
  ImportIntrospectionArtifact,
  "schemaText" | "externalRefContext"
>;

export type ImportToSnapshotResultBase = ImportPrismaSchemaToSnapshotResult & {
  source: ImportToSnapshotSourceInfo;
};

export type PrismaSchemaFileImportSourceInfo = ImportToSnapshotSourceInfo;
export type PostgresImportSourceInfo = ImportToSnapshotSourceInfo;

export type ImportPrismaSchemaFileToSnapshotResult = ImportToSnapshotResultBase;
export type ImportPostgresToSnapshotResult = ImportToSnapshotResultBase;
