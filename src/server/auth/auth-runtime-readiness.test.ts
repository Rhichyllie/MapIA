import { describe, expect, it, vi } from "vitest";
import type { ServerEnv } from "@/src/lib/env";
import { inspectAuthRuntimeReadiness } from "./auth-runtime-readiness";

function buildEnv(overrides: Partial<ServerEnv> = {}): ServerEnv {
  return {
    NODE_ENV: "production",
    NEXTAUTH_URL: "https://staging.mapia.example.com",
    NEXTAUTH_SECRET: "production-secret-not-default",
    AUTH_MODE: "oidc",
    AUTH_OIDC_ISSUER_URL: "https://idp.example.com/realms/mapia",
    AUTH_OIDC_CLIENT_ID: "mapia-web-staging",
    AUTH_OIDC_CLIENT_SECRET: "super-secret",
    AUTH_OIDC_PROVIDER_NAME: "MapIA SSO",
    AUTH_OIDC_SCOPE: "openid profile email",
    TELEMETRY_HASH_SALT: undefined,
    DEV_LOGIN_EMAIL: "admin@mapia.local",
    DEV_LOGIN_PASSWORD: "mapia123",
    APP_RELEASE_VERSION: "staging",
    APP_SERVICE_NAME: "mapia-web",
    CREATION_TRANSITION_TELEMETRY_ENABLED: true,
    TELEMETRY_SINK_TIMEOUT_MS: 150,
    TELEMETRY_SINK_FALLBACK_COOLDOWN_MS: 30000,
    TELEMETRY_GATE_EVALUATION_INTERVAL_MS: 30000,
    CREATION_TRANSITION_TELEMETRY_LOG_THROTTLE_MS: 60000,
    INTERNAL_OBSERVABILITY_ALLOWED_IDENTITIES: "admin@mapia.local",
    DATABASE_URL:
      "postgresql://mapia:mapia@localhost:55432/mapia?schema=public",
    ...overrides,
  };
}

describe("auth runtime readiness", () => {
  it("reports staging auth as ready when env and discovery document are coherent", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        issuer: "https://idp.example.com/realms/mapia",
        authorization_endpoint:
          "https://idp.example.com/realms/mapia/protocol/openid-connect/auth",
        token_endpoint:
          "https://idp.example.com/realms/mapia/protocol/openid-connect/token",
        jwks_uri:
          "https://idp.example.com/realms/mapia/protocol/openid-connect/certs",
      }),
    });

    const report = await inspectAuthRuntimeReadiness({
      env: buildEnv(),
      probeOidcDiscovery: true,
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(report.ready).toBe(true);
    expect(report.runtime.mode).toBe("oidc");
    expect(report.discovery).toMatchObject({
      status: "pass",
      issuer: "https://idp.example.com/realms/mapia",
    });
  });

  it("fails readiness when required shared-env checks are incomplete", async () => {
    const report = await inspectAuthRuntimeReadiness({
      env: buildEnv({
        NEXTAUTH_URL: "http://localhost:3000",
        AUTH_OIDC_CLIENT_SECRET: "",
      }),
      probeOidcDiscovery: false,
    });

    expect(report.ready).toBe(false);
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "nextauth_url_shared_safe",
          status: "fail",
        }),
        expect.objectContaining({
          id: "oidc_client_secret_present",
          status: "fail",
        }),
      ]),
    );
    expect(report.discovery.status).toBe("skip");
  });

  it("fails readiness when discovery document does not match the configured issuer", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        issuer: "https://different-idp.example.com/realms/mapia",
        authorization_endpoint:
          "https://idp.example.com/realms/mapia/protocol/openid-connect/auth",
        token_endpoint:
          "https://idp.example.com/realms/mapia/protocol/openid-connect/token",
        jwks_uri:
          "https://idp.example.com/realms/mapia/protocol/openid-connect/certs",
      }),
    });

    const report = await inspectAuthRuntimeReadiness({
      env: buildEnv(),
      probeOidcDiscovery: true,
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(report.ready).toBe(false);
    expect(report.discovery).toMatchObject({
      status: "fail",
    });
  });
});
