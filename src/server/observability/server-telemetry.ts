import type { Attributes, Span } from "@opentelemetry/api";
import {
  addTelemetryEvent,
  setTelemetryAttributes,
  withTelemetrySpan,
  type WithTelemetrySpanInput,
} from "@/src/lib/telemetry-span";
import { ensureServerOpenTelemetryRuntimeStarted } from "./otel-runtime";

const SERVER_TRACER_NAME = "mapia.server";
const SERVER_TRACER_VERSION = "1.0.0";

export function setServerTelemetryAttributes(
  span: Span,
  attributes?: Attributes,
): void {
  setTelemetryAttributes(span, attributes);
}

export function addServerTelemetryEvent(
  span: Span,
  name: string,
  attributes?: Attributes,
): void {
  addTelemetryEvent(span, name, attributes);
}

export async function withServerTelemetrySpan<T>(
  name: string,
  input: WithTelemetrySpanInput,
  run: (span: Span) => Promise<T> | T,
): Promise<T> {
  return await withTelemetrySpan(name, input, run, {
    tracerName: SERVER_TRACER_NAME,
    tracerVersion: SERVER_TRACER_VERSION,
    ensureStarted: () => {
      ensureServerOpenTelemetryRuntimeStarted();
    },
  });
}
