import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/src/lib/app-error";

const mocks = vi.hoisted(() => ({
  getServerEnv: vi.fn(),
  resolveAuthRuntimeConfig: vi.fn(),
  buildOidcDiscoveryUrl: vi.fn((issuerUrl: string) => issuerUrl),
  syncAuthenticatedActor: vi.fn(),
}));

vi.mock("@/src/lib/env", () => ({
  getServerEnv: mocks.getServerEnv,
}));

vi.mock("@/src/server/auth/auth-runtime", () => ({
  resolveAuthRuntimeConfig: mocks.resolveAuthRuntimeConfig,
  buildOidcDiscoveryUrl: mocks.buildOidcDiscoveryUrl,
}));

vi.mock("@/src/server/auth/auth-user-store", () => ({
  syncAuthenticatedActor: mocks.syncAuthenticatedActor,
}));

import { getAuthOptions } from "./options";

const baseEnv = {
  NODE_ENV: "test",
  NEXTAUTH_URL: "http://localhost:3000",
  NEXTAUTH_SECRET: "dev-only-nextauth-secret",
  AUTH_MODE: "oidc",
  AUTH_OIDC_ISSUER_URL: "https://idp.example.com",
  AUTH_OIDC_CLIENT_ID: "mapia-web",
  AUTH_OIDC_CLIENT_SECRET: "super-secret",
  AUTH_OIDC_PROVIDER_NAME: "Example Identity",
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
  DATABASE_URL: "postgresql://mapia:mapia@localhost:55432/mapia?schema=public",
};

function getCallbacks() {
  const callbacks = getAuthOptions().callbacks;

  if (!callbacks) {
    throw new Error("Expected auth callbacks to be configured.");
  }

  return callbacks;
}

