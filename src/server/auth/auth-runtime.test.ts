import { describe, expect, it } from "vitest";
import type { ServerEnv } from "@/src/lib/env";
import {
  assertAuthRuntimeReady,
  resolveAuthRuntimeConfig,
} from "./auth-runtime";

function buildEnv(overrides: Partial<ServerEnv> = {}): ServerEnv {
  return {
    NODE_ENV: "test",
    NEXTAUTH_URL: "http://localhost:3000",
    NEXTAUTH_SECRET: "dev-only-nextauth-secret",
    AUTH_MODE: "development",
    AUTH_OIDC_ISSUER_URL: undefined,
    AUTH_OIDC_CLIENT_ID: undefined,
    AUTH_OIDC_CLIENT_SECRET: undefined,
    AUTH_OIDC_PROVIDER_NAME: "Single Sign-On",
    AUTH_OIDC_SCOPE: "openid profile email",
    TELEMETRY_HASH_SALT: undefined,
    DEV_LOGIN_EMAIL: "admin@mapia.local",
    DEV_LOGIN_PASSWORD: "mapia123",
    APP_RELEASE_VERSION: "dev",
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

describe("auth runtime", () => {
  it("keeps development credentials available outside production by default", () => {
    const runtime = resolveAuthRuntimeConfig(buildEnv());

    expect(runtime).toMatchObject({
      mode: "development_credentials",
      providerId: "credentials",
      productionCapable: false,
    });
  });

  it("resolves oidc mode when production env is complete", () => {
    const runtime = resolveAuthRuntimeConfig(
      buildEnv({
        NODE_ENV: "production",
        AUTH_MODE: "oidc",
        NEXTAUTH_URL: "https://mapia.example.com",
        NEXTAUTH_SECRET: "production-secret-not-default",
        AUTH_OIDC_ISSUER_URL: "https://idp.example.com",
        AUTH_OIDC_CLIENT_ID: "mapia-web",
        AUTH_OIDC_CLIENT_SECRET: "super-secret",
        AUTH_OIDC_PROVIDER_NAME: "Example Identity",
      }),
    );

    expect(runtime).toMatchObject({
      mode: "oidc",
      providerId: "oidc",
      productionCapable: true,
      providerName: "Example Identity",
    });
  });

  it("fails closed in production when oidc is requested but env is incomplete", () => {
    const runtime = resolveAuthRuntimeConfig(
      buildEnv({
        NODE_ENV: "production",
        AUTH_MODE: "oidc",
        NEXTAUTH_URL: "https://mapia.example.com",
        NEXTAUTH_SECRET: "production-secret-not-default",
        AUTH_OIDC_ISSUER_URL: "https://idp.example.com",
        AUTH_OIDC_CLIENT_ID: "mapia-web",
        AUTH_OIDC_CLIENT_SECRET: undefined,
      }),
    );

    expect(runtime).toMatchObject({
      mode: "misconfigured",
      providerId: null,
      reason: "oidc_env_missing",
    });
    expect(runtime.requiredEnv).toContain("AUTH_OIDC_CLIENT_SECRET");
  });

  it("fails closed in production when NEXTAUTH_URL is still local/default", () => {
    const runtime = resolveAuthRuntimeConfig(
      buildEnv({
        NODE_ENV: "production",
        AUTH_MODE: "oidc",
        NEXTAUTH_SECRET: "production-secret-not-default",
        NEXTAUTH_URL: "http://localhost:3000",
        AUTH_OIDC_ISSUER_URL: "https://idp.example.com",
        AUTH_OIDC_CLIENT_ID: "mapia-web",
        AUTH_OIDC_CLIENT_SECRET: "super-secret",
      }),
    );

    expect(runtime).toMatchObject({
      mode: "misconfigured",
      providerId: null,
      reason: "nextauth_url_invalid",
    });
    expect(runtime.requiredEnv).toContain("NEXTAUTH_URL");
  });

  it("fails closed in production when OIDC issuer URL is not safe for shared env", () => {
    const runtime = resolveAuthRuntimeConfig(
      buildEnv({
        NODE_ENV: "production",
        AUTH_MODE: "oidc",
        NEXTAUTH_URL: "https://mapia.example.com",
        NEXTAUTH_SECRET: "production-secret-not-default",
        AUTH_OIDC_ISSUER_URL: "http://localhost:5556",
        AUTH_OIDC_CLIENT_ID: "mapia-web",
        AUTH_OIDC_CLIENT_SECRET: "super-secret",
      }),
    );

    expect(runtime).toMatchObject({
      mode: "misconfigured",
      providerId: null,
      reason: "oidc_issuer_url_invalid",
    });
  });

  it("fails closed in production when OIDC scope no longer contains openid", () => {
    const runtime = resolveAuthRuntimeConfig(
      buildEnv({
        NODE_ENV: "production",
        AUTH_MODE: "oidc",
        NEXTAUTH_URL: "https://mapia.example.com",
        NEXTAUTH_SECRET: "production-secret-not-default",
        AUTH_OIDC_ISSUER_URL: "https://idp.example.com",
        AUTH_OIDC_CLIENT_ID: "mapia-web",
        AUTH_OIDC_CLIENT_SECRET: "super-secret",
        AUTH_OIDC_SCOPE: "profile email",
      }),
    );

    expect(runtime).toMatchObject({
      mode: "misconfigured",
      providerId: null,
      reason: "oidc_scope_invalid",
    });
    expect(runtime.requiredEnv).toContain("AUTH_OIDC_SCOPE");
  });

  it("rejects development auth explicitly in production", () => {
    try {
      assertAuthRuntimeReady(
        buildEnv({
          NODE_ENV: "production",
          AUTH_MODE: "development",
        }),
      );
      throw new Error("Expected assertAuthRuntimeReady to throw.");
    } catch (error) {
      expect(error).toMatchObject({
        code: "AUTH_CONFIGURATION_INVALID",
        message: "Autenticacao de producao mal configurada para este ambiente.",
        status: 503,
      });
    }
  });
});
