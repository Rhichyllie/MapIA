import {
  SpanKind,
  SpanStatusCode,
  trace,
  type Attributes,
  type Span,
  type SpanOptions,
} from "@opentelemetry/api";

const DEFAULT_TRACER_NAME = "mapia.app";
const DEFAULT_TRACER_VERSION = "1.0.0";

export type WithTelemetrySpanInput = {
  attributes?: Attributes;
  options?: Omit<SpanOptions, "attributes" | "kind"> & {
    kind?: SpanKind;
  };
};

type TelemetryTracerConfig = {
  tracerName?: string;
  tracerVersion?: string;
  ensureStarted?: () => void;
};

function getTelemetryTracer(config?: TelemetryTracerConfig) {
  config?.ensureStarted?.();

  return trace.getTracer(
    config?.tracerName ?? DEFAULT_TRACER_NAME,
    config?.tracerVersion ?? DEFAULT_TRACER_VERSION,
  );
}

export function setTelemetryAttributes(
  span: Span,
  attributes?: Attributes,
): void {
  if (!attributes) {
    return;
  }

  try {
    span.setAttributes(attributes);
  } catch {
    // best-effort only
  }
}

export function addTelemetryEvent(
  span: Span,
  name: string,
  attributes?: Attributes,
): void {
  try {
    span.addEvent(name, attributes);
  } catch {
    // best-effort only
  }
}

function recordTelemetryException(span: Span, error: unknown): void {
  const exception =
    error instanceof Error ? error : new Error(String(error));

  try {
    span.recordException(exception);
  } catch {
    // best-effort only
  }
}

export async function withTelemetrySpan<T>(
  name: string,
  input: WithTelemetrySpanInput,
  run: (span: Span) => Promise<T> | T,
  config?: TelemetryTracerConfig,
): Promise<T> {
  const tracer = getTelemetryTracer(config);

  return await new Promise<T>((resolve, reject) => {
    tracer.startActiveSpan(
      name,
      {
        kind: input.options?.kind ?? SpanKind.INTERNAL,
        ...input.options,
        ...(input.attributes ? { attributes: input.attributes } : {}),
      },
      (span) => {
        Promise.resolve(run(span))
          .then((result) => {
            span.setStatus({ code: SpanStatusCode.OK });
            resolve(result);
          })
          .catch((error) => {
            recordTelemetryException(span, error);
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: error instanceof Error ? error.message : String(error),
            });
            reject(error);
          })
          .finally(() => {
            span.end();
          });
      },
    );
  });
}
