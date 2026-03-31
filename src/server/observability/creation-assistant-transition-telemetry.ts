import { randomUUID } from "node:crypto";
import { trace } from "@opentelemetry/api";
import { prisma } from "@/src/server/db/client";
import { getServerEnv } from "@/src/lib/env";
import { normalizeSourceStatusCode, type InitialView, type LayoutChoice, type ProjectProfile, type StartSource, type StartStrategy } from "@/src/modules/creation-assistant/domain";
import { sanitizeLogLine, sanitizeTelemetryValue, hashActorIdentity } from "./creation-transition-sanitizer";
import {
  CREATION_TRANSITION_EVENT_CONTRACT,
  CREATION_TRANSITION_EVENT_NAMES,
  CreationTransitionEnvelopeSchema,
  parseCreationTransitionPayload,
  type CreationTelemetryDedupePolicy,
  type CreationTransitionEventName,
  type CreationTransitionPayloadByEventName,
} from "./creation-transition-contract";
import {
  recordTelemetryEmitDropped,
  recordTelemetryEmitFailure,
  recordTelemetryEmitSuccess,
  recordTelemetrySinkLatencyMs,
  recordTelemetrySnapshotStaleness,
} from "./creation-transition-metrics";
import {
  MemoryCreationTransitionTelemetryStore,
  NoopCreationTransitionTelemetryStore,
  PrismaCreationTransitionTelemetryStore,
  ResilientCreationTransitionTelemetryStore,
  createCreationTelemetryTableReadinessProbe,
  type CreationTransitionTelemetryStore,
} from "./creation-transition-store";
import { logTelemetryOperationalEvent } from "./telemetry-operational-logger";

type RequestTelemetryContext = {
  requestId?: string;
  correlationId?: string;
  causationId?: string;
  traceId?: string;
  traceparent?: string;
};

type EmitContext = RequestTelemetryContext & {
  actorIdentity?: string;
  actorType?: "user" | "service" | "system";
  projectId?: string;
  dedupeKey?: string;
};

type RuntimeTelemetryConfig = {
  enabled: boolean;
  sinkTimeoutMs: number;
  sinkFallbackCooldownMs: number;
  gateEvaluationIntervalMs: number;
  logThrottleMs: number;
};

type CreationTelemetrySinkFallbackReason =
  | "timeout"
  | "error"
  | "sink_unavailable"
  | "missing_table";

type CreationTelemetrySinkState =
  | {
      mode: "ready";
    }
  | {
      mode: "fallback-noop";
      reason: CreationTelemetrySinkFallbackReason;
      activatedAtMs: number;
      untilMs: number;
    };
type CreationTelemetryEmitStatus =
  | "stored"
  | "deduped"
  | "skipped"
  | "disabled"
  | "timeout"
  | "error";

type LegacyTemplateFallbackInput = {
  projectId: string;
  ownerIdentity: string;
  source: string;
  fallbackMode: "none" | "partial" | "full";
  fallbackReason:
    | "missing_creation_settings"
    | "missing_recipe"
    | "invalid_settings"
    | "migration_gap"
    | "unknown"
    | "none";
  fieldsFromTemplate: {
    profile: boolean;
    initialView: boolean;
    layout: boolean;
    contextDefaults: boolean;
  };
  riskTier: "none" | "low" | "high";
  effectiveResult: {
    profile: ProjectProfile;
    initialView: InitialView;
    layout: LayoutChoice;
  };
};

const WINDOW_DAYS = 14;
const STALE_SNAPSHOT_AFTER_SECONDS = 15 * 60;
const TRACE_ID_PATTERN = /^[\da-f]{32}$/i;
const MIN_TRACE_ID = "00000000000000000000000000000000";
const GATE_EVALUATION_TRIGGER_EVENTS = new Set<CreationTransitionEventName>([
  CREATION_TRANSITION_EVENT_NAMES.CREATION_SETTINGS_ALIAS_PUT,
  CREATION_TRANSITION_EVENT_NAMES.CREATION_DRAFT_SAVED,
  CREATION_TRANSITION_EVENT_NAMES.CREATION_APPLY_ATTEMPTED,
  CREATION_TRANSITION_EVENT_NAMES.CREATION_APPLY_BLOCKED_STRICT_VALIDATION,
]);
type GateWarningPayload = CreationTransitionPayloadByEventName[
  typeof CREATION_TRANSITION_EVENT_NAMES.CREATION_TRANSITION_GATE_WARNING
];
type CreationTransitionTelemetrySnapshot = {
  executiveSummary: {
    aliasWriteRatePercent: number;
    templateDependencyRatePercent: number;
    strictBlockRatePercent: number;
    runtimeFallbackRatePercent: number;
    breachedGateCount: number;
  };
  operationalSummary: {
    counters: Record<string, number>;
    rates: {
      aliasWriteRatePercent: number;
      templateDependencyRatePercent: number;
      strictBlockRatePercent: number;
      runtimeFallbackRatePercent: number;
    };
    topFallbackReasons: Array<{ reason: string; count: number }>;
    inheritedTemplateFields: Array<{ field: string; count: number }>;
    window: {
      start: string;
      end: string;
    };
    gates: GateWarningPayload[];
  };
  technicalBreakdown: {
    freshness: {
      latestIngestedAt: string | null;
      stalenessSeconds: number;
      stale: boolean;
    };
    eventsWindowCount: number;
  };
  securitySummary: {
    redactionPolicy: "central_enforced";
    piiLeakDetected: boolean;
  };
  transitionReadiness: {
    readyToCutLegacy: boolean;
    blockingGates: string[];
  };
  generatedAt: string;
};

