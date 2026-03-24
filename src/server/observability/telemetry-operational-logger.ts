type TelemetryOperationalEventName =
  | "telemetry_bootstrap_enabled"
  | "telemetry_bootstrap_disabled"
  | "telemetry_sink_ready"
  | "telemetry_sink_timeout"
  | "telemetry_sink_fallback_active"
  | "telemetry_export_success"
  | "telemetry_export_skipped";

type TelemetryOperationalLogLevel = "info" | "warn" | "error";

type TelemetryOperationalLogInput = {
  event: TelemetryOperationalEventName;
  payload?: Record<string, unknown>;
  level?: TelemetryOperationalLogLevel;
  dedupeKey?: string;
  throttleMs?: number;
};

type TelemetryOperationalLogState = {
  lastLogByKey: Map<string, number>;
};

type GlobalThisWithTelemetryOperationalLogState = typeof globalThis & {
  __mapiaTelemetryOperationalLogState?: TelemetryOperationalLogState;
};

const DEFAULT_THROTTLE_MS = 60_000;

function getTelemetryOperationalLogState(): TelemetryOperationalLogState {
  const scopedGlobal = globalThis as GlobalThisWithTelemetryOperationalLogState;
  if (!scopedGlobal.__mapiaTelemetryOperationalLogState) {
    scopedGlobal.__mapiaTelemetryOperationalLogState = {
      lastLogByKey: new Map(),
    };
  }

  return scopedGlobal.__mapiaTelemetryOperationalLogState;
}

function pruneExpiredLogKeys(nowMs: number, throttleMs: number) {
  const state = getTelemetryOperationalLogState();

  for (const [key, lastLoggedAtMs] of state.lastLogByKey.entries()) {
    if (nowMs - lastLoggedAtMs >= throttleMs) {
      state.lastLogByKey.delete(key);
    }
  }
}

export function logTelemetryOperationalEvent(
  input: TelemetryOperationalLogInput,
): void {
  const level = input.level ?? "info";
  const throttleMs = input.throttleMs ?? DEFAULT_THROTTLE_MS;
  const dedupeKey = input.dedupeKey ?? input.event;
  const nowMs = Date.now();
  const state = getTelemetryOperationalLogState();

  pruneExpiredLogKeys(nowMs, throttleMs);

  const lastLoggedAtMs = state.lastLogByKey.get(dedupeKey);
  if (
    lastLoggedAtMs !== undefined &&
    nowMs - lastLoggedAtMs < throttleMs
  ) {
    return;
  }

  state.lastLogByKey.set(dedupeKey, nowMs);

  const logger =
    level === "error"
      ? console.error
      : level === "warn"
        ? console.warn
        : console.info;
  const serializedPayload = input.payload
    ? ` ${JSON.stringify(input.payload)}`
    : "";

  logger(`[telemetry] ${input.event}${serializedPayload}`);
}

export function __resetTelemetryOperationalLoggerForTests(): void {
  getTelemetryOperationalLogState().lastLogByKey.clear();
}
