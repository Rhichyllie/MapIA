import {
  ROOT_CONTEXT,
  SpanStatusCode,
  trace,
  type Attributes,
  type Context,
  type Span,
  type SpanOptions,
  type Tracer,
} from "@opentelemetry/api";
import { describe, expect, it, vi } from "vitest";
import {
  IMPORT_TELEMETRY_CODES,
  IMPORT_TELEMETRY_EVENT_NAMES,
  IMPORT_TELEMETRY_NAMESPACE,
  IMPORT_TELEMETRY_STEP_NAMES,
  type ImportTelemetryClock,
  type ImportTelemetryCorrelation,
  type ImportTelemetryEvent,
  type ImportTelemetryStep,
  type ImportTelemetrySummary,
  importPrismaSchemaToGraphSnapshot,
} from "../../domain";
import {
  ImportTelemetryOtelAdapter,
  createImportTelemetryOtelAdapter,
} from "./import-telemetry-otel-adapter";

class FakeSpan {
  name: string;
  readonly startOptions?: SpanOptions;
  readonly parentContext?: Context;
  readonly attributes: Record<string, unknown> = {};
  readonly events: Array<{
    name: string;
    attributes?: Attributes;
    timestampMs?: number;
  }> = [];
  readonly exceptions: unknown[] = [];
  readonly endCalls: number[] = [];
  status?: { code: SpanStatusCode; message?: string };
  ended = false;
  throwOn?: Partial<Record<"addEvent" | "setAttributes" | "setStatus" | "recordException" | "end", string>>;

  constructor(name: string, options?: SpanOptions, parentContext?: Context) {
    this.name = name;
    this.startOptions = options;
    this.parentContext = parentContext;
    if (options?.attributes) {
      Object.assign(this.attributes, options.attributes);
    }
  }

  spanContext() {
    return {
      traceId: "0".repeat(32),
      spanId: "0".repeat(16),
      traceFlags: 1,
    };
  }

  setAttribute(key: string, value: unknown) {
    this.attributes[key] = value;
    return this;
  }

  setAttributes(attributes: Attributes) {
    if (this.throwOn?.setAttributes) {
      throw new Error(this.throwOn.setAttributes);
    }
    Object.assign(this.attributes, attributes);
    return this;
  }

  addEvent(name: string, attributes?: Attributes, timestampMs?: number) {
    if (this.throwOn?.addEvent) {
      throw new Error(this.throwOn.addEvent);
    }
    this.events.push({
      name,
      ...(attributes ? { attributes } : {}),
      ...(typeof timestampMs === "number" ? { timestampMs } : {}),
    });
    return this;
  }

  setStatus(status: { code: SpanStatusCode; message?: string }) {
    if (this.throwOn?.setStatus) {
      throw new Error(this.throwOn.setStatus);
    }
    this.status = status;
    return this;
  }

  updateName(name: string) {
    this.name = name;
    return this;
  }

  end(endTime?: number) {
    if (this.throwOn?.end) {
      throw new Error(this.throwOn.end);
    }
    this.endCalls.push(typeof endTime === "number" ? endTime : NaN);
    this.ended = true;
  }

  isRecording() {
    return !this.ended;
  }

  recordException(exception: unknown) {
    if (this.throwOn?.recordException) {
      throw new Error(this.throwOn.recordException);
    }
    this.exceptions.push(exception);
  }

  addLink() {
    return undefined;
  }
}

class FakeTracer {
  readonly spans: FakeSpan[] = [];
  readonly startSpanCalls: Array<{
    name: string;
    options?: SpanOptions;
    context?: Context;
    span: FakeSpan;
  }> = [];
  throwOnStartSpanMessage?: string;
  decorateSpan?: (span: FakeSpan, callIndex: number) => void;

  startSpan(name: string, options?: SpanOptions, context?: Context): Span {
    if (this.throwOnStartSpanMessage) {
      throw new Error(this.throwOnStartSpanMessage);
    }
    const span = new FakeSpan(name, options, context);
    this.decorateSpan?.(span, this.startSpanCalls.length);
    this.spans.push(span);
    this.startSpanCalls.push({ name, options, context, span });
    return span as unknown as Span;
  }
}

function asTracer(fakeTracer: FakeTracer): Tracer {
  return fakeTracer as unknown as Tracer;
}