describe("auth options", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerEnv.mockReturnValue(baseEnv);
    mocks.resolveAuthRuntimeConfig.mockReturnValue({
      mode: "oidc",
      providerId: "oidc",
      productionCapable: true,
      requiresInteractiveSignIn: true,
      providerName: "Example Identity",
      requiredEnv: [
        "NEXTAUTH_URL",
        "AUTH_OIDC_ISSUER_URL",
        "AUTH_OIDC_CLIENT_ID",
        "AUTH_OIDC_CLIENT_SECRET",
        "NEXTAUTH_SECRET",
      ],
    });
    mocks.syncAuthenticatedActor.mockResolvedValue({
      userId: "11111111-1111-4111-8111-111111111111",
      email: "user@mapia.local",
      providerId: "oidc",
      authMode: "oidc",
    });
  });

  it("accepts preferred_username as a usable OIDC email fallback", async () => {
    const result = await getCallbacks().signIn?.({
      user: { email: undefined, name: "OIDC User" },
      account: {
        provider: "oidc",
        providerAccountId: "subject-123",
        type: "oauth",
      },
      profile: {
        sub: "subject-123",
        preferred_username: "user@mapia.local",
      },
    } as never);

    expect(result).toBe(true);
    expect(mocks.syncAuthenticatedActor).toHaveBeenCalledWith(
      expect.objectContaining({
        providerType: "oidc",
        subject: "subject-123",
        email: "user@mapia.local",
      }),
    );
  });

  it("rejects OIDC sign-in without a usable email claim", async () => {
    const result = await getCallbacks().signIn?.({
      user: { email: undefined, name: "OIDC User" },
      account: {
        provider: "oidc",
        providerAccountId: "subject-123",
        type: "oauth",
      },
      profile: {
        sub: "subject-123",
        preferred_username: "not-an-email",
      },
    } as never);

    expect(result).toBe(false);
    expect(mocks.syncAuthenticatedActor).not.toHaveBeenCalled();
  });

  it("rejects OIDC sign-in without a stable subject", async () => {
    const result = await getCallbacks().signIn?.({
      user: { email: "user@mapia.local", name: "OIDC User" },
      account: {
        provider: "oidc",
        providerAccountId: "",
        type: "oauth",
      },
      profile: {
        email: "user@mapia.local",
      },
    } as never);

    expect(result).toBe(false);
    expect(mocks.syncAuthenticatedActor).not.toHaveBeenCalled();
  });

  it("propagates identity conflicts from the internal auth store", async () => {
    mocks.syncAuthenticatedActor.mockRejectedValueOnce(
      new AppError(
        "A identidade externa autenticada conflita com um usuario interno ja vinculado a outro subject.",
        {
          code: "AUTH_IDENTITY_CONFLICT",
          status: 409,
        },
      ),
    );

    await expect(
      getCallbacks().signIn?.({
        user: { email: "user@mapia.local", name: "OIDC User" },
        account: {
          provider: "oidc",
          providerAccountId: "subject-123",
          type: "oauth",
        },
        profile: {
          sub: "subject-123",
          email: "user@mapia.local",
        },
      } as never),
    ).rejects.toMatchObject({
      message: "AuthIdentityConflict",
    });
  });

  it("maps auth storage readiness failures to a stable callback error code", async () => {
    mocks.syncAuthenticatedActor.mockRejectedValueOnce(
      new AppError(
        "Storage de autenticacao do MapIA nao esta pronto. Aplique as migrations de auth antes de executar login ou validar sessao.",
        {
          code: "AUTH_STORAGE_NOT_READY",
          status: 503,
        },
      ),
    );

    await expect(
      getCallbacks().signIn?.({
        user: { email: "user@mapia.local", name: "OIDC User" },
        account: {
          provider: "oidc",
          providerAccountId: "subject-123",
          type: "oauth",
        },
        profile: {
          sub: "subject-123",
          email: "user@mapia.local",
        },
      } as never),
    ).rejects.toMatchObject({
      message: "AuthStorageNotReady",
    });
  });

  it("maps auth migration rollout failures to a stable callback error code", async () => {
    mocks.syncAuthenticatedActor.mockRejectedValueOnce(
      new AppError(
        "O rollout de migrations obrigatorias da auth esta incompleto neste ambiente.",
        {
          code: "AUTH_STORAGE_MIGRATION_INCOMPLETE",
          status: 503,
        },
      ),
    );

    await expect(
      getCallbacks().signIn?.({
        user: { email: "user@mapia.local", name: "OIDC User" },
        account: {
          provider: "oidc",
          providerAccountId: "subject-123",
          type: "oauth",
        },
        profile: {
          sub: "subject-123",
          email: "user@mapia.local",
        },
      } as never),
    ).rejects.toMatchObject({
      message: "AuthStorageMigrationIncomplete",
    });
  });

  it("maps auth integrity failures to a stable callback error code", async () => {
    mocks.syncAuthenticatedActor.mockRejectedValueOnce(
      new AppError(
        "A integridade do storage de autenticacao do MapIA esta invalida neste ambiente.",
        {
          code: "AUTH_STORAGE_INTEGRITY_INVALID",
          status: 503,
        },
      ),
    );

    await expect(
      getCallbacks().signIn?.({
        user: { email: "user@mapia.local", name: "OIDC User" },
        account: {
          provider: "oidc",
          providerAccountId: "subject-123",
          type: "oauth",
        },
        profile: {
          sub: "subject-123",
          email: "user@mapia.local",
        },
      } as never),
    ).rejects.toMatchObject({
      message: "AuthStorageIntegrityInvalid",
    });
  });

  it("fails closed when jwt callback receives incomplete authenticated claims", async () => {
    await expect(
      getCallbacks().jwt?.({
        token: {},
        user: {
          id: "",
          email: "user@mapia.local",
          authProvider: "oidc",
          authMode: "oidc",
        },
      } as never),
    ).rejects.toMatchObject({
      code: "AUTH_JWT_CLAIMS_MISSING",
      status: 401,
    });
  });

  it("invalidates legacy jwt tokens without required MapIA claims", async () => {
    const token = await getCallbacks().jwt?.({
      token: {
        sub: "11111111-1111-4111-8111-111111111111",
        email: "user@mapia.local",
        authProvider: "oidc",
      },
    } as never);

    expect(token).toMatchObject({
      mapiaSessionInvalid: true,
      mapiaSessionErrorCode: "AUTH_JWT_CLAIMS_MISSING",
    });
  });

  it("returns an empty session payload when the jwt was invalidated", async () => {
    const result = await getCallbacks().session?.({
      session: {
        expires: "2099-01-01T00:00:00.000Z",
        user: {},
      },
      token: {
        mapiaSessionInvalid: true,
        mapiaSessionErrorCode: "AUTH_JWT_CLAIMS_MISSING",
      },
    } as never);

    expect(result).toEqual({});
  });

  it("treats tokens without required claims as an invalid session payload instead of throwing", async () => {
    const result = await getCallbacks().session?.({
      session: {
        expires: "2099-01-01T00:00:00.000Z",
        user: {},
      },
      token: {
        sub: "11111111-1111-4111-8111-111111111111",
        email: "user@mapia.local",
        authProvider: "oidc",
      },
    } as never);

    expect(result).toEqual({});
  });
});
