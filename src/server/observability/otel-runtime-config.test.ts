import { describe, expect, it } from "vitest";
import {
  parseOpenTelemetryRuntimeConfig,
  toOpenTelemetryRuntimeConfigLogSnapshot,
} from "./otel-runtime-config";

describe("parseOpenTelemetryRuntimeConfig", () => {
  it("aplica defaults seguros e OTel desligado por padrao", () => {
    const { config, warnings } = parseOpenTelemetryRuntimeConfig({});

    expect(config.enabled).toBe(false);
    expect(config.serviceName).toBe("mapia");
    expect(config.traces.endpointUrl).toBeUndefined();
    expect(config.metrics.enabled).toBe(false);
    expect(config.instrumentation.http.enabled).toBe(true);
    expect(config.instrumentation.prisma.enabled).toBe(true);
    expect(config.instrumentation.prisma.slowQueryThresholdMs).toBe(250);
    expect(config.metrics.views.enabled).toBe(true);
    expect(warnings).toEqual([]);
  });

  it("parseia envs validos para traces/metrics/sampler/headers", () => {
    const { config, warnings } = parseOpenTelemetryRuntimeConfig({
      OTEL_RUNTIME_ENABLED: "true",
      OTEL_METRICS_ENABLED: "true",
      OTEL_SERVICE_NAME: "mapia-api",
      OTEL_SERVICE_VERSION: "1.2.3",
      OTEL_DEPLOYMENT_ENVIRONMENT: "staging",
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://otel-collector:4318",
      OTEL_EXPORTER_OTLP_HEADERS: "api-key=secret,tenant=my-team",
      OTEL_TRACES_SAMPLER: "traceidratio",
      OTEL_TRACES_SAMPLER_ARG: "0.25",
      OTEL_BSP_MAX_QUEUE_SIZE: "1000",
      OTEL_BSP_MAX_EXPORT_BATCH_SIZE: "300",
      OTEL_METRIC_EXPORT_INTERVAL: "5000",
      OTEL_METRIC_EXPORT_TIMEOUT: "2000",
      OTEL_INSTRUMENTATION_HTTP_ENABLED: "false",
      OTEL_INSTRUMENTATION_PRISMA_ENABLED: "false",
      OTEL_INSTRUMENTATION_PRISMA_SLOW_QUERY_THRESHOLD_MS: "750",
      OTEL_METRIC_VIEWS_ENABLED: "false",
    });

    expect(warnings).toEqual([]);
    expect(config).toMatchObject({
      enabled: true,
      enabledSource: {
        key: "OTEL_RUNTIME_ENABLED",
        explicit: true,
      },
      serviceName: "mapia-api",
      serviceVersion: "1.2.3",
      deploymentEnvironment: "staging",
      instrumentation: {
        http: {
          enabled: false,
        },
        prisma: {
          enabled: false,
          slowQueryThresholdMs: 750,
        },
      },
      traces: {
        endpointUrl: "http://otel-collector:4318/v1/traces",
        headers: {
          "api-key": "secret",
          tenant: "my-team",
        },
        sampler: {
          kind: "traceidratio",
          ratio: 0.25,
        },
        batch: {
          maxQueueSize: 1000,
          maxExportBatchSize: 300,
        },
      },
      metrics: {
        enabled: true,
        endpointUrl: "http://otel-collector:4318/v1/metrics",
        exportIntervalMillis: 5000,
        exportTimeoutMillis: 2000,
        views: {
          enabled: false,
        },
      },
    });
  });

  it("degrada de forma defensiva em valores invalidos sem quebrar parse", () => {
    const { config, warnings } = parseOpenTelemetryRuntimeConfig({
      OTEL_RUNTIME_ENABLED: "maybe",
      OTEL_METRICS_ENABLED: "not-bool",
      OTEL_EXPORTER_OTLP_ENDPOINT: "://bad-url",
      OTEL_EXPORTER_OTLP_HEADERS: "bad-entry,noeq,token=",
      OTEL_TRACES_SAMPLER: "bad_sampler",
      OTEL_TRACES_SAMPLER_ARG: "not-a-number",
      OTEL_BSP_MAX_QUEUE_SIZE: "bad",
      OTEL_BSP_MAX_EXPORT_BATCH_SIZE: "999999",
      OTEL_INSTRUMENTATION_HTTP_ENABLED: "not-bool",
      OTEL_INSTRUMENTATION_PRISMA_ENABLED: "not-bool",
      OTEL_METRIC_VIEWS_ENABLED: "not-bool",
    });

    expect(config.enabled).toBe(false);
    expect(config.instrumentation.http.enabled).toBe(true);
    expect(config.instrumentation.prisma.enabled).toBe(true);
    expect(config.metrics.views.enabled).toBe(true);
    expect(config.traces.endpointUrl).toBeUndefined();
    expect(config.traces.sampler).toEqual({ kind: "always_on" });
    expect(config.traces.batch.maxQueueSize).toBeGreaterThan(0);
    expect(config.traces.batch.maxExportBatchSize).toBe(
      config.traces.batch.maxQueueSize,
    );
    expect(warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining([
        "INVALID_BOOLEAN",
        "INVALID_URL",
        "INVALID_HEADERS_ENTRY",
        "INVALID_SAMPLER",
        "INVALID_NUMBER",
      ]),
    );
  });

  it("gera warning quando OTEL esta habilitado sem endpoint valido", () => {
    const { warnings } = parseOpenTelemetryRuntimeConfig({
      OTEL_RUNTIME_ENABLED: "true",
    });

    expect(warnings.map((warning) => warning.code)).toContain("MISSING_OTLP_ENDPOINT");
  });

  it("emite warnings de clamp e ajuste quando export batch size excede queue size", () => {
    const { config, warnings } = parseOpenTelemetryRuntimeConfig({
      OTEL_RUNTIME_ENABLED: "true",
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://otel-collector:4318",
      OTEL_BSP_MAX_QUEUE_SIZE: "1000",
      OTEL_BSP_MAX_EXPORT_BATCH_SIZE: "999999",
    });

    expect(config.traces.batch.maxQueueSize).toBe(1000);
    expect(config.traces.batch.maxExportBatchSize).toBe(1000);
    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "CLAMPED_NUMBER",
          details: expect.objectContaining({
            key: "OTEL_BSP_MAX_EXPORT_BATCH_SIZE",
            raw: "999999",
            normalized: 1000,
            max: 1000,
          }),
        }),
        expect.objectContaining({
          code: "BATCH_SIZE_ADJUSTED",
          details: expect.objectContaining({
            maxQueueSize: 1000,
            normalizedExportBatchSize: 1000,
          }),
        }),
      ]),
    );
  });

  it("gera warning quando metrics esta habilitado mas endpoint de metrics nao fica configurado", () => {
    const { config, warnings } = parseOpenTelemetryRuntimeConfig({
      OTEL_RUNTIME_ENABLED: "true",
      OTEL_METRICS_ENABLED: "true",
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://otel-collector:4318",
      OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: "://bad-url",
    });

    const snapshot = toOpenTelemetryRuntimeConfigLogSnapshot(config);

    expect(config.traces.endpointUrl).toBe("http://otel-collector:4318/v1/traces");
    expect(config.metrics.endpointUrl).toBeUndefined();
    expect(snapshot.metrics.endpointConfigured).toBe(false);
    expect(warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining(["INVALID_URL", "MISSING_OTLP_METRICS_ENDPOINT"]),
    );
  });

  it("gera snapshot de log sem vazar valores de headers", () => {
    const { config } = parseOpenTelemetryRuntimeConfig({
      OTEL_RUNTIME_ENABLED: "true",
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://otel-collector:4318",
      OTEL_EXPORTER_OTLP_HEADERS: "authorization=Bearer secret,x-tenant=acme",
    });

    const snapshot = toOpenTelemetryRuntimeConfigLogSnapshot(config);

    expect(snapshot.traces.headersCount).toBe(2);
    expect(snapshot.instrumentation.httpEnabled).toBe(true);
    expect(snapshot.instrumentation.prismaEnabled).toBe(true);
    expect(snapshot.instrumentation.prismaSlowQueryThresholdMs).toBe(250);
    expect(snapshot.metrics.viewsEnabled).toBe(true);
    expect(JSON.stringify(snapshot)).not.toContain("Bearer secret");
    expect(JSON.stringify(snapshot)).not.toContain("authorization=");
  });

  it("aceita OTEL_ENABLED como fallback compativel quando OTEL_RUNTIME_ENABLED nao esta definido", () => {
    const { config } = parseOpenTelemetryRuntimeConfig({
      OTEL_ENABLED: "true",
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://otel-collector:4318",
    });

    expect(config.enabled).toBe(true);
    expect(config.enabledSource).toEqual({
      key: "OTEL_ENABLED",
      explicit: true,
      rawValue: "true",
    });
  });
});