function createFixedClock(values: number[]): ImportTelemetryClock {
  let index = 0;

  return {
    nowMs() {
      const value = values[Math.min(index, values.length - 1)] ?? 0;
      index += 1;
      return value;
    },
  };
}

function createCorrelation(importRunId = "run-1"): ImportTelemetryCorrelation {
  return {
    namespace: IMPORT_TELEMETRY_NAMESPACE,
    importRunId,
    projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
    sourceKind: "prisma-schema-file",
    sourceLabel: "prisma/schema.prisma",
  };
}

function createEvent(overrides: Partial<ImportTelemetryEvent> = {}): ImportTelemetryEvent {
  const correlation = overrides.correlation ?? createCorrelation();
  return {
    sequence: overrides.sequence ?? 1,
    timestampMs: overrides.timestampMs,
    eventName: overrides.eventName ?? IMPORT_TELEMETRY_EVENT_NAMES.INPUT_ACCEPTED,
    phase: overrides.phase ?? "input",
    severity: overrides.severity ?? "info",
    code: overrides.code ?? IMPORT_TELEMETRY_CODES.INPUT_ACCEPTED,
    message: overrides.message ?? "input accepted",
    attributes: overrides.attributes ?? {
      source: {
        kind: "prisma-schema-file",
        hasExternalRefContext: true,
      },
    },
    correlation,
    durationMs: overrides.durationMs,
    outcome: overrides.outcome,
  };
}

function createStep(overrides: Partial<ImportTelemetryStep> = {}): ImportTelemetryStep {
  const correlation = overrides.correlation ?? createCorrelation();
  return {
    sequence: overrides.sequence ?? 10,
    startedSequence: overrides.startedSequence ?? 2,
    endedSequence: overrides.endedSequence ?? 10,
    stepName:
      overrides.stepName ?? IMPORT_TELEMETRY_STEP_NAMES.PARSE_PRISMA_SCHEMA_MODELS,
    phase: overrides.phase ?? "parse",
    status: overrides.status ?? "success",
    startedAtMs: overrides.startedAtMs,
    endedAtMs: overrides.endedAtMs,
    durationMs: overrides.durationMs ?? 12,
    attributes: overrides.attributes ?? {
      parsedModels: 2,
      markers: ["[ArrayTruncated:+31]"],
    },
    correlation,
    error: overrides.error,
  };
}

function createSummary(overrides: Partial<ImportTelemetrySummary> = {}): ImportTelemetrySummary {
  const correlation = overrides.correlation ?? createCorrelation();
  return {
    namespace: IMPORT_TELEMETRY_NAMESPACE,
    correlation,
    outcome: overrides.outcome ?? "success",
    counts: overrides.counts ?? {
      nodesGenerated: 2,
      edgesGenerated: 1,
      scalarFieldsGenerated: 5,
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
      warningsByCategory: {
        "provenance.node.miss": 0,
      },
    },
    phases: overrides.phases ?? [
      {
        phase: "parse",
        stepName: IMPORT_TELEMETRY_STEP_NAMES.PARSE_PRISMA_SCHEMA_MODELS,
        status: "success",
        durationMs: 12,
      },
      {
        phase: "finalize",
        stepName: IMPORT_TELEMETRY_STEP_NAMES.FINALIZE_SUMMARY,
        status: "success",
        durationMs: 3,
      },
    ],
    flags: overrides.flags ?? {
      normalizationApplied: true,
      revalidatedAfterNormalize: true,
      hasPartialProvenance: false,
    },
    source: overrides.source ?? {
      sourceKind: "prisma-schema-file",
      sourceLabel: "prisma/schema.prisma",
      hasExternalRefContext: true,
      metadata: {
        fileSizeBytes: 1024,
        markers: {
          deep: "[MaxDepthExceeded]",
        },
      },
    },
  };
}

function getRootSpans(tracer: FakeTracer) {
  return tracer.spans.filter((span) => span.name === "importing.pipeline");
}

function getChildSpans(tracer: FakeTracer) {
  return tracer.spans.filter((span) => span.name !== "importing.pipeline");
}

