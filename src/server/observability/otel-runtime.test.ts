import type { Sampler, SpanExporter } from "@opentelemetry/sdk-trace-base";
import { describe, expect, it, vi } from "vitest";
import {
  __resetServerOpenTelemetryRuntimeForTests,
  createOpenTelemetryRuntime,
  ensureServerOpenTelemetryRuntimeStarted,
  getOrCreateServerOpenTelemetryRuntime,
  shutdownServerOpenTelemetryRuntime,
} from "./otel-runtime";
import { __resetTelemetryOperationalLoggerForTests } from "./telemetry-operational-logger";

type FakeSdk = {
  start: ReturnType<typeof vi.fn>;
  shutdown: ReturnType<typeof vi.fn>;
};

function createRuntimeDeps(overrides?: {
  sdk?: FakeSdk;
  throwOnTraceExporter?: string;
  throwOnHttpInstrumentation?: string;
  throwOnSdkStart?: string;
  throwOnCreateNodeSdk?: string;
}) {
  const sdk =
    overrides?.sdk ??
    ({
      start: vi.fn(),
      shutdown: vi.fn().mockResolvedValue(undefined),
    } satisfies FakeSdk);

  const createTraceExporter = vi.fn((config: unknown) => {
    if (overrides?.throwOnTraceExporter) {
      throw new Error(overrides.throwOnTraceExporter);
    }
    return {
      export: vi.fn(),
      shutdown: vi.fn().mockResolvedValue(undefined),
      forceFlush: vi.fn().mockResolvedValue(undefined),
      ...(typeof config === "object" && config ? config : {}),
    } as unknown as SpanExporter;
  });

  const createMetricExporter = vi.fn((config: unknown) => {
    return {
      export: vi.fn(),
      shutdown: vi.fn().mockResolvedValue(undefined),
      forceFlush: vi.fn().mockResolvedValue(undefined),
      ...(typeof config === "object" && config ? config : {}),
    } as never;
  });
  const createMetricReader = vi.fn(
    (config: unknown) =>
      ({ ...(typeof config === "object" && config ? config : {}) }) as never,
  );
  const createHttpInstrumentation = vi.fn(() => {
    if (overrides?.throwOnHttpInstrumentation) {
      throw new Error(overrides.throwOnHttpInstrumentation);
    }
    return {} as never;
  });
  const createNodeSdk = vi.fn((config: unknown) => {
    if (overrides?.throwOnCreateNodeSdk) {
      throw new Error(overrides.throwOnCreateNodeSdk);
    }
    if (overrides?.throwOnSdkStart) {
      sdk.start.mockImplementationOnce(() => {
        throw new Error(overrides.throwOnSdkStart);
      });
    }
    return {
      ...sdk,
      __config: config,
    };
  });

  return {
    sdk,
    deps: {
      createContextManager: vi.fn(() => ({}) as never),
      createTextMapPropagator: vi.fn(() => ({}) as never),
      createSampler: vi.fn(
        () =>
          ({
            shouldSample: () => ({ decision: 1 }),
            toString: () => "fake",
          }) as unknown as Sampler,
      ),
      createTraceExporter,
      createMetricExporter,
      createMetricReader,
      createHttpInstrumentation,
      createNodeSdk,
    },
  };
}

