import { describe, expect, it, vi } from "vitest";
import {
  type ImportTelemetryClock,
  type ImportTelemetryCollector,
  BufferedImportTelemetryCollector,
  NoopImportTelemetryCollector,
} from "./import-telemetry";
import {
  IMPORT_TELEMETRY_EVENT_NAMES,
  IMPORT_TELEMETRY_STEP_NAMES,
} from "./import-telemetry-contract";
import { IMPORT_TELEMETRY_CODES } from "./import-telemetry-codes";
import { importPrismaSchemaToGraphSnapshot } from "./prisma-schema-importer";

const projectId = "58f3ca26-085e-4237-80d9-adcc42f7142b";

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createIncrementalClock(stepMs = 5): ImportTelemetryClock {
  let current = 0;

  return {
    nowMs() {
      current += stepMs;
      return current;
    },
  };
}

function createSpyCollector() {
  const buffered = new BufferedImportTelemetryCollector();
  const recordEventSpy = vi.fn((event) => buffered.recordEvent(event));
  const recordStepSpy = vi.fn((step) => buffered.recordStep(step));
  const recordSummarySpy = vi.fn((summary) => buffered.recordSummary(summary));
  const collector: ImportTelemetryCollector = {
    recordEvent: recordEventSpy,
    recordStep: recordStepSpy,
    recordSummary: recordSummarySpy,
  };

  return { collector, buffered, recordEventSpy, recordStepSpy, recordSummarySpy };
}

