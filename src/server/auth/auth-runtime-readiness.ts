import { getServerEnv, type ServerEnv } from "@/src/lib/env";
import {
  buildOidcDiscoveryUrl,
  hasNonDefaultNextAuthSecret,
  isSafeSharedAuthUrl,
  resolveAuthRuntimeConfig,
} from "./auth-runtime";

export type AuthRuntimeReadinessCheck = {
  id: string;
  severity: "required" | "recommended";
  status: "pass" | "fail" | "skip";
  message: string;
};

export type AuthRuntimeDiscoveryProbe = {
  status: "pass" | "fail" | "skip";
  url?: string;
  issuer?: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  jwksUri?: string;
  message: string;
};

export type AuthRuntimeReadinessReport = {
  ready: boolean;
  runtime: ReturnType<typeof resolveAuthRuntimeConfig>;
  checks: AuthRuntimeReadinessCheck[];
  discovery: AuthRuntimeDiscoveryProbe;
};

type AuthRuntimeReadinessOptions = {
  env?: ServerEnv;
  probeOidcDiscovery?: boolean;
  fetchImpl?: typeof fetch;
};

function hasRequiredOidcScope(scope: string) {
  return scope
    .split(/\s+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .includes("openid");
}

function normalizeUrlForComparison(url: string) {
  return url.replace(/\/+$/, "");
}

function buildCheck(input: AuthRuntimeReadinessCheck) {
  return input;
}

function resolveRequestedMode(env: ServerEnv) {
  return (
    env.AUTH_MODE ?? (env.NODE_ENV === "production" ? "oidc" : "development")
  );
}

export async function inspectAuthRuntimeReadiness(
  options: AuthRuntimeReadinessOptions = {},
): Promise<AuthRuntimeReadinessReport> {
  const env = options.env ?? getServerEnv();
  const runtime = resolveAuthRuntimeConfig(env);
  const checks: AuthRuntimeReadinessCheck[] = [
    buildCheck({
      id: "auth_mode_oidc",
      severity: "required",
      status: resolveRequestedMode(env) === "oidc" ? "pass" : "fail",
      message:
        resolveRequestedMode(env) === "oidc"
          ? "AUTH_MODE configurado para OIDC."
          : "AUTH_MODE ainda nao esta configurado para o caminho OIDC real.",
    }),
    buildCheck({
      id: "runtime_resolves_oidc",
      severity: "required",
      status: runtime.mode === "oidc" ? "pass" : "fail",
      message:
        runtime.mode === "oidc"
          ? "Runtime de auth resolve o modo OIDC sem fallback."
          : `Runtime de auth nao esta pronto (${runtime.reason ?? "runtime_invalid"}).`,
    }),
    buildCheck({
      id: "nextauth_url_shared_safe",
      severity: "required",
      status: isSafeSharedAuthUrl(env.NEXTAUTH_URL) ? "pass" : "fail",
      message: isSafeSharedAuthUrl(env.NEXTAUTH_URL)
        ? "NEXTAUTH_URL aponta para origem HTTPS compartilhada."
        : "NEXTAUTH_URL ainda nao atende o baseline de ambiente compartilhado.",
    }),
    buildCheck({
      id: "nextauth_secret_nondefault",
      severity: "required",
      status: hasNonDefaultNextAuthSecret(env) ? "pass" : "fail",
      message: hasNonDefaultNextAuthSecret(env)
        ? "NEXTAUTH_SECRET nao usa valor de desenvolvimento."
        : "NEXTAUTH_SECRET ainda usa valor default/dev.",
    }),
    buildCheck({
      id: "oidc_issuer_url_shared_safe",
      severity: "required",
      status: isSafeSharedAuthUrl(env.AUTH_OIDC_ISSUER_URL) ? "pass" : "fail",
      message: isSafeSharedAuthUrl(env.AUTH_OIDC_ISSUER_URL)
        ? "AUTH_OIDC_ISSUER_URL aponta para issuer HTTPS valido."
        : "AUTH_OIDC_ISSUER_URL nao atende o baseline de issuer compartilhado.",
    }),
    buildCheck({
      id: "oidc_client_id_present",
      severity: "required",
      status: env.AUTH_OIDC_CLIENT_ID?.trim() ? "pass" : "fail",
      message: env.AUTH_OIDC_CLIENT_ID?.trim()
        ? "AUTH_OIDC_CLIENT_ID presente."
        : "AUTH_OIDC_CLIENT_ID ausente.",
    }),
    buildCheck({
      id: "oidc_client_secret_present",
      severity: "required",
      status: env.AUTH_OIDC_CLIENT_SECRET?.trim() ? "pass" : "fail",
      message: env.AUTH_OIDC_CLIENT_SECRET?.trim()
        ? "AUTH_OIDC_CLIENT_SECRET presente."
        : "AUTH_OIDC_CLIENT_SECRET ausente.",
    }),
    buildCheck({
      id: "oidc_scope_contains_openid",
      severity: "required",
      status: hasRequiredOidcScope(env.AUTH_OIDC_SCOPE) ? "pass" : "fail",
      message: hasRequiredOidcScope(env.AUTH_OIDC_SCOPE)
        ? "AUTH_OIDC_SCOPE contem openid."
        : "AUTH_OIDC_SCOPE nao contem openid.",
    }),
    buildCheck({
      id: "oidc_provider_name_present",
      severity: "recommended",
      status: env.AUTH_OIDC_PROVIDER_NAME.trim() ? "pass" : "fail",
      message: env.AUTH_OIDC_PROVIDER_NAME.trim()
        ? "AUTH_OIDC_PROVIDER_NAME configurado."
        : "AUTH_OIDC_PROVIDER_NAME esta vazio.",
    }),
  ];

  let discovery: AuthRuntimeDiscoveryProbe = {
    status: "skip",
    message: "Probe de discovery nao executado.",
  };

  if (!options.probeOidcDiscovery) {
    discovery = {
      status: "skip",
      message: "Probe de discovery foi desabilitado explicitamente.",
    };
  } else if (!env.AUTH_OIDC_ISSUER_URL?.trim()) {
    discovery = {
      status: "skip",
      message:
        "Probe de discovery ignorado porque AUTH_OIDC_ISSUER_URL esta ausente.",
    };
  } else if (!isSafeSharedAuthUrl(env.AUTH_OIDC_ISSUER_URL)) {
    discovery = {
      status: "skip",
      message:
        "Probe de discovery ignorado porque o issuer ainda nao passou na validacao basica.",
    };
  } else {
    const discoveryUrl = buildOidcDiscoveryUrl(env.AUTH_OIDC_ISSUER_URL);

    try {
      const fetchImpl = options.fetchImpl ?? fetch;
      const response = await fetchImpl(discoveryUrl, {
        method: "GET",
        headers: {
          accept: "application/json",
        },
      });

      if (!response.ok) {
        discovery = {
          status: "fail",
          url: discoveryUrl,
          message: `Issuer respondeu ${response.status} no discovery document.`,
        };
      } else {
        const payload = (await response.json()) as Record<string, unknown>;
        const issuer =
          typeof payload.issuer === "string" ? payload.issuer : undefined;
        const authorizationEndpoint =
          typeof payload.authorization_endpoint === "string"
            ? payload.authorization_endpoint
            : undefined;
        const tokenEndpoint =
          typeof payload.token_endpoint === "string"
            ? payload.token_endpoint
            : undefined;
        const jwksUri =
          typeof payload.jwks_uri === "string" ? payload.jwks_uri : undefined;
        const issuerMatches =
          issuer &&
          normalizeUrlForComparison(issuer) ===
            normalizeUrlForComparison(env.AUTH_OIDC_ISSUER_URL);

        if (
          !issuerMatches ||
          !authorizationEndpoint ||
          !tokenEndpoint ||
          !jwksUri
        ) {
          discovery = {
            status: "fail",
            url: discoveryUrl,
            issuer,
            authorizationEndpoint,
            tokenEndpoint,
            jwksUri,
            message:
              "Discovery document nao expoe issuer/endpoints obrigatorios coerentes com o runtime.",
          };
        } else {
          discovery = {
            status: "pass",
            url: discoveryUrl,
            issuer,
            authorizationEndpoint,
            tokenEndpoint,
            jwksUri,
            message:
              "Discovery document OIDC validado sem exigir credenciais do cliente.",
          };
        }
      }
    } catch (error) {
      discovery = {
        status: "fail",
        url: discoveryUrl,
        message:
          error instanceof Error
            ? `Falha ao consultar discovery document: ${error.message}`
            : "Falha ao consultar discovery document.",
      };
    }
  }

  const ready =
    checks.every((check) =>
      check.severity === "recommended" ? true : check.status === "pass",
    ) && discovery.status !== "fail";

  return {
    ready,
    runtime,
    checks,
    discovery,
  };
}
