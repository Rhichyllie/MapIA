import {
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  trace,
  type Attributes,
  type Counter,
  type Context,
  type Histogram,
  type Meter,
  type Span,
  type SpanOptions,
  type Tracer,
} from "@opentelemetry/api";
import {
  IMPORT_TELEMETRY_FAILURE_CODES,
  type ImportTelemetryAttributes,
  type ImportTelemetryClock,
  type ImportTelemetryCollector,
  type ImportTelemetryCorrelation,
  type ImportTelemetryEvent,
  type ImportTelemetryOutcome,
  type ImportTelemetryPhase,
  type ImportTelemetrySeverity,
  type ImportTelemetryStep,
  type ImportTelemetryStepStatus,
  type ImportTelemetrySummary,
  type ImportTelemetryValue,
} from "../../domain";

const OTEL_NULL_ATTRIBUTE_MARKER = "[null]" as const;
const OTEL_EMPTY_OBJECT_ATTRIBUTE_MARKER = "{}" as const;
const OTEL_EMPTY_ARRAY_ATTRIBUTE_MARKER = "[]" as const;
const DEFAULT_ROOT_SPAN_NAME = "importing.pipeline" as const;
const DEFAULT_ATTRIBUTE_PREFIX = "import." as const;
const DEFAULT_MAX_FINALIZED_RUN_TOMBSTONES = 1024 as const;

const FAILURE_CODES = new Set<string>(IMPORT_TELEMETRY_FAILURE_CODES);

type ImportTelemetryOtelAdapterWarningCode =
  | "RUN_EVENT_DROPPED_AFTER_FINALIZE"
  | "RUN_STEP_DROPPED_AFTER_FINALIZE"
  | "RUN_SUMMARY_DROPPED_AFTER_FINALIZE"
  | "RUN_SUMMARY_DUPLICATED"
  | "SPAN_ALREADY_ENDED"
  | "METRICS_OPERATION_FAILED"
  | "TRACER_OPERATION_FAILED";

type ImportTelemetryOtelAdapterWarning = {
  code: ImportTelemetryOtelAdapterWarningCode;
  importRunId: string;
  message: string;
  details?: Record<string, string | number | boolean | null>;
};

export type ImportTelemetryOtelAdapterConfig = {
  rootSpanName?: string;
  attributePrefix?: string;
  recordEventsOnRootOnly?: boolean;
  enableDebugLifecycleEvents?: boolean;
  onInternalAdapterWarning?: (warning: ImportTelemetryOtelAdapterWarning) => void;
  maxFinalizedRunTombstones?: number;
};

export type CreateImportTelemetryOtelAdapterInput = {
  tracer: Tracer;
  meter?: Meter;
  config?: ImportTelemetryOtelAdapterConfig;
  clock?: ImportTelemetryClock;
};

type NormalizedImportTelemetryOtelAdapterConfig = {
  rootSpanName: string;
  attributePrefix: string;
  recordEventsOnRootOnly: boolean;
  enableDebugLifecycleEvents: boolean;
  onInternalAdapterWarning?: (warning: ImportTelemetryOtelAdapterWarning) => void;
  maxFinalizedRunTombstones: number;
};

type ManagedSpanState = {
  span: Span;
  name: string;
  ended: boolean;
  endCallCount: number;
};

type BufferedRunEvent = {
  sequence: number;
  phase: ImportTelemetryPhase;
  eventName: string;
  attributes: Attributes;
  timestampMs?: number;
};

type RecordedStepSpan = {
  stepName: string;
  phase: ImportTelemetryPhase;
  status: ImportTelemetryStepStatus;
  sequence: number;
  startedSequence: number;
  endedSequence: number;
  ended: boolean;
  endCallCount: number;
};

type ActiveRunState = {
  correlation: ImportTelemetryCorrelation;
  rootSpan: ManagedSpanState;
  rootContext: Context;
  eventBuffer: BufferedRunEvent[];
  stepSpans: RecordedStepSpan[];
  summaryReceived: boolean;
  finalized: boolean;
  createdAtMs: number;
  warningsCount: number;
  lastFailureEvent?: {
    code: string;
    message: string;
    severity: ImportTelemetrySeverity;
    eventName: string;
  };
};

type FinalizedRunTombstone = {
  finalizedAtMs: number;
  summaryReceived: boolean;
};

type DebugActiveRunSnapshot = {
  importRunId: string;
  createdAtMs: number;
  eventBufferCount: number;
  stepSpanCount: number;
  summaryReceived: boolean;
  finalized: boolean;
  warningsCount: number;
  rootSpanEnded: boolean;
};

type DebugFinalizedRunSnapshot = {
  importRunId: string;
  finalizedAtMs: number;
  summaryReceived: boolean;
};