describe("importPrismaSchemaToGraphSnapshot telemetry", () => {
  it("keeps snapshot/summary unchanged with noop and buffered collectors", () => {
    const schemaText = `
      model User {
        id    String @id
        posts Post[]
      }

      model Post {
        id       String @id
        authorId String
        author   User @relation(fields: [authorId], references: [id])
      }
    `;
    const externalRefContext = {
      sourceKind: "prisma-schema-file" as const,
      filePath: "C:\\Projetos\\MapIA\\prisma\\schema.prisma",
    };
    const baseline = importPrismaSchemaToGraphSnapshot({
      projectId,
      schemaText,
      externalRefContext,
    });
    const noop = importPrismaSchemaToGraphSnapshot({
      projectId,
      schemaText,
      externalRefContext,
      telemetry: {
        collector: new NoopImportTelemetryCollector(),
      },
    });
    const bufferedCollector = new BufferedImportTelemetryCollector();
    const buffered = importPrismaSchemaToGraphSnapshot({
      projectId,
      schemaText,
      externalRefContext,
      telemetry: {
        collector: bufferedCollector,
        clock: createIncrementalClock(),
        includeTimestamps: true,
      },
    });
    const telemetry = bufferedCollector.snapshot();

    expect(cloneJson(noop.snapshot)).toEqual(cloneJson(baseline.snapshot));
    expect(noop.summary).toEqual(baseline.summary);
    expect(cloneJson(buffered.snapshot)).toEqual(cloneJson(baseline.snapshot));
    expect(buffered.summary).toEqual(baseline.summary);
    expect(telemetry.events.length).toBeGreaterThan(0);
    expect(telemetry.steps.length).toBeGreaterThan(0);
    expect(telemetry.summary).toBeDefined();
    expect(telemetry.summary?.namespace).toBe("importing.telemetry.v1");
  });

  it("emits deterministic event order/codes and stable summary for the same input", () => {
    const schemaText = `
      model User {
        id    String @id
        posts Post[]
      }

      model Post {
        id       String @id
        authorId String
        author   User @relation(fields: [authorId], references: [id])
      }
    `;
    const externalRefContext = {
      sourceKind: "prisma-schema-file" as const,
      filePath: "prisma\\schema.prisma",
    };

    const collectorA = new BufferedImportTelemetryCollector();
    const collectorB = new BufferedImportTelemetryCollector();

    importPrismaSchemaToGraphSnapshot({
      projectId,
      schemaText,
      externalRefContext,
      telemetry: {
        collector: collectorA,
        clock: createIncrementalClock(3),
        includeTimestamps: true,
      },
    });
    importPrismaSchemaToGraphSnapshot({
      projectId,
      schemaText,
      externalRefContext,
      telemetry: {
        collector: collectorB,
        clock: createIncrementalClock(3),
        includeTimestamps: true,
      },
    });

    const telemetryA = collectorA.snapshot();
    const telemetryB = collectorB.snapshot();

    expect(telemetryA).toEqual(telemetryB);
    expect(telemetryA.events.map((event) => event.code)).toEqual([
      IMPORT_TELEMETRY_CODES.INPUT_ACCEPTED,
      IMPORT_TELEMETRY_CODES.PARSE_START,
      IMPORT_TELEMETRY_CODES.PARSE_OK,
      IMPORT_TELEMETRY_CODES.EXTERNALREFS_MAP_START,
      IMPORT_TELEMETRY_CODES.EXTERNALREFS_MAP_STATS,
      IMPORT_TELEMETRY_CODES.VALIDATE_PARSE_START,
      IMPORT_TELEMETRY_CODES.VALIDATE_PARSE_OK,
      IMPORT_TELEMETRY_CODES.VALIDATE_INVARIANTS_START,
      IMPORT_TELEMETRY_CODES.VALIDATE_INVARIANTS_OK,
      IMPORT_TELEMETRY_CODES.NORMALIZE_START,
      IMPORT_TELEMETRY_CODES.NORMALIZE_OK,
      IMPORT_TELEMETRY_CODES.REPARSE_START,
      IMPORT_TELEMETRY_CODES.REPARSE_OK,
      IMPORT_TELEMETRY_CODES.REVALIDATE_START,
      IMPORT_TELEMETRY_CODES.REVALIDATE_OK,
      IMPORT_TELEMETRY_CODES.FINALIZE_SUMMARY,
    ]);
    expect(telemetryA.steps.map((step) => step.stepName)).toEqual([
      IMPORT_TELEMETRY_STEP_NAMES.PARSE_PRISMA_SCHEMA_MODELS,
      IMPORT_TELEMETRY_STEP_NAMES.EXTERNALREFS_MAP_ELEMENTS,
      IMPORT_TELEMETRY_STEP_NAMES.VALIDATE_GRAPH_SNAPSHOT_SCHEMA_INITIAL,
      IMPORT_TELEMETRY_STEP_NAMES.VALIDATE_GRAPH_INVARIANTS_INITIAL,
      IMPORT_TELEMETRY_STEP_NAMES.NORMALIZE_IMPORTED_SNAPSHOT_CANONICAL,
      IMPORT_TELEMETRY_STEP_NAMES.REPARSE_GRAPH_SNAPSHOT_SCHEMA_AFTER_NORMALIZE,
      IMPORT_TELEMETRY_STEP_NAMES.VALIDATE_GRAPH_INVARIANTS_AFTER_NORMALIZE,
      IMPORT_TELEMETRY_STEP_NAMES.FINALIZE_SUMMARY,
    ]);
    expect(telemetryA.summary).toMatchObject({
      outcome: "success",
      flags: {
        normalizationApplied: true,
        revalidatedAfterNormalize: true,
        hasPartialProvenance: false,
      },
      counts: {
        nodesGenerated: 2,
        edgesGenerated: 1,
        relationCandidates: 2,
        relationsDeduplicated: 1,
        externalRefsGenerated: {
          nodes: 2,
          edges: 1,
          total: 3,
        },
        provenanceFallbacks: {
          nodeMiss: 0,
          edgeMiss: 0,
        },
        warningsByCategory: {},
      },
    });
  });

  it("emits stable provenance warning codes and counts for partial postgres provenance", () => {
    const schemaText = `
      model Users {
        id Int @id
        posts Posts[] @relation("fk_public_posts_posts_author_id_fkey")
      }

      model Posts {
        id        Int   @id
        author_id Int
        author    Users @relation("fk_public_posts_posts_author_id_fkey", fields: [author_id], references: [id])
      }
    `;
    const collector = new BufferedImportTelemetryCollector();

    const result = importPrismaSchemaToGraphSnapshot({
      projectId,
      schemaText,
      externalRefContext: {
        sourceKind: "postgres-live",
        modelsByModelName: {},
        relationsByRelationName: {},
      },
      telemetry: {
        collector,
        clock: createIncrementalClock(),
      },
    });
    const telemetry = collector.snapshot();

    expect(result.snapshot.nodes).toHaveLength(2);
    expect(result.snapshot.edges).toHaveLength(1);
    expect(
      telemetry.events
        .filter((event) => event.severity === "warn")
        .map((event) => event.code),
    ).toEqual([
      IMPORT_TELEMETRY_CODES.PROVENANCE_NODE_MISS,
      IMPORT_TELEMETRY_CODES.PROVENANCE_EDGE_MISS,
    ]);
    expect(telemetry.summary).toMatchObject({
      outcome: "partial",
      flags: {
        hasPartialProvenance: true,
      },
      counts: {
        externalRefsGenerated: {
          nodes: 0,
          edges: 0,
          total: 0,
        },
        provenanceFallbacks: {
          nodeMiss: 2,
          edgeMiss: 1,
        },
        warningsByCategory: {
          "provenance.node.miss": 2,
          "provenance.edge.miss.relation-origin-not-found": 1,
        },
      },
    });
  });

  it("sanitizes telemetry payloads and never leaks schemaText/externalRefContext raw payloads", () => {
    const schemaText = `
      model Users {
        id Int @id
      }
    `;
    const collector = new BufferedImportTelemetryCollector();

    importPrismaSchemaToGraphSnapshot({
      projectId,
      schemaText,
      externalRefContext: {
        sourceKind: "postgres-live",
        modelsByModelName: {
          Users: { schema: "public", table: "users" },
        },
        relationsByRelationName: {
          fk_public_users_id_fkey: {
            schema: "public",
            table: "users",
            column: "id",
            constraint: "users_id_fkey",
          },
        },
      },
      telemetry: {
        collector,
        clock: createIncrementalClock(),
      },
    });

    const telemetry = collector.snapshot();
    const serialized = JSON.stringify(telemetry);

    expect(serialized).not.toContain("schemaText");
    expect(serialized).not.toContain("externalRefContext");
    expect(serialized).not.toContain("modelsByModelName");
    expect(serialized).not.toContain("relationsByRelationName");
    expect(serialized).not.toContain("\"table\":\"users\"");
    expect(telemetry.summary?.source).toMatchObject({
      sourceKind: "postgres-live",
      sourceLabel: "postgres-live",
      hasExternalRefContext: true,
      metadata: {
        provenanceModelCatalogCount: 1,
        provenanceRelationCatalogCount: 1,
      },
    });
    expect(telemetry.events.every((event) => "externalRefs" in event.attributes === false)).toBe(
      true,
    );
  });

  it("emits pipeline failure + finalize summary once on parse failure and records summary once", () => {
    const { collector, buffered, recordSummarySpy } = createSpyCollector();

    expect(() =>
      importPrismaSchemaToGraphSnapshot({
        projectId,
        schemaText: `
          model User {
            id String @id
            @broken
          }
        `,
        telemetry: {
          collector,
          clock: createIncrementalClock(),
        },
      }),
    ).toThrow(/schema prisma invalido/i);

    const telemetry = buffered.snapshot();
    const eventCodes = telemetry.events.map((event) => event.code);

    expect(eventCodes).toContain(IMPORT_TELEMETRY_CODES.PARSE_FAILED);
    expect(eventCodes).toContain(IMPORT_TELEMETRY_CODES.PIPELINE_FAILED);
    expect(eventCodes.filter((code) => code === IMPORT_TELEMETRY_CODES.FINALIZE_SUMMARY)).toHaveLength(
      1,
    );
    expect(telemetry.summary?.outcome).toBe("failure");
    expect(
      telemetry.events.some(
        (event) => event.eventName === IMPORT_TELEMETRY_EVENT_NAMES.PIPELINE_FAILED,
      ),
    ).toBe(true);
    expect(
      telemetry.events.some(
        (event) => event.eventName === IMPORT_TELEMETRY_EVENT_NAMES.FINALIZE_SUMMARY,
      ),
    ).toBe(true);
    expect(recordSummarySpy).toHaveBeenCalledTimes(1);
  });

  it("emits pipeline failure + finalize summary once on revalidate failure and records summary once", async () => {
    vi.resetModules();
    vi.doMock("@/src/modules/graph/domain", async () => {
      const actual = await vi.importActual<typeof import("@/src/modules/graph/domain")>(
        "@/src/modules/graph/domain",
      );
      let validateCalls = 0;

      return {
        ...actual,
        validateGraphSnapshotInvariants: vi.fn((snapshot) => {
          validateCalls += 1;
          if (validateCalls === 2) {
            throw new Error("Injected revalidate failure");
          }

          return actual.validateGraphSnapshotInvariants(snapshot);
        }),
      };
    });
    try {
      const importerModule = await import("./prisma-schema-importer");
      const { collector, buffered, recordSummarySpy } = createSpyCollector();

      expect(() =>
        importerModule.importPrismaSchemaToGraphSnapshot({
          projectId,
          schemaText: `
            model User {
              id String @id
            }
          `,
          telemetry: {
            collector,
            clock: createIncrementalClock(),
          },
        }),
      ).toThrow(/injected revalidate failure/i);

      const telemetry = buffered.snapshot();
      const eventCodes = telemetry.events.map((event) => event.code);

      expect(eventCodes).toContain(IMPORT_TELEMETRY_CODES.REVALIDATE_START);
      expect(eventCodes).toContain(IMPORT_TELEMETRY_CODES.PIPELINE_FAILED);
      expect(
        eventCodes.filter((code) => code === IMPORT_TELEMETRY_CODES.FINALIZE_SUMMARY),
      ).toHaveLength(1);
      expect(
        telemetry.events.some(
          (event) =>
            event.eventName === IMPORT_TELEMETRY_EVENT_NAMES.REVALIDATE_END &&
            event.code === IMPORT_TELEMETRY_CODES.PIPELINE_FAILED,
        ),
      ).toBe(true);
      expect(
        telemetry.events.some(
          (event) => event.eventName === IMPORT_TELEMETRY_EVENT_NAMES.PIPELINE_FAILED,
        ),
      ).toBe(true);
      expect(telemetry.summary?.outcome).toBe("failure");
      expect(recordSummarySpy).toHaveBeenCalledTimes(1);
    } finally {
      vi.doUnmock("@/src/modules/graph/domain");
      vi.resetModules();
    }
  });
});
