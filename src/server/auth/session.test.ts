import type { Session } from "next-auth";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findActiveAppUserById: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getLocale: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/src/i18n/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("@/src/server/auth/options", () => ({
  getAuthOptions: vi.fn(),
}));

vi.mock("@/src/server/observability/server-telemetry", () => ({
  addServerTelemetryEvent: vi.fn(),
  setServerTelemetryAttributes: vi.fn(),
  withServerTelemetrySpan: vi.fn(
    async (
      _name: string,
      _options: unknown,
      callback: (span: unknown) => unknown,
    ) => callback({}),
  ),
}));

vi.mock("@/src/server/auth/auth-user-store", async () => {
  const actual = await vi.importActual<
    typeof import("@/src/server/auth/auth-user-store")
  >("@/src/server/auth/auth-user-store");

  return {
    ...actual,
    findActiveAppUserById: mocks.findActiveAppUserById,
  };
});

import {
  requireSessionActor,
  requireSessionIdentity,
  requireSessionUserId,
} from "./session";

const validSession = {
  expires: "2099-01-01T00:00:00.000Z",
  user: {
    id: "11111111-1111-4111-8111-111111111111",
    email: "owner@mapia.local",
    authProvider: "oidc",
    authMode: "oidc",
  },
} satisfies Session;

describe("session helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns session identity and userId when claims are present", () => {
    expect(requireSessionIdentity(validSession)).toBe("owner@mapia.local");
    expect(requireSessionUserId(validSession)).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
  });

  it("rejects sessions without internal userId", () => {
    try {
      requireSessionUserId({
        ...validSession,
        user: {
          ...validSession.user,
          id: "",
        },
      });
      throw new Error("Expected requireSessionUserId to throw.");
    } catch (error) {
      expect(error).toMatchObject({
        code: "AUTH_SESSION_USER_ID_MISSING",
        message: "Sessao autenticada sem userId interno do MapIA.",
        status: 401,
      });
    }
  });

  it("rejects sessions without a valid email claim", () => {
    try {
      requireSessionIdentity({
        ...validSession,
        user: {
          ...validSession.user,
          email: "invalid-email",
        },
      });
      throw new Error("Expected requireSessionIdentity to throw.");
    } catch (error) {
      expect(error).toMatchObject({
        code: "AUTH_SESSION_IDENTITY_MISSING",
        status: 401,
      });
    }
  });

  it("resolves the authenticated actor against the internal user store", async () => {
    mocks.findActiveAppUserById.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      email: "owner@mapia.local",
      emailNormalized: "owner@mapia.local",
      displayName: "Owner",
      active: true,
      createdAt: new Date("2026-04-02T10:00:00.000Z"),
      updatedAt: new Date("2026-04-02T10:00:00.000Z"),
    });

    await expect(requireSessionActor(validSession)).resolves.toMatchObject({
      userId: "11111111-1111-4111-8111-111111111111",
      email: "owner@mapia.local",
      displayName: "Owner",
      providerId: "oidc",
      authMode: "oidc",
    });
  });

  it("fails when the session points to a missing or disabled internal user", async () => {
    mocks.findActiveAppUserById.mockResolvedValue(null);

    await expect(requireSessionActor(validSession)).rejects.toMatchObject({
      code: "AUTH_SESSION_USER_INVALID",
      status: 403,
    });
  });

  it("fails when session identity no longer matches the internal active user", async () => {
    mocks.findActiveAppUserById.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      email: "other@mapia.local",
      emailNormalized: "other@mapia.local",
      displayName: "Owner",
      active: true,
      createdAt: new Date("2026-04-02T10:00:00.000Z"),
      updatedAt: new Date("2026-04-02T10:00:00.000Z"),
    });

    await expect(requireSessionActor(validSession)).rejects.toMatchObject({
      code: "AUTH_SESSION_IDENTITY_MISMATCH",
      status: 401,
    });
  });
});
