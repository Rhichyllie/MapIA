import {
  SpanKind,
  SpanStatusCode,
  metrics,
  trace,
  type Attributes,
  type Counter,
  type Histogram,
  type Meter,
  type Span,
  type Tracer,
} from "@opentelemetry/api";
import type { PrismaClient } from "@prisma/client";
import { parseOpenTelemetryRuntimeConfig } from "./otel-runtime-config";

type PrismaTelemetryClock = {
  nowMs(): number;
};

type PrismaTelemetryInstrumentationConfig = {
  enabled: boolean;
  otelEnabled: boolean;
  slowQueryThresholdMs: number;
  tracerName: string;
  meterName: string;
  tracerVersion?: string;
  meterVersion?: string;
};

type PrismaMiddlewareParams = {
  model?: string;
  action: string;
  runInTransaction?: boolean;
};

type PrismaMiddlewareNext = (params: unknown) => Promise<unknown>;

type PrismaClientWithMiddleware = PrismaClient & {
  $use?: (middleware: (params: unknown, next: PrismaMiddlewareNext) => Promise<unknown>) => void;
};

type CreatePrismaTelemetryInstrumentationInput = {
  env?: Record<string, string | undefined>;
  tracer?: Tracer;
  meter?: Meter;
  clock?: PrismaTelemetryClock;
  config?: Partial<
    Pick<
      PrismaTelemetryInstrumentationConfig,
      "tracerName" | "meterName" | "tracerVersion" | "meterVersion"
    >
  >;
};

type AttachPrismaTelemetryInstrumentationResult =
  | { attached: true }
  | {
      attached: false;
      reason:
        | "otel_disabled"
        | "prisma_instrumentation_disabled"
        | "prisma_middleware_unavailable"
        | "already_instrumented";
    };

type PrismaMetricsInstruments = {
  operations: Counter;
  errors: Counter;
  slowQueries: Counter;
  queryDurationMs: Histogram;
};

const DEFAULT_TRACER_NAME = "mapia.prisma" as const;
const DEFAULT_METER_NAME = "mapia.prisma" as const;
const instrumentedClients = new WeakSet<object>();

function defaultClock(): PrismaTelemetryClock {
  return {
    nowMs: () => Date.now(),
  };
}

function buildConfig(
  input: CreatePrismaTelemetryInstrumentationInput,
): PrismaTelemetryInstrumentationConfig {
  const runtime = parseOpenTelemetryRuntimeConfig(input.env ?? process.env).config;

  return {
    enabled: runtime.instrumentation.prisma.enabled,
    otelEnabled: runtime.enabled && Boolean(runtime.traces.endpointUrl),
    slowQueryThresholdMs: runtime.instrumentation.prisma.slowQueryThresholdMs,
    tracerName: input.config?.tracerName ?? DEFAULT_TRACER_NAME,
    meterName: input.config?.meterName ?? DEFAULT_METER_NAME,
    tracerVersion: input.config?.tracerVersion,
    meterVersion: input.config?.meterVersion,
  };
}

function createPrismaMetricsRecorder(params: {
  meter: Meter;
}): {
  recordDuration(attributes: Attributes, durationMs: number): void;
  recordOperation(attributes: Attributes): void;
  recordError(attributes: Attributes): void;
  recordSlowQuery(attributes: Attributes): void;
} {
  let instruments: PrismaMetricsInstruments | undefined;

  const getInstruments = (): PrismaMetricsInstruments | undefined => {
    if (instruments) {
      return instruments;
    }

    try {
      instruments = {
        operations: params.meter.createCounter("prisma.telemetry.operations", {
          description: "Quantidade de operacoes Prisma observadas por acao/modelo/outcome.",
          unit: "{operation}",
        }),
        errors: params.meter.createCounter("prisma.telemetry.errors", {
          description: "Quantidade de operacoes Prisma com erro por acao/modelo.",
          unit: "{error}",
        }),
        slowQueries: params.meter.createCounter("prisma.telemetry.slow_queries", {
          description: "Quantidade de operacoes Prisma acima do threshold de lentidao.",
          unit: "{query}",
        }),
        queryDurationMs: params.meter.createHistogram("prisma.telemetry.query.duration", {
          description: "Duracao de operacoes Prisma observadas pela instrumentacao OTel.",
          unit: "ms",
        }),
      };
      return instruments;
    } catch {
      return undefined;
    }
  };

  const safeCounterAdd = (counter: Counter | undefined, attributes: Attributes) => {
    if (!counter) {
      return;
    }
    try {
      counter.add(1, attributes);
    } catch {
      // Observability failures must never break DB operations.
    }
  };

  const safeHistogramRecord = (histogram: Histogram | undefined, durationMs: number, attributes: Attributes) => {
    if (!histogram) {
      return;
    }
    try {
      histogram.record(Math.max(0, durationMs), attributes);
    } catch {
      // Observability failures must never break DB operations.
    }
  };

  return {
    recordDuration(attributes, durationMs) {
      const created = getInstruments();
      safeHistogramRecord(created?.queryDurationMs, durationMs, attributes);
    },
    recordOperation(attributes) {
      const created = getInstruments();
      safeCounterAdd(created?.operations, attributes);
    },
    recordError(attributes) {
      const created = getInstruments();
      safeCounterAdd(created?.errors, attributes);
    },
    recordSlowQuery(attributes) {
      const created = getInstruments();
      safeCounterAdd(created?.slowQueries, attributes);
    },
  };
}