const gateDefinitions = [
  {
    code: "alias_write_rate_percent",
    title: "Uso do alias legado de escrita",
    threshold: 5,
    effectiveFrom: "2026-06-07T00:00:00.000Z",
    owner: "api-core",
    recommendedAction:
      "Migrar consumidores para PUT /creation-draft e bloquear novos usos do alias.",
  },
  {
    code: "template_dependency_rate_percent",
    title: "Dependencia real de template legado",
    threshold: 2,
    effectiveFrom: "2026-07-19T00:00:00.000Z",
    owner: "product-eng",
    recommendedAction:
      "Completar backfill de creationSettings e remover caminhos que dependem de template.",
  },
  {
    code: "strict_block_rate_percent",
    title: "Bloqueios de validacao estrita no apply",
    threshold: 15,
    effectiveFrom: "2026-03-12T00:00:00.000Z",
    owner: "assistant-quality",
    recommendedAction:
      "Revisar recipes/strict rules e corrigir instrucoes de preenchimento no fluxo.",
  },
  {
    code: "runtime_fallback_rate_percent",
    title: "Fallback de recipe runtime",
    threshold: 5,
    effectiveFrom: "2026-03-12T00:00:00.000Z",
    owner: "assistant-architecture",
    recommendedAction:
      "Completar registry de recipes e remover dependencias de fallback generico.",
  },
] as const;

function toPercent(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return Number(((numerator / denominator) * 100).toFixed(2));
}

function parseTraceparentTraceId(traceparent?: string | null) {
  if (!traceparent?.trim()) return undefined;
  const [version, traceId] = traceparent.trim().split("-");
  if (!version || !traceId) return undefined;
  if (!TRACE_ID_PATTERN.test(traceId)) return undefined;
  if (traceId.toLowerCase() === MIN_TRACE_ID) return undefined;
  return traceId.toLowerCase();
}

function parseTraceId(traceId?: string | null) {
  if (!traceId?.trim()) return undefined;
  const normalized = traceId.trim();
  if (!TRACE_ID_PATTERN.test(normalized)) return undefined;
  if (normalized.toLowerCase() === MIN_TRACE_ID) return undefined;
  return normalized.toLowerCase();
}

function readTraceId(context?: RequestTelemetryContext) {
  const fromHeader = parseTraceId(context?.traceId);
  if (fromHeader) return fromHeader;

  const fromTraceparent = parseTraceparentTraceId(context?.traceparent);
  if (fromTraceparent) return fromTraceparent;

  const fromActiveSpan = parseTraceId(trace.getActiveSpan()?.spanContext().traceId);
  if (fromActiveSpan) return fromActiveSpan;

  return "unknown";
}

export function resolveTraceIdForTelemetry(
  context?: RequestTelemetryContext,
) {
  return readTraceId(context);
}

function eventDayKey(dateIso: string) {
  return dateIso.slice(0, 10);
}

const disabledTelemetryStore = new NoopCreationTransitionTelemetryStore(
  "disabled",
);
const fallbackTelemetryStore = new NoopCreationTransitionTelemetryStore(
  "sink_unavailable",
);
let telemetryStore: CreationTransitionTelemetryStore =
  createDefaultCreationTransitionTelemetryStore();
let telemetryRuntimeConfig: Partial<RuntimeTelemetryConfig> = {};
let telemetrySinkState: CreationTelemetrySinkState = { mode: "ready" };
let gateEvaluationInFlight: Promise<void> | null = null;
let lastGateEvaluationAtMs = 0;
let gateEvaluationSignalVersion = 0;
let inFlightGateEvaluationSignalVersion = 0;
let pendingGateEvaluationSignalVersion = 0;
const backgroundTelemetryOperations = new Set<Promise<unknown>>();
const logThrottleBySignature = new Map<string, number>();

function getTelemetryRuntimeConfig(): RuntimeTelemetryConfig {
  const env = getServerEnv();
  return {
    enabled:
      telemetryRuntimeConfig.enabled ??
      env.CREATION_TRANSITION_TELEMETRY_ENABLED,
    sinkTimeoutMs:
      telemetryRuntimeConfig.sinkTimeoutMs ?? env.TELEMETRY_SINK_TIMEOUT_MS,
    sinkFallbackCooldownMs:
      telemetryRuntimeConfig.sinkFallbackCooldownMs ??
      env.TELEMETRY_SINK_FALLBACK_COOLDOWN_MS,
    gateEvaluationIntervalMs:
      telemetryRuntimeConfig.gateEvaluationIntervalMs ??
      env.TELEMETRY_GATE_EVALUATION_INTERVAL_MS,
    logThrottleMs:
      telemetryRuntimeConfig.logThrottleMs ??
      env.CREATION_TRANSITION_TELEMETRY_LOG_THROTTLE_MS,
  };
}

function getResilientCreationTransitionTelemetryStore() {
  return telemetryStore instanceof ResilientCreationTransitionTelemetryStore
    ? telemetryStore
    : undefined;
}

function getActiveTelemetrySinkFallbackState(nowMs = Date.now()) {
  if (telemetrySinkState.mode !== "fallback-noop") {
    return null;
  }

  if (nowMs >= telemetrySinkState.untilMs) {
    telemetrySinkState = { mode: "ready" };
    return null;
  }

  return telemetrySinkState;
}

function activateTelemetrySinkFallback(input: {
  reason: CreationTelemetrySinkFallbackReason;
  eventName?: string;
  durationMs?: number;
  errorMessage?: string;
}) {
  const runtimeConfig = getTelemetryRuntimeConfig();
  const nowMs = Date.now();
  const untilMs = nowMs + runtimeConfig.sinkFallbackCooldownMs;

  telemetrySinkState = {
    mode: "fallback-noop",
    reason: input.reason,
    activatedAtMs: nowMs,
    untilMs,
  };

  logTelemetryOperationalEvent({
    event: "telemetry_sink_fallback_active",
    level: "warn",
    dedupeKey: `creation-telemetry-fallback:${input.reason}`,
    throttleMs: Math.max(
      runtimeConfig.logThrottleMs,
      runtimeConfig.sinkFallbackCooldownMs,
    ),
    payload: {
      mode: "fallback-noop",
      reason: input.reason,
      cooldownMs: runtimeConfig.sinkFallbackCooldownMs,
      activeUntil: new Date(untilMs).toISOString(),
      ...(input.eventName ? { eventName: input.eventName } : {}),
      ...(typeof input.durationMs === "number"
        ? { durationMs: Number(input.durationMs.toFixed(2)) }
        : {}),
      ...(input.errorMessage ? { errorMessage: input.errorMessage } : {}),
    },
  });
}