type DebugSnapshot = {
  activeRunCount: number;
  activeRunIds: string[];
  finalizedRunCount: number;
  finalizedRunIds: string[];
  activeRuns: DebugActiveRunSnapshot[];
  finalizedRuns: DebugFinalizedRunSnapshot[];
};

type ImportTelemetryOtelAdapterMetricsInstruments = {
  runsStarted: Counter;
  runsFinalized: Counter;
  adapterWarnings: Counter;
  lateDrops: Counter;
  runDurationMs: Histogram;
  stepDurationMs: Histogram;
};

type ImportTelemetryOtelAdapterMetricsRecorder = {
  recordRunStarted(correlation: ImportTelemetryCorrelation): void;
  recordRunFinalized(params: {
    correlation: ImportTelemetryCorrelation;
    outcome: ImportTelemetryOutcome;
    durationMs: number;
  }): void;
  recordStep(step: ImportTelemetryStep): void;
  recordWarning(warning: ImportTelemetryOtelAdapterWarning): void;
  recordLateDrop(params: {
    dropKind: "event" | "step" | "summary";
    correlation?: ImportTelemetryCorrelation;
  }): void;
};

function defaultClock(): ImportTelemetryClock {
  return {
    nowMs: () => Date.now(),
  };
}

function normalizeAttributePrefix(prefix: string | undefined): string {
  if (!prefix) {
    return "";
  }

  return prefix.endsWith(".") ? prefix : `${prefix}.`;
}

function normalizeConfig(
  config: ImportTelemetryOtelAdapterConfig | undefined,
): NormalizedImportTelemetryOtelAdapterConfig {
  const normalizedMaxFinalizedRunTombstones = Number.isFinite(config?.maxFinalizedRunTombstones)
    ? Math.max(0, Math.trunc(config?.maxFinalizedRunTombstones ?? 0))
    : DEFAULT_MAX_FINALIZED_RUN_TOMBSTONES;

  return {
    rootSpanName: config?.rootSpanName ?? DEFAULT_ROOT_SPAN_NAME,
    attributePrefix: normalizeAttributePrefix(config?.attributePrefix ?? DEFAULT_ATTRIBUTE_PREFIX),
    recordEventsOnRootOnly: config?.recordEventsOnRootOnly ?? true,
    enableDebugLifecycleEvents: config?.enableDebugLifecycleEvents ?? false,
    onInternalAdapterWarning: config?.onInternalAdapterWarning,
    maxFinalizedRunTombstones: normalizedMaxFinalizedRunTombstones,
  };
}

function createNoopMetricsRecorder(): ImportTelemetryOtelAdapterMetricsRecorder {
  return {
    recordRunStarted() {},
    recordRunFinalized() {},
    recordStep() {},
    recordWarning() {},
    recordLateDrop() {},
  };
}

