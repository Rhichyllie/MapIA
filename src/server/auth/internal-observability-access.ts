import { getServerEnv } from "@/src/lib/env";

function parseAllowList(raw: string) {
  return new Set(
    raw
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length > 0),
  );
}

export function canAccessInternalObservability(identity: string) {
  return resolveInternalObservabilityAccess(identity).allowed;
}

export function resolveInternalObservabilityAccess(identity: string): {
  allowed: boolean;
  role: "internal" | "user";
  reason: "allowlist" | "dev_admin" | "forbidden";
} {
  const env = getServerEnv();
  const normalizedIdentity = identity.trim().toLowerCase();
  const allowList = parseAllowList(
    env.INTERNAL_OBSERVABILITY_ALLOWED_IDENTITIES,
  );
  if (allowList.has(normalizedIdentity)) {
    return {
      allowed: true,
      role: "internal",
      reason: "allowlist",
    };
  }

  const canUseDevBypass =
    env.NODE_ENV === "development" || env.NODE_ENV === "test";
  if (
    canUseDevBypass &&
    normalizedIdentity === env.DEV_LOGIN_EMAIL.toLowerCase()
  ) {
    return {
      allowed: true,
      role: "internal",
      reason: "dev_admin",
    };
  }

  return {
    allowed: false,
    role: "user",
    reason: "forbidden",
  };
}

export function resolveInternalObservabilityRole(identity: string) {
  return resolveInternalObservabilityAccess(identity).role;
}
