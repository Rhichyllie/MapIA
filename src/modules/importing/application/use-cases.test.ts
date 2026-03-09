import { describe, expect, it, vi } from "vitest";
import type { ImportTelemetryCollector } from "@/src/modules/importing/domain";
import type {
  PostgresImportIntrospectionPort,
  PrismaSchemaFileImportSourcePort,
} from "./ports";
import {
  ImportPostgresToSnapshotUseCase,
  ImportPrismaSchemaFileToSnapshotUseCase,
  ImportPrismaSchemaToSnapshotUseCase,
} from "./use-cases";

const projectId = "58f3ca26-085e-4237-80d9-adcc42f7142b";

describe("ImportPrismaSchemaToSnapshotUseCase", () => {
  it("imports a valid Prisma schema into a graph snapshot", async () => {
    const useCase = new ImportPrismaSchemaToSnapshotUseCase();

    const result = await useCase.execute({
      projectId,
      schemaText: `
        model User {
          id String @id
          name String
        }
      `,
    });

    expect(result.snapshot.nodes).toHaveLength(1);
    expect(result.snapshot.nodes[0]?.label).toBe("User");
    expect(result.snapshot.edges).toHaveLength(0);
    expect(result.summary).toMatchObject({
      modelsCount: 1,
      relationsCount: 0,
      scalarFieldsCount: 2,
    });
  });

  it("validates use-case input with zod", async () => {
    const useCase = new ImportPrismaSchemaToSnapshotUseCase();

    await expect(
      useCase.execute({
        projectId: "invalid-uuid",
        schemaText: "model User { id String @id }",
      }),
    ).rejects.toThrow();
  });

  it("injeta collector de telemetria opcional sem alterar o resultado publico", async () => {
    const collector: ImportTelemetryCollector = {
      recordEvent: vi.fn(),
      recordStep: vi.fn(),
      recordSummary: vi.fn(),
    };
    const useCase = new ImportPrismaSchemaToSnapshotUseCase({
      telemetryCollectorFactory: () => collector,
    });

    const result = await useCase.execute({
      projectId,
      schemaText: `
        model User {
          id String @id
          name String
        }
      `,
    });

    expect(result.snapshot.nodes).toHaveLength(1);
    expect(result.summary).toMatchObject({
      modelsCount: 1,
      relationsCount: 0,
      scalarFieldsCount: 2,
    });
    expect(collector.recordEvent).toHaveBeenCalled();
    expect(collector.recordStep).toHaveBeenCalled();
    expect(collector.recordSummary).toHaveBeenCalledTimes(1);
  });
});

describe("ImportPrismaSchemaFileToSnapshotUseCase", () => {
  it("composes file source adapter with the existing text import pipeline", async () => {
    const fileSource: PrismaSchemaFileImportSourcePort = {
      readSchemaText: vi.fn().mockResolvedValue({
        sourceKind: "prisma-schema-file",
        sourceLabel: "prisma/schema.prisma",
        schemaText: "model User { id String @id }",
        warnings: ["arquivo grande"],
        metadata: { bytes: 30, fileName: "schema.prisma", source: "fs" },
        externalRefContext: {
          sourceKind: "prisma-schema-file",
          filePath: "prisma/schema.prisma",
        },
      }),
    };
    const importPrismaSchemaToSnapshot = {
      execute: vi.fn().mockResolvedValue({
        snapshot: {
          nodes: [],
          edges: [],
          viewport: { x: 0, y: 0, zoom: 1 },
        },
        summary: {
          modelsCount: 1,
          relationsCount: 0,
          scalarFieldsCount: 1,
        },
      }),
    };
    const useCase = new ImportPrismaSchemaFileToSnapshotUseCase({
      prismaSchemaFileImportSource: fileSource,
      importPrismaSchemaToSnapshot,
    });

    const result = await useCase.execute({
      projectId,
      filePath: "prisma/schema.prisma",
      workspaceRoot: "C:/Projetos/MapIA",
    });

    expect(fileSource.readSchemaText).toHaveBeenCalledWith({
      projectId,
      filePath: "prisma/schema.prisma",
      workspaceRoot: "C:/Projetos/MapIA",
    });
    expect(importPrismaSchemaToSnapshot.execute).toHaveBeenCalledWith({
      projectId,
      schemaText: "model User { id String @id }",
      externalRefContext: {
        sourceKind: "prisma-schema-file",
        filePath: "prisma/schema.prisma",
      },
    });
    expect(result.summary).toMatchObject({ modelsCount: 1 });
    expect(result.source).toMatchObject({
      sourceKind: "prisma-schema-file",
      sourceLabel: "prisma/schema.prisma",
      warnings: ["arquivo grande"],
      metadata: { bytes: 30, fileName: "schema.prisma", source: "fs" },
    });
    expect("schemaText" in result.source).toBe(false);
    expect("externalRefContext" in result.source).toBe(false);
  });

  it("wraps adapter errors with a friendly message", async () => {
    const fileSource: PrismaSchemaFileImportSourcePort = {
      readSchemaText: vi
        .fn()
        .mockRejectedValue(new Error("Arquivo Prisma nao encontrado")),
    };
    const useCase = new ImportPrismaSchemaFileToSnapshotUseCase({
      prismaSchemaFileImportSource: fileSource,
    });

    await expect(
      useCase.execute({
        projectId,
        filePath: "prisma/missing.prisma",
      }),
    ).rejects.toThrow(/Falha ao ler arquivo Prisma para importacao/i);
  });

  it("wraps schema-to-snapshot import errors with source-specific context", async () => {
    const fileSource: PrismaSchemaFileImportSourcePort = {
      readSchemaText: vi.fn().mockResolvedValue({
        sourceKind: "prisma-schema-file",
        sourceLabel: "prisma/schema.prisma",
        schemaText: "invalid prisma schema text",
        warnings: [],
        metadata: { bytes: 25, fileName: "schema.prisma" },
        externalRefContext: {
          sourceKind: "prisma-schema-file",
          filePath: "prisma/schema.prisma",
        },
      }),
    };
    const importPrismaSchemaToSnapshot = {
      execute: vi.fn().mockRejectedValue(new Error("Schema Prisma invalido")),
    };
    const useCase = new ImportPrismaSchemaFileToSnapshotUseCase({
      prismaSchemaFileImportSource: fileSource,
      importPrismaSchemaToSnapshot,
    });

    await expect(
      useCase.execute({
        projectId,
        filePath: "prisma/schema.prisma",
      }),
    ).rejects.toThrow(/Falha ao importar schema Prisma do arquivo prisma\/schema\.prisma/i);
  });
});