function createImportTelemetryOtelAdapterMetricsRecorder(input: {
  meter?: Meter;
  onMetricsOperationFailed: (operation: string, error: unknown) => void;
}): ImportTelemetryOtelAdapterMetricsRecorder {
  const meter = input.meter;
  if (!meter) {
    return createNoopMetricsRecorder();
  }

  let instruments: ImportTelemetryOtelAdapterMetricsInstruments | undefined;
  let metricsFailureWarningMuted = false;

  const emitMetricsFailureWarning = (operation: string, error: unknown) => {
    if (metricsFailureWarningMuted) {
      return;
    }

    metricsFailureWarningMuted = true;
    input.onMetricsOperationFailed(operation, error);
  };

  const getInstruments = (): ImportTelemetryOtelAdapterMetricsInstruments | undefined => {
    if (instruments) {
      return instruments;
    }

    try {
      instruments = {
        runsStarted: meter.createCounter("importing.telemetry.runs.started", {
          description: "Quantidade de import runs iniciados no adapter OTel.",
          unit: "{run}",
        }),
        runsFinalized: meter.createCounter("importing.telemetry.runs.finalized", {
          description: "Quantidade de import runs finalizados por outcome.",
          unit: "{run}",
        }),
        adapterWarnings: meter.createCounter("importing.telemetry.adapter.warnings", {
          description: "Warnings internos do ImportTelemetryOtelAdapter por codigo.",
          unit: "{warning}",
        }),
        lateDrops: meter.createCounter("importing.telemetry.adapter.late_drops", {
          description: "Drops tardios de eventos/steps/summary apos finalize.",
          unit: "{drop}",
        }),
        runDurationMs: meter.createHistogram("importing.telemetry.run.duration", {
          description: "Duracao total do import run observada no adapter OTel.",
          unit: "ms",
        }),
        stepDurationMs: meter.createHistogram("importing.telemetry.step.duration", {
          description: "Duracao de steps do pipeline de importacao observada no adapter OTel.",
          unit: "ms",
        }),
      };

      return instruments;
    } catch (error) {
      emitMetricsFailureWarning("createInstruments", error);
      return undefined;
    }
  };

  const safeCounterAdd = (
    operation: string,
    counter: Counter | undefined,
    value: number,
    attributes: Attributes,
  ) => {
    if (!counter) {
      return;
    }
    try {
      counter.add(value, attributes);
    } catch (error) {
      emitMetricsFailureWarning(operation, error);
    }
  };

  const safeHistogramRecord = (
    operation: string,
    histogram: Histogram | undefined,
    value: number,
    attributes: Attributes,
  ) => {
    if (!histogram) {
      return;
    }
    try {
      histogram.record(Math.max(0, value), attributes);
    } catch (error) {
      emitMetricsFailureWarning(operation, error);
    }
  };

  const baseRunAttributes = (correlation: ImportTelemetryCorrelation): Attributes => ({
    "importing.source_kind": correlation.sourceKind,
    ...(correlation.sourceLabel ? { "importing.source_label_present": true } : {}),
  });

  return {
    recordRunStarted(correlation) {
      const created = getInstruments();
      safeCounterAdd("runsStarted.add", created?.runsStarted, 1, baseRunAttributes(correlation));
    },
    recordRunFinalized(params) {
      const created = getInstruments();
      const attributes: Attributes = {
        ...baseRunAttributes(params.correlation),
        "importing.outcome": params.outcome,
      };
      safeCounterAdd("runsFinalized.add", created?.runsFinalized, 1, attributes);
      safeHistogramRecord(
        "runDurationMs.record",
        created?.runDurationMs,
        params.durationMs,
        attributes,
      );
    },
    recordStep(step) {
      const created = getInstruments();
      safeHistogramRecord(
        "stepDurationMs.record",
        created?.stepDurationMs,
        Math.max(0, step.durationMs ?? 0),
        {
          "importing.phase": step.phase,
          "importing.status": step.status,
          "importing.step_name": step.stepName,
          "importing.source_kind": step.correlation.sourceKind,
        },
      );
    },
    recordWarning(warning) {
      const created = getInstruments();
      safeCounterAdd("adapterWarnings.add", created?.adapterWarnings, 1, {
        "importing.warning_code": warning.code,
      });
    },
    recordLateDrop(params) {
      const created = getInstruments();
      safeCounterAdd("lateDrops.add", created?.lateDrops, 1, {
        "importing.drop_kind": params.dropKind,
        ...(params.correlation ? { "importing.source_kind": params.correlation.sourceKind } : {}),
      });
    },
  };
}

function toOtelPrimitiveArray(
  value: ImportTelemetryValue[],
): string[] | number[] | boolean[] | undefined {
  if (value.length === 0) {
    return undefined;
  }

  const first = value[0];
  if (typeof first !== "string" && typeof first !== "number" && typeof first !== "boolean") {
    return undefined;
  }

  if (first === null || Array.isArray(first) || typeof first === "object") {
    return undefined;
  }

  if (typeof first === "string") {
    const result: string[] = [first];
    for (const item of value.slice(1)) {
      if (typeof item !== "string") {
        return undefined;
      }
      result.push(item);
    }
    return result;
  }

  if (typeof first === "number") {
    const result: number[] = [first];
    for (const item of value.slice(1)) {
      if (typeof item !== "number") {
        return undefined;
      }
      result.push(item);
    }
    return result;
  }

  const result: boolean[] = [first];
  for (const item of value.slice(1)) {
    if (typeof item !== "boolean") {
      return undefined;
    }
    result.push(item);
  }
  return result;
}

function flattenImportTelemetryValue(
  target: Attributes,
  key: string,
  value: ImportTelemetryValue,
): void {
  if (value === null) {
    target[key] = OTEL_NULL_ATTRIBUTE_MARKER;
    return;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    target[key] = value;
    return;
  }

  if (Array.isArray(value)) {
    const primitiveArray = toOtelPrimitiveArray(value);
    if (primitiveArray) {
      target[key] = primitiveArray;
      return;
    }

    target[key] = value.length === 0 ? OTEL_EMPTY_ARRAY_ATTRIBUTE_MARKER : JSON.stringify(value);
    return;
  }

  const entries = Object.entries(value);
  if (entries.length === 0) {
    target[key] = OTEL_EMPTY_OBJECT_ATTRIBUTE_MARKER;
    return;
  }

  for (const [nestedKey, nestedValue] of entries) {
    flattenImportTelemetryValue(target, `${key}.${nestedKey}`, nestedValue);
  }
}

function flattenImportTelemetryAttributes(
  target: Attributes,
  baseKeyPrefix: string,
  attributes: ImportTelemetryAttributes,
): void {
  for (const [key, value] of Object.entries(attributes)) {
    flattenImportTelemetryValue(target, `${baseKeyPrefix}${key}`, value);
  }
}

function stepStatusToOtelSpanStatus(status: ImportTelemetryStepStatus): SpanStatusCode {
  if (status === "failure") {
    return SpanStatusCode.ERROR;
  }

  return SpanStatusCode.OK;
}

