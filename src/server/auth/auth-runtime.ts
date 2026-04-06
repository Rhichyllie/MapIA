import { AppError } from "@/src/lib/app-error";
import { getServerEnv, type ServerEnv } from "@/src/lib/env";

export type AuthRuntimeMode =
  | "development_credentials"
  | "oidc"
  | "misconfigured";

export type SupportedAuthRuntimeMode = Exclude<
  AuthRuntimeMode,
  "misconfigured"
>;

export type AuthRuntimeConfig = {
  mode: AuthRuntimeMode;
  providerId: "credentials" | "oidc" | null;
  productionCapable: boolean;
  requiresInteractiveSignIn: boolean;
  providerName?: string;
  requiredEnv: string[];
  reason?: string;
};

const DEV_SECRET = "dev-only-nextauth-secret";
const DEV_NEXTAUTH_URL = "http://localhost:3000";

export function hasNonDefaultNextAuthSecret(env: ServerEnv) {
  return env.NEXTAUTH_SECRET.trim() !== DEV_SECRET;
}

function hasOidcEnvironment(env: ServerEnv) {
  return Boolean(
    env.AUTH_OIDC_ISSUER_URL &&
    env.AUTH_OIDC_CLIENT_ID &&
    env.AUTH_OIDC_CLIENT_SECRET,
  );
}

export function isSafeSharedAuthUrl(rawUrl?: string | null) {
  if (!rawUrl?.trim()) {
    return false;
  }

  if (rawUrl.trim() === DEV_NEXTAUTH_URL) {
    return false;
  }

  try {
    const url = new URL(rawUrl);
    return (
      url.protocol === "https:" &&
      url.hostname !== "localhost" &&
      url.hostname !== "127.0.0.1"
    );
  } catch {
    return false;
  }
}

function hasSafeProductionNextAuthUrl(env: ServerEnv) {
  return env.NODE_ENV !== "production" || isSafeSharedAuthUrl(env.NEXTAUTH_URL);
}

function hasSafeProductionOidcIssuerUrl(env: ServerEnv) {
  return (
    env.NODE_ENV !== "production" ||
    isSafeSharedAuthUrl(env.AUTH_OIDC_ISSUER_URL)
  );
}

function hasRequiredOidcScope(env: ServerEnv) {
  return env.AUTH_OIDC_SCOPE.split(/\s+/)
    .map((scope) => scope.trim().toLowerCase())
    .filter(Boolean)
    .includes("openid");
}

export function buildOidcDiscoveryUrl(issuerUrl: string) {
  const issuer = new URL(issuerUrl);
  const issuerPath = issuer.pathname.endsWith("/")
    ? issuer.pathname
    : `${issuer.pathname}/`;

  issuer.pathname = `${issuerPath}.well-known/openid-configuration`;
  issuer.search = "";
  issuer.hash = "";

  return issuer.toString();
}

export function resolveAuthRuntimeConfig(
  env: ServerEnv = getServerEnv(),
): AuthRuntimeConfig {
  const requestedMode =
    env.AUTH_MODE ?? (env.NODE_ENV === "production" ? "oidc" : "development");
  const oidcReady = hasOidcEnvironment(env);
  const secretReady =
    env.NODE_ENV !== "production" ? true : hasNonDefaultNextAuthSecret(env);
  const baseUrlReady = hasSafeProductionNextAuthUrl(env);
  const issuerUrlReady = hasSafeProductionOidcIssuerUrl(env);
  const scopeReady = hasRequiredOidcScope(env);

  if (requestedMode === "oidc") {
    const requiredEnv = [
      "NEXTAUTH_URL",
      "AUTH_OIDC_ISSUER_URL",
      "AUTH_OIDC_CLIENT_ID",
      "AUTH_OIDC_CLIENT_SECRET",
      "AUTH_OIDC_SCOPE",
      "NEXTAUTH_SECRET",
    ];

    if (
      !oidcReady ||
      !secretReady ||
      !baseUrlReady ||
      !issuerUrlReady ||
      !scopeReady
    ) {
      return {
        mode: "misconfigured",
        providerId: null,
        productionCapable: false,
        requiresInteractiveSignIn: false,
        providerName: env.AUTH_OIDC_PROVIDER_NAME,
        requiredEnv,
        reason: !oidcReady
          ? "oidc_env_missing"
          : !secretReady
            ? "nextauth_secret_invalid"
            : !baseUrlReady
              ? "nextauth_url_invalid"
              : !issuerUrlReady
                ? "oidc_issuer_url_invalid"
                : "oidc_scope_invalid",
      };
    }

    return {
      mode: "oidc",
      providerId: "oidc",
      productionCapable: true,
      requiresInteractiveSignIn: true,
      providerName: env.AUTH_OIDC_PROVIDER_NAME,
      requiredEnv,
    };
  }

  if (env.NODE_ENV === "production") {
    return {
      mode: "misconfigured",
      providerId: null,
      productionCapable: false,
      requiresInteractiveSignIn: false,
      requiredEnv: [
        "AUTH_MODE=oidc",
        "NEXTAUTH_URL",
        "AUTH_OIDC_ISSUER_URL",
        "AUTH_OIDC_CLIENT_ID",
        "AUTH_OIDC_CLIENT_SECRET",
        "NEXTAUTH_SECRET",
      ],
      reason: "development_auth_disallowed_in_production",
    };
  }

  return {
    mode: "development_credentials",
    providerId: "credentials",
    productionCapable: false,
    requiresInteractiveSignIn: true,
    requiredEnv: ["DEV_LOGIN_EMAIL", "DEV_LOGIN_PASSWORD"],
  };
}

export function assertAuthRuntimeReady(
  env: ServerEnv = getServerEnv(),
): AuthRuntimeConfig {
  const runtime = resolveAuthRuntimeConfig(env);

  if (runtime.mode === "misconfigured") {
    throw new AppError(
      "Autenticacao de producao mal configurada para este ambiente.",
      {
        code: "AUTH_CONFIGURATION_INVALID",
        status: 503,
        details: {
          reason: runtime.reason,
          requiredEnv: runtime.requiredEnv,
          nodeEnv: env.NODE_ENV,
          requestedMode:
            env.AUTH_MODE ??
            (env.NODE_ENV === "production" ? "oidc" : "development"),
        },
      },
    );
  }

  return runtime;
}