describe("createOpenTelemetryRuntime", () => {
  it("fica desabilitado quando OTEL_RUNTIME_ENABLED=false e start eh idempotente", () => {
    __resetTelemetryOperationalLoggerForTests();
    const warnings: Array<{ code: string }> = [];
    const { deps } = createRuntimeDeps();
    const runtime = createOpenTelemetryRuntime({
      env: {
        OTEL_RUNTIME_ENABLED: "false",
      },
      onWarning: (warning) => warnings.push(warning),
      dependencies: deps as never,
    });

    const first = runtime.start();
    const second = runtime.start();

    expect(first).toMatchObject({
      state: "disabled",
      enabled: false,
      started: false,
    });
    expect(second.state).toBe("disabled");
    expect(deps.createNodeSdk).not.toHaveBeenCalled();
    expect(warnings.map((warning) => warning.code)).toContain("BOOTSTRAP_DISABLED");
    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "BOOTSTRAP_DISABLED",
          details: expect.objectContaining({
            enabledSourceKey: "OTEL_RUNTIME_ENABLED",
            enabledExplicit: true,
          }),
        }),
      ]),
    );
    expect(runtime.debugSnapshot().startCallCount).toBe(2);
  });

  it("emite log estruturado telemetry_bootstrap_disabled com motivo da decisao", () => {
    __resetTelemetryOperationalLoggerForTests();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { deps } = createRuntimeDeps();
    const runtime = createOpenTelemetryRuntime({
      env: {
        OTEL_RUNTIME_ENABLED: "true",
      },
      dependencies: deps as never,
      onWarning: vi.fn(),
    });

    runtime.start();

    const combinedOutput = warnSpy.mock.calls
      .flat()
      .map((value) => String(value))
      .join(" ");

    expect(combinedOutput).toContain("telemetry_bootstrap_disabled");
    expect(combinedOutput).toContain("missing_traces_endpoint");
    expect(combinedOutput).toContain("fallback-noop");
  });

  it("inicializa runtime com exporter/reader reais via deps e shutdown eh idempotente", async () => {
    __resetTelemetryOperationalLoggerForTests();
    const { deps, sdk } = createRuntimeDeps();
    const runtime = createOpenTelemetryRuntime({
      env: {
        OTEL_RUNTIME_ENABLED: "true",
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://otel-collector:4318",
        OTEL_METRICS_ENABLED: "true",
      },
      dependencies: deps as never,
      onWarning: vi.fn(),
    });

    const started = runtime.start();
    const startedAgain = runtime.start();
    await runtime.shutdown();
    await runtime.shutdown();

    expect(started).toMatchObject({
      state: "started",
      enabled: true,
      started: true,
    });
    expect(startedAgain.state).toBe("started");
    expect(deps.createTraceExporter).toHaveBeenCalledTimes(1);
    expect(deps.createMetricExporter).toHaveBeenCalledTimes(1);
    expect(deps.createMetricReader).toHaveBeenCalledTimes(1);
    expect(deps.createHttpInstrumentation).toHaveBeenCalledTimes(1);
    expect(deps.createNodeSdk).toHaveBeenCalledTimes(1);
    const nodeSdkConfig = deps.createNodeSdk.mock.calls[0]?.[0] as {
      views?: Array<{ instrumentName?: string }>;
    };
    expect(nodeSdkConfig.views?.map((view) => view.instrumentName)).toEqual(
      expect.arrayContaining([
        "importing.telemetry.run.duration",
        "importing.telemetry.step.duration",
        "prisma.telemetry.query.duration",
      ]),
    );
    expect(sdk.start).toHaveBeenCalledTimes(1);
    expect(sdk.shutdown).toHaveBeenCalledTimes(1);
    expect(runtime.debugSnapshot()).toMatchObject({
      state: "shutdown",
      shutdownCallCount: 2,
      sdkCreated: false,
      shutdownInFlight: false,
    });
  });

  it("emite log estruturado telemetry_bootstrap_enabled quando o runtime sobe", () => {
    __resetTelemetryOperationalLoggerForTests();
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { deps } = createRuntimeDeps();
    const runtime = createOpenTelemetryRuntime({
      env: {
        OTEL_RUNTIME_ENABLED: "true",
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://otel-collector:4318",
      },
      dependencies: deps as never,
      onWarning: vi.fn(),
    });

    runtime.start();

    const combinedOutput = infoSpy.mock.calls
      .flat()
      .map((value) => String(value))
      .join(" ");

    expect(combinedOutput).toContain("telemetry_bootstrap_enabled");
    expect(combinedOutput).toContain("started");
    expect(combinedOutput).toContain("active");
  });

  it("permite desabilitar instrumentacao HTTP por env sem quebrar bootstrap", () => {
    const warnings: Array<{ code: string }> = [];
    const { deps } = createRuntimeDeps();
    const runtime = createOpenTelemetryRuntime({
      env: {
        OTEL_RUNTIME_ENABLED: "true",
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://otel-collector:4318",
        OTEL_INSTRUMENTATION_HTTP_ENABLED: "false",
      },
      dependencies: deps as never,
      onWarning: (warning) => warnings.push(warning),
    });

    expect(runtime.start()).toMatchObject({
      state: "started",
      started: true,
    });
    expect(deps.createHttpInstrumentation).not.toHaveBeenCalled();
    expect(warnings.map((warning) => warning.code)).not.toContain(
      "INSTRUMENTATION_INIT_FAILED",
    );
    const nodeSdkConfig = deps.createNodeSdk.mock.calls[0]?.[0] as {
      instrumentations?: unknown[];
    };
    expect(nodeSdkConfig.instrumentations).toEqual([]);
    expect(runtime.debugSnapshot().config.instrumentation.httpEnabled).toBe(false);
  });

  it("permite desabilitar metric views por env sem quebrar bootstrap", () => {
    const { deps } = createRuntimeDeps();
    const runtime = createOpenTelemetryRuntime({
      env: {
        OTEL_RUNTIME_ENABLED: "true",
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://otel-collector:4318",
        OTEL_METRICS_ENABLED: "true",
        OTEL_METRIC_VIEWS_ENABLED: "false",
      },
      dependencies: deps as never,
      onWarning: vi.fn(),
    });

    expect(runtime.start()).toMatchObject({
      state: "started",
      started: true,
    });

    const nodeSdkConfig = deps.createNodeSdk.mock.calls[0]?.[0] as {
      views?: unknown[];
    };
    expect(nodeSdkConfig.views).toEqual([]);
    expect(runtime.debugSnapshot().config.metrics.viewsEnabled).toBe(false);
  });

  it("nao executa double-shutdown do SDK em chamadas concorrentes de shutdown", async () => {
    let resolveShutdown: (() => void) | undefined;
    const sdk = {
      start: vi.fn(),
      shutdown: vi.fn().mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveShutdown = resolve;
          }),
      ),
    } satisfies FakeSdk;
    const { deps } = createRuntimeDeps({ sdk });
    const runtime = createOpenTelemetryRuntime({
      env: {
        OTEL_RUNTIME_ENABLED: "true",
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://otel-collector:4318",
      },
      dependencies: deps as never,
      onWarning: vi.fn(),
    });

    runtime.start();
    const shutdownA = runtime.shutdown();
    const shutdownB = runtime.shutdown();

    expect(sdk.shutdown).toHaveBeenCalledTimes(1);
    expect(runtime.debugSnapshot()).toMatchObject({
      state: "shutdown",
      shutdownInFlight: true,
      sdkCreated: false,
    });

    resolveShutdown?.();
    await Promise.all([shutdownA, shutdownB]);

    expect(runtime.debugSnapshot()).toMatchObject({
      state: "shutdown",
      shutdownInFlight: false,
      shutdownCallCount: 2,
    });
  });

  it("degrada com warning quando bootstrap falha no exporter/sdk sem quebrar a app", () => {
    const warnings: Array<{ code: string; details?: Record<string, unknown> }> = [];
    const { deps } = createRuntimeDeps({
      throwOnTraceExporter: "exporter exploded",
    });
    const runtime = createOpenTelemetryRuntime({
      env: {
        OTEL_RUNTIME_ENABLED: "true",
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://otel-collector:4318",
      },
      dependencies: deps as never,
      onWarning: (warning) => warnings.push(warning),
    });

    expect(() => runtime.start()).not.toThrow();
    expect(runtime.start()).toMatchObject({
      state: "failed",
      enabled: false,
      started: false,
    });
    expect(deps.createTraceExporter).toHaveBeenCalledTimes(1);
    expect(deps.createNodeSdk).not.toHaveBeenCalled();
    expect(warnings.map((warning) => warning.code)).toContain("BOOTSTRAP_FAILED");
    expect(runtime.getTracer("test")).toBeDefined();
    expect(runtime.getMeter("test")).toBeDefined();
  });

  it("degrada com warning quando instrumentacao de plataforma falha sem derrubar bootstrap", () => {
    const warnings: Array<{ code: string; details?: Record<string, unknown> }> = [];
    const { deps } = createRuntimeDeps({
      throwOnHttpInstrumentation: "http instrumentation exploded",
    });
    const runtime = createOpenTelemetryRuntime({
      env: {
        OTEL_RUNTIME_ENABLED: "true",
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://otel-collector:4318",
      },
      dependencies: deps as never,
      onWarning: (warning) => warnings.push(warning),
    });

    expect(runtime.start()).toMatchObject({
      state: "started",
      enabled: true,
      started: true,
    });
    expect(deps.createTraceExporter).toHaveBeenCalledTimes(1);
    expect(deps.createNodeSdk).toHaveBeenCalledTimes(1);
    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "INSTRUMENTATION_INIT_FAILED",
          details: expect.objectContaining({
            instrumentationName: "http",
          }),
        }),
      ]),
    );
  });

  it("isola excecao no callback de warning", () => {
    const { deps } = createRuntimeDeps({
      throwOnCreateNodeSdk: "sdk factory exploded",
    });
    const runtime = createOpenTelemetryRuntime({
      env: {
        OTEL_RUNTIME_ENABLED: "true",
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://otel-collector:4318",
      },
      dependencies: deps as never,
      onWarning: () => {
        throw new Error("warning callback exploded");
      },
    });

    expect(() => runtime.start()).not.toThrow();
    expect(runtime.debugSnapshot().state).toBe("failed");
  });

  it("normaliza idle para shutdown quando shutdown eh chamado antes do start", async () => {
    const runtime = createOpenTelemetryRuntime({
      env: {
        OTEL_RUNTIME_ENABLED: "false",
      },
      onWarning: vi.fn(),
    });

    await runtime.shutdown();

    expect(runtime.debugSnapshot()).toMatchObject({
      state: "shutdown",
      shutdownCallCount: 1,
      sdkCreated: false,
      shutdownInFlight: false,
    });
  });

  it("retorna estado/razao estaveis ao chamar start depois de shutdown", async () => {
    const { deps } = createRuntimeDeps();
    const runtime = createOpenTelemetryRuntime({
      env: {
        OTEL_RUNTIME_ENABLED: "true",
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://otel-collector:4318",
      },
      dependencies: deps as never,
      onWarning: vi.fn(),
    });

    expect(runtime.start()).toMatchObject({
      state: "started",
      started: true,
    });
    await runtime.shutdown();

    expect(runtime.start()).toMatchObject({
      state: "shutdown",
      enabled: false,
      started: false,
      reason: "runtime_already_shutdown",
    });
    expect(deps.createNodeSdk).toHaveBeenCalledTimes(1);
  });
});

