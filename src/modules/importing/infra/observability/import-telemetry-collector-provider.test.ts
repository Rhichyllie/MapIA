import type { Meter, Tracer } from "@opentelemetry/api";
import { describe, expect, it, vi } from "vitest";
import {
  BufferedImportTelemetryCollector,
  NoopImportTelemetryCollector,
} from "../../domain";
import type { OpenTelemetryRuntime } from "@/src/server/observability";
import {
  ImportTelemetryCollectorProvider,
  createImportTelemetryCollectorProvider,
} from "./import-telemetry-collector-provider";
import { ImportTelemetryOtelAdapter } from "./import-telemetry-otel-adapter";

function createFakeRuntime(overrides?: {
  startResult?: ReturnType<OpenTelemetryRuntime["start"]>;
}) {
  const tracer = {} as Tracer;
  const meter = {} as Meter;
  const runtime: OpenTelemetryRuntime = {
    start: vi.fn().mockReturnValue(
      overrides?.startResult ?? {
        state: "started",
        enabled: true,
        started: true,
      },
    ),
    shutdown: vi.fn().mockResolvedValue(undefined),
    ensureProcessShutdownHooks: vi.fn(),
    getTracer: vi.fn().mockReturnValue(tracer),
    getMeter: vi.fn().mockReturnValue(meter),
    debugSnapshot: vi.fn().mockReturnValue({
      state: "started",
      startCallCount: 0,
      shutdownCallCount: 0,
      sdkCreated: true,
      shutdownInFlight: false,
      shutdownHooksRegistered: false,
      config: {
        enabled: true,
        serviceName: "mapia",
        serviceVersion: "0.1.0",
        deploymentEnvironment: "test",
        instrumentation: {
          httpEnabled: false,
        },
        traces: {
          endpointConfigured: true,
          timeoutMillis: 10_000,
          headersCount: 0,
          sampler: { kind: "always_on" as const },
          batch: {
            scheduleDelayMillis: 5000,
            exportTimeoutMillis: 30000,
            maxQueueSize: 2048,
            maxExportBatchSize: 512,
          },
        },
        metrics: {
          enabled: true,
          endpointConfigured: true,
          timeoutMillis: 10_000,
          exportIntervalMillis: 60_000,
          exportTimeoutMillis: 30_000,
          headersCount: 0,
        },
      },
    }),
  };

  return { runtime, tracer, meter };
}

describe("ImportTelemetryCollectorProvider", () => {
  it("cria adapter OTel com tracer/meter do runtime e reutiliza a instancia", () => {
    const { runtime, tracer, meter } = createFakeRuntime();
    const provider = createImportTelemetryCollectorProvider(runtime);

    const collectorA = provider.getCollector();
    const collectorB = provider.getCollector();

    expect(collectorA).toBeInstanceOf(ImportTelemetryOtelAdapter);
    expect(collectorB).toBe(collectorA);
    expect(runtime.start).toHaveBeenCalledTimes(1);
    expect(runtime.getTracer).toHaveBeenCalledWith("mapia.importing", undefined);
    expect(runtime.getMeter).toHaveBeenCalledWith("mapia.importing", undefined);
    expect(runtime.getTracer).toHaveReturnedWith(tracer);
    expect(runtime.getMeter).toHaveReturnedWith(meter);
    expect(provider.debugSnapshot()).toMatchObject({
      otelCollectorInitialized: true,
      fallbackCollectorInitialized: false,
      collectorKind: "otel",
      tracerName: "mapia.importing",
      meterName: "mapia.importing",
      runtimeStartMemoized: false,
    });
  });

  it("faz fallback para Noop quando runtime esta desabilitado/indisponivel", () => {
    const { runtime } = createFakeRuntime({
      startResult: {
        state: "disabled",
        enabled: false,
        started: false,
        reason: "otel_disabled_by_flag",
      },
    });
    const provider = new ImportTelemetryCollectorProvider(runtime);

    const collector = provider.getCollector();
    const collectorAgain = provider.getCollector();

    expect(collector).toBeInstanceOf(NoopImportTelemetryCollector);
    expect(collectorAgain).toBe(collector);
    expect(runtime.start).toHaveBeenCalledTimes(1);
    expect(runtime.getTracer).not.toHaveBeenCalled();
    expect(runtime.getMeter).not.toHaveBeenCalled();
    expect(provider.debugSnapshot()).toMatchObject({
      fallbackCollectorInitialized: true,
      collectorKind: "fallback-noop",
      runtimeStartMemoized: true,
      memoizedRuntimeStartState: "disabled",
      memoizedRuntimeStartReason: "otel_disabled_by_flag",
    });
  });

  it("nao tenta de novo repetidamente quando runtime esta desabilitado por endpoint ausente", () => {
    const { runtime } = createFakeRuntime({
      startResult: {
        state: "disabled",
        enabled: false,
        started: false,
        reason: "missing_traces_endpoint",
      },
    });
    const provider = createImportTelemetryCollectorProvider(runtime);

    const collectorA = provider.getCollector();
    const collectorB = provider.getCollector();

    expect(collectorA).toBeInstanceOf(NoopImportTelemetryCollector);
    expect(collectorB).toBe(collectorA);
    expect(runtime.start).toHaveBeenCalledTimes(1);
    expect(runtime.getTracer).not.toHaveBeenCalled();
    expect(runtime.getMeter).not.toHaveBeenCalled();
    expect(provider.debugSnapshot()).toMatchObject({
      collectorKind: "fallback-noop",
      runtimeStartMemoized: true,
      memoizedRuntimeStartState: "disabled",
      memoizedRuntimeStartReason: "missing_traces_endpoint",
    });
  });

  it("permite fallback custom (ex.: buffered) para cenarios de teste/debug", () => {
    const { runtime } = createFakeRuntime({
      startResult: {
        state: "failed",
        enabled: false,
        started: false,
        reason: "bootstrap_failed",
      },
    });
    const provider = createImportTelemetryCollectorProvider(runtime, {
      fallbackCollectorFactory: () => new BufferedImportTelemetryCollector(),
    });

    const collector = provider.getCollector();
    const collectorAgain = provider.getCollector();

    expect(collector).toBeInstanceOf(BufferedImportTelemetryCollector);
    expect(collectorAgain).toBe(collector);
    expect(runtime.start).toHaveBeenCalledTimes(1);
    expect(runtime.getTracer).not.toHaveBeenCalled();
    expect(runtime.getMeter).not.toHaveBeenCalled();
    expect(provider.debugSnapshot()).toMatchObject({
      fallbackCollectorInitialized: true,
      collectorKind: "fallback-custom",
      runtimeStartMemoized: true,
      memoizedRuntimeStartState: "failed",
      memoizedRuntimeStartReason: "bootstrap_failed",
    });
  });
});
