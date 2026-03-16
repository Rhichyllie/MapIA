type OpenTelemetryRuntimeConfigWarningCode =
  | "INVALID_BOOLEAN"
  | "INVALID_NUMBER"
  | "CLAMPED_NUMBER"
  | "INVALID_RATIO"
  | "INVALID_URL"
  | "INVALID_HEADERS_ENTRY"
  | "MISSING_OTLP_ENDPOINT"
  | "MISSING_OTLP_METRICS_ENDPOINT"
  | "BATCH_SIZE_ADJUSTED"
  | "INVALID_SAMPLER";

export type OpenTelemetryRuntimeConfigWarning = {
  code: OpenTelemetryRuntimeConfigWarningCode;
  message: string;
  details?: Record<string, string | number | boolean | null>;
};

export type OpenTelemetrySamplerConfig =
  | { kind: "always_on" }
  | { kind: "always_off" }
  | { kind: "traceidratio"; ratio: number };

export type OpenTelemetryRuntimeEnabledSourceKey =
  | "OTEL_RUNTIME_ENABLED"
  | "OTEL_ENABLED"
  | "default";

export type OpenTelemetryRuntimeConfig = {
  enabled: boolean;
  enabledSource: {
    key: OpenTelemetryRuntimeEnabledSourceKey;
    explicit: boolean;
    rawValue?: string;
  };
  serviceName: string;
  serviceVersion: string;
  deploymentEnvironment: string;
  instrumentation: {
    http: {
      enabled: boolean;
    };
    prisma: {
      enabled: boolean;
      slowQueryThresholdMs: number;
    };
  };
  traces: {
    endpointUrl?: string;
    headers: Record<string, string>;
    timeoutMillis: number;
    sampler: OpenTelemetrySamplerConfig;
    batch: {
      scheduleDelayMillis: number;
      exportTimeoutMillis: number;
      maxQueueSize: number;
      maxExportBatchSize: number;
    };
  };
  metrics: {
    enabled: boolean;
    endpointUrl?: string;
    headers: Record<string, string>;
    exportIntervalMillis: number;
    exportTimeoutMillis: number;
    timeoutMillis: number;
    views: {
      enabled: boolean;
    };
  };
};

export type ParseOpenTelemetryRuntimeConfigResult = {
  config: OpenTelemetryRuntimeConfig;
  warnings: OpenTelemetryRuntimeConfigWarning[];
};

const DEFAULTS = {
  enabled: false,
  serviceName: "mapia",
  serviceVersion: "0.1.0",
  tracesTimeoutMillis: 10_000,
  metricsTimeoutMillis: 10_000,
  metricExportIntervalMillis: 60_000,
  metricExportTimeoutMillis: 30_000,
  metricViewsEnabled: true,
  bspScheduleDelayMillis: 5_000,
  bspExportTimeoutMillis: 30_000,
  bspMaxQueueSize: 2048,
  bspMaxExportBatchSize: 512,
  prismaSlowQueryThresholdMs: 250,
} as const;

function parseBooleanLike(value: string | undefined): boolean | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  switch (value.trim().toLowerCase()) {
    case "1":
    case "true":
    case "yes":
    case "on":
      return true;
    case "0":
    case "false":
    case "no":
    case "off":
      return false;
    default:
      return undefined;
  }
}

function parseEnvBoolean(params: {
  env: Record<string, string | undefined>;
  key: string;
  fallback: boolean;
  warnings: OpenTelemetryRuntimeConfigWarning[];
}): boolean {
  const raw = params.env[params.key];
  if (typeof raw !== "string" || raw.trim() === "") {
    return params.fallback;
  }

  const parsed = parseBooleanLike(raw);
  if (typeof parsed === "boolean") {
    return parsed;
  }

  params.warnings.push({
    code: "INVALID_BOOLEAN",
    message: `Invalid boolean environment value for ${params.key}; using fallback.`,
    details: {
      key: params.key,
      fallback: params.fallback,
    },
  });
  return params.fallback;
}