function outcomeToOtelSpanStatus(outcome: ImportTelemetryOutcome): SpanStatusCode {
  if (outcome === "failure") {
    return SpanStatusCode.ERROR;
  }

  return SpanStatusCode.OK;
}

function inferRootStartTimeFromEvent(event: ImportTelemetryEvent, clock: ImportTelemetryClock): number {
  return event.timestampMs ?? clock.nowMs();
}

function inferRootStartTimeFromStep(step: ImportTelemetryStep, clock: ImportTelemetryClock): number {
  if (typeof step.startedAtMs === "number") {
    return step.startedAtMs;
  }

  if (typeof step.endedAtMs === "number") {
    return Math.max(0, step.endedAtMs - Math.max(0, step.durationMs ?? 0));
  }

  return Math.max(0, clock.nowMs() - Math.max(0, step.durationMs ?? 0));
}

function inferStepStartTime(step: ImportTelemetryStep, clock: ImportTelemetryClock): number {
  return inferRootStartTimeFromStep(step, clock);
}

function inferStepEndTime(step: ImportTelemetryStep, startTime: number): number {
  if (typeof step.endedAtMs === "number") {
    return step.endedAtMs;
  }

  return Math.max(startTime, startTime + Math.max(0, step.durationMs ?? 0));
}

export class ImportTelemetryOtelAdapter implements ImportTelemetryCollector {
  private readonly tracer: Tracer;
  private readonly config: NormalizedImportTelemetryOtelAdapterConfig;
  private readonly clock: ImportTelemetryClock;
  private readonly metrics: ImportTelemetryOtelAdapterMetricsRecorder;
  private readonly activeRuns = new Map<string, ActiveRunState>();
  private readonly finalizedRuns = new Map<string, FinalizedRunTombstone>();
  private readonly finalizedRunOrder: string[] = [];

  constructor(input: CreateImportTelemetryOtelAdapterInput) {
    this.tracer = input.tracer;
    this.config = normalizeConfig(input.config);
    this.clock = input.clock ?? defaultClock();
    this.metrics = createImportTelemetryOtelAdapterMetricsRecorder({
      meter: input.meter,
      onMetricsOperationFailed: (operation, error) => {
        this.emitWarning({
          code: "METRICS_OPERATION_FAILED",
          importRunId: "metrics",
          message: `Metrics operation failed safely (${operation}).`,
          details: {
            operation,
            errorMessage: error instanceof Error ? error.message : String(error),
          },
        });
      },
    });
  }

  recordEvent(event: ImportTelemetryEvent): void {
    const runId = event.correlation.importRunId;
    if (this.isRunFinalized(runId)) {
      this.metrics.recordLateDrop({
        dropKind: "event",
        correlation: event.correlation,
      });
      this.emitWarning({
        code: "RUN_EVENT_DROPPED_AFTER_FINALIZE",
        importRunId: runId,
        message: "Ignoring telemetry event for a finalized import run.",
        details: {
          sequence: event.sequence,
          eventName: event.eventName,
        },
      });
      return;
    }

    const runState = this.getOrCreateRunState(event.correlation, inferRootStartTimeFromEvent(event, this.clock));
    if (!runState) {
      return;
    }

    const mapped = this.mapEvent(event);
    this.safeSpanAddEvent(runState.rootSpan.span, mapped.eventName, mapped.attributes, mapped.timestampMs, runId);
    runState.eventBuffer.push({
      sequence: event.sequence,
      phase: event.phase,
      eventName: mapped.eventName,
      attributes: mapped.attributes,
      ...(typeof mapped.timestampMs === "number" ? { timestampMs: mapped.timestampMs } : {}),
    });

    if (mapped.isFailureEvent) {
      runState.lastFailureEvent = {
        code: event.code,
        message: event.message,
        severity: event.severity,
        eventName: event.eventName,
      };
      this.safeSpanSetAttributes(
        runState.rootSpan.span,
        {
          [this.attrKey("failure.last_event_code")]: event.code,
          [this.attrKey("failure.last_event_name")]: event.eventName,
          [this.attrKey("failure.last_event_severity")]: event.severity,
          [this.attrKey("failure.last_event_message")]: event.message,
        },
        runId,
      );
    }
  }