function logTelemetrySinkReady(input?: {
  eventName?: string;
  restoredFromFallback?: boolean;
}) {
  const runtimeConfig = getTelemetryRuntimeConfig();
  const degradedState =
    getResilientCreationTransitionTelemetryStore()?.getDegradedState() ?? null;

  telemetrySinkState = { mode: "ready" };
  logTelemetryOperationalEvent({
    event: "telemetry_sink_ready",
    level: "info",
    dedupeKey: `creation-telemetry-ready:${input?.restoredFromFallback ? "restored" : "steady"}`,
    throttleMs: runtimeConfig.logThrottleMs,
    payload: {
      mode: "active",
      fallbackActive: false,
      degradedByStoreProbe: degradedState !== null,
      ...(input?.eventName ? { eventName: input.eventName } : {}),
      ...(input?.restoredFromFallback
        ? { restoredFromFallback: input.restoredFromFallback }
        : {}),
    },
  });
}

function createDefaultCreationTransitionTelemetryStore(): CreationTransitionTelemetryStore {
  return new ResilientCreationTransitionTelemetryStore({
    primary: new PrismaCreationTransitionTelemetryStore(
      prisma.creationTelemetryEvent,
      prisma,
    ),
    fallback: fallbackTelemetryStore,
    probePrimaryReadiness: createCreationTelemetryTableReadinessProbe(prisma),
    onDegraded: (state) => {
      activateTelemetrySinkFallback({
        reason: "missing_table",
        errorMessage: state.tableName,
      });
      logTelemetryOperationalEvent({
        event: "telemetry_export_skipped",
        level: "warn",
        dedupeKey: `creation-telemetry-store-degraded:${state.reason}:${state.tableName}`,
        throttleMs: getTelemetryRuntimeConfig().logThrottleMs,
        payload: {
          mode: "fallback-noop",
          eventName: "creation_transition_store_probe",
          reason: state.reason,
          fallbackMode: state.fallbackMode,
          tableName: state.tableName,
        },
      });
    },
  });
}

function getCreationTransitionTelemetryStore(): CreationTransitionTelemetryStore {
  const runtimeConfig = getTelemetryRuntimeConfig();
  if (!runtimeConfig.enabled) {
    return disabledTelemetryStore;
  }

  return getActiveTelemetrySinkFallbackState()
    ? fallbackTelemetryStore
    : telemetryStore;
}

function pruneLogThrottleMap(nowMs: number, throttleMs: number) {
  for (const [signature, lastLoggedAtMs] of logThrottleBySignature.entries()) {
    if (nowMs - lastLoggedAtMs >= throttleMs) {
      logThrottleBySignature.delete(signature);
    }
  }
}

function logCreationTransitionTelemetryIssue(input: {
  level: "warn" | "error";
  signature: string;
  payload: Record<string, unknown>;
}) {
  const runtimeConfig = getTelemetryRuntimeConfig();
  const nowMs = Date.now();
  pruneLogThrottleMap(nowMs, runtimeConfig.logThrottleMs);

  const lastLoggedAtMs = logThrottleBySignature.get(input.signature);
  if (
    lastLoggedAtMs !== undefined &&
    nowMs - lastLoggedAtMs < runtimeConfig.logThrottleMs
  ) {
    return;
  }

  logThrottleBySignature.set(input.signature, nowMs);
  const logger = input.level === "warn" ? console.warn : console.error;
  logger(
    "[creation-transition-telemetry]",
    JSON.stringify(sanitizeLogLine(input.payload)),
  );
}

function resolveDedupeKey(
  eventName: CreationTransitionEventName,
  dedupePolicy: CreationTelemetryDedupePolicy,
  requested?: string,
) {
  if (!requested?.trim()) return undefined;
  if (dedupePolicy === "dedupe_forbidden") return undefined;
  if (
    dedupePolicy === "dedupe_alerts_only" &&
    eventName !== CREATION_TRANSITION_EVENT_NAMES.CREATION_TRANSITION_GATE_WARNING
  ) {
    return undefined;
  }
  return requested.trim();
}

function nextGateEvaluationSignalVersion() {
  gateEvaluationSignalVersion += 1;
  return gateEvaluationSignalVersion;
}

async function runWithTimeout<T>(input: {
  timeoutMs: number;
  run: () => Promise<T>;
}): Promise<
  | { status: "completed"; value: T; durationMs: number }
  | { status: "timeout"; durationMs: number }
  | { status: "error"; durationMs: number; error: unknown }
> {
  const startedAt = performance.now();
  return await new Promise((resolve) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({
        status: "timeout",
        durationMs: performance.now() - startedAt,
      });
    }, input.timeoutMs);

    void input
      .run()
      .then((value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve({
          status: "completed",
          value,
          durationMs: performance.now() - startedAt,
        });
      })
      .catch((error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve({
          status: "error",
          durationMs: performance.now() - startedAt,
          error: error,
        });
      });
  });
}

function trackBackgroundTelemetryOperation(operation: Promise<unknown>) {
  backgroundTelemetryOperations.add(operation);
  void operation.finally(() => {
    backgroundTelemetryOperations.delete(operation);
  });
}

