import type { Meter, Tracer } from "@opentelemetry/api";
import { describe, expect, it, vi } from "vitest";
import {
  IMPORT_TELEMETRY_CODES,
  IMPORT_TELEMETRY_EVENT_NAMES,
  IMPORT_TELEMETRY_NAMESPACE,
  IMPORT_TELEMETRY_STEP_NAMES,
  type ImportTelemetryCorrelation,
  type ImportTelemetryEvent,
  type ImportTelemetryStep,
  type ImportTelemetrySummary,
} from "../../domain";
import { createImportTelemetryOtelAdapter } from "./import-telemetry-otel-adapter";

class NoopSpan {
  setAttributes() {
    return this;
  }
  addEvent() {
    return this;
  }
  setStatus() {
    return this;
  }
  recordException() {}
  end() {}
  spanContext() {
    return { traceId: "0".repeat(32), spanId: "0".repeat(16), traceFlags: 1 };
  }
  isRecording() {
    return true;
  }
  setAttribute() {
    return this;
  }
  updateName() {
    return this;
  }
  addLink() {
    return undefined;
  }
}

class NoopTracer {
  startSpan() {
    return new NoopSpan();
  }
}

class FakeCounter {
  readonly calls: Array<{ value: number; attributes?: Record<string, unknown> }> = [];
  throwOnAdd?: string;

  add(value: number, attributes?: Record<string, unknown>) {
    if (this.throwOnAdd) {
      throw new Error(this.throwOnAdd);
    }
    this.calls.push({ value, attributes });
  }
}

class FakeHistogram {
  readonly calls: Array<{ value: number; attributes?: Record<string, unknown> }> = [];
  throwOnRecord?: string;

  record(value: number, attributes?: Record<string, unknown>) {
    if (this.throwOnRecord) {
      throw new Error(this.throwOnRecord);
    }
    this.calls.push({ value, attributes });
  }
}

class FakeMeter {
  readonly counters = new Map<string, FakeCounter>();
  readonly histograms = new Map<string, FakeHistogram>();
  throwOnCreateCounter?: string;
  throwOnCreateHistogram?: string;

  createCounter(name: string) {
    if (this.throwOnCreateCounter) {
      throw new Error(this.throwOnCreateCounter);
    }
    const counter = new FakeCounter();
    this.counters.set(name, counter);
    return counter;
  }

  createHistogram(name: string) {
    if (this.throwOnCreateHistogram) {
      throw new Error(this.throwOnCreateHistogram);
    }
    const histogram = new FakeHistogram();
    this.histograms.set(name, histogram);
    return histogram;
  }
}

function asTracer(): Tracer {
  return new NoopTracer() as unknown as Tracer;
}

function asMeter(fakeMeter: FakeMeter): Meter {
  return fakeMeter as unknown as Meter;
}

function correlation(importRunId = "run-metrics"): ImportTelemetryCorrelation {
  return {
    namespace: IMPORT_TELEMETRY_NAMESPACE,
    importRunId,
    projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
    sourceKind: "prisma-schema-file",
    sourceLabel: "prisma/schema.prisma",
  };
}

function event(input: Partial<ImportTelemetryEvent> = {}): ImportTelemetryEvent {
  return {
    sequence: input.sequence ?? 1,
    eventName: input.eventName ?? IMPORT_TELEMETRY_EVENT_NAMES.INPUT_ACCEPTED,
    phase: input.phase ?? "input",
    severity: input.severity ?? "info",
    code: input.code ?? IMPORT_TELEMETRY_CODES.INPUT_ACCEPTED,
    message: input.message ?? "ok",
    attributes: input.attributes ?? {},
    correlation: input.correlation ?? correlation(),
    timestampMs: input.timestampMs,
    durationMs: input.durationMs,
    outcome: input.outcome,
  };
}

function step(input: Partial<ImportTelemetryStep> = {}): ImportTelemetryStep {
  return {
    sequence: input.sequence ?? 5,
    startedSequence: input.startedSequence ?? 2,
    endedSequence: input.endedSequence ?? 5,
    stepName: input.stepName ?? IMPORT_TELEMETRY_STEP_NAMES.PARSE_PRISMA_SCHEMA_MODELS,
    phase: input.phase ?? "parse",
    status: input.status ?? "success",
    durationMs: input.durationMs ?? 12,
    attributes: input.attributes ?? {},
    correlation: input.correlation ?? correlation(),
    startedAtMs: input.startedAtMs,
    endedAtMs: input.endedAtMs,
    error: input.error,
  };
}