  recordStep(step: ImportTelemetryStep): void {
    const runId = step.correlation.importRunId;
    if (this.isRunFinalized(runId)) {
      this.metrics.recordLateDrop({
        dropKind: "step",
        correlation: step.correlation,
      });
      this.emitWarning({
        code: "RUN_STEP_DROPPED_AFTER_FINALIZE",
        importRunId: runId,
        message: "Ignoring telemetry step for a finalized import run.",
        details: {
          sequence: step.sequence,
          stepName: step.stepName,
        },
      });
      return;
    }

    const runState = this.getOrCreateRunState(step.correlation, inferRootStartTimeFromStep(step, this.clock));
    if (!runState) {
      return;
    }

    const startTime = inferStepStartTime(step, this.clock);
    const endTime = inferStepEndTime(step, startTime);
    const stepAttributes = this.mapStepSpanAttributes(step);
    const childSpan = this.safeStartSpan(
      this.getStepSpanName(step),
      {
        kind: SpanKind.INTERNAL,
        startTime,
        attributes: stepAttributes,
      },
      runState.rootContext,
      runId,
    );
    if (!childSpan) {
      return;
    }

    if (!this.config.recordEventsOnRootOnly) {
      this.replayCorrelatedEventsOnStepSpan(runState, step, childSpan, runId);
    }

    if (step.error) {
      this.safeSpanRecordException(childSpan, step.error.message, runId);
    }

    const stepStatusCode = stepStatusToOtelSpanStatus(step.status);
    this.safeSpanSetStatus(
      childSpan,
      {
        code: stepStatusCode,
        ...(stepStatusCode === SpanStatusCode.ERROR && step.error
          ? { message: step.error.message }
          : {}),
      },
      runId,
    );

    const managedChildSpan: ManagedSpanState = {
      span: childSpan,
      name: this.getStepSpanName(step),
      ended: false,
      endCallCount: 0,
    };
    this.safeEndManagedSpan(managedChildSpan, endTime, runId);

    runState.stepSpans.push({
      stepName: step.stepName,
      phase: step.phase,
      status: step.status,
      sequence: step.sequence,
      startedSequence: step.startedSequence,
      endedSequence: step.endedSequence,
      ended: managedChildSpan.ended,
      endCallCount: managedChildSpan.endCallCount,
    });
    this.metrics.recordStep(step);
  }

  recordSummary(summary: ImportTelemetrySummary): void {
    const runId = summary.correlation.importRunId;
    if (this.isRunFinalized(runId)) {
      this.metrics.recordLateDrop({
        dropKind: "summary",
        correlation: summary.correlation,
      });
      this.emitWarning({
        code: "RUN_SUMMARY_DROPPED_AFTER_FINALIZE",
        importRunId: runId,
        message: "Ignoring duplicated or late summary for a finalized import run.",
        details: {
          outcome: summary.outcome,
        },
      });
      return;
    }

    const runState = this.getOrCreateRunState(summary.correlation, this.clock.nowMs());
    if (!runState) {
      return;
    }

    if (runState.summaryReceived) {
      this.emitWarning({
        code: "RUN_SUMMARY_DUPLICATED",
        importRunId: runId,
        message: "Summary was already recorded for this import run.",
        details: {
          outcome: summary.outcome,
        },
      });
      return;
    }

    runState.summaryReceived = true;
    const summaryAttributes = this.mapSummaryRootAttributes(summary);
    this.safeSpanSetAttributes(runState.rootSpan.span, summaryAttributes, runId);
    this.recordSummaryPhaseEvents(runState.rootSpan.span, summary, runId);

    const rootStatusCode = outcomeToOtelSpanStatus(summary.outcome);
    this.safeSpanSetStatus(
      runState.rootSpan.span,
      {
        code: rootStatusCode,
        ...(rootStatusCode === SpanStatusCode.ERROR
          ? {
              message:
                runState.lastFailureEvent?.message ?? "Import pipeline finished with failure",
            }
          : {}),
      },
      runId,
    );

    if (summary.outcome === "failure" && runState.lastFailureEvent) {
      this.safeSpanSetAttributes(
        runState.rootSpan.span,
        {
          [this.attrKey("failure.root_status_source")]: "event",
          [this.attrKey("failure.root_status_event_code")]: runState.lastFailureEvent.code,
          [this.attrKey("failure.root_status_event_name")]: runState.lastFailureEvent.eventName,
        },
        runId,
      );
    }

    this.recordDebugLifecycleEvent(runState.rootSpan.span, "adapter.lifecycle.run.finalizing", {
      [this.attrKey("lifecycle.step_count")]: runState.stepSpans.length,
      [this.attrKey("lifecycle.event_count")]: runState.eventBuffer.length,
      [this.attrKey("lifecycle.summary_received")]: true,
    });

    runState.finalized = true;
    this.metrics.recordRunFinalized({
      correlation: summary.correlation,
      outcome: summary.outcome,
      durationMs: Math.max(0, this.clock.nowMs() - runState.createdAtMs),
    });
    this.safeEndManagedSpan(runState.rootSpan, this.clock.nowMs(), runId);
    this.finalizeAndCleanupRun(runId, runState);
  }

