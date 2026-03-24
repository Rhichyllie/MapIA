import { metrics, trace, type Meter, type Tracer } from "@opentelemetry/api";
import type { ContextManager, TextMapPropagator } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import {
  CompositePropagator,
  W3CBaggagePropagator,
  W3CTraceContextPropagator,
} from "@opentelemetry/core";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  AggregationType,
  PeriodicExportingMetricReader,
  type ViewOptions,
} from "@opentelemetry/sdk-metrics";
import {
  AlwaysOffSampler,
  AlwaysOnSampler,
  BatchSpanProcessor,
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
  type Sampler,
  type SpanExporter,
} from "@opentelemetry/sdk-trace-base";
import {
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import {
  parseOpenTelemetryRuntimeConfig,
  toOpenTelemetryRuntimeConfigLogSnapshot,
  type OpenTelemetryRuntimeConfig,
  type OpenTelemetryRuntimeConfigWarning,
  type OpenTelemetrySamplerConfig,
} from "./otel-runtime-config";
import { logTelemetryOperationalEvent } from "./telemetry-operational-logger";

type OpenTelemetryRuntimeState =
  | "idle"
  | "disabled"
  | "started"
  | "failed"
  | "shutdown";

type OpenTelemetryRuntimeWarningCode =
  | "CONFIG_WARNING"
  | "BOOTSTRAP_DISABLED"
  | "INSTRUMENTATION_INIT_FAILED"
  | "BOOTSTRAP_FAILED"
  | "SHUTDOWN_FAILED";

export type OpenTelemetryRuntimeWarning = {
  code: OpenTelemetryRuntimeWarningCode;
  message: string;
  details?: Record<string, string | number | boolean | null>;
};

export type OpenTelemetryRuntimeStartResult = {
  state: OpenTelemetryRuntimeState;
  enabled: boolean;
  started: boolean;
  reason?: string;
};

export type EnsureServerOpenTelemetryRuntimeStartedResult = {
  runtime: OpenTelemetryRuntime;
  startResult: OpenTelemetryRuntimeStartResult;
  memoized: boolean;
};

type OpenTelemetryNodeSdkLike = {
  start(): void;
  shutdown(): Promise<void>;
};

type OpenTelemetryNodeSdkConfig = ConstructorParameters<typeof NodeSDK>[0];

type OpenTelemetryRuntimeDebugSnapshot = {
  state: OpenTelemetryRuntimeState;
  startCallCount: number;
  shutdownCallCount: number;
  sdkCreated: boolean;
  shutdownInFlight: boolean;
  shutdownHooksRegistered: boolean;
  lastStartReason?: string;
  lastErrorMessage?: string;
  config: ReturnType<typeof toOpenTelemetryRuntimeConfigLogSnapshot>;
};

type OpenTelemetryRuntimeDependencies = {
  createContextManager: () => ContextManager;
  createTextMapPropagator: () => TextMapPropagator;
  createSampler: (config: OpenTelemetrySamplerConfig) => Sampler;
  createTraceExporter: (config: {
    url: string;
    headers: Record<string, string>;
    timeoutMillis: number;
  }) => SpanExporter;
  createMetricExporter: (config: {
    url: string;
    headers: Record<string, string>;
    timeoutMillis: number;
  }) => OTLPMetricExporter;
  createMetricReader: (config: {
    exporter: OTLPMetricExporter;
    exportIntervalMillis: number;
    exportTimeoutMillis: number;
  }) => PeriodicExportingMetricReader;
  createHttpInstrumentation: () => unknown;
  createNodeSdk: (
    configuration: OpenTelemetryNodeSdkConfig,
  ) => OpenTelemetryNodeSdkLike;
};

const defaultRuntimeDependencies: OpenTelemetryRuntimeDependencies = {
  createContextManager: () => new AsyncLocalStorageContextManager(),
  createTextMapPropagator: () =>
    new CompositePropagator({
      propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
    }),
  createSampler: (config) => {
    switch (config.kind) {
      case "always_off":
        return new ParentBasedSampler({
          root: new AlwaysOffSampler(),
        });
      case "traceidratio":
        return new ParentBasedSampler({
          root: new TraceIdRatioBasedSampler(config.ratio),
        });
      case "always_on":
      default:
        return new ParentBasedSampler({
          root: new AlwaysOnSampler(),
        });
    }
  },
  createTraceExporter: (config) =>
    new OTLPTraceExporter({
      url: config.url,
      headers: config.headers,
      timeoutMillis: config.timeoutMillis,
    }),
  createMetricExporter: (config) =>
    new OTLPMetricExporter({
      url: config.url,
      headers: config.headers,
      timeoutMillis: config.timeoutMillis,
    }),
  createMetricReader: (config) =>
    new PeriodicExportingMetricReader({
      exporter: config.exporter,
      exportIntervalMillis: config.exportIntervalMillis,
      exportTimeoutMillis: config.exportTimeoutMillis,
    }),
  createHttpInstrumentation: () => new HttpInstrumentation(),
  createNodeSdk: (configuration) => new NodeSDK(configuration),
};

const IMPORTING_DURATION_BUCKETS_MS = [
  5,
  10,
  25,
  50,
  100,
  250,
  500,
  1_000,
  2_500,
  5_000,
  10_000,
  20_000,
  30_000,
] as const;

const PRISMA_QUERY_DURATION_BUCKETS_MS = [
  1,
  2,
  5,
  10,
  20,
  50,
  100,
  250,
  500,
  1_000,
  2_500,
  5_000,
] as const;

function defaultRuntimeWarningLogger(warning: OpenTelemetryRuntimeWarning): void {
  if (warning.code === "BOOTSTRAP_DISABLED" || warning.code === "BOOTSTRAP_FAILED") {
    return;
  }

  const details = warning.details ? ` ${JSON.stringify(warning.details)}` : "";
  console.warn(`[otel-runtime] ${warning.code}: ${warning.message}${details}`);
}

type CreateOpenTelemetryRuntimeInput = {
  env?: Record<string, string | undefined>;
  onWarning?: (warning: OpenTelemetryRuntimeWarning) => void;
  dependencies?: Partial<OpenTelemetryRuntimeDependencies>;
};

export interface OpenTelemetryRuntime {
  start(): OpenTelemetryRuntimeStartResult;
  shutdown(): Promise<void>;
  ensureProcessShutdownHooks(): void;
  getTracer(name: string, version?: string): Tracer;
  getMeter(name: string, version?: string): Meter;
  debugSnapshot(): OpenTelemetryRuntimeDebugSnapshot;
}

export function shouldMemoizeOpenTelemetryRuntimeStartResult(
  result: OpenTelemetryRuntimeStartResult,
): boolean {
  if (result.state === "failed" || result.state === "shutdown") {
    return true;
  }

  if (result.state !== "disabled") {
    return false;
  }

  return (
    result.reason === "otel_disabled_by_flag" ||
    result.reason === "missing_traces_endpoint"
  );
}

type OpenTelemetryProcessSignal = "SIGTERM" | "SIGINT" | "beforeExit";

type ServerOpenTelemetryRuntimeGlobalState = {
  runtime?: OpenTelemetryRuntime;
  startResult?: OpenTelemetryRuntimeStartResult;
  shutdownHooksRegistered: boolean;
  shutdownHandler?: () => void;
  shutdownSignals: OpenTelemetryProcessSignal[];
};

type GlobalThisWithServerOpenTelemetryRuntime = typeof globalThis & {
  __mapiaServerOpenTelemetryRuntimeState?: ServerOpenTelemetryRuntimeGlobalState;
};

function getServerOpenTelemetryRuntimeGlobalState(): ServerOpenTelemetryRuntimeGlobalState {
  const globalState = globalThis as GlobalThisWithServerOpenTelemetryRuntime;
  if (!globalState.__mapiaServerOpenTelemetryRuntimeState) {
    globalState.__mapiaServerOpenTelemetryRuntimeState = {
      shutdownHooksRegistered: false,
      shutdownSignals: [],
    };
  }

  return globalState.__mapiaServerOpenTelemetryRuntimeState;
}

class OpenTelemetryNodeRuntime implements OpenTelemetryRuntime {
  private readonly config: OpenTelemetryRuntimeConfig;
  private readonly configWarnings: OpenTelemetryRuntimeConfigWarning[];
  private readonly deps: OpenTelemetryRuntimeDependencies;
  private readonly onWarning: (warning: OpenTelemetryRuntimeWarning) => void;
  private sdk?: OpenTelemetryNodeSdkLike;
  private state: OpenTelemetryRuntimeState = "idle";
  private startCallCount = 0;
  private shutdownCallCount = 0;
  private shutdownHooksRegistered = false;
  private shutdownPromise?: Promise<void>;
  private lastStartReason?: string;
  private lastErrorMessage?: string;

  constructor(input: CreateOpenTelemetryRuntimeInput) {
    const parsed = parseOpenTelemetryRuntimeConfig(input.env ?? process.env);
    this.config = parsed.config;
    this.configWarnings = parsed.warnings;
    this.deps = {
      ...defaultRuntimeDependencies,
      ...(input.dependencies ?? {}),
    };
    this.onWarning = input.onWarning ?? defaultRuntimeWarningLogger;
  }

  start(): OpenTelemetryRuntimeStartResult {
    this.startCallCount += 1;

    if (this.state === "started") {
      return {
        state: this.state,
        enabled: true,
        started: true,
      };
    }

    if (this.state === "disabled") {
      return {
        state: this.state,
        enabled: false,
        started: false,
        ...(this.lastStartReason ? { reason: this.lastStartReason } : {}),
      };
    }

    if (this.state === "failed") {
      return {
        state: this.state,
        enabled: false,
        started: false,
        ...(this.lastStartReason ? { reason: this.lastStartReason } : {}),
      };
    }

    if (this.state === "shutdown") {
      return {
        state: this.state,
        enabled: false,
        started: false,
        reason: "runtime_already_shutdown",
      };
    }

    for (const warning of this.configWarnings) {
      this.emitWarning({
        code: "CONFIG_WARNING",
        message: warning.message,
        details: warning.details,
      });
    }

    if (!this.config.enabled) {
      this.state = "disabled";
      this.lastStartReason = "otel_disabled_by_flag";
      this.emitWarning({
        code: "BOOTSTRAP_DISABLED",
        message: "OpenTelemetry runtime disabled by configuration flag.",
        details: {
          enabled: false,
          enabledSourceKey: this.config.enabledSource.key,
          enabledExplicit: this.config.enabledSource.explicit,
          ...(this.config.enabledSource.rawValue
            ? { enabledSourceRawValue: this.config.enabledSource.rawValue }
            : {}),
        },
      });
      this.logBootstrapState({
        event: "telemetry_bootstrap_disabled",
        level: "info",
        mode: "disabled",
        reason: this.lastStartReason,
      });
      return {
        state: this.state,
        enabled: false,
        started: false,
        reason: this.lastStartReason,
      };
    }

    if (!this.config.traces.endpointUrl) {
      this.state = "disabled";
      this.lastStartReason = "missing_traces_endpoint";
      this.emitWarning({
        code: "BOOTSTRAP_DISABLED",
        message: "OpenTelemetry runtime not started because no valid traces OTLP endpoint is configured.",
        details: {
          ...this.baseWarningDetails(),
          enabledSourceKey: this.config.enabledSource.key,
          tracesEndpointConfigured: false,
        },
      });
      this.logBootstrapState({
        event: "telemetry_bootstrap_disabled",
        level: "warn",
        mode: "fallback-noop",
        reason: this.lastStartReason,
      });
      return {
        state: this.state,
        enabled: false,
        started: false,
        reason: this.lastStartReason,
      };
    }

    try {
      const traceExporter = this.deps.createTraceExporter({
        url: this.config.traces.endpointUrl,
        headers: this.config.traces.headers,
        timeoutMillis: this.config.traces.timeoutMillis,
      });
      const spanProcessor = new BatchSpanProcessor(traceExporter, {
        scheduledDelayMillis: this.config.traces.batch.scheduleDelayMillis,
        exportTimeoutMillis: this.config.traces.batch.exportTimeoutMillis,
        maxQueueSize: this.config.traces.batch.maxQueueSize,
        maxExportBatchSize: this.config.traces.batch.maxExportBatchSize,
      });

      const metricReaders: PeriodicExportingMetricReader[] = [];
      if (this.config.metrics.enabled && this.config.metrics.endpointUrl) {
        const metricExporter = this.deps.createMetricExporter({
          url: this.config.metrics.endpointUrl,
          headers: this.config.metrics.headers,
          timeoutMillis: this.config.metrics.timeoutMillis,
        });
        metricReaders.push(
          this.deps.createMetricReader({
            exporter: metricExporter,
            exportIntervalMillis: this.config.metrics.exportIntervalMillis,
            exportTimeoutMillis: this.config.metrics.exportTimeoutMillis,
          }),
        );
      }

      const instrumentations = this.createRuntimeInstrumentations();

      this.sdk = this.deps.createNodeSdk({
        autoDetectResources: false,
        contextManager: this.deps.createContextManager(),
        textMapPropagator: this.deps.createTextMapPropagator(),
        sampler: this.deps.createSampler(this.config.traces.sampler),
        serviceName: this.config.serviceName,
        resource: resourceFromAttributes({
          [SEMRESATTRS_SERVICE_NAME]: this.config.serviceName,
          [SEMRESATTRS_SERVICE_VERSION]: this.config.serviceVersion,
          [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: this.config.deploymentEnvironment,
        }),
        spanProcessors: [spanProcessor],
        ...(metricReaders.length > 0 ? { metricReaders } : {}),
        views: createMetricViews(this.config),
        // sdk-node typing for `instrumentations` is stricter/inconsistent across versions.
        instrumentations: instrumentations as never,
      });

      this.sdk.start();
      this.state = "started";
      this.lastStartReason = "started";
      this.logBootstrapState({
        event: "telemetry_bootstrap_enabled",
        level: "info",
        mode: "active",
        reason: this.lastStartReason,
      });
      return {
        state: this.state,
        enabled: true,
        started: true,
      };
    } catch (error) {
      this.sdk = undefined;
      this.state = "failed";
      this.lastErrorMessage = error instanceof Error ? error.message : String(error);
      this.lastStartReason = "bootstrap_failed";
      this.emitWarning({
        code: "BOOTSTRAP_FAILED",
        message: "OpenTelemetry runtime bootstrap failed; continuing with telemetry disabled.",
        details: {
          ...this.baseWarningDetails(),
          errorMessage: this.lastErrorMessage,
        },
      });
      this.logBootstrapState({
        event: "telemetry_bootstrap_disabled",
        level: "warn",
        mode: "fallback-noop",
        reason: this.lastStartReason,
        extraDetails: {
          errorMessage: this.lastErrorMessage,
        },
      });
      return {
        state: this.state,
        enabled: false,
        started: false,
        reason: this.lastStartReason,
      };
    }
  }

  async shutdown(): Promise<void> {
    this.shutdownCallCount += 1;

    if (this.shutdownPromise) {
      return this.shutdownPromise;
    }

    if (!this.sdk) {
      if (this.state !== "shutdown") {
        this.state =
          this.state === "started" || this.state === "idle"
            ? "shutdown"
            : this.state;
      }
      return;
    }

    const sdk = this.sdk;
    this.state = "shutdown";
    this.sdk = undefined;
    this.shutdownPromise = (async () => {
      try {
        await sdk.shutdown();
      } catch (error) {
        this.lastErrorMessage = error instanceof Error ? error.message : String(error);
        this.emitWarning({
          code: "SHUTDOWN_FAILED",
          message: "OpenTelemetry runtime shutdown failed.",
          details: {
            errorMessage: this.lastErrorMessage,
          },
        });
      } finally {
        this.shutdownPromise = undefined;
      }
    })();

    return this.shutdownPromise;
  }

  ensureProcessShutdownHooks(): void {
    const globalState = getServerOpenTelemetryRuntimeGlobalState();
    if (globalState.shutdownHooksRegistered) {
      this.shutdownHooksRegistered = true;
      return;
    }

    globalState.shutdownHooksRegistered = true;
    this.shutdownHooksRegistered = true;
    if (!globalState.shutdownHandler) {
      globalState.shutdownHandler = () => {
        const runtime = getServerOpenTelemetryRuntimeGlobalState().runtime;
        if (runtime) {
          void runtime.shutdown();
        }
      };
    }

    for (const signal of ["SIGTERM", "SIGINT", "beforeExit"] as const) {
      process.once(signal, globalState.shutdownHandler);
      globalState.shutdownSignals.push(signal);
    }
  }

  getTracer(name: string, version?: string): Tracer {
    return trace.getTracer(name, version);
  }

  getMeter(name: string, version?: string): Meter {
    return metrics.getMeter(name, version);
  }

  debugSnapshot(): OpenTelemetryRuntimeDebugSnapshot {
    return {
      state: this.state,
      startCallCount: this.startCallCount,
      shutdownCallCount: this.shutdownCallCount,
      sdkCreated: Boolean(this.sdk),
      shutdownInFlight: Boolean(this.shutdownPromise),
      shutdownHooksRegistered: this.shutdownHooksRegistered,
      ...(this.lastStartReason ? { lastStartReason: this.lastStartReason } : {}),
      ...(this.lastErrorMessage ? { lastErrorMessage: this.lastErrorMessage } : {}),
      config: toOpenTelemetryRuntimeConfigLogSnapshot(this.config),
    };
  }

  private emitWarning(warning: OpenTelemetryRuntimeWarning): void {
    try {
      this.onWarning(warning);
    } catch {
      // Runtime warnings must not break application bootstrap or request handling.
    }
  }

  private logBootstrapState(input: {
    event: "telemetry_bootstrap_enabled" | "telemetry_bootstrap_disabled";
    level: "info" | "warn";
    mode: "active" | "disabled" | "fallback-noop";
    reason: string;
    extraDetails?: Record<string, unknown>;
  }): void {
    logTelemetryOperationalEvent({
      event: input.event,
      level: input.level,
      dedupeKey: `otel-bootstrap:${input.mode}:${input.reason}`,
      throttleMs: 60_000,
      payload: {
        mode: input.mode,
        reason: input.reason,
        state: this.state,
        ...toOpenTelemetryRuntimeConfigLogSnapshot(this.config),
        ...(input.extraDetails ?? {}),
      },
    });
  }

  private baseWarningDetails(): Record<string, string | number | boolean | null> {
    return {
      enabled: this.config.enabled,
      enabledSourceKey: this.config.enabledSource.key,
      enabledExplicit: this.config.enabledSource.explicit,
      serviceName: this.config.serviceName,
      deploymentEnvironment: this.config.deploymentEnvironment,
      tracesEndpointConfigured: Boolean(this.config.traces.endpointUrl),
      metricsEnabled: this.config.metrics.enabled,
      metricsEndpointConfigured: Boolean(this.config.metrics.endpointUrl),
    };
  }

  private createRuntimeInstrumentations(): unknown[] {
    const instrumentations: unknown[] = [];

    if (!this.config.instrumentation.http.enabled) {
      return instrumentations;
    }

    try {
      instrumentations.push(this.deps.createHttpInstrumentation());
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.emitWarning({
        code: "INSTRUMENTATION_INIT_FAILED",
        message:
          "OpenTelemetry platform instrumentation failed to initialize; continuing without it.",
        details: {
          instrumentationName: "http",
          errorMessage,
        },
      });
    }

    return instrumentations;
  }
}

function createMetricViews(config: OpenTelemetryRuntimeConfig): ViewOptions[] {
  if (!config.metrics.views.enabled) {
    return [];
  }

  return [
    {
      instrumentName: "importing.telemetry.run.duration",
      aggregation: {
        type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM,
        options: {
          boundaries: [...IMPORTING_DURATION_BUCKETS_MS],
          recordMinMax: true,
        },
      },
    },
    {
      instrumentName: "importing.telemetry.step.duration",
      aggregation: {
        type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM,
        options: {
          boundaries: [...IMPORTING_DURATION_BUCKETS_MS],
          recordMinMax: true,
        },
      },
    },
    {
      instrumentName: "prisma.telemetry.query.duration",
      aggregation: {
        type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM,
        options: {
          boundaries: [...PRISMA_QUERY_DURATION_BUCKETS_MS],
          recordMinMax: true,
        },
      },
    },
  ];
}

export function createOpenTelemetryRuntime(
  input: CreateOpenTelemetryRuntimeInput = {},
): OpenTelemetryRuntime {
  return new OpenTelemetryNodeRuntime(input);
}

export function getOrCreateServerOpenTelemetryRuntime(): OpenTelemetryRuntime {
  const globalState = getServerOpenTelemetryRuntimeGlobalState();

  if (!globalState.runtime) {
    globalState.runtime = createOpenTelemetryRuntime();
    if (process.env.NODE_ENV !== "test") {
      globalState.runtime.ensureProcessShutdownHooks();
    }
  }

  return globalState.runtime;
}

export function ensureServerOpenTelemetryRuntimeStarted(): EnsureServerOpenTelemetryRuntimeStartedResult {
  const globalState = getServerOpenTelemetryRuntimeGlobalState();
  const runtime = getOrCreateServerOpenTelemetryRuntime();

  if (globalState.startResult) {
    return {
      runtime,
      startResult: globalState.startResult,
      memoized: true,
    };
  }

  const startResult = runtime.start();
  globalState.startResult = startResult;

  return {
    runtime,
    startResult,
    memoized: false,
  };
}

export async function shutdownServerOpenTelemetryRuntime(): Promise<void> {
  const globalState = getServerOpenTelemetryRuntimeGlobalState();
  if (!globalState.runtime) {
    return;
  }

  await globalState.runtime.shutdown();
  globalState.startResult = undefined;
}

export function __resetServerOpenTelemetryRuntimeForTests(): void {
  const globalState = getServerOpenTelemetryRuntimeGlobalState();
  if (globalState.shutdownHandler) {
    for (const signal of globalState.shutdownSignals) {
      process.off(signal, globalState.shutdownHandler);
    }
  }

  globalState.runtime = undefined;
  globalState.startResult = undefined;
  globalState.shutdownHooksRegistered = false;
  globalState.shutdownHandler = undefined;
  globalState.shutdownSignals = [];
}