describe("ImportPostgresToSnapshotUseCase", () => {
  it("composes postgres introspection with the existing text import pipeline", async () => {
    const postgresSource: PostgresImportIntrospectionPort = {
      introspectToPrismaSchemaText: vi.fn().mockResolvedValue({
        sourceKind: "postgres-live",
        sourceLabel: "postgres:public",
        schemaText: "model Users { id Int @id }",
        warnings: ["warning-1"],
        metadata: { tablesCount: 1, schemas: "public" },
        externalRefContext: {
          sourceKind: "postgres-live",
          modelsByModelName: {
            Users: { schema: "public", table: "users" },
          },
          relationsByRelationName: {},
        },
      }),
    };
    const importPrismaSchemaToSnapshot = {
      execute: vi.fn().mockResolvedValue({
        snapshot: {
          nodes: [],
          edges: [],
          viewport: { x: 0, y: 0, zoom: 1 },
        },
        summary: {
          modelsCount: 1,
          relationsCount: 0,
          scalarFieldsCount: 1,
        },
      }),
    };
    const useCase = new ImportPostgresToSnapshotUseCase({
      postgresImportIntrospectionPort: postgresSource,
      importPrismaSchemaToSnapshot,
    });

    const result = await useCase.execute({
      projectId,
      schema: "public",
    });

    expect(postgresSource.introspectToPrismaSchemaText).toHaveBeenCalledWith({
      projectId,
      schemas: ["public"],
    });
    expect(importPrismaSchemaToSnapshot.execute).toHaveBeenCalledWith({
      projectId,
      schemaText: "model Users { id Int @id }",
      externalRefContext: {
        sourceKind: "postgres-live",
        modelsByModelName: {
          Users: { schema: "public", table: "users" },
        },
        relationsByRelationName: {},
      },
    });
    expect(result.source).toMatchObject({
      sourceKind: "postgres-live",
      sourceLabel: "postgres:public",
      warnings: ["warning-1"],
      metadata: { tablesCount: 1, schemas: "public" },
    });
    expect("schemaText" in result.source).toBe(false);
    expect("externalRefContext" in result.source).toBe(false);
  });

  it("wraps postgres introspection errors with a friendly message", async () => {
    const postgresSource: PostgresImportIntrospectionPort = {
      introspectToPrismaSchemaText: vi
        .fn()
        .mockRejectedValue(new Error("permissao negada")),
    };
    const useCase = new ImportPostgresToSnapshotUseCase({
      postgresImportIntrospectionPort: postgresSource,
    });

    await expect(
      useCase.execute({
        projectId,
        schema: "public",
      }),
    ).rejects.toThrow(/Falha ao introspectar Postgres para importacao/i);
  });

  it("wraps schema-to-snapshot import errors with the target schema context", async () => {
    const postgresSource: PostgresImportIntrospectionPort = {
      introspectToPrismaSchemaText: vi.fn().mockResolvedValue({
        sourceKind: "postgres-live",
        sourceLabel: "postgres:public",
        schemaText: "invalid prisma schema text",
        warnings: ["warning-1"],
        metadata: { tablesCount: 1, schemas: "public" },
        externalRefContext: {
          sourceKind: "postgres-live",
          modelsByModelName: {},
          relationsByRelationName: {},
        },
      }),
    };
    const importPrismaSchemaToSnapshot = {
      execute: vi.fn().mockRejectedValue(new Error("Schema Prisma invalido")),
    };
    const useCase = new ImportPostgresToSnapshotUseCase({
      postgresImportIntrospectionPort: postgresSource,
      importPrismaSchemaToSnapshot,
    });

    await expect(
      useCase.execute({
        projectId,
        schema: "public",
      }),
    ).rejects.toThrow(/Falha ao importar introspeccao Postgres \(public\)/i);
  });
});