  debugSnapshot(): DebugSnapshot {
    return {
      activeRunCount: this.activeRuns.size,
      activeRunIds: [...this.activeRuns.keys()],
      finalizedRunCount: this.finalizedRuns.size,
      finalizedRunIds: [...this.finalizedRuns.keys()],
      activeRuns: [...this.activeRuns.entries()].map(([importRunId, runState]) => ({
        importRunId,
        createdAtMs: runState.createdAtMs,
        eventBufferCount: runState.eventBuffer.length,
        stepSpanCount: runState.stepSpans.length,
        summaryReceived: runState.summaryReceived,
        finalized: runState.finalized,
        warningsCount: runState.warningsCount,
        rootSpanEnded: runState.rootSpan.ended,
      })),
      finalizedRuns: [...this.finalizedRuns.entries()].map(([importRunId, tombstone]) => ({
        importRunId,
        finalizedAtMs: tombstone.finalizedAtMs,
        summaryReceived: tombstone.summaryReceived,
      })),
    };
  }

  private getOrCreateRunState(
    correlation: ImportTelemetryCorrelation,
    rootStartTime: number,
  ): ActiveRunState | undefined {
    const runId = correlation.importRunId;
    const existing = this.activeRuns.get(runId);
    if (existing) {
      return existing;
    }

    if (this.isRunFinalized(runId)) {
      return undefined;
    }

    const rootAttributes = this.mapCorrelationAttributes(correlation);
    const rootSpan = this.safeStartSpan(
      this.config.rootSpanName,
      {
        kind: SpanKind.INTERNAL,
        startTime: rootStartTime,
        attributes: rootAttributes,
      },
      ROOT_CONTEXT,
      runId,
    );
    if (!rootSpan) {
      return undefined;
    }

    const runState: ActiveRunState = {
      correlation,
      rootSpan: {
        span: rootSpan,
        name: this.config.rootSpanName,
        ended: false,
        endCallCount: 0,
      },
      rootContext: trace.setSpan(ROOT_CONTEXT, rootSpan),
      eventBuffer: [],
      stepSpans: [],
      summaryReceived: false,
      finalized: false,
      createdAtMs: this.clock.nowMs(),
      warningsCount: 0,
    };
    this.activeRuns.set(runId, runState);
    this.metrics.recordRunStarted(correlation);

    this.recordDebugLifecycleEvent(rootSpan, "adapter.lifecycle.run.created", {
      [this.attrKey("lifecycle.root_span_name")]: this.config.rootSpanName,
      [this.attrKey("lifecycle.record_events_on_root_only")]: this.config.recordEventsOnRootOnly,
    });

    return runState;
  }

  private finalizeAndCleanupRun(runId: string, runState: ActiveRunState): void {
    this.activeRuns.delete(runId);
    this.finalizedRuns.set(runId, {
      finalizedAtMs: this.clock.nowMs(),
      summaryReceived: runState.summaryReceived,
    });
    this.finalizedRunOrder.push(runId);

    while (this.finalizedRunOrder.length > this.config.maxFinalizedRunTombstones) {
      const staleRunId = this.finalizedRunOrder.shift();
      if (staleRunId) {
        this.finalizedRuns.delete(staleRunId);
      }
    }
  }

  private isRunFinalized(runId: string): boolean {
    return this.finalizedRuns.has(runId);
  }

  private attrKey(suffix: string): string {
    return `${this.config.attributePrefix}${suffix}`;
  }

  private mapCorrelationAttributes(correlation: ImportTelemetryCorrelation): Attributes {
    const attributes: Attributes = {
      [this.attrKey("namespace")]: correlation.namespace,
      [this.attrKey("run_id")]: correlation.importRunId,
      [this.attrKey("project_id")]: correlation.projectId,
      [this.attrKey("source_kind")]: correlation.sourceKind,
    };

    if (correlation.sourceLabel) {
      attributes[this.attrKey("source_label")] = correlation.sourceLabel;
    }

    return attributes;
  }

  private mapEvent(event: ImportTelemetryEvent): {
    eventName: string;
    attributes: Attributes;
    timestampMs?: number;
    isFailureEvent: boolean;
  } {
    const isFailureEvent =
      event.severity === "error" ||
      event.outcome === "failure" ||
      FAILURE_CODES.has(event.code);
    const attributes: Attributes = {
      ...this.mapCorrelationAttributes(event.correlation),
      [this.attrKey("phase")]: event.phase,
      [this.attrKey("event_name")]: event.eventName,
      [this.attrKey("code")]: event.code,
      [this.attrKey("severity")]: event.severity,
      [this.attrKey("message")]: event.message,
      [this.attrKey("sequence")]: event.sequence,
      [this.attrKey("is_failure_event")]: isFailureEvent,
      [this.attrKey("is_error_severity")]: event.severity === "error",
      [this.attrKey("is_failure_code")]: FAILURE_CODES.has(event.code),
    };

    if (typeof event.durationMs === "number") {
      attributes[this.attrKey("duration_ms")] = event.durationMs;
    }

    if (event.outcome) {
      attributes[this.attrKey("outcome")] = event.outcome;
    }

    flattenImportTelemetryAttributes(
      attributes,
      this.attrKey("event.attr."),
      event.attributes,
    );

    return {
      eventName: event.eventName,
      attributes,
      ...(typeof event.timestampMs === "number" ? { timestampMs: event.timestampMs } : {}),
      isFailureEvent,
    };
  }