function getSafeErrorMetadata(error: unknown): {
  errorType: string;
  errorCode?: string;
} {
  if (!(error instanceof Error)) {
    return {
      errorType: typeof error,
    };
  }

  const errorWithCode = error as unknown as { code?: unknown };
  const maybeCode =
    typeof errorWithCode.code === "string"
      ? errorWithCode.code
      : undefined;

  return {
    errorType: error.name || "Error",
    ...(maybeCode ? { errorCode: maybeCode } : {}),
  };
}

function toMiddlewareParams(raw: unknown): PrismaMiddlewareParams {
  if (!raw || typeof raw !== "object") {
    return {
      action: "unknown",
    };
  }

  const params = raw as Record<string, unknown>;
  return {
    model: typeof params.model === "string" ? params.model : undefined,
    action: typeof params.action === "string" ? params.action : "unknown",
    runInTransaction:
      typeof params.runInTransaction === "boolean" ? params.runInTransaction : undefined,
  };
}

function buildBaseAttributes(params: PrismaMiddlewareParams): Attributes {
  const rawOperation = params.action.startsWith("$");
  return {
    "prisma.action": params.action,
    ...(params.model ? { "prisma.model": params.model } : {}),
    "prisma.raw_operation": rawOperation,
    ...(typeof params.runInTransaction === "boolean"
      ? { "prisma.in_transaction": params.runInTransaction }
      : {}),
  };
}

function buildSpanName(params: PrismaMiddlewareParams): string {
  const model = params.model ?? "raw";
  return `prisma.${model}.${params.action}`;
}

function safeSpanSetAttributes(span: Span, attributes: Attributes): void {
  try {
    span.setAttributes(attributes);
  } catch {
    // Best-effort only.
  }
}

function safeSpanSetStatus(
  span: Span,
  status: {
    code: SpanStatusCode;
    message?: string;
  },
): void {
  try {
    span.setStatus(status);
  } catch {
    // Best-effort only.
  }
}

function safeSpanEnd(span: Span): void {
  try {
    span.end();
  } catch {
    // Best-effort only.
  }
}

export function attachOpenTelemetryPrismaInstrumentation(
  prismaClient: PrismaClient,
  input: CreatePrismaTelemetryInstrumentationInput = {},
): AttachPrismaTelemetryInstrumentationResult {
  const config = buildConfig(input);

  if (!config.otelEnabled) {
    return { attached: false, reason: "otel_disabled" };
  }
  if (!config.enabled) {
    return { attached: false, reason: "prisma_instrumentation_disabled" };
  }

  const client = prismaClient as PrismaClientWithMiddleware;
  if (typeof client.$use !== "function") {
    return { attached: false, reason: "prisma_middleware_unavailable" };
  }
  if (instrumentedClients.has(prismaClient as unknown as object)) {
    return { attached: false, reason: "already_instrumented" };
  }

  const tracer =
    input.tracer ?? trace.getTracer(config.tracerName, config.tracerVersion);
  const meter =
    input.meter ?? metrics.getMeter(config.meterName, config.meterVersion);
  const clock = input.clock ?? defaultClock();
  const metricsRecorder = createPrismaMetricsRecorder({ meter });

  client.$use(async (rawParams, next) => {
    const params = toMiddlewareParams(rawParams);
    const startedAtMs = clock.nowMs();
    const baseAttributes = buildBaseAttributes(params);
    const span = tracer.startSpan(buildSpanName(params), {
      kind: SpanKind.CLIENT,
      attributes: {
        ...baseAttributes,
        "prisma.outcome": "in_progress",
      },
    });

    try {
      const result = await next(rawParams);
      const durationMs = Math.max(0, clock.nowMs() - startedAtMs);
      const slowQuery = durationMs >= config.slowQueryThresholdMs;
      const attributes: Attributes = {
        ...baseAttributes,
        "prisma.outcome": "success",
        "prisma.slow_query": slowQuery,
      };
      metricsRecorder.recordOperation(attributes);
      metricsRecorder.recordDuration(attributes, durationMs);
      if (slowQuery) {
        metricsRecorder.recordSlowQuery(attributes);
      }
      safeSpanSetAttributes(span, {
        ...attributes,
        "prisma.duration_ms": durationMs,
      });
      safeSpanSetStatus(span, { code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      const durationMs = Math.max(0, clock.nowMs() - startedAtMs);
      const errorMetadata = getSafeErrorMetadata(error);
      const slowQuery = durationMs >= config.slowQueryThresholdMs;
      const attributes: Attributes = {
        ...baseAttributes,
        "prisma.outcome": "error",
        "prisma.slow_query": slowQuery,
        "prisma.error_type": errorMetadata.errorType,
        ...(errorMetadata.errorCode ? { "prisma.error_code": errorMetadata.errorCode } : {}),
      };

      metricsRecorder.recordOperation(attributes);
      metricsRecorder.recordError(attributes);
      metricsRecorder.recordDuration(attributes, durationMs);
      if (slowQuery) {
        metricsRecorder.recordSlowQuery(attributes);
      }
      safeSpanSetAttributes(span, {
        ...attributes,
        "prisma.duration_ms": durationMs,
      });
      safeSpanSetStatus(span, {
        code: SpanStatusCode.ERROR,
        message: "Prisma operation failed",
      });
      throw error;
    } finally {
      safeSpanEnd(span);
    }
  });

  instrumentedClients.add(prismaClient as unknown as object);
  return { attached: true };
}

export function __resetPrismaTelemetryInstrumentationForTests(): void {
  // WeakSet cannot be cleared, so recreate by mutating module state through indirection.
  // The easiest safe approach is to no-op here and rely on fresh fake client objects in tests.
}