export function scheduleCreationTelemetryOperation(
  operation: () => Promise<unknown>,
) {
  queueMicrotask(() => {
    const task = Promise.resolve()
      .then(operation)
      .catch((error) => {
        const errorMessage =
          error instanceof Error ? error.message : "erro-telemetria-background";
        logCreationTransitionTelemetryIssue({
          level: "error",
          signature: `background-operation:${errorMessage}`,
          payload: {
            subsystem: "creation-transition-telemetry",
            error: errorMessage,
          },
        });
      });

    trackBackgroundTelemetryOperation(task);
  });
}

async function emitEvent<TEventName extends CreationTransitionEventName>(input: {
  eventName: TEventName;
  payload: CreationTransitionPayloadByEventName[TEventName];
  context?: EmitContext;
}): Promise<CreationTelemetryEmitStatus> {
  const runtimeConfig = getTelemetryRuntimeConfig();
  const env = getServerEnv();
  if (!runtimeConfig.enabled) {
    logTelemetryOperationalEvent({
      event: "telemetry_export_skipped",
      level: "info",
      dedupeKey: `creation-telemetry-disabled:${input.eventName}`,
      throttleMs: runtimeConfig.logThrottleMs,
      payload: {
        mode: "disabled",
        eventName: input.eventName,
        reason: "telemetry_disabled",
      },
    });
    return "disabled";
  }

  const activeFallback = getActiveTelemetrySinkFallbackState();
  if (activeFallback) {
    recordTelemetryEmitDropped({
      eventName: input.eventName,
      environment: env.NODE_ENV,
      releaseVersion: env.APP_RELEASE_VERSION,
      reason: "sink_unavailable",
    });
    logTelemetryOperationalEvent({
      event: "telemetry_export_skipped",
      level: "warn",
      dedupeKey: `creation-telemetry-fallback-skip:${activeFallback.reason}:${input.eventName}`,
      throttleMs: runtimeConfig.logThrottleMs,
      payload: {
        mode: "fallback-noop",
        eventName: input.eventName,
        reason: activeFallback.reason,
        activeUntil: new Date(activeFallback.untilMs).toISOString(),
      },
    });
    return "skipped";
  }

  const requestId = input.context?.requestId?.trim() || randomUUID();
  const correlationId = input.context?.correlationId?.trim() || requestId;
  const contract = CREATION_TRANSITION_EVENT_CONTRACT[input.eventName];
  const parsedPayload = parseCreationTransitionPayload(
    input.eventName,
    sanitizeTelemetryValue(input.payload),
  );
  const dedupeKey = resolveDedupeKey(
    input.eventName,
    contract.dedupePolicy,
    input.context?.dedupeKey,
  );

  const envelope = CreationTransitionEnvelopeSchema.parse({
    eventId: randomUUID(),
    eventName: input.eventName,
    eventVersion: contract.eventVersion,
    emittedAt: new Date().toISOString(),
    environment: env.NODE_ENV,
    releaseVersion: env.APP_RELEASE_VERSION,
    serviceName: env.APP_SERVICE_NAME,
    requestId,
    traceId: readTraceId(input.context),
    correlationId,
    ...(input.context?.causationId ? { causationId: input.context.causationId } : {}),
    actorType: input.context?.actorType ?? (input.context?.actorIdentity ? "user" : "system"),
    ...(input.context?.actorIdentity
      ? { actorIdentityHash: hashActorIdentity(input.context.actorIdentity) }
      : {}),
    ...(input.context?.projectId ? { projectId: input.context.projectId } : {}),
    classification: contract.classification,
    piiLevel: contract.piiLevel,
    retentionClass: contract.retentionClass,
    payload: parsedPayload,
    ...(dedupeKey ? { dedupeKey } : {}),
  });

  try {
    const outcome = await runWithTimeout({
      timeoutMs: runtimeConfig.sinkTimeoutMs,
      run: () => getCreationTransitionTelemetryStore().insert(envelope),
    });
    recordTelemetrySinkLatencyMs({
      eventName: input.eventName,
      environment: env.NODE_ENV,
      releaseVersion: env.APP_RELEASE_VERSION,
      durationMs: outcome.durationMs,
    });
    if (outcome.status === "timeout") {
      // Timeout indicates request-budget expiration; it does not guarantee physical sink cancellation.
      recordTelemetryEmitDropped({
        eventName: input.eventName,
        environment: env.NODE_ENV,
        releaseVersion: env.APP_RELEASE_VERSION,
        reason: "timeout",
      });
      logTelemetryOperationalEvent({
        event: "telemetry_sink_timeout",
        level: "warn",
        dedupeKey: `creation-telemetry-timeout:${input.eventName}`,
        throttleMs: runtimeConfig.logThrottleMs,
        payload: {
          mode: "active",
          eventName: input.eventName,
          timeoutMs: runtimeConfig.sinkTimeoutMs,
          durationMs: Number(outcome.durationMs.toFixed(2)),
        },
      });
      activateTelemetrySinkFallback({
        reason: "timeout",
        eventName: input.eventName,
        durationMs: outcome.durationMs,
      });
      logCreationTransitionTelemetryIssue({
        level: "error",
        signature: `timeout:${input.eventName}`,
        payload: {
          eventName: input.eventName,
          error: "telemetry-sink-timeout",
        },
      });
      return "timeout";
    }

    if (outcome.status === "error") {
      recordTelemetryEmitFailure({
        eventName: input.eventName,
        environment: env.NODE_ENV,
        releaseVersion: env.APP_RELEASE_VERSION,
      });
      const errorMessage =
        outcome.error instanceof Error
          ? outcome.error.message
          : "erro-desconhecido";
      activateTelemetrySinkFallback({
        reason: "error",
        eventName: input.eventName,
        durationMs: outcome.durationMs,
        errorMessage,
      });
      logCreationTransitionTelemetryIssue({
        level: "error",
        signature: `error:${input.eventName}:${errorMessage}`,
        payload: {
          eventName: input.eventName,
          error: errorMessage,
        },
      });
      return "error";
    }

    const result = outcome.value;
    if (result.status === "deduped") {
      recordTelemetryEmitDropped({
        eventName: input.eventName,
        environment: env.NODE_ENV,
        releaseVersion: env.APP_RELEASE_VERSION,
        reason: "deduped",
      });
      return "deduped";
    }

    if (result.status === "skipped") {
      recordTelemetryEmitDropped({
        eventName: input.eventName,
        environment: env.NODE_ENV,
        releaseVersion: env.APP_RELEASE_VERSION,
        reason: result.reason,
      });
      if (result.reason === "sink_unavailable") {
        activateTelemetrySinkFallback({
          reason: "sink_unavailable",
          eventName: input.eventName,
        });
      }
      logTelemetryOperationalEvent({
        event: "telemetry_export_skipped",
        level: result.reason === "disabled" ? "info" : "warn",
        dedupeKey: `creation-telemetry-skipped:${result.reason}:${input.eventName}`,
        throttleMs: runtimeConfig.logThrottleMs,
        payload: {
          mode: result.reason === "disabled" ? "disabled" : "fallback-noop",
          eventName: input.eventName,
          reason: result.reason,
        },
      });
      return result.reason === "disabled" ? "disabled" : "skipped";
    }

    recordTelemetryEmitSuccess({
      eventName: input.eventName,
      environment: env.NODE_ENV,
      releaseVersion: env.APP_RELEASE_VERSION,
    });
    logTelemetrySinkReady({
      eventName: input.eventName,
    });
    logTelemetryOperationalEvent({
      event: "telemetry_export_success",
      level: "info",
      dedupeKey: `creation-telemetry-success:${input.eventName}`,
      throttleMs: runtimeConfig.logThrottleMs,
      payload: {
        mode: "active",
        eventName: input.eventName,
      },
    });
    if (GATE_EVALUATION_TRIGGER_EVENTS.has(input.eventName)) {
      triggerCreationTransitionGateEvaluation(nextGateEvaluationSignalVersion());
    }
    return "stored";
  } catch (error) {
    recordTelemetryEmitFailure({
      eventName: input.eventName,
      environment: env.NODE_ENV,
      releaseVersion: env.APP_RELEASE_VERSION,
    });
    const errorMessage =
      error instanceof Error ? error.message : "erro-desconhecido";
    activateTelemetrySinkFallback({
      reason: "error",
      eventName: input.eventName,
      errorMessage,
    });
    logCreationTransitionTelemetryIssue({
      level: "error",
      signature: `error:${input.eventName}:${errorMessage}`,
      payload: {
        eventName: input.eventName,
        error: errorMessage,
      },
    });
    return "error";
  }
}

