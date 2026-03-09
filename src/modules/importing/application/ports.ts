import type { ImportExternalRefContext } from "@/src/modules/importing/domain";

export type ImportIntrospectionSourceKind =
  | "prisma-schema-file"
  | "postgres-live";

export type ImportIntrospectionArtifact = {
  sourceKind: ImportIntrospectionSourceKind;
  sourceLabel: string;
  schemaText: string;
  warnings: string[];
  metadata: Record<string, string | number | boolean | null>;
  // Contexto interno para rastreabilidade de elementos importados; nao vai para a resposta da API.
  externalRefContext?: ImportExternalRefContext;
};

export type ReadPrismaSchemaFileForImportInput = {
  projectId: string;
  filePath: string;
  workspaceRoot?: string;
};

export interface PrismaSchemaFileImportSourcePort {
  readSchemaText(
    input: ReadPrismaSchemaFileForImportInput,
  ): Promise<ImportIntrospectionArtifact>;
}

export type IntrospectPostgresForImportInput = {
  projectId: string;
  databaseUrl?: string;
  schemas?: string[];
};

export interface PostgresImportIntrospectionPort {
  // Retorna schema Prisma em texto para reaproveitar o parser/mapper da Fase 4A.
  introspectToPrismaSchemaText(
    input: IntrospectPostgresForImportInput,
  ): Promise<ImportIntrospectionArtifact>;
}