function summary(input: Partial<ImportTelemetrySummary> = {}): ImportTelemetrySummary {
  return {
    namespace: IMPORT_TELEMETRY_NAMESPACE,
    correlation: input.correlation ?? correlation(),
    outcome: input.outcome ?? "success",
    counts: input.counts ?? {
      nodesGenerated: 2,
      edgesGenerated: 1,
      scalarFieldsGenerated: 2,
      relationCandidates: 1,
      relationsDeduplicated: 0,
      externalRefsGenerated: { nodes: 2, edges: 1, total: 3 },
      provenanceFallbacks: { nodeMiss: 0, edgeMiss: 0 },
      warningsByCategory: {},
    },
    phases: input.phases ?? [],
    flags: input.flags ?? {
      normalizationApplied: true,
      revalidatedAfterNormalize: true,
      hasPartialProvenance: false,
    },
    source: input.source ?? {
      sourceKind: "prisma-schema-file",
      sourceLabel: "prisma/schema.prisma",
      hasExternalRefContext: true,
      metadata: {},
    },
  };
}

describe("ImportTelemetryOtelAdapter metrics", () => {
  it("registra contadores e histogramas com cardinalidade controlada", () => {
    const fakeMeter = new FakeMeter();
    const adapter = createImportTelemetryOtelAdapter({
      tracer: asTracer(),
      meter: asMeter(fakeMeter),
      clock: {
        nowMs: vi
          .fn()
          .mockReturnValueOnce(100)
          .mockReturnValueOnce(110)
          .mockReturnValueOnce(120)
          .mockReturnValueOnce(130),
      },
    });
    const runCorrelation = correlation("run-metrics-1");

    adapter.recordEvent(event({ correlation: runCorrelation }));
    adapter.recordStep(step({ correlation: runCorrelation, durationMs: 22 }));
    adapter.recordSummary(summary({ correlation: runCorrelation, outcome: "partial" }));
    adapter.recordEvent(event({ correlation: runCorrelation, sequence: 99 }));

    expect(fakeMeter.counters.get("importing.telemetry.runs.started")?.calls).toHaveLength(1);
    expect(fakeMeter.counters.get("importing.telemetry.runs.finalized")?.calls).toHaveLength(1);
    expect(fakeMeter.counters.get("importing.telemetry.adapter.warnings")?.calls.length ?? 0).toBeGreaterThanOrEqual(1);
    expect(fakeMeter.counters.get("importing.telemetry.adapter.late_drops")?.calls).toHaveLength(1);
    expect(fakeMeter.histograms.get("importing.telemetry.run.duration")?.calls).toHaveLength(1);
    expect(fakeMeter.histograms.get("importing.telemetry.step.duration")?.calls).toHaveLength(1);

    const runFinalizedAttrs =
      fakeMeter.counters.get("importing.telemetry.runs.finalized")?.calls[0]?.attributes ?? {};
    expect(runFinalizedAttrs).toMatchObject({
      "importing.outcome": "partial",
      "importing.source_kind": "prisma-schema-file",
    });
    expect(Object.keys(runFinalizedAttrs).some((key) => key.includes("run_id"))).toBe(false);

    const lateDropAttrs =
      fakeMeter.counters.get("importing.telemetry.adapter.late_drops")?.calls[0]?.attributes ?? {};
    expect(lateDropAttrs).toMatchObject({
      "importing.drop_kind": "event",
    });
  });

  it("degrada com seguranca quando meter/instrumentos falham", () => {
    const fakeMeter = new FakeMeter();
    fakeMeter.throwOnCreateCounter = "counter create exploded";
    const warnings: string[] = [];
    const adapter = createImportTelemetryOtelAdapter({
      tracer: asTracer(),
      meter: asMeter(fakeMeter),
      config: {
        onInternalAdapterWarning: (warning) => warnings.push(warning.code),
      },
      clock: {
        nowMs: () => 100,
      },
    });

    expect(() => {
      adapter.recordEvent(event({ correlation: correlation("run-meter-fail") }));
      adapter.recordStep(step({ correlation: correlation("run-meter-fail") }));
      adapter.recordSummary(summary({ correlation: correlation("run-meter-fail") }));
    }).not.toThrow();

    expect(warnings).toContain("METRICS_OPERATION_FAILED");
  });
});