export async function runCreationTelemetryFanout(
  operations: Array<() => Promise<unknown>>,
) {
  if (operations.length === 0) return;
  operations.forEach((operation) => {
    scheduleCreationTelemetryOperation(operation);
  });
}

export function buildCreationTelemetryContextFromRequest(
  request: Request,
): RequestTelemetryContext {
  return {
    requestId: request.headers.get("x-request-id") ?? undefined,
    correlationId: request.headers.get("x-correlation-id") ?? undefined,
    causationId: request.headers.get("x-causation-id") ?? undefined,
    traceId: request.headers.get("x-trace-id") ?? undefined,
    traceparent: request.headers.get("traceparent") ?? undefined,
  };
}

export async function recordCreationSettingsAliasPut(input: {
  projectId: string;
  ownerIdentity: string;
  route: string;
  usedSettingsAliasPayload: boolean;
  requestContext?: RequestTelemetryContext;
}) {
  await emitEvent({
    eventName: CREATION_TRANSITION_EVENT_NAMES.CREATION_SETTINGS_ALIAS_PUT,
    payload: {
      route: input.route,
      usedSettingsAliasPayload: input.usedSettingsAliasPayload,
    },
    context: {
      actorIdentity: input.ownerIdentity,
      projectId: input.projectId,
      ...input.requestContext,
    },
  });

  if (input.usedSettingsAliasPayload) {
    await emitEvent({
      eventName:
        CREATION_TRANSITION_EVENT_NAMES.CREATION_SETTINGS_ALIAS_PAYLOAD_SETTINGS,
      payload: { route: input.route },
      context: {
        actorIdentity: input.ownerIdentity,
        projectId: input.projectId,
        ...input.requestContext,
      },
    });
  }
}

export async function recordCreationDraftSaved(input: {
  projectId: string;
  ownerIdentity: string;
  route: string;
  viaAlias: boolean;
  draftVersion: number;
  requestContext?: RequestTelemetryContext;
}) {
  await emitEvent({
    eventName: CREATION_TRANSITION_EVENT_NAMES.CREATION_DRAFT_SAVED,
    payload: {
      route: input.route,
      viaAlias: input.viaAlias,
      draftVersion: input.draftVersion,
    },
    context: {
      actorIdentity: input.ownerIdentity,
      projectId: input.projectId,
      ...input.requestContext,
    },
  });
}

export async function recordCreationLegacyTemplateFallback(
  input: LegacyTemplateFallbackInput,
  requestContext?: RequestTelemetryContext,
) {
  await emitEvent({
    eventName:
      CREATION_TRANSITION_EVENT_NAMES.CREATION_LEGACY_TEMPLATE_FALLBACK,
    payload: {
      source: input.source,
      fallbackMode: input.fallbackMode,
      fallbackReason: input.fallbackReason,
      dependencyReal: Object.values(input.fieldsFromTemplate).some(Boolean),
      fieldsFromTemplate: input.fieldsFromTemplate,
      riskTier: input.riskTier,
      effectiveResult: input.effectiveResult,
    },
    context: {
      actorIdentity: input.ownerIdentity,
      projectId: input.projectId,
      ...requestContext,
    },
  });
}