function parseEnvBooleanByPriority(params: {
  env: Record<string, string | undefined>;
  keys: readonly ["OTEL_RUNTIME_ENABLED", "OTEL_ENABLED"];
  fallback: boolean;
  warnings: OpenTelemetryRuntimeConfigWarning[];
}): {
  value: boolean;
  source: OpenTelemetryRuntimeConfig["enabledSource"];
} {
  for (const key of params.keys) {
    const raw = params.env[key];
    if (typeof raw !== "string" || raw.trim() === "") {
      continue;
    }

    const parsed = parseBooleanLike(raw);
    if (typeof parsed === "boolean") {
      return {
        value: parsed,
        source: {
          key,
          explicit: true,
          rawValue: raw,
        },
      };
    }

    params.warnings.push({
      code: "INVALID_BOOLEAN",
      message: `Invalid boolean environment value for ${key}; using fallback.`,
      details: {
        key,
        fallback: params.fallback,
      },
    });
    return {
      value: params.fallback,
      source: {
        key,
        explicit: true,
        rawValue: raw,
      },
    };
  }

  return {
    value: params.fallback,
    source: {
      key: "default",
      explicit: false,
    },
  };
}

function parseEnvInteger(params: {
  env: Record<string, string | undefined>;
  key: string;
  fallback: number;
  min?: number;
  max?: number;
  warnings: OpenTelemetryRuntimeConfigWarning[];
}): number {
  const raw = params.env[params.key];
  if (typeof raw !== "string" || raw.trim() === "") {
    return params.fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    params.warnings.push({
      code: "INVALID_NUMBER",
      message: `Invalid numeric environment value for ${params.key}; using fallback.`,
      details: {
        key: params.key,
        fallback: params.fallback,
      },
    });
    return params.fallback;
  }

  let normalized = Math.trunc(parsed);
  if (typeof params.min === "number") {
    normalized = Math.max(params.min, normalized);
  }
  if (typeof params.max === "number") {
    normalized = Math.min(params.max, normalized);
  }

  if (normalized !== parsed) {
    params.warnings.push({
      code: "CLAMPED_NUMBER",
      message: `Normalized numeric environment value for ${params.key}.`,
      details: {
        key: params.key,
        raw,
        normalized,
        ...(typeof params.min === "number" ? { min: params.min } : {}),
        ...(typeof params.max === "number" ? { max: params.max } : {}),
      },
    });
  }

  return normalized;
}

function parseEnvRatio(params: {
  env: Record<string, string | undefined>;
  key: string;
  fallback: number;
  warnings: OpenTelemetryRuntimeConfigWarning[];
}): number {
  const raw = params.env[params.key];
  if (typeof raw !== "string" || raw.trim() === "") {
    return params.fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    params.warnings.push({
      code: "INVALID_RATIO",
      message: `Invalid sampler ratio in ${params.key}; using fallback.`,
      details: {
        key: params.key,
        fallback: params.fallback,
      },
    });
    return params.fallback;
  }

  return Math.max(0, Math.min(1, parsed));
}

function ensureValidUrl(
  value: string | undefined,
  key: string,
  warnings: OpenTelemetryRuntimeConfigWarning[],
): string | undefined {
  if (!value || value.trim() === "") {
    return undefined;
  }

  try {
    return new URL(value).toString();
  } catch {
    warnings.push({
      code: "INVALID_URL",
      message: `Invalid URL for ${key}; ignoring configured endpoint.`,
      details: {
        key,
      },
    });
    return undefined;
  }
}

function buildOtlpSignalEndpoint(params: {
  explicitSignalEndpointRaw?: string;
  explicitSignalEndpointKey: string;
  genericEndpointRaw?: string;
  genericEndpointKey: string;
  signalPath: "/v1/traces" | "/v1/metrics";
  warnings: OpenTelemetryRuntimeConfigWarning[];
}): string | undefined {
  const explicitRawConfigured =
    typeof params.explicitSignalEndpointRaw === "string" &&
    params.explicitSignalEndpointRaw.trim() !== "";
  const explicit = ensureValidUrl(
    params.explicitSignalEndpointRaw,
    params.explicitSignalEndpointKey,
    params.warnings,
  );
  if (explicit) {
    return explicit;
  }
  if (explicitRawConfigured) {
    return undefined;
  }

  const base = ensureValidUrl(
    params.genericEndpointRaw,
    params.genericEndpointKey,
    params.warnings,
  );
  if (!base) {
    return undefined;
  }

  try {
    const url = new URL(base);
    const normalizedBasePath = url.pathname.replace(/\/+$/, "");
    url.pathname = `${normalizedBasePath}${params.signalPath}`;
    return url.toString();
  } catch {
    params.warnings.push({
      code: "INVALID_URL",
      message: `Invalid OTLP base endpoint; unable to derive ${params.signalPath}.`,
      details: {
        key: params.genericEndpointKey,
      },
    });
    return undefined;
  }
}