  private mapStepSpanAttributes(step: ImportTelemetryStep): Attributes {
    const attributes: Attributes = {
      ...this.mapCorrelationAttributes(step.correlation),
      [this.attrKey("step_name")]: step.stepName,
      [this.attrKey("phase")]: step.phase,
      [this.attrKey("status")]: step.status,
      [this.attrKey("sequence")]: step.sequence,
      [this.attrKey("started_sequence")]: step.startedSequence,
      [this.attrKey("ended_sequence")]: step.endedSequence,
      [this.attrKey("duration_ms")]: Math.max(0, step.durationMs ?? 0),
      [this.attrKey("step.partial")]: step.status === "partial",
      [this.attrKey("step.failure")]: step.status === "failure",
    };

    if (typeof step.startedAtMs === "number") {
      attributes[this.attrKey("started_at_ms")] = step.startedAtMs;
    }
    if (typeof step.endedAtMs === "number") {
      attributes[this.attrKey("ended_at_ms")] = step.endedAtMs;
    }

    flattenImportTelemetryAttributes(attributes, this.attrKey("step.attr."), step.attributes);

    if (step.error) {
      attributes[this.attrKey("error.name")] = step.error.name;
      attributes[this.attrKey("error.message")] = step.error.message;
      if (step.error.code) {
        attributes[this.attrKey("error.code")] = step.error.code;
      }
    }

    return attributes;
  }

  private mapSummaryRootAttributes(summary: ImportTelemetrySummary): Attributes {
    const attributes: Attributes = {
      ...this.mapCorrelationAttributes(summary.correlation),
      [this.attrKey("outcome")]: summary.outcome,
      [this.attrKey("summary.phase_count")]: summary.phases.length,
      [this.attrKey("summary.counts.nodes_generated")]: summary.counts.nodesGenerated,
      [this.attrKey("summary.counts.edges_generated")]: summary.counts.edgesGenerated,
      [this.attrKey("summary.counts.scalar_fields_generated")]:
        summary.counts.scalarFieldsGenerated,
      [this.attrKey("summary.counts.relation_candidates")]: summary.counts.relationCandidates,
      [this.attrKey("summary.counts.relations_deduplicated")]:
        summary.counts.relationsDeduplicated,
      [this.attrKey("summary.counts.external_refs_generated.nodes")]:
        summary.counts.externalRefsGenerated.nodes,
      [this.attrKey("summary.counts.external_refs_generated.edges")]:
        summary.counts.externalRefsGenerated.edges,
      [this.attrKey("summary.counts.external_refs_generated.total")]:
        summary.counts.externalRefsGenerated.total,
      [this.attrKey("summary.counts.provenance_fallbacks.node_miss")]:
        summary.counts.provenanceFallbacks.nodeMiss,
      [this.attrKey("summary.counts.provenance_fallbacks.edge_miss")]:
        summary.counts.provenanceFallbacks.edgeMiss,
      [this.attrKey("summary.flags.normalization_applied")]:
        summary.flags.normalizationApplied,
      [this.attrKey("summary.flags.revalidated_after_normalize")]:
        summary.flags.revalidatedAfterNormalize,
      [this.attrKey("summary.flags.has_partial_provenance")]:
        summary.flags.hasPartialProvenance,
      [this.attrKey("summary.source.source_kind")]: summary.source.sourceKind,
      [this.attrKey("summary.source.has_external_ref_context")]:
        summary.source.hasExternalRefContext,
    };

    if (summary.source.sourceLabel) {
      attributes[this.attrKey("summary.source.source_label")] = summary.source.sourceLabel;
    }

    for (const [category, count] of Object.entries(summary.counts.warningsByCategory)) {
      attributes[this.attrKey(`summary.counts.warnings_by_category.${category}`)] = count;
    }

    flattenImportTelemetryAttributes(
      attributes,
      this.attrKey("summary.source.metadata."),
      summary.source.metadata,
    );

    return attributes;
  }

  private recordSummaryPhaseEvents(rootSpan: Span, summary: ImportTelemetrySummary, runId: string): void {
    for (const phaseSummary of summary.phases) {
      const phaseAttributes: Attributes = {
        ...this.mapCorrelationAttributes(summary.correlation),
        [this.attrKey("phase")]: phaseSummary.phase,
        [this.attrKey("step_name")]: phaseSummary.stepName,
        [this.attrKey("status")]: phaseSummary.status,
      };

      if (typeof phaseSummary.durationMs === "number") {
        phaseAttributes[this.attrKey("duration_ms")] = phaseSummary.durationMs;
      }

      this.safeSpanAddEvent(rootSpan, "import.summary.phase", phaseAttributes, undefined, runId);
    }
  }

