import { metrics, type Counter, type Histogram, type Meter } from "@opentelemetry/api";
import { sanitizeMetricLabelValue } from "./creation-transition-sanitizer";

type CreationTransitionMetrics = {
  emitSuccess: Counter;
  emitFailure: Counter;
  emitDropped: Counter;
  sinkLatencyMs: Histogram;
  snapshotStalenessSeconds: Histogram;
};

let cachedMetrics: CreationTransitionMetrics | null = null;

function getMeter(): Meter {
  return metrics.getMeter("mapia.creation-transition", "1.0.0");
}

function getMetrics(): CreationTransitionMetrics {
  if (cachedMetrics) {
    return cachedMetrics;
  }

  const meter = getMeter();
  cachedMetrics = {
    emitSuccess: meter.createCounter("telemetry_emit_success_total", {
      description: "Total de emissões de telemetria persistidas com sucesso.",
    }),
    emitFailure: meter.createCounter("telemetry_emit_failure_total", {
      description: "Total de falhas ao emitir telemetria.",
    }),
    emitDropped: meter.createCounter("telemetry_emit_dropped_total", {
      description: "Total de eventos descartados/deduplicados no sink.",
    }),
    sinkLatencyMs: meter.createHistogram("telemetry_sink_latency_ms", {
      description: "Latência de persistência do sink de telemetria.",
      unit: "ms",
    }),
    snapshotStalenessSeconds: meter.createHistogram(
      "telemetry_snapshot_staleness_seconds",
      {
        description: "Defasagem do snapshot de telemetria em segundos.",
        unit: "s",
      },
    ),
  };

  return cachedMetrics;
}

type BaseLabels = {
  environment: string;
  releaseVersion: string;
  eventName?: string;
  reason?: string;
};

function toLabels(labels: BaseLabels) {
  return {
    environment: sanitizeMetricLabelValue(labels.environment),
    release_version: sanitizeMetricLabelValue(labels.releaseVersion),
    ...(labels.eventName
      ? { event_name: sanitizeMetricLabelValue(labels.eventName) }
      : {}),
    ...(labels.reason ? { reason: sanitizeMetricLabelValue(labels.reason) } : {}),
  };
}

export function recordTelemetryEmitSuccess(input: BaseLabels) {
  const metricsRecorder = getMetrics();
  metricsRecorder.emitSuccess.add(1, toLabels(input));
}

export function recordTelemetryEmitFailure(input: BaseLabels) {
  const metricsRecorder = getMetrics();
  metricsRecorder.emitFailure.add(1, toLabels(input));
}

export function recordTelemetryEmitDropped(input: BaseLabels) {
  const metricsRecorder = getMetrics();
  metricsRecorder.emitDropped.add(1, toLabels(input));
}

export function recordTelemetrySinkLatencyMs(input: BaseLabels & { durationMs: number }) {
  const metricsRecorder = getMetrics();
  metricsRecorder.sinkLatencyMs.record(input.durationMs, toLabels(input));
}

export function recordTelemetrySnapshotStaleness(input: {
  environment: string;
  releaseVersion: string;
  stalenessSeconds: number;
}) {
  const metricsRecorder = getMetrics();
  metricsRecorder.snapshotStalenessSeconds.record(input.stalenessSeconds, {
    environment: sanitizeMetricLabelValue(input.environment),
    release_version: sanitizeMetricLabelValue(input.releaseVersion),
  });
}