function parseHeadersRecord(params: {
  raw: string | undefined;
  key: string;
  warnings: OpenTelemetryRuntimeConfigWarning[];
}): Record<string, string> {
  if (!params.raw || params.raw.trim() === "") {
    return {};
  }

  const headers: Record<string, string> = {};
  for (const entry of params.raw.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      params.warnings.push({
        code: "INVALID_HEADERS_ENTRY",
        message: `Ignoring malformed headers entry in ${params.key}.`,
        details: {
          key: params.key,
        },
      });
      continue;
    }

    const headerKey = trimmed.slice(0, separatorIndex).trim();
    const headerValue = trimmed.slice(separatorIndex + 1).trim();
    if (!headerKey || !headerValue) {
      params.warnings.push({
        code: "INVALID_HEADERS_ENTRY",
        message: `Ignoring malformed headers entry in ${params.key}.`,
        details: {
          key: params.key,
        },
      });
      continue;
    }

    headers[headerKey] = headerValue;
  }

  return headers;
}

function parseSamplerConfig(
  env: Record<string, string | undefined>,
  warnings: OpenTelemetryRuntimeConfigWarning[],
): OpenTelemetrySamplerConfig {
  const rawSampler = env.OTEL_TRACES_SAMPLER?.trim().toLowerCase();

  if (!rawSampler || rawSampler === "always_on") {
    return { kind: "always_on" };
  }

  if (rawSampler === "always_off") {
    return { kind: "always_off" };
  }

  if (rawSampler === "traceidratio") {
    return {
      kind: "traceidratio",
      ratio: parseEnvRatio({
        env,
        key: "OTEL_TRACES_SAMPLER_ARG",
        fallback: 1,
        warnings,
      }),
    };
  }

  warnings.push({
    code: "INVALID_SAMPLER",
    message: "Invalid OTEL_TRACES_SAMPLER value; using always_on.",
    details: {
      key: "OTEL_TRACES_SAMPLER",
    },
  });
  return { kind: "always_on" };
}

