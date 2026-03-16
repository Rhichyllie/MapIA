import { createHash } from "node:crypto";
import { getServerEnv } from "@/src/lib/env";
import { getRedactedValueMask, redactSensitiveStrings } from "@/src/modules/creation-assistant/domain";

const sensitiveKeyPattern =
  /password|passwd|pwd|token|secret|connectionstring|apikey|api_key|bearer|authorization|access_token|refresh_token/i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizeByKey(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeByKey(entry));
  }

  if (isPlainObject(value)) {
    const next: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      if (sensitiveKeyPattern.test(key)) {
        if (nested === undefined || nested === null || nested === "") {
          continue;
        }
        next[key] = getRedactedValueMask();
        continue;
      }

      next[key] = sanitizeByKey(nested);
    }
    return next;
  }

  return value;
}

export function sanitizeTelemetryValue(value: unknown): unknown {
  return redactSensitiveStrings(sanitizeByKey(value));
}

export function hashActorIdentity(identity?: string | null) {
  if (!identity?.trim()) {
    return undefined;
  }

  const env = getServerEnv();
  const normalizedIdentity = identity.trim().toLowerCase();
  const telemetrySalt = env.TELEMETRY_HASH_SALT?.trim();
  if (telemetrySalt) {
    return createHash("sha256")
      .update(`${telemetrySalt}:${normalizedIdentity}`)
      .digest("hex");
  }

  if (env.NODE_ENV === "production") {
    // Enforce explicit telemetry salt in production to avoid coupling with auth secrets.
    return undefined;
  }

  return createHash("sha256")
    .update(`${env.NEXTAUTH_SECRET}:${normalizedIdentity}`)
    .digest("hex");
}

export function sanitizeMetricLabelValue(value: string) {
  const sanitized = String(sanitizeTelemetryValue(value));
  return sanitized.slice(0, 80);
}

export function sanitizeLogLine(value: unknown) {
  return sanitizeTelemetryValue(value);
}
