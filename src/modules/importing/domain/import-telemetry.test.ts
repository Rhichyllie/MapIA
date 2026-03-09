import { describe, expect, it } from "vitest";
import {
  type ImportTelemetryClock,
  BufferedImportTelemetryCollector,
  IMPORT_TELEMETRY_NAMESPACE,
  IMPORT_TELEMETRY_SANITIZATION_LIMITS,
  createImportTelemetrySession,
} from "./import-telemetry";
import { IMPORT_TELEMETRY_EVENT_NAMES, IMPORT_TELEMETRY_STEP_NAMES } from "./import-telemetry-contract";
import { IMPORT_TELEMETRY_CODES } from "./import-telemetry-codes";

function createSequenceClock(values: number[]): ImportTelemetryClock {
  let index = 0;

  return {
    nowMs() {
      const value = values[Math.min(index, values.length - 1)] ?? 0;
      index += 1;
      return value;
    },
  };
}

describe("import telemetry session", () => {
  it("redacts forbidden keys from event attributes and summary metadata", () => {
    const collector = new BufferedImportTelemetryCollector();
    const session = createImportTelemetrySession({
      collector,
      correlation: {
        projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
        sourceKind: "prisma-schema-inline",
        sourceLabel: "inline-prisma-schema",
        importRunId: "test-run-id",
      },
    });

    session.event({
      eventName: IMPORT_TELEMETRY_EVENT_NAMES.INPUT_ACCEPTED,
      phase: "input",
      severity: "info",
      code: IMPORT_TELEMETRY_CODES.INPUT_ACCEPTED,
      message: "test",
      attributes: {
        keep: true,
        schemaText: "secret",
        nested: {
          externalRefContext: { raw: true },
          value: "ok",
        },
      },
      outcome: "success",
    });

    session.summary({
      namespace: IMPORT_TELEMETRY_NAMESPACE,
      correlation: session.correlation,
      outcome: "success",
      counts: {
        nodesGenerated: 0,
        edgesGenerated: 0,
        scalarFieldsGenerated: 0,
        relationCandidates: 0,
        relationsDeduplicated: 0,
        externalRefsGenerated: { nodes: 0, edges: 0, total: 0 },
        provenanceFallbacks: { nodeMiss: 0, edgeMiss: 0 },
        warningsByCategory: {
          keep: 1,
          schemaText: 99,
        },
      },
      phases: [],
      flags: {
        normalizationApplied: false,
        revalidatedAfterNormalize: false,
        hasPartialProvenance: false,
      },
      source: {
        sourceKind: "prisma-schema-inline",
        sourceLabel: "inline-prisma-schema",
        hasExternalRefContext: false,
        metadata: {
          schemaText: "secret",
          externalRefContext: { raw: true },
          keep: "ok",
        },
      },
    });

    const telemetry = collector.snapshot();

    expect(telemetry.events[0]?.attributes).toEqual({
      keep: true,
      nested: { value: "ok" },
    });
    expect(telemetry.summary?.source.metadata).toEqual({
      keep: "ok",
    });
    expect(telemetry.summary?.counts.warningsByCategory).toEqual({
      keep: 1,
    });
  });

  it("applies deterministic payload limits for strings, arrays, depth and object keys", () => {
    const collector = new BufferedImportTelemetryCollector();
    const session = createImportTelemetrySession({
      collector,
      correlation: {
        projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
        sourceKind: "prisma-schema-inline",
        sourceLabel: "inline-prisma-schema",
        importRunId: "test-run-id",
      },
    });
    const longString = "x".repeat(IMPORT_TELEMETRY_SANITIZATION_LIMITS.maxStringLength + 64);
    const hugeArray = Array.from({ length: 80 }, (_, index) => index);
    const deepObject = {
      level1: {
        level2: {
          level3: {
            level4: {
              level5: { tooDeep: true },
            },
          },
        },
      },
    };
    const wideObject = Object.fromEntries(
      Array.from({ length: 70 }, (_, index) => [`k${index}`, index]),
    );

    session.event({
      eventName: IMPORT_TELEMETRY_EVENT_NAMES.PARSE_START,
      phase: "input",
      severity: "info",
      code: IMPORT_TELEMETRY_CODES.INPUT_ACCEPTED,
      message: "payload-limits",
      attributes: {
        longString,
        hugeArray,
        deepObject,
        wideObject,
      },
      outcome: "success",
    });

    const telemetry = collector.snapshot();
    const attributes = telemetry.events[0]?.attributes as Record<string, unknown>;
    const sanitizedLongString = attributes.longString as string;
    const sanitizedHugeArray = attributes.hugeArray as unknown[];
    const sanitizedDeepObject = attributes.deepObject as Record<string, unknown>;
    const sanitizedWideObject = attributes.wideObject as Record<string, unknown>;

    expect(typeof sanitizedLongString).toBe("string");
    expect(sanitizedLongString.length).toBe(
      IMPORT_TELEMETRY_SANITIZATION_LIMITS.maxStringLength,
    );
    expect(sanitizedLongString.endsWith("...[truncated]")).toBe(true);

    expect(Array.isArray(sanitizedHugeArray)).toBe(true);
    expect(sanitizedHugeArray).toHaveLength(
      IMPORT_TELEMETRY_SANITIZATION_LIMITS.maxArrayItems,
    );
    expect(sanitizedHugeArray.at(-1)).toBe("[ArrayTruncated:+31]");

    expect(sanitizedDeepObject).toEqual({
      level1: {
        level2: {
          level3: "[MaxDepthExceeded]",
        },
      },
    });

    expect(Object.keys(sanitizedWideObject)).toHaveLength(
      IMPORT_TELEMETRY_SANITIZATION_LIMITS.maxObjectKeys,
    );
    expect(sanitizedWideObject).toHaveProperty("__telemetryTruncatedKeys", 21);
    expect(sanitizedWideObject).not.toHaveProperty("k69");
  });

  it("clamps step durationMs to zero when clock is non-monotonic", () => {
    const collector = new BufferedImportTelemetryCollector();
    const session = createImportTelemetrySession({
      collector,
      includeTimestamps: true,
      clock: createSequenceClock([100, 90]),
      correlation: {
        projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
        sourceKind: "prisma-schema-inline",
        sourceLabel: "inline-prisma-schema",
        importRunId: "test-run-id",
      },
    });

    const step = session.startStep({
      stepName: IMPORT_TELEMETRY_STEP_NAMES.FINALIZE_SUMMARY,
      phase: "input",
    });
    step.end({
      status: "success",
    });

    const telemetry = collector.snapshot();
    expect(telemetry.steps).toHaveLength(1);
    expect(telemetry.steps[0]?.durationMs).toBe(0);
    expect(telemetry.steps[0]?.startedAtMs).toBe(100);
    expect(telemetry.steps[0]?.endedAtMs).toBe(90);
  });
});
