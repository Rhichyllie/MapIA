import type { Meter, Tracer } from "@opentelemetry/api";
import { describe, expect, it, vi } from "vitest";
import { attachOpenTelemetryPrismaInstrumentation } from "./prisma-otel-instrumentation";

class FakeSpan {
  readonly attributes: Record<string, unknown> = {};
  status?: { code: number; message?: string };
  ended = false;

  setAttributes(attributes: Record<string, unknown>) {
    Object.assign(this.attributes, attributes);
    return this;
  }

  setStatus(status: { code: number; message?: string }) {
    this.status = status;
    return this;
  }

  end() {
    this.ended = true;
  }

  spanContext() {
    return { traceId: "0".repeat(32), spanId: "0".repeat(16), traceFlags: 1 };
  }

  isRecording() {
    return true;
  }

  addEvent() {
    return this;
  }

  setAttribute(key: string, value: unknown) {
    this.attributes[key] = value;
    return this;
  }

  updateName() {
    return this;
  }

  addLink() {
    return undefined;
  }

  recordException() {
    return undefined;
  }
}

class FakeTracer {
  readonly spans: Array<{ name: string; span: FakeSpan }> = [];

  startSpan(name: string) {
    const span = new FakeSpan();
    this.spans.push({ name, span });
    return span;
  }
}

class FakeCounter {
  readonly calls: Array<{ value: number; attributes?: Record<string, unknown> }> = [];

  add(value: number, attributes?: Record<string, unknown>) {
    this.calls.push({ value, attributes });
  }
}

class FakeHistogram {
  readonly calls: Array<{ value: number; attributes?: Record<string, unknown> }> = [];

  record(value: number, attributes?: Record<string, unknown>) {
    this.calls.push({ value, attributes });
  }
}

class FakeMeter {
  readonly counters = new Map<string, FakeCounter>();
  readonly histograms = new Map<string, FakeHistogram>();

  createCounter(name: string) {
    const counter = new FakeCounter();
    this.counters.set(name, counter);
    return counter;
  }

  createHistogram(name: string) {
    const histogram = new FakeHistogram();
    this.histograms.set(name, histogram);
    return histogram;
  }
}

class FakePrismaClient {
  middleware?: (params: unknown, next: (params: unknown) => Promise<unknown>) => Promise<unknown>;
  readonly $use = vi.fn(
    (middleware: (params: unknown, next: (params: unknown) => Promise<unknown>) => Promise<unknown>) => {
      this.middleware = middleware;
    },
  );

  async execute(params: unknown, nextImpl?: (params: unknown) => Promise<unknown>) {
    if (!this.middleware) {
      throw new Error("middleware not attached");
    }

    return this.middleware(
      params,
      nextImpl ??
        (async () => ({
          ok: true,
        })),
    );
  }
}

function asTracer(fakeTracer: FakeTracer): Tracer {
  return fakeTracer as unknown as Tracer;
}

function asMeter(fakeMeter: FakeMeter): Meter {
  return fakeMeter as unknown as Meter;
}