describe("getOrCreateServerOpenTelemetryRuntime", () => {
  it("retorna singleton module-level", () => {
    __resetServerOpenTelemetryRuntimeForTests();
    const runtimeA = getOrCreateServerOpenTelemetryRuntime();
    const runtimeB = getOrCreateServerOpenTelemetryRuntime();

    expect(runtimeA).toBe(runtimeB);
  });

  it("nao registra hooks de shutdown em duplicidade fora de test", () => {
    __resetServerOpenTelemetryRuntimeForTests();
    const mutableEnv = process.env as Record<string, string | undefined>;
    const originalNodeEnv = mutableEnv.NODE_ENV;
    mutableEnv.NODE_ENV = "development";
    const onceSpy = vi
      .spyOn(process, "once")
      .mockImplementation((() => process) as never);

    try {
      const runtimeA = getOrCreateServerOpenTelemetryRuntime();
      const runtimeB = getOrCreateServerOpenTelemetryRuntime();

      expect(runtimeA).toBe(runtimeB);
      expect(onceSpy).toHaveBeenCalledTimes(3);
      expect(onceSpy.mock.calls.map((call) => call[0])).toEqual([
        "SIGTERM",
        "SIGINT",
        "beforeExit",
      ]);
      expect(runtimeA.debugSnapshot().shutdownHooksRegistered).toBe(true);
    } finally {
      onceSpy.mockRestore();
      if (typeof originalNodeEnv === "string") {
        mutableEnv.NODE_ENV = originalNodeEnv;
      } else {
        delete mutableEnv.NODE_ENV;
      }
      __resetServerOpenTelemetryRuntimeForTests();
    }
  });

  it("reusa singleton global e nao duplica hooks em reavaliacao de modulo", async () => {
    vi.resetModules();
    const mutableEnv = process.env as Record<string, string | undefined>;
    const originalNodeEnv = mutableEnv.NODE_ENV;
    mutableEnv.NODE_ENV = "development";
    const onceSpy = vi
      .spyOn(process, "once")
      .mockImplementation((() => process) as never);

    try {
      const firstModule = await import("./otel-runtime");
      firstModule.__resetServerOpenTelemetryRuntimeForTests();
      const runtimeA = firstModule.getOrCreateServerOpenTelemetryRuntime();

      vi.resetModules();
      const secondModule = await import("./otel-runtime");
      const runtimeB = secondModule.getOrCreateServerOpenTelemetryRuntime();

      expect(runtimeA).toBe(runtimeB);
      expect(onceSpy).toHaveBeenCalledTimes(3);
      expect(onceSpy.mock.calls.map((call) => call[0])).toEqual([
        "SIGTERM",
        "SIGINT",
        "beforeExit",
      ]);

      secondModule.__resetServerOpenTelemetryRuntimeForTests();
    } finally {
      onceSpy.mockRestore();
      if (typeof originalNodeEnv === "string") {
        mutableEnv.NODE_ENV = originalNodeEnv;
      } else {
        delete mutableEnv.NODE_ENV;
      }
      __resetServerOpenTelemetryRuntimeForTests();
    }
  });
});