export async function recordCreationRecipeRuntimeResolved(input: {
  projectId?: string;
  ownerIdentity?: string;
  profile: ProjectProfile;
  view: InitialView;
  recipeId: string;
  fallbackUsed: boolean;
  requestContext?: RequestTelemetryContext;
}) {
  await emitEvent({
    eventName:
      CREATION_TRANSITION_EVENT_NAMES.CREATION_RECIPE_RUNTIME_RESOLVED,
    payload: {
      profile: input.profile,
      view: input.view,
      recipeId: input.recipeId,
      fallbackUsed: input.fallbackUsed,
    },
    context: {
      ...(input.ownerIdentity ? { actorIdentity: input.ownerIdentity } : {}),
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...input.requestContext,
    },
  });

  if (!input.fallbackUsed) return;

  await emitEvent({
    eventName:
      CREATION_TRANSITION_EVENT_NAMES.CREATION_RECIPE_RUNTIME_FALLBACK,
    payload: {
      profile: input.profile,
      view: input.view,
      recipeId: input.recipeId,
      reason: "missing_recipe_registry",
    },
    context: {
      ...(input.ownerIdentity ? { actorIdentity: input.ownerIdentity } : {}),
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...input.requestContext,
    },
  });
}

export async function recordCreationApplyAttempted(input: {
  projectId?: string;
  ownerIdentity: string;
  mode: "new" | "existing";
  createInitialMap: boolean;
  requestContext?: RequestTelemetryContext;
}) {
  await emitEvent({
    eventName: CREATION_TRANSITION_EVENT_NAMES.CREATION_APPLY_ATTEMPTED,
    payload: {
      mode: input.mode,
      createInitialMap: input.createInitialMap,
    },
    context: {
      actorIdentity: input.ownerIdentity,
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...input.requestContext,
    },
  });
}

export async function recordCreationApplyBlockedStrictValidation(input: {
  projectId: string;
  ownerIdentity: string;
  profile: ProjectProfile;
  initialView: InitialView;
  blockingIssueCount: number;
  warningCount: number;
  requestContext?: RequestTelemetryContext;
}) {
  await emitEvent({
    eventName:
      CREATION_TRANSITION_EVENT_NAMES.CREATION_APPLY_BLOCKED_STRICT_VALIDATION,
    payload: {
      profile: input.profile,
      initialView: input.initialView,
      blockingIssueCount: input.blockingIssueCount,
      warningCount: input.warningCount,
    },
    context: {
      actorIdentity: input.ownerIdentity,
      projectId: input.projectId,
      ...input.requestContext,
    },
  });
}

export async function recordCreationApplySucceeded(input: {
  projectId: string;
  ownerIdentity: string;
  createInitialMap: boolean;
  appliedVersion: number;
  sourceStatus?: string;
  requestContext?: RequestTelemetryContext;
}) {
  const sourceStatus = normalizeSourceStatusCode(input.sourceStatus);
  await emitEvent({
    eventName: CREATION_TRANSITION_EVENT_NAMES.CREATION_APPLY_SUCCEEDED,
    payload: {
      createInitialMap: input.createInitialMap,
      appliedVersion: input.appliedVersion,
      ...(sourceStatus ? { sourceStatus } : {}),
    },
    context: {
      actorIdentity: input.ownerIdentity,
      projectId: input.projectId,
      ...input.requestContext,
    },
  });
}

export async function recordCreationSourceStatusChanged(input: {
  projectId: string;
  ownerIdentity: string;
  fromStatus?: string;
  toStatus?: string;
  startStrategy: StartStrategy;
  startSource?: StartSource;
  phase: "draft" | "applied";
  requestContext?: RequestTelemetryContext;
}) {
  const fromStatus = normalizeSourceStatusCode(input.fromStatus);
  const toStatus = normalizeSourceStatusCode(input.toStatus);
  if (!toStatus || fromStatus === toStatus) return;

  await emitEvent({
    eventName: CREATION_TRANSITION_EVENT_NAMES.CREATION_SOURCE_STATUS_CHANGED,
    payload: {
      ...(fromStatus ? { fromStatus } : {}),
      toStatus,
      startStrategy: input.startStrategy,
      ...(input.startSource ? { startSource: input.startSource } : {}),
      phase: input.phase,
    },
    context: {
      actorIdentity: input.ownerIdentity,
      projectId: input.projectId,
      ...input.requestContext,
    },
  });
}

export async function recordCreationTransitionSnapshotAccessed(input: {
  ownerIdentity: string;
  role: "internal";
  requestContext?: RequestTelemetryContext;
}) {
  await emitEvent({
    eventName:
      CREATION_TRANSITION_EVENT_NAMES.CREATION_TRANSITION_SNAPSHOT_ACCESSED,
    payload: {
      route: "GET /api/internal/observability/creation-transition",
      role: input.role,
    },
    context: {
      actorIdentity: input.ownerIdentity,
      ...input.requestContext,
    },
  });
}

export async function recordCreationTransitionSnapshotAccessDenied(input: {
  ownerIdentity: string;
  requestContext?: RequestTelemetryContext;
}) {
  await emitEvent({
    eventName:
      CREATION_TRANSITION_EVENT_NAMES.CREATION_TRANSITION_SNAPSHOT_ACCESS_DENIED,
    payload: {
      route: "GET /api/internal/observability/creation-transition",
      reason: "forbidden",
    },
    context: {
      actorIdentity: input.ownerIdentity,
      ...input.requestContext,
    },
  });
}