describe("attachOpenTelemetryPrismaInstrumentation", () => {
  it("nao anexa middleware quando OTel esta desligado", () => {
    const client = new FakePrismaClient();

    const result = attachOpenTelemetryPrismaInstrumentation(client as never, {
      env: {
        OTEL_RUNTIME_ENABLED: "false",
      },
    });

    expect(result).toEqual({
      attached: false,
      reason: "otel_disabled",
    });
    expect(client.$use).not.toHaveBeenCalled();
  });

  it("nao anexa middleware quando flag de Prisma instrumentation esta desligada", () => {
    const client = new FakePrismaClient();

    const result = attachOpenTelemetryPrismaInstrumentation(client as never, {
      env: {
        OTEL_RUNTIME_ENABLED: "true",
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://otel-collector:4318",
        OTEL_INSTRUMENTATION_PRISMA_ENABLED: "false",
      },
    });

    expect(result).toEqual({
      attached: false,
      reason: "prisma_instrumentation_disabled",
    });
    expect(client.$use).not.toHaveBeenCalled();
  });

  it("anexa middleware de forma idempotente no mesmo client", () => {
    const client = new FakePrismaClient();

    const first = attachOpenTelemetryPrismaInstrumentation(client as never, {
      env: {
        OTEL_RUNTIME_ENABLED: "true",
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://otel-collector:4318",
      },
    });
    const second = attachOpenTelemetryPrismaInstrumentation(client as never, {
      env: {
        OTEL_RUNTIME_ENABLED: "true",
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://otel-collector:4318",
      },
    });

    expect(first).toEqual({ attached: true });
    expect(second).toEqual({
      attached: false,
      reason: "already_instrumented",
    });
    expect(client.$use).toHaveBeenCalledTimes(1);
  });

  it("registra spans e metricas sem vazar args/SQL em sucesso e erro", async () => {
    const client = new FakePrismaClient();
    const fakeTracer = new FakeTracer();
    const fakeMeter = new FakeMeter();
    const clock = {
      nowMs: vi
        .fn()
        .mockReturnValueOnce(100) // success start
        .mockReturnValueOnce(125) // success end
        .mockReturnValueOnce(200) // error start
        .mockReturnValueOnce(510), // error end
    };

    attachOpenTelemetryPrismaInstrumentation(client as never, {
      env: {
        OTEL_RUNTIME_ENABLED: "true",
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://otel-collector:4318",
        OTEL_INSTRUMENTATION_PRISMA_SLOW_QUERY_THRESHOLD_MS: "250",
      },
      tracer: asTracer(fakeTracer),
      meter: asMeter(fakeMeter),
      clock,
    });

    const rawParams = {
      model: "Project",
      action: "findMany",
      runInTransaction: false,
      args: {
        where: {
          id: "secret-id-123",
        },
        query: "select * from project where id = 'secret-id-123'",
      },
    };

    await client.execute(rawParams, async () => [{ id: "result" }]);

    await expect(
      client.execute(
        {
          model: "Project",
          action: "update",
          runInTransaction: true,
          args: {
            data: {
              name: "sensitive-name",
            },
          },
        },
        async () => {
          const error = new Error(
            "Prisma query failed: update Project set name='sensitive-name'",
          ) as Error & { code?: string };
          error.code = "P2002";
          throw error;
        },
      ),
    ).rejects.toThrow("Prisma query failed");

    expect(fakeTracer.spans).toHaveLength(2);
    expect(fakeTracer.spans[0]?.name).toBe("prisma.Project.findMany");
    expect(fakeTracer.spans[1]?.name).toBe("prisma.Project.update");

    const successSpanAttrs = fakeTracer.spans[0]?.span.attributes ?? {};
    const errorSpanAttrs = fakeTracer.spans[1]?.span.attributes ?? {};

    expect(successSpanAttrs).toMatchObject({
      "prisma.action": "findMany",
      "prisma.model": "Project",
      "prisma.outcome": "success",
      "prisma.slow_query": false,
      "prisma.duration_ms": 25,
    });
    expect(errorSpanAttrs).toMatchObject({
      "prisma.action": "update",
      "prisma.model": "Project",
      "prisma.outcome": "error",
      "prisma.in_transaction": true,
      "prisma.error_type": "Error",
      "prisma.error_code": "P2002",
      "prisma.slow_query": true,
      "prisma.duration_ms": 310,
    });

    const serializedTelemetry = JSON.stringify({
      spans: fakeTracer.spans.map((entry) => entry.span.attributes),
      counters: [...fakeMeter.counters.entries()].map(([name, counter]) => ({
        name,
        calls: counter.calls,
      })),
      histograms: [...fakeMeter.histograms.entries()].map(([name, histogram]) => ({
        name,
        calls: histogram.calls,
      })),
    });

    expect(serializedTelemetry).not.toContain("secret-id-123");
    expect(serializedTelemetry).not.toContain("sensitive-name");
    expect(serializedTelemetry).not.toContain("select * from project");

    expect(fakeMeter.counters.get("prisma.telemetry.operations")?.calls).toHaveLength(2);
    expect(fakeMeter.counters.get("prisma.telemetry.errors")?.calls).toHaveLength(1);
    expect(fakeMeter.counters.get("prisma.telemetry.slow_queries")?.calls).toHaveLength(1);
    expect(fakeMeter.histograms.get("prisma.telemetry.query.duration")?.calls).toHaveLength(2);
  });
});
