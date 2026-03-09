import {
  NoopImportTelemetryCollector,
  type ImportTelemetryCollector,
} from "../../domain";
import {
  shouldMemoizeOpenTelemetryRuntimeStartResult,
  type OpenTelemetryRuntime,
} from "@/src/server/observability";
import {
  ImportTelemetryOtelAdapter,
  type ImportTelemetryOtelAdapterConfig,
  createImportTelemetryOtelAdapter,
} from "./import-telemetry-otel-adapter";

export type ImportTelemetryCollectorProviderConfig = {
  tracerName?: string;
  tracerVersion?: string;
  meterName?: string;
  meterVersion?: string;
  adapterConfig?: ImportTelemetryOtelAdapterConfig;
  fallbackCollectorFactory?: () => ImportTelemetryCollector;
};

type ImportTelemetryCollectorProviderDebugSnapshot = {
  otelCollectorInitialized: boolean;
  fallbackCollectorInitialized: boolean;
  fallbackCollectorFactoryConfigured: boolean;
  collectorKind: "none" | "otel" | "fallback-noop" | "fallback-custom";
  tracerName: string;
  meterName: string;
  runtimeStartMemoized: boolean;
  memoizedRuntimeStartState?: string;
  memoizedRuntimeStartReason?: string;
};

const DEFAULT_TRACER_NAME = "mapia.importing" as const;
const DEFAULT_METER_NAME = "mapia.importing" as const;

export class ImportTelemetryCollectorProvider {
  private readonly tracerName: string;
  private readonly tracerVersion?: string;
  private readonly meterName: string;
  private readonly meterVersion?: string;
  private readonly adapterConfig?: ImportTelemetryOtelAdapterConfig;
  private readonly fallbackCollectorFactory: () => ImportTelemetryCollector;
  private otelCollector?: ImportTelemetryOtelAdapter;
  private fallbackCollector?: ImportTelemetryCollector;
  private memoizedTerminalRuntimeStart?: ReturnType<OpenTelemetryRuntime["start"]>;

  constructor(
    private readonly runtime: OpenTelemetryRuntime,
    config: ImportTelemetryCollectorProviderConfig = {},
  ) {
    this.tracerName = config.tracerName ?? DEFAULT_TRACER_NAME;
    this.tracerVersion = config.tracerVersion;
    this.meterName = config.meterName ?? DEFAULT_METER_NAME;
    this.meterVersion = config.meterVersion;
    this.adapterConfig = config.adapterConfig;
    this.fallbackCollectorFactory =
      config.fallbackCollectorFactory ?? (() => new NoopImportTelemetryCollector());
  }

  getCollector(): ImportTelemetryCollector {
    if (this.otelCollector) {
      return this.otelCollector;
    }

    const runtimeStart = this.resolveRuntimeStart();
    if (!runtimeStart.started) {
      return this.getOrCreateFallbackCollector();
    }

    if (!this.otelCollector) {
      this.otelCollector = createImportTelemetryOtelAdapter({
        tracer: this.runtime.getTracer(this.tracerName, this.tracerVersion),
        meter: this.runtime.getMeter(this.meterName, this.meterVersion),
        ...(this.adapterConfig ? { config: this.adapterConfig } : {}),
      });
    }

    return this.otelCollector;
  }

  debugSnapshot(): ImportTelemetryCollectorProviderDebugSnapshot {
    return {
      otelCollectorInitialized: Boolean(this.otelCollector),
      fallbackCollectorInitialized: Boolean(this.fallbackCollector),
      fallbackCollectorFactoryConfigured: Boolean(this.fallbackCollectorFactory),
      collectorKind: this.getCollectorKind(),
      tracerName: this.tracerName,
      meterName: this.meterName,
      runtimeStartMemoized: Boolean(this.memoizedTerminalRuntimeStart),
      ...(this.memoizedTerminalRuntimeStart
        ? {
            memoizedRuntimeStartState: this.memoizedTerminalRuntimeStart.state,
            memoizedRuntimeStartReason: this.memoizedTerminalRuntimeStart.reason,
          }
        : {}),
    };
  }

  private resolveRuntimeStart(): ReturnType<OpenTelemetryRuntime["start"]> {
    if (this.memoizedTerminalRuntimeStart) {
      return this.memoizedTerminalRuntimeStart;
    }

    const result = this.runtime.start();
    if (shouldMemoizeOpenTelemetryRuntimeStartResult(result)) {
      this.memoizedTerminalRuntimeStart = result;
    }

    return result;
  }

  private getOrCreateFallbackCollector(): ImportTelemetryCollector {
    if (!this.fallbackCollector) {
      this.fallbackCollector = this.fallbackCollectorFactory();
    }

    return this.fallbackCollector;
  }

  private getCollectorKind():
    | "none"
    | "otel"
    | "fallback-noop"
    | "fallback-custom" {
    if (this.otelCollector) {
      return "otel";
    }
    if (!this.fallbackCollector) {
      return "none";
    }
    if (this.fallbackCollector instanceof NoopImportTelemetryCollector) {
      return "fallback-noop";
    }

    return "fallback-custom";
  }
}

export function createImportTelemetryCollectorProvider(
  runtime: OpenTelemetryRuntime,
  config?: ImportTelemetryCollectorProviderConfig,
): ImportTelemetryCollectorProvider {
  return new ImportTelemetryCollectorProvider(runtime, config);
}