const RATE_EVENT_NAMES: CreationTransitionEventName[] = [
  CREATION_TRANSITION_EVENT_NAMES.CREATION_SETTINGS_ALIAS_PUT,
  CREATION_TRANSITION_EVENT_NAMES.CREATION_DRAFT_SAVED,
  CREATION_TRANSITION_EVENT_NAMES.CREATION_LEGACY_TEMPLATE_FALLBACK,
  CREATION_TRANSITION_EVENT_NAMES.CREATION_APPLY_ATTEMPTED,
  CREATION_TRANSITION_EVENT_NAMES.CREATION_APPLY_BLOCKED_STRICT_VALIDATION,
  CREATION_TRANSITION_EVENT_NAMES.CREATION_RECIPE_RUNTIME_RESOLVED,
  CREATION_TRANSITION_EVENT_NAMES.CREATION_RECIPE_RUNTIME_FALLBACK,
];

async function collectTransitionWindowTelemetry(now = new Date()) {
  const store = getCreationTransitionTelemetryStore();
  const windowEnd = now;
  const windowStart = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const [
    counts,
    observedProjectCount,
    dependentProjectCount,
    topFallbackReasons,
    inheritedFieldsCount,
    latestIngestedAt,
  ] =
    await Promise.all([
      store.countByEventName({
        eventNames: RATE_EVENT_NAMES,
        windowStart,
        windowEnd,
      }),
      store.countDistinctProjectIds({
        windowStart,
        windowEnd,
      }),
      store.countDistinctProjectsWithTemplateDependency({
        windowStart,
        windowEnd,
      }),
      store.topTemplateFallbackReasons({
        windowStart,
        windowEnd,
        limit: 3,
      }),
      store.countTemplateInheritedFields({
        windowStart,
        windowEnd,
      }),
      store.latestIngestedAt(),
    ]);
  const rates = {
    aliasWriteRatePercent: toPercent(
      counts[CREATION_TRANSITION_EVENT_NAMES.CREATION_SETTINGS_ALIAS_PUT],
      counts[CREATION_TRANSITION_EVENT_NAMES.CREATION_DRAFT_SAVED],
    ),
    templateDependencyRatePercent: toPercent(
      dependentProjectCount,
      observedProjectCount,
    ),
    strictBlockRatePercent: toPercent(
      counts[
        CREATION_TRANSITION_EVENT_NAMES.CREATION_APPLY_BLOCKED_STRICT_VALIDATION
      ],
      counts[CREATION_TRANSITION_EVENT_NAMES.CREATION_APPLY_ATTEMPTED],
    ),
    runtimeFallbackRatePercent: toPercent(
      counts[CREATION_TRANSITION_EVENT_NAMES.CREATION_RECIPE_RUNTIME_FALLBACK],
      counts[CREATION_TRANSITION_EVENT_NAMES.CREATION_RECIPE_RUNTIME_RESOLVED],
    ),
  };

  const gates: GateWarningPayload[] = gateDefinitions.map((gate) => {
    const currentValue =
      gate.code === "alias_write_rate_percent"
        ? rates.aliasWriteRatePercent
        : gate.code === "template_dependency_rate_percent"
          ? rates.templateDependencyRatePercent
          : gate.code === "strict_block_rate_percent"
            ? rates.strictBlockRatePercent
            : rates.runtimeFallbackRatePercent;
    const active = now >= new Date(gate.effectiveFrom);
    const breached = active && currentValue > gate.threshold;
    return {
      code: gate.code,
      title: gate.title,
      threshold: gate.threshold,
      comparator: "gt" as const,
      currentValue,
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      breached,
      breachSeverity:
        breached && currentValue > gate.threshold * 2
          ? "high"
          : breached
            ? "low"
            : "none",
      effectiveFrom: gate.effectiveFrom,
      owner: gate.owner,
      recommendedAction: gate.recommendedAction,
    };
  });

  return {
    now,
    windowStart,
    windowEnd,
    counts,
    rates,
    topFallbackReasons,
    inheritedFieldsCount,
    gates,
    breachedGates: gates.filter((gate) => gate.breached),
    latestIngestedAt,
    observedProjectCount,
  };
}

export async function evaluateCreationTransitionGateWarnings(
  trigger: "auto" | "manual" = "auto",
  signalVersion = gateEvaluationSignalVersion,
) {
  if (!getTelemetryRuntimeConfig().enabled) {
    return;
  }

  const telemetry = await collectTransitionWindowTelemetry();
  const runtimeConfig = getTelemetryRuntimeConfig();
  const leaseBucket = Math.floor(
    telemetry.now.getTime() / runtimeConfig.gateEvaluationIntervalMs,
  );
  const leaseResult = await emitEvent({
    eventName:
      CREATION_TRANSITION_EVENT_NAMES.CREATION_TRANSITION_GATE_EVALUATION_TICK,
    payload: {
      trigger,
      windowStart: telemetry.windowStart.toISOString(),
      windowEnd: telemetry.windowEnd.toISOString(),
      leaseBucket,
    },
    context: {
      actorType: "system",
      dedupeKey: `gate-eval:${leaseBucket}:${signalVersion}`,
    },
  });
  if (leaseResult !== "stored") {
    return;
  }

  await Promise.all(
    telemetry.breachedGates.map((gate) =>
      emitEvent({
        eventName:
          CREATION_TRANSITION_EVENT_NAMES.CREATION_TRANSITION_GATE_WARNING,
        payload: gate,
        context: {
          actorType: "system",
          dedupeKey: `gate:${gate.code}:${eventDayKey(gate.windowStart)}`,
        },
      }),
    ),
  );
}