export function parseOpenTelemetryRuntimeConfig(
  env: Record<string, string | undefined>,
): ParseOpenTelemetryRuntimeConfigResult {
  const warnings: OpenTelemetryRuntimeConfigWarning[] = [];
  const enabledResult = parseEnvBooleanByPriority({
    env,
    keys: ["OTEL_RUNTIME_ENABLED", "OTEL_ENABLED"],
    fallback: DEFAULTS.enabled,
    warnings,
  });
  const enabled = enabledResult.value;
  const metricsEnabled = parseEnvBoolean({
    env,
    key: "OTEL_METRICS_ENABLED",
    fallback: enabled,
    warnings,
  });
  const httpInstrumentationEnabled = parseEnvBoolean({
    env,
    key: "OTEL_INSTRUMENTATION_HTTP_ENABLED",
    fallback: true,
    warnings,
  });
  const prismaInstrumentationEnabled = parseEnvBoolean({
    env,
    key: "OTEL_INSTRUMENTATION_PRISMA_ENABLED",
    fallback: true,
    warnings,
  });
  const metricViewsEnabled = parseEnvBoolean({
    env,
    key: "OTEL_METRIC_VIEWS_ENABLED",
    fallback: DEFAULTS.metricViewsEnabled,
    warnings,
  });
  const prismaSlowQueryThresholdMs = parseEnvInteger({
    env,
    key: "OTEL_INSTRUMENTATION_PRISMA_SLOW_QUERY_THRESHOLD_MS",
    fallback: DEFAULTS.prismaSlowQueryThresholdMs,
    min: 1,
    max: 60_000,
    warnings,
  });

  const tracesEndpointUrl = buildOtlpSignalEndpoint({
    explicitSignalEndpointRaw: env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
    explicitSignalEndpointKey: "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT",
    genericEndpointRaw: env.OTEL_EXPORTER_OTLP_ENDPOINT,
    genericEndpointKey: "OTEL_EXPORTER_OTLP_ENDPOINT",
    signalPath: "/v1/traces",
    warnings,
  });
  const metricsEndpointUrl = buildOtlpSignalEndpoint({
    explicitSignalEndpointRaw: env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT,
    explicitSignalEndpointKey: "OTEL_EXPORTER_OTLP_METRICS_ENDPOINT",
    genericEndpointRaw: env.OTEL_EXPORTER_OTLP_ENDPOINT,
    genericEndpointKey: "OTEL_EXPORTER_OTLP_ENDPOINT",
    signalPath: "/v1/metrics",
    warnings,
  });

  if (enabled && !tracesEndpointUrl) {
    warnings.push({
      code: "MISSING_OTLP_ENDPOINT",
      message: "OTEL is enabled but no valid OTLP endpoint was configured; runtime will stay disabled.",
      details: {
        tracesEndpointConfigured: false,
      },
    });
  }
  if (metricsEnabled && !metricsEndpointUrl) {
    warnings.push({
      code: "MISSING_OTLP_METRICS_ENDPOINT",
      message:
        "OTEL metrics are enabled but no valid OTLP metrics endpoint was configured; metrics export will stay disabled.",
      details: {
        metricsEnabled: true,
        metricsEndpointConfigured: false,
      },
    });
  }

  const genericHeaders = env.OTEL_EXPORTER_OTLP_HEADERS;
  const tracesHeaders = parseHeadersRecord({
    raw: env.OTEL_EXPORTER_OTLP_TRACES_HEADERS ?? genericHeaders,
    key: env.OTEL_EXPORTER_OTLP_TRACES_HEADERS
      ? "OTEL_EXPORTER_OTLP_TRACES_HEADERS"
      : "OTEL_EXPORTER_OTLP_HEADERS",
    warnings,
  });
  const metricsHeaders = parseHeadersRecord({
    raw: env.OTEL_EXPORTER_OTLP_METRICS_HEADERS ?? genericHeaders,
    key: env.OTEL_EXPORTER_OTLP_METRICS_HEADERS
      ? "OTEL_EXPORTER_OTLP_METRICS_HEADERS"
      : "OTEL_EXPORTER_OTLP_HEADERS",
    warnings,
  });

  const config: OpenTelemetryRuntimeConfig = {
    enabled,
    enabledSource: enabledResult.source,
    serviceName: env.OTEL_SERVICE_NAME?.trim() || DEFAULTS.serviceName,
    serviceVersion:
      env.OTEL_SERVICE_VERSION?.trim() ||
      env.npm_package_version?.trim() ||
      DEFAULTS.serviceVersion,
    deploymentEnvironment:
      env.OTEL_DEPLOYMENT_ENVIRONMENT?.trim() ||
      env.NODE_ENV?.trim() ||
      "development",
    instrumentation: {
      http: {
        enabled: httpInstrumentationEnabled,
      },
      prisma: {
        enabled: prismaInstrumentationEnabled,
        slowQueryThresholdMs: prismaSlowQueryThresholdMs,
      },
    },
    traces: {
      endpointUrl: tracesEndpointUrl,
      headers: tracesHeaders,
      timeoutMillis: parseEnvInteger({
        env,
        key: "OTEL_EXPORTER_OTLP_TRACES_TIMEOUT",
        fallback: DEFAULTS.tracesTimeoutMillis,
        min: 100,
        warnings,
      }),
      sampler: parseSamplerConfig(env, warnings),
      batch: {
        scheduleDelayMillis: parseEnvInteger({
          env,
          key: "OTEL_BSP_SCHEDULE_DELAY",
          fallback: DEFAULTS.bspScheduleDelayMillis,
          min: 100,
          warnings,
        }),
        exportTimeoutMillis: parseEnvInteger({
          env,
          key: "OTEL_BSP_EXPORT_TIMEOUT",
          fallback: DEFAULTS.bspExportTimeoutMillis,
          min: 100,
          warnings,
        }),
        maxQueueSize: parseEnvInteger({
          env,
          key: "OTEL_BSP_MAX_QUEUE_SIZE",
          fallback: DEFAULTS.bspMaxQueueSize,
          min: 1,
          warnings,
        }),
        maxExportBatchSize: parseEnvInteger({
          env,
          key: "OTEL_BSP_MAX_EXPORT_BATCH_SIZE",
          fallback: DEFAULTS.bspMaxExportBatchSize,
          min: 1,
          warnings,
        }),
      },
    },
    metrics: {
      enabled: metricsEnabled,
      endpointUrl: metricsEndpointUrl,
      headers: metricsHeaders,
      timeoutMillis: parseEnvInteger({
        env,
        key: "OTEL_EXPORTER_OTLP_METRICS_TIMEOUT",
        fallback: DEFAULTS.metricsTimeoutMillis,
        min: 100,
        warnings,
      }),
      exportIntervalMillis: parseEnvInteger({
        env,
        key: "OTEL_METRIC_EXPORT_INTERVAL",
        fallback: DEFAULTS.metricExportIntervalMillis,
        min: 1_000,
        warnings,
      }),
      exportTimeoutMillis: parseEnvInteger({
        env,
        key: "OTEL_METRIC_EXPORT_TIMEOUT",
        fallback: DEFAULTS.metricExportTimeoutMillis,
        min: 100,
        warnings,
      }),
      views: {
        enabled: metricViewsEnabled,
      },
    },
  };

  if (config.traces.batch.maxExportBatchSize > config.traces.batch.maxQueueSize) {
    config.traces.batch.maxExportBatchSize = config.traces.batch.maxQueueSize;
    warnings.push({
      code: "CLAMPED_NUMBER",
      message:
        "Normalized numeric environment value for OTEL_BSP_MAX_EXPORT_BATCH_SIZE.",
      details: {
        key: "OTEL_BSP_MAX_EXPORT_BATCH_SIZE",
        raw: env.OTEL_BSP_MAX_EXPORT_BATCH_SIZE ?? null,
        normalized: config.traces.batch.maxExportBatchSize,
        min: 1,
        max: config.traces.batch.maxQueueSize,
      },
    });
    warnings.push({
      code: "BATCH_SIZE_ADJUSTED",
      message:
        "Adjusted OTEL_BSP_MAX_EXPORT_BATCH_SIZE to not exceed OTEL_BSP_MAX_QUEUE_SIZE.",
      details: {
        ...(typeof env.OTEL_BSP_MAX_EXPORT_BATCH_SIZE === "string"
          ? { maxExportBatchSizeRaw: env.OTEL_BSP_MAX_EXPORT_BATCH_SIZE }
          : {}),
        maxQueueSize: config.traces.batch.maxQueueSize,
        normalizedExportBatchSize: config.traces.batch.maxExportBatchSize,
      },
    });
  }

  return { config, warnings };
}