  private replayCorrelatedEventsOnStepSpan(
    runState: ActiveRunState,
    step: ImportTelemetryStep,
    stepSpan: Span,
    runId: string,
  ): void {
    const correlatedEvents = runState.eventBuffer.filter(
      (event) =>
        event.phase === step.phase &&
        event.sequence > step.startedSequence &&
        event.sequence < step.endedSequence,
    );

    for (const event of correlatedEvents) {
      this.safeSpanAddEvent(stepSpan, event.eventName, event.attributes, event.timestampMs, runId);
    }
  }

  private getStepSpanName(step: ImportTelemetryStep): string {
    return `${this.config.rootSpanName}.${step.stepName}`;
  }

  private recordDebugLifecycleEvent(
    span: Span,
    eventName: string,
    attributes: Attributes,
  ): void {
    if (!this.config.enableDebugLifecycleEvents) {
      return;
    }

    this.safeSpanAddEvent(
      span,
      eventName,
      {
        [this.attrKey("debug.lifecycle")]: true,
        ...attributes,
      },
      this.clock.nowMs(),
      "debug",
    );
  }

  private safeStartSpan(
    name: string,
    options: SpanOptions,
    context: Context,
    runId: string,
  ): Span | undefined {
    try {
      return this.tracer.startSpan(name, options, context);
    } catch (error) {
      this.emitTracerOperationWarning(runId, "startSpan", error, {
        spanName: name,
      });
      return undefined;
    }
  }

  private safeSpanSetAttributes(span: Span, attributes: Attributes, runId: string): void {
    try {
      span.setAttributes(attributes);
    } catch (error) {
      this.emitTracerOperationWarning(runId, "setAttributes", error);
    }
  }

  private safeSpanAddEvent(
    span: Span,
    name: string,
    attributes: Attributes,
    timestampMs: number | undefined,
    runId: string,
  ): void {
    try {
      if (typeof timestampMs === "number") {
        span.addEvent(name, attributes, timestampMs);
        return;
      }

      span.addEvent(name, attributes);
    } catch (error) {
      this.emitTracerOperationWarning(runId, "addEvent", error, {
        eventName: name,
      });
    }
  }

  private safeSpanSetStatus(
    span: Span,
    status: { code: SpanStatusCode; message?: string },
    runId: string,
  ): void {
    try {
      span.setStatus(status);
    } catch (error) {
      this.emitTracerOperationWarning(runId, "setStatus", error);
    }
  }

  private safeSpanRecordException(span: Span, message: string, runId: string): void {
    try {
      span.recordException(message);
    } catch (error) {
      this.emitTracerOperationWarning(runId, "recordException", error);
    }
  }

  private safeEndManagedSpan(
    managedSpan: ManagedSpanState,
    timestampMs: number,
    runId: string,
  ): void {
    if (managedSpan.ended) {
      managedSpan.endCallCount += 1;
      this.emitWarning({
        code: "SPAN_ALREADY_ENDED",
        importRunId: runId,
        message: "Span end was requested after it had already been ended.",
        details: {
          spanName: managedSpan.name,
          endCallCount: managedSpan.endCallCount,
        },
      });
      return;
    }

    try {
      managedSpan.span.end(timestampMs);
      managedSpan.ended = true;
      managedSpan.endCallCount += 1;
    } catch (error) {
      this.emitTracerOperationWarning(runId, "end", error, {
        spanName: managedSpan.name,
      });
    }
  }

  private emitTracerOperationWarning(
    runId: string,
    operation:
      | "startSpan"
      | "setAttributes"
      | "addEvent"
      | "setStatus"
      | "recordException"
      | "end",
    error: unknown,
    details?: Record<string, string | number | boolean | null>,
  ): void {
    this.emitWarning({
      code: "TRACER_OPERATION_FAILED",
      importRunId: runId,
      message: `Tracer operation failed safely (${operation}).`,
      details: {
        operation,
        ...(details ?? {}),
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    });
  }

  private emitWarning(warning: ImportTelemetryOtelAdapterWarning): void {
    const runState = this.activeRuns.get(warning.importRunId);
    if (runState) {
      runState.warningsCount += 1;
    }
    this.metrics.recordWarning(warning);

    try {
      this.config.onInternalAdapterWarning?.(warning);
    } catch {
      // Warning callbacks must never break the import pipeline.
    }
  }
}

export function createImportTelemetryOtelAdapter(
  input: CreateImportTelemetryOtelAdapterInput,
): ImportTelemetryOtelAdapter {
  return new ImportTelemetryOtelAdapter(input);
}

export type { DebugSnapshot, ImportTelemetryOtelAdapterWarning, ImportTelemetryOtelAdapterWarningCode };