describe("ImportTelemetryOtelAdapter", () => {
  it("cria span raiz por importRunId", () => {
    const tracer = new FakeTracer();
    const adapter = createImportTelemetryOtelAdapter({ tracer: asTracer(tracer) });

    adapter.recordEvent(createEvent({ sequence: 1, correlation: createCorrelation("run-a") }));
    adapter.recordEvent(
      createEvent({
        sequence: 2,
        correlation: createCorrelation("run-a"),
        eventName: IMPORT_TELEMETRY_EVENT_NAMES.PARSE_START,
        phase: "parse",
        code: IMPORT_TELEMETRY_CODES.PARSE_START,
        severity: "debug",
      }),
    );
    adapter.recordEvent(createEvent({ sequence: 1, correlation: createCorrelation("run-b") }));

    expect(getRootSpans(tracer)).toHaveLength(2);
  });

  it("cria child span para recordStep e correlaciona com root context", () => {
    const tracer = new FakeTracer();
    const adapter = createImportTelemetryOtelAdapter({ tracer: asTracer(tracer) });

    adapter.recordEvent(
      createEvent({
        sequence: 1,
        correlation: createCorrelation("run-step"),
      }),
    );
    adapter.recordStep(
      createStep({
        correlation: createCorrelation("run-step"),
        sequence: 6,
        startedSequence: 2,
        endedSequence: 6,
        startedAtMs: 100,
        endedAtMs: 112,
      }),
    );

    const childSpans = getChildSpans(tracer);
    expect(childSpans).toHaveLength(1);
    expect(childSpans[0]?.ended).toBe(true);
    expect(childSpans[0]?.attributes["import.step_name"]).toBe(
      IMPORT_TELEMETRY_STEP_NAMES.PARSE_PRISMA_SCHEMA_MODELS,
    );

    const childCall = tracer.startSpanCalls.find((call) =>
      call.name.includes(IMPORT_TELEMETRY_STEP_NAMES.PARSE_PRISMA_SCHEMA_MODELS),
    );
    const rootCall = tracer.startSpanCalls.find((call) => call.name === "importing.pipeline");

    expect(childCall).toBeDefined();
    expect(rootCall).toBeDefined();
    expect(trace.getSpan(childCall?.context ?? ROOT_CONTEXT)).toBe(
      rootCall?.span as unknown as Span,
    );
  });

  it("mapeia recordEvent para span event com atributos canonicos", () => {
    const tracer = new FakeTracer();
    const adapter = createImportTelemetryOtelAdapter({ tracer: asTracer(tracer) });

    adapter.recordEvent(
      createEvent({
        sequence: 3,
        timestampMs: 123,
        eventName: IMPORT_TELEMETRY_EVENT_NAMES.EXTERNALREFS_MAP_STATS,
        phase: "externalRefs",
        code: IMPORT_TELEMETRY_CODES.EXTERNALREFS_MAP_STATS,
        message: "stats",
        durationMs: 7,
        outcome: "success",
        attributes: {
          counts: {
            nodes: 2,
            edges: 1,
          },
          markers: ["a", "b"],
        },
      }),
    );

    const rootSpan = getRootSpans(tracer)[0];
    const event = rootSpan?.events[0];

    expect(event?.name).toBe(IMPORT_TELEMETRY_EVENT_NAMES.EXTERNALREFS_MAP_STATS);
    expect(event?.timestampMs).toBe(123);
    expect(event?.attributes).toMatchObject({
      "import.event_name": IMPORT_TELEMETRY_EVENT_NAMES.EXTERNALREFS_MAP_STATS,
      "import.phase": "externalRefs",
      "import.code": IMPORT_TELEMETRY_CODES.EXTERNALREFS_MAP_STATS,
      "import.severity": "info",
      "import.message": "stats",
      "import.sequence": 3,
      "import.duration_ms": 7,
      "import.outcome": "success",
      "import.run_id": "run-1",
      "import.project_id": "58f3ca26-085e-4237-80d9-adcc42f7142b",
      "import.source_kind": "prisma-schema-file",
      "import.source_label": "prisma/schema.prisma",
      "import.event.attr.counts.nodes": 2,
      "import.event.attr.counts.edges": 1,
      "import.event.attr.markers": ["a", "b"],
    });
  });

  it("recordSummary consolida atributos no root e finaliza o ciclo", () => {
    const tracer = new FakeTracer();
    const adapter = createImportTelemetryOtelAdapter({
      tracer: asTracer(tracer),
      clock: createFixedClock([10, 20, 30, 40, 50]),
    });

    adapter.recordEvent(createEvent({ correlation: createCorrelation("run-summary") }));
    adapter.recordSummary(
      createSummary({
        correlation: createCorrelation("run-summary"),
        outcome: "partial",
      }),
    );

    const rootSpan = getRootSpans(tracer)[0];
    expect(rootSpan?.ended).toBe(true);
    expect(rootSpan?.status).toEqual({ code: SpanStatusCode.OK });
    expect(rootSpan?.attributes).toMatchObject({
      "import.outcome": "partial",
      "import.summary.counts.nodes_generated": 2,
      "import.summary.counts.edges_generated": 1,
      "import.summary.counts.external_refs_generated.total": 3,
      "import.summary.flags.normalization_applied": true,
      "import.summary.flags.revalidated_after_normalize": true,
      "import.summary.flags.has_partial_provenance": false,
      "import.summary.source.source_kind": "prisma-schema-file",
      "import.summary.source.source_label": "prisma/schema.prisma",
      "import.summary.source.has_external_ref_context": true,
      "import.summary.source.metadata.fileSizeBytes": 1024,
      "import.summary.source.metadata.markers.deep": "[MaxDepthExceeded]",
    });
    expect(rootSpan?.events.some((event) => event.name === "import.summary.phase")).toBe(true);
  });

  it("mantem finalize idempotente sem duplicar end do root span", () => {
    const tracer = new FakeTracer();
    const warnings: string[] = [];
    const adapter = createImportTelemetryOtelAdapter({
      tracer: asTracer(tracer),
      config: {
        onInternalAdapterWarning: (warning) => warnings.push(warning.code),
      },
      clock: createFixedClock([1, 2, 3, 4, 5]),
    });
    const summary = createSummary({ correlation: createCorrelation("run-idempotent") });

    adapter.recordEvent(createEvent({ correlation: createCorrelation("run-idempotent") }));
    adapter.recordSummary(summary);
    adapter.recordSummary(summary);

    const rootSpan = getRootSpans(tracer)[0];
    expect(rootSpan?.endCalls).toHaveLength(1);
    expect(warnings).toContain("RUN_SUMMARY_DROPPED_AFTER_FINALIZE");
  });

  it("marca status ERROR corretamente para falha em step e root", () => {
    const tracer = new FakeTracer();
    const adapter = createImportTelemetryOtelAdapter({
      tracer: asTracer(tracer),
      clock: createFixedClock([10, 20, 30, 40, 50, 60]),
    });
    const correlation = createCorrelation("run-failure");

    adapter.recordEvent(
      createEvent({
        correlation,
        sequence: 1,
        eventName: IMPORT_TELEMETRY_EVENT_NAMES.PIPELINE_FAILED,
        phase: "finalize",
        severity: "error",
        code: IMPORT_TELEMETRY_CODES.PIPELINE_FAILED,
        message: "pipeline failed",
        outcome: "failure",
      }),
    );
    adapter.recordStep(
      createStep({
        correlation,
        sequence: 7,
        startedSequence: 2,
        endedSequence: 7,
        status: "failure",
        phase: "parse",
        error: {
          name: "ParseError",
          message: "invalid schema",
          code: "PARSE_INVALID",
        },
      }),
    );
    adapter.recordSummary(
      createSummary({
        correlation,
        outcome: "failure",
      }),
    );

    const childSpan = getChildSpans(tracer)[0];
    const rootSpan = getRootSpans(tracer)[0];

    expect(childSpan?.status?.code).toBe(SpanStatusCode.ERROR);
    expect(childSpan?.attributes["import.error.name"]).toBe("ParseError");
    expect(childSpan?.attributes["import.error.message"]).toBe("invalid schema");
    expect(childSpan?.attributes["import.error.code"]).toBe("PARSE_INVALID");
    expect(childSpan?.exceptions).toEqual(["invalid schema"]);

    expect(rootSpan?.status?.code).toBe(SpanStatusCode.ERROR);
    expect(rootSpan?.status?.message).toBe("pipeline failed");
    expect(rootSpan?.attributes["import.failure.last_event_code"]).toBe(
      IMPORT_TELEMETRY_CODES.PIPELINE_FAILED,
    );
  });

  it("aceita payload sanitizado/truncado sem quebrar o shape no adapter", () => {
    const tracer = new FakeTracer();
    const adapter = createImportTelemetryOtelAdapter({ tracer: asTracer(tracer) });
    const correlation = createCorrelation("run-sanitized-shape");

    adapter.recordEvent(
      createEvent({
        correlation,
        attributes: {
          keep: true,
          nested: {
            marker: "[MaxDepthExceeded]",
            truncatedKeys: {
              __telemetryTruncatedKeys: 21,
            },
          },
          hugeArray: [0, 1, 2, "[ArrayTruncated:+31]"],
        },
      }),
    );
    adapter.recordSummary(
      createSummary({
        correlation,
        source: {
          sourceKind: "prisma-schema-file",
          sourceLabel: "prisma/schema.prisma",
          hasExternalRefContext: false,
          metadata: {
            keep: "ok",
            deepMarker: "[MaxDepthExceeded]",
            hugeArray: [0, 1, "[ArrayTruncated:+31]"],
          },
        },
      }),
    );

    const rootSpan = getRootSpans(tracer)[0];
    const rootEvent = rootSpan?.events.find((event) => event.name === IMPORT_TELEMETRY_EVENT_NAMES.INPUT_ACCEPTED);

    expect(rootEvent?.attributes?.["import.event.attr.nested.marker"]).toBe("[MaxDepthExceeded]");
    expect(rootEvent?.attributes?.["import.event.attr.nested.truncatedKeys.__telemetryTruncatedKeys"]).toBe(
      21,
    );
    expect(rootEvent?.attributes?.["import.event.attr.hugeArray"]).toBe("[0,1,2,\"[ArrayTruncated:+31]\"]");
    expect(rootSpan?.attributes["import.summary.source.metadata.deepMarker"]).toBe(
      "[MaxDepthExceeded]",
    );
    expect(rootSpan?.attributes["import.summary.source.metadata.hugeArray"]).toBe(
      "[0,1,\"[ArrayTruncated:+31]\"]",
    );
  });

  it("trata cenarios fora de ordem com fallback seguro e warnings internos", () => {
    const tracer = new FakeTracer();
    const onWarning = vi.fn();
    const adapter = createImportTelemetryOtelAdapter({
      tracer: asTracer(tracer),
      config: {
        onInternalAdapterWarning: onWarning,
      },
      clock: createFixedClock([1, 2, 3, 4, 5, 6, 7]),
    });

    const lateRun = createCorrelation("run-late");
    adapter.recordSummary(createSummary({ correlation: lateRun }));
    adapter.recordEvent(createEvent({ correlation: lateRun, sequence: 99 }));
    adapter.recordStep(createStep({ correlation: lateRun, sequence: 100 }));

    const stepFirstRun = createCorrelation("run-step-first");
    adapter.recordStep(
      createStep({
        correlation: stepFirstRun,
        sequence: 4,
        startedSequence: 2,
        endedSequence: 4,
      }),
    );
    adapter.recordSummary(createSummary({ correlation: stepFirstRun }));

    expect(getRootSpans(tracer)).toHaveLength(2);
    expect(onWarning).toHaveBeenCalled();
    expect(onWarning.mock.calls.map(([warning]) => warning.code)).toEqual(
      expect.arrayContaining([
        "RUN_EVENT_DROPPED_AFTER_FINALIZE",
        "RUN_STEP_DROPPED_AFTER_FINALIZE",
      ]),
    );
  });

  it("faz cleanup do registry apos finalize sem run ativo sobrando", () => {
    const tracer = new FakeTracer();
    const adapter = new ImportTelemetryOtelAdapter({
      tracer: asTracer(tracer),
      clock: createFixedClock([1, 2, 3, 4, 5]),
    });
    const correlation = createCorrelation("run-cleanup");

    adapter.recordEvent(createEvent({ correlation }));
    adapter.recordStep(createStep({ correlation }));
    adapter.recordSummary(createSummary({ correlation }));

    expect(adapter.debugSnapshot()).toMatchObject({
      activeRunCount: 0,
      finalizedRunCount: 1,
      finalizedRunIds: ["run-cleanup"],
      finalizedRuns: [
        {
          importRunId: "run-cleanup",
          summaryReceived: true,
        },
      ],
    });
  });

  it("descarta tombstones antigos quando ultrapassa maxFinalizedRunTombstones", () => {
    const tracer = new FakeTracer();
    const adapter = new ImportTelemetryOtelAdapter({
      tracer: asTracer(tracer),
      config: {
        maxFinalizedRunTombstones: 2,
      },
      clock: createFixedClock([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
    });

    for (const runId of ["run-1", "run-2", "run-3"]) {
      const correlation = createCorrelation(runId);
      adapter.recordEvent(createEvent({ correlation }));
      adapter.recordSummary(createSummary({ correlation }));
    }

    expect(adapter.debugSnapshot()).toMatchObject({
      activeRunCount: 0,
      finalizedRunCount: 2,
      finalizedRunIds: ["run-2", "run-3"],
    });
  });

  it("normaliza maxFinalizedRunTombstones invalido para inteiro nao-negativo", () => {
    const tracer = new FakeTracer();
    const adapter = new ImportTelemetryOtelAdapter({
      tracer: asTracer(tracer),
      config: {
        maxFinalizedRunTombstones: -5.7,
      },
      clock: createFixedClock([1, 2, 3, 4]),
    });
    const correlation = createCorrelation("run-negative-tombstone-limit");

    expect(() => {
      adapter.recordEvent(createEvent({ correlation }));
      adapter.recordSummary(createSummary({ correlation }));
    }).not.toThrow();
    expect(adapter.debugSnapshot()).toMatchObject({
      activeRunCount: 0,
      finalizedRunCount: 0,
      finalizedRunIds: [],
    });
  });

  it("replaya eventos correlacionados no child span quando recordEventsOnRootOnly=false", () => {
    const tracer = new FakeTracer();
    const adapter = createImportTelemetryOtelAdapter({
      tracer: asTracer(tracer),
      config: {
        recordEventsOnRootOnly: false,
      },
    });
    const correlation = createCorrelation("run-replay");

    adapter.recordEvent(
      createEvent({
        correlation,
        sequence: 1,
        eventName: IMPORT_TELEMETRY_EVENT_NAMES.INPUT_ACCEPTED,
        phase: "input",
      }),
    );
    adapter.recordEvent(
      createEvent({
        correlation,
        sequence: 2,
        eventName: IMPORT_TELEMETRY_EVENT_NAMES.PARSE_START,
        phase: "parse",
        code: IMPORT_TELEMETRY_CODES.PARSE_START,
        severity: "debug",
      }),
    );
    adapter.recordEvent(
      createEvent({
        correlation,
        sequence: 3,
        eventName: IMPORT_TELEMETRY_EVENT_NAMES.PARSE_END,
        phase: "parse",
        code: IMPORT_TELEMETRY_CODES.PARSE_OK,
      }),
    );
    adapter.recordEvent(
      createEvent({
        correlation,
        sequence: 4,
        eventName: IMPORT_TELEMETRY_EVENT_NAMES.EXTERNALREFS_MAP_START,
        phase: "externalRefs",
        code: IMPORT_TELEMETRY_CODES.EXTERNALREFS_MAP_START,
        severity: "debug",
      }),
    );
    adapter.recordStep(
      createStep({
        correlation,
        phase: "parse",
        startedSequence: 2,
        endedSequence: 5,
        sequence: 5,
      }),
    );

    const childSpan = getChildSpans(tracer)[0];
    expect(childSpan).toBeDefined();
    expect((childSpan?.events ?? []).map((event) => event.name)).toEqual([
      IMPORT_TELEMETRY_EVENT_NAMES.PARSE_END,
    ]);
    expect(
      childSpan?.events[0]?.attributes?.["import.event_name"],
    ).toBe(IMPORT_TELEMETRY_EVENT_NAMES.PARSE_END);
  });

  it("nao quebra o pipeline quando operacoes do tracer falham e emite warnings consistentes", () => {
    const tracer = new FakeTracer();
    tracer.decorateSpan = (span, callIndex) => {
      span.throwOn = {
        addEvent: `addEvent-fail-${callIndex}`,
        setAttributes: `setAttributes-fail-${callIndex}`,
        setStatus: `setStatus-fail-${callIndex}`,
        recordException: `recordException-fail-${callIndex}`,
        end: `end-fail-${callIndex}`,
      };
    };
    const warnings: Array<{ code: string; details?: Record<string, unknown>; message: string }> = [];
    const adapter = createImportTelemetryOtelAdapter({
      tracer: asTracer(tracer),
      config: {
        onInternalAdapterWarning: (warning) => warnings.push(warning),
      },
      clock: createFixedClock([10, 20, 30, 40, 50, 60, 70, 80]),
    });
    const correlation = createCorrelation("run-tracer-failures");

    expect(() => {
      adapter.recordEvent(createEvent({ correlation, sequence: 1 }));
      adapter.recordStep(
        createStep({
          correlation,
          sequence: 5,
          startedSequence: 2,
          endedSequence: 5,
          status: "failure",
          error: {
            name: "StepError",
            message: "boom",
            code: "STEP_ERR",
          },
        }),
      );
      adapter.recordSummary(createSummary({ correlation, outcome: "failure" }));
    }).not.toThrow();

    const tracerWarningDetails = warnings
      .filter((warning) => warning.code === "TRACER_OPERATION_FAILED")
      .map((warning) => warning.details?.operation);

    expect(tracerWarningDetails).toEqual(
      expect.arrayContaining([
        "addEvent",
        "setAttributes",
        "setStatus",
        "recordException",
        "end",
      ]),
    );
    expect(adapter.debugSnapshot().activeRunCount).toBe(0);
  });

  it("emite warning e nao quebra quando tracer.startSpan falha", () => {
    const tracer = new FakeTracer();
    tracer.throwOnStartSpanMessage = "startSpan exploded";
    const onWarning = vi.fn((warning) => {
      throw new Error(`callback should not bubble: ${warning.code}`);
    });
    const adapter = createImportTelemetryOtelAdapter({
      tracer: asTracer(tracer),
      config: {
        onInternalAdapterWarning: onWarning,
      },
    });
    const correlation = createCorrelation("run-startspan-fail");

    expect(() => {
      adapter.recordEvent(createEvent({ correlation }));
      adapter.recordSummary(createSummary({ correlation }));
    }).not.toThrow();
    expect(tracer.spans).toHaveLength(0);
    expect(onWarning).toHaveBeenCalled();
    const firstWarning = onWarning.mock.calls[0]?.[0];
    expect(firstWarning?.code).toBe("TRACER_OPERATION_FAILED");
    expect(firstWarning?.details?.operation).toBe("startSpan");
  });

  it("integra com importPrismaSchemaToGraphSnapshot usando tracer fake (smoke)", () => {
    const tracer = new FakeTracer();
    const adapter = createImportTelemetryOtelAdapter({
      tracer: asTracer(tracer),
      clock: createFixedClock(Array.from({ length: 64 }, (_, index) => index + 1)),
    });

    const result = importPrismaSchemaToGraphSnapshot({
      projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
      schemaText: `
        model User {
          id    String @id
          posts Post[]
        }

        model Post {
          id       String @id
          authorId String
          author   User @relation(fields: [authorId], references: [id])
        }
      `,
      externalRefContext: {
        sourceKind: "prisma-schema-file",
        filePath: "prisma/schema.prisma",
      },
      telemetry: {
        collector: adapter,
      },
    });

    expect(result.snapshot.nodes).toHaveLength(2);
    expect(result.snapshot.edges).toHaveLength(1);

    const rootSpan = getRootSpans(tracer)[0];
    const childSpans = getChildSpans(tracer);
    const rootEventNames = (rootSpan?.events ?? []).map((event) => event.name);

    expect(rootSpan?.ended).toBe(true);
    expect(childSpans.length).toBeGreaterThan(0);
    expect(rootEventNames).toEqual(
      expect.arrayContaining([
        IMPORT_TELEMETRY_EVENT_NAMES.INPUT_ACCEPTED,
        IMPORT_TELEMETRY_EVENT_NAMES.PARSE_START,
        IMPORT_TELEMETRY_EVENT_NAMES.FINALIZE_SUMMARY,
      ]),
    );
    expect(rootSpan?.attributes["import.outcome"]).toBe("success");
  });
});