export type OpenTelemetryRuntimeConfigLogSnapshot = {
  enabled: boolean;
  enabledSourceKey: OpenTelemetryRuntimeEnabledSourceKey;
  enabledExplicit: boolean;
  serviceName: string;
  serviceVersion: string;
  deploymentEnvironment: string;
  instrumentation: {
    httpEnabled: boolean;
    prismaEnabled: boolean;
    prismaSlowQueryThresholdMs: number;
  };
  traces: {
    endpointConfigured: boolean;
    timeoutMillis: number;
    headersCount: number;
    sampler: OpenTelemetrySamplerConfig;
    batch: OpenTelemetryRuntimeConfig["traces"]["batch"];
  };
  metrics: {
    enabled: boolean;
    endpointConfigured: boolean;
    timeoutMillis: number;
    exportIntervalMillis: number;
    exportTimeoutMillis: number;
    headersCount: number;
    viewsEnabled: boolean;
  };
};

export function toOpenTelemetryRuntimeConfigLogSnapshot(
  config: OpenTelemetryRuntimeConfig,
): OpenTelemetryRuntimeConfigLogSnapshot {
  return {
    enabled: config.enabled,
    enabledSourceKey: config.enabledSource.key,
    enabledExplicit: config.enabledSource.explicit,
    serviceName: config.serviceName,
    serviceVersion: config.serviceVersion,
    deploymentEnvironment: config.deploymentEnvironment,
    instrumentation: {
      httpEnabled: config.instrumentation.http.enabled,
      prismaEnabled: config.instrumentation.prisma.enabled,
      prismaSlowQueryThresholdMs: config.instrumentation.prisma.slowQueryThresholdMs,
    },
    traces: {
      endpointConfigured: Boolean(config.traces.endpointUrl),
      timeoutMillis: config.traces.timeoutMillis,
      headersCount: Object.keys(config.traces.headers).length,
      sampler: config.traces.sampler,
      batch: config.traces.batch,
    },
    metrics: {
      enabled: config.metrics.enabled,
      endpointConfigured: Boolean(config.metrics.endpointUrl),
      timeoutMillis: config.metrics.timeoutMillis,
      exportIntervalMillis: config.metrics.exportIntervalMillis,
      exportTimeoutMillis: config.metrics.exportTimeoutMillis,
      headersCount: Object.keys(config.metrics.headers).length,
      viewsEnabled: config.metrics.views.enabled,
    },
  };
}