describe("ensureServerOpenTelemetryRuntimeStarted / shutdownServerOpenTelemetryRuntime", () => {
  it("memoiza o bootstrap start do runtime server-side", () => {
    __resetServerOpenTelemetryRuntimeForTests();
    const mutableEnv = process.env as Record<string, string | undefined>;
    const originalOtelEnabled = mutableEnv.OTEL_RUNTIME_ENABLED;
    const originalOtlpEndpoint = mutableEnv.OTEL_EXPORTER_OTLP_ENDPOINT;
    mutableEnv.OTEL_RUNTIME_ENABLED = "false";
    delete mutableEnv.OTEL_EXPORTER_OTLP_ENDPOINT;

    try {
      const first = ensureServerOpenTelemetryRuntimeStarted();
      const second = ensureServerOpenTelemetryRuntimeStarted();

      expect(first.runtime).toBe(second.runtime);
      expect(first.memoized).toBe(false);
      expect(second.memoized).toBe(true);
      expect(first.startResult.state).toBe("disabled");
      expect(first.runtime.debugSnapshot().startCallCount).toBe(1);
    } finally {
      if (typeof originalOtelEnabled === "string") {
        mutableEnv.OTEL_RUNTIME_ENABLED = originalOtelEnabled;
      } else {
        delete mutableEnv.OTEL_RUNTIME_ENABLED;
      }
      if (typeof originalOtlpEndpoint === "string") {
        mutableEnv.OTEL_EXPORTER_OTLP_ENDPOINT = originalOtlpEndpoint;
      } else {
        delete mutableEnv.OTEL_EXPORTER_OTLP_ENDPOINT;
      }
      __resetServerOpenTelemetryRuntimeForTests();
    }
  });

  it("faz shutdown do runtime server-side de forma previsivel e permite diagnostico apos shutdown", async () => {
    __resetServerOpenTelemetryRuntimeForTests();
    const mutableEnv = process.env as Record<string, string | undefined>;
    const originalOtelEnabled = mutableEnv.OTEL_RUNTIME_ENABLED;
    const originalOtlpEndpoint = mutableEnv.OTEL_EXPORTER_OTLP_ENDPOINT;
    mutableEnv.OTEL_RUNTIME_ENABLED = "false";
    delete mutableEnv.OTEL_EXPORTER_OTLP_ENDPOINT;

    try {
      const started = ensureServerOpenTelemetryRuntimeStarted();
      const shutdownSpy = vi.spyOn(started.runtime, "shutdown");

      await shutdownServerOpenTelemetryRuntime();

      expect(shutdownSpy).toHaveBeenCalledTimes(1);
      const afterShutdown = ensureServerOpenTelemetryRuntimeStarted();
      expect(afterShutdown.memoized).toBe(false);
      expect(afterShutdown.runtime).toBe(started.runtime);
      expect(afterShutdown.startResult.state).toBe("disabled");
      expect(afterShutdown.runtime.debugSnapshot().startCallCount).toBe(2);
    } finally {
      if (typeof originalOtelEnabled === "string") {
        mutableEnv.OTEL_RUNTIME_ENABLED = originalOtelEnabled;
      } else {
        delete mutableEnv.OTEL_RUNTIME_ENABLED;
      }
      if (typeof originalOtlpEndpoint === "string") {
        mutableEnv.OTEL_EXPORTER_OTLP_ENDPOINT = originalOtlpEndpoint;
      } else {
        delete mutableEnv.OTEL_EXPORTER_OTLP_ENDPOINT;
      }
      __resetServerOpenTelemetryRuntimeForTests();
    }
  });
});