function triggerCreationTransitionGateEvaluation(
  signalVersion = gateEvaluationSignalVersion,
) {
  const runtimeConfig = getTelemetryRuntimeConfig();
  if (!runtimeConfig.enabled) {
    return;
  }

  const nowMs = Date.now();
  if (gateEvaluationInFlight) {
    pendingGateEvaluationSignalVersion = Math.max(
      pendingGateEvaluationSignalVersion,
      signalVersion,
    );
    return;
  }
  if (nowMs - lastGateEvaluationAtMs < runtimeConfig.gateEvaluationIntervalMs) {
    return;
  }
  lastGateEvaluationAtMs = nowMs;
  inFlightGateEvaluationSignalVersion = signalVersion;
  gateEvaluationInFlight = evaluateCreationTransitionGateWarnings(
    "auto",
    signalVersion,
  )
    .catch((error) => {
      const errorMessage =
        error instanceof Error ? error.message : "erro-avaliacao-gate";
      logCreationTransitionTelemetryIssue({
        level: "error",
        signature: `gate-evaluation:${errorMessage}`,
        payload: {
          eventName: "creation_transition_gate_warning",
          error: errorMessage,
        },
      });
    })
    .finally(() => {
      gateEvaluationInFlight = null;
      inFlightGateEvaluationSignalVersion = 0;
      if (
        pendingGateEvaluationSignalVersion >
        Math.max(signalVersion, inFlightGateEvaluationSignalVersion)
      ) {
        const nextSignalVersion = pendingGateEvaluationSignalVersion;
        pendingGateEvaluationSignalVersion = 0;
        lastGateEvaluationAtMs = 0;
        triggerCreationTransitionGateEvaluation(nextSignalVersion);
      }
    });
}

export async function getCreationTransitionTelemetrySnapshot(): Promise<CreationTransitionTelemetrySnapshot> {
  const telemetry = await collectTransitionWindowTelemetry();
  const stalenessSeconds = telemetry.latestIngestedAt
    ? Math.max(
        0,
        Math.floor((telemetry.now.getTime() - telemetry.latestIngestedAt.getTime()) / 1000),
      )
    : Number.MAX_SAFE_INTEGER;
  const stale =
    telemetry.latestIngestedAt === null ||
    stalenessSeconds > STALE_SNAPSHOT_AFTER_SECONDS;
  const env = getServerEnv();
  if (telemetry.latestIngestedAt && Number.isFinite(stalenessSeconds)) {
    recordTelemetrySnapshotStaleness({
      environment: env.NODE_ENV,
      releaseVersion: env.APP_RELEASE_VERSION,
      stalenessSeconds,
    });
  }

  const snapshot: CreationTransitionTelemetrySnapshot = {
    executiveSummary: {
      ...telemetry.rates,
      breachedGateCount: telemetry.breachedGates.length,
    },
    operationalSummary: {
      counters: telemetry.counts,
      rates: telemetry.rates,
      topFallbackReasons: telemetry.topFallbackReasons,
      inheritedTemplateFields: Object.entries(telemetry.inheritedFieldsCount)
        .map(([field, count]) => ({ field, count }))
        .sort((a, b) => b.count - a.count),
      window: {
        start: telemetry.windowStart.toISOString(),
        end: telemetry.windowEnd.toISOString(),
      },
      gates: telemetry.gates,
    },
    technicalBreakdown: {
      freshness: {
        latestIngestedAt: telemetry.latestIngestedAt?.toISOString() ?? null,
        stalenessSeconds,
        stale,
      },
      eventsWindowCount: Object.values(telemetry.counts).reduce(
        (acc, value) => acc + value,
        0,
      ),
    },
    securitySummary: {
      redactionPolicy: "central_enforced",
      piiLeakDetected: false,
    },
    transitionReadiness: {
      readyToCutLegacy: telemetry.breachedGates.length === 0,
      blockingGates: telemetry.breachedGates.map((gate) => gate.code),
    },
    generatedAt: telemetry.now.toISOString(),
  };

  return sanitizeTelemetryValue(snapshot) as CreationTransitionTelemetrySnapshot;
}

// Backward compatibility
export async function recordProjectTemplateFallbackDependency(input: {
  projectId: string;
  ownerIdentity: string;
  template: string;
  source: string;
}) {
  await recordCreationLegacyTemplateFallback({
    projectId: input.projectId,
    ownerIdentity: input.ownerIdentity,
    source: input.source,
    fallbackMode: "partial",
    fallbackReason: "unknown",
    fieldsFromTemplate: {
      profile: false,
      initialView: true,
      layout: false,
      contextDefaults: false,
    },
    riskTier: "low",
    effectiveResult: {
      profile: "system-architecture",
      initialView: "graph",
      layout: "auto",
    },
  });
}

export function __setCreationTransitionTelemetryStoreForTests(
  nextStore: CreationTransitionTelemetryStore,
) {
  telemetryStore = nextStore;
}

export function __setCreationTransitionTelemetryRuntimeConfigForTests(
  nextConfig: Partial<RuntimeTelemetryConfig>,
) {
  telemetryRuntimeConfig = {
    ...telemetryRuntimeConfig,
    ...nextConfig,
  };
}

export async function __flushCreationTransitionTelemetryForTests() {
  while (true) {
    await Promise.resolve();
    const backgroundOperations = Array.from(backgroundTelemetryOperations);
    const inFlight = gateEvaluationInFlight;
    if (backgroundOperations.length === 0 && !inFlight) {
      return;
    }
    if (backgroundOperations.length > 0) {
      await Promise.allSettled(backgroundOperations);
    }
    await inFlight;
  }
}

export function __resetCreationTransitionTelemetryForTests() {
  telemetryStore = createDefaultCreationTransitionTelemetryStore();
  telemetryRuntimeConfig = {};
  telemetrySinkState = { mode: "ready" };
  gateEvaluationInFlight = null;
  lastGateEvaluationAtMs = 0;
  gateEvaluationSignalVersion = 0;
  inFlightGateEvaluationSignalVersion = 0;
  pendingGateEvaluationSignalVersion = 0;
  backgroundTelemetryOperations.clear();
  logThrottleBySignature.clear();
}

export async function __emitCreationTransitionEventForTests<
  TEventName extends CreationTransitionEventName,
>(input: {
  eventName: TEventName;
  payload: CreationTransitionPayloadByEventName[TEventName];
  context?: EmitContext;
}) {
  return await emitEvent(input);
}

export { MemoryCreationTransitionTelemetryStore };
