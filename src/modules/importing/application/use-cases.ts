import {
  importPrismaSchemaToGraphSnapshot,
  type ImportTelemetryCollector,
} from "@/src/modules/importing/domain";
import type {
  ImportIntrospectionArtifact,
  PostgresImportIntrospectionPort,
  PrismaSchemaFileImportSourcePort,
} from "./ports";
import {
  type ImportToSnapshotResultBase,
  type ImportToSnapshotSourceInfo,
  type ImportPostgresToSnapshotInput,
  ImportPostgresToSnapshotInputSchema,
  type ImportPostgresToSnapshotResult,
  type ImportPrismaSchemaFileToSnapshotInput,
  ImportPrismaSchemaFileToSnapshotInputSchema,
  type ImportPrismaSchemaFileToSnapshotResult,
  type ImportPrismaSchemaToSnapshotInput,
  ImportPrismaSchemaToSnapshotInputSchema,
  type ImportPrismaSchemaToSnapshotResult,
  ImportPrismaSchemaToSnapshotResultSchema,
} from "./schemas";

export class ImportPrismaSchemaToSnapshotUseCase {
  constructor(
    private readonly deps: {
      telemetryCollectorFactory?: () => ImportTelemetryCollector;
    } = {},
  ) {}

  async execute(
    input: ImportPrismaSchemaToSnapshotInput,
  ): Promise<ImportPrismaSchemaToSnapshotResult> {
    const parsed = ImportPrismaSchemaToSnapshotInputSchema.parse(input);
    const collector = this.deps.telemetryCollectorFactory?.();

    return ImportPrismaSchemaToSnapshotResultSchema.parse(
      importPrismaSchemaToGraphSnapshot({
        projectId: parsed.projectId,
        schemaText: parsed.schemaText,
        externalRefContext: input.externalRefContext,
        ...(collector ? { telemetry: { collector } } : {}),
      }),
    );
  }
}

type ImportPrismaSchemaToSnapshotExecutor = Pick<
  ImportPrismaSchemaToSnapshotUseCase,
  "execute"
>;

type ImportPrismaSchemaFileToSnapshotUseCaseDeps = {
  prismaSchemaFileImportSource: PrismaSchemaFileImportSourcePort;
  importPrismaSchemaToSnapshot?: ImportPrismaSchemaToSnapshotExecutor;
};

type ImportPostgresToSnapshotUseCaseDeps = {
  postgresImportIntrospectionPort: PostgresImportIntrospectionPort;
  importPrismaSchemaToSnapshot?: ImportPrismaSchemaToSnapshotExecutor;
};

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function toImportSourceInfo(
  artifact: ImportIntrospectionArtifact,
): ImportToSnapshotSourceInfo {
  return {
    sourceKind: artifact.sourceKind,
    sourceLabel: artifact.sourceLabel,
    warnings: artifact.warnings,
    metadata: artifact.metadata,
  };
}

async function importIntrospectionArtifactToSnapshot(params: {
  importPrismaSchemaToSnapshot: ImportPrismaSchemaToSnapshotExecutor;
  projectId: string;
  artifact: ImportIntrospectionArtifact;
}): Promise<ImportToSnapshotResultBase> {
  const imported = await params.importPrismaSchemaToSnapshot.execute({
    projectId: params.projectId,
    schemaText: params.artifact.schemaText,
    externalRefContext: params.artifact.externalRefContext,
  });

  return {
    ...imported,
    source: toImportSourceInfo(params.artifact),
  };
}

export class ImportPrismaSchemaFileToSnapshotUseCase {
  private readonly importPrismaSchemaToSnapshot: ImportPrismaSchemaToSnapshotExecutor;

  constructor(
    private readonly deps: ImportPrismaSchemaFileToSnapshotUseCaseDeps,
  ) {
    this.importPrismaSchemaToSnapshot =
      deps.importPrismaSchemaToSnapshot ?? new ImportPrismaSchemaToSnapshotUseCase();
  }

  async execute(
    input: ImportPrismaSchemaFileToSnapshotInput,
  ): Promise<ImportPrismaSchemaFileToSnapshotResult> {
    const parsed = ImportPrismaSchemaFileToSnapshotInputSchema.parse(input);

    let artifact;

    try {
      artifact = await this.deps.prismaSchemaFileImportSource.readSchemaText(parsed);
    } catch (error) {
      throw new Error(
        `Falha ao ler arquivo Prisma para importacao: ${toErrorMessage(error)}`,
      );
    }

    try {
      return await importIntrospectionArtifactToSnapshot({
        importPrismaSchemaToSnapshot: this.importPrismaSchemaToSnapshot,
        projectId: parsed.projectId,
        artifact,
      });
    } catch (error) {
      throw new Error(
        `Falha ao importar schema Prisma do arquivo ${artifact.sourceLabel}: ${toErrorMessage(error)}`,
      );
    }
  }
}

export class ImportPostgresToSnapshotUseCase {
  private readonly importPrismaSchemaToSnapshot: ImportPrismaSchemaToSnapshotExecutor;

  constructor(private readonly deps: ImportPostgresToSnapshotUseCaseDeps) {
    this.importPrismaSchemaToSnapshot =
      deps.importPrismaSchemaToSnapshot ?? new ImportPrismaSchemaToSnapshotUseCase();
  }

  async execute(
    input: ImportPostgresToSnapshotInput,
  ): Promise<ImportPostgresToSnapshotResult> {
    const parsed = ImportPostgresToSnapshotInputSchema.parse(input);
    const targetSchema = parsed.schema ?? "public";

    let artifact;

    try {
      artifact =
        await this.deps.postgresImportIntrospectionPort.introspectToPrismaSchemaText(
          {
            projectId: parsed.projectId,
            schemas: [targetSchema],
          },
        );
    } catch (error) {
      throw new Error(
        `Falha ao introspectar Postgres para importacao: ${toErrorMessage(error)}`,
      );
    }

    try {
      return await importIntrospectionArtifactToSnapshot({
        importPrismaSchemaToSnapshot: this.importPrismaSchemaToSnapshot,
        projectId: parsed.projectId,
        artifact,
      });
    } catch (error) {
      throw new Error(
        `Falha ao importar introspeccao Postgres (${targetSchema}): ${toErrorMessage(error)}`,
      );
    }
  }
}
