import { describe, expect, it } from "vitest";
import {
  IMPORT_TELEMETRY_EVENT_CONTRACT,
  IMPORT_TELEMETRY_EVENT_NAMES,
  IMPORT_TELEMETRY_STEP_NAMES,
  type ImportTelemetryEventContractMeta,
} from "./import-telemetry-contract";
import { IMPORT_TELEMETRY_CODES } from "./import-telemetry-codes";

describe("import telemetry contract governance", () => {
  it("keeps the telemetry code list stable", () => {
    expect(Object.values(IMPORT_TELEMETRY_CODES)).toEqual([
      "IMPORT_INPUT_ACCEPTED",
      "IMPORT_PARSE_START",
      "IMPORT_PARSE_OK",
      "IMPORT_PARSE_FAILED",
      "IMPORT_EXTERNALREFS_MAP_START",
      "IMPORT_EXTERNALREFS_MAP_STATS",
      "IMPORT_PROVENANCE_NODE_MISS",
      "IMPORT_PROVENANCE_EDGE_MISS",
      "IMPORT_VALIDATE_PARSE_START",
      "IMPORT_VALIDATE_PARSE_OK",
      "IMPORT_VALIDATE_INVARIANTS_START",
      "IMPORT_VALIDATE_INVARIANTS_OK",
      "IMPORT_NORMALIZE_START",
      "IMPORT_NORMALIZE_OK",
      "IMPORT_REPARSE_START",
      "IMPORT_REPARSE_OK",
      "IMPORT_REVALIDATE_START",
      "IMPORT_REVALIDATE_OK",
      "IMPORT_FINALIZE_SUMMARY",
      "IMPORT_PIPELINE_FAILED",
    ]);
  });

  it("keeps the telemetry eventName list stable", () => {
    expect(Object.values(IMPORT_TELEMETRY_EVENT_NAMES)).toEqual([
      "import.finalize.summary",
      "import.input.accepted",
      "import.parse.start",
      "import.parse.end",
      "import.externalRefs.map.start",
      "import.externalRefs.map.stats",
      "import.provenance.warning.node-miss",
      "import.provenance.warning.edge-miss",
      "import.validate.schema.start",
      "import.validate.schema.end",
      "import.validate.invariants.start",
      "import.validate.invariants.end",
      "import.normalize.start",
      "import.normalize.end",
      "import.reparse.start",
      "import.reparse.end",
      "import.revalidate.start",
      "import.revalidate.end",
      "import.pipeline.failed",
    ]);
  });

  it("keeps the telemetry stepName list stable", () => {
    expect(Object.values(IMPORT_TELEMETRY_STEP_NAMES)).toEqual([
      "finalize.summary",
      "parse.prisma-schema-models",
      "externalRefs.map-elements",
      "validate.graph-snapshot-schema.initial",
      "validate.graph-invariants.initial",
      "normalize.imported-snapshot-canonical",
      "reparse.graph-snapshot-schema.after-normalize",
      "validate.graph-invariants.after-normalize",
    ]);
  });

  it("keeps the event contract catalog aligned with event names and codes", () => {
    const eventNameKeys = Object.keys(IMPORT_TELEMETRY_EVENT_NAMES).sort();
    const catalogKeys = Object.keys(IMPORT_TELEMETRY_EVENT_CONTRACT).sort();
    const validCodes = new Set(Object.values(IMPORT_TELEMETRY_CODES));
    const validEventNames = new Set(Object.values(IMPORT_TELEMETRY_EVENT_NAMES));

    expect(catalogKeys).toEqual(eventNameKeys);

    for (const [key, meta] of Object.entries(
      IMPORT_TELEMETRY_EVENT_CONTRACT,
    ) as Array<[string, ImportTelemetryEventContractMeta]>) {
      const eventNameKey = key as keyof typeof IMPORT_TELEMETRY_EVENT_NAMES;
      expect(meta.eventName).toBe(IMPORT_TELEMETRY_EVENT_NAMES[eventNameKey]);
      expect(validEventNames.has(meta.eventName)).toBe(true);
      expect(validCodes.has(meta.code)).toBe(true);
      expect(typeof meta.description).toBe("string");
      expect(meta.description.length).toBeGreaterThan(0);

      if (meta.possibleCodes) {
        expect(meta.possibleCodes.length).toBeGreaterThan(0);
        expect(meta.possibleCodes).toContain(meta.code);
        meta.possibleCodes.forEach((code) => {
          expect(validCodes.has(code)).toBe(true);
        });
      }
    }
  });
});
