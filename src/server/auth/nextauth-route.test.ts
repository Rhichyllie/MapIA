import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/src/lib/app-error";

const mocks = vi.hoisted(() => ({
  nextAuthFactory: vi.fn(),
  assertAuthRuntimeReady: vi.fn(),
  getAuthOptions: vi.fn(),
}));

vi.mock("next-auth", () => ({
  default: mocks.nextAuthFactory,
}));

vi.mock("@/src/server/auth/auth-runtime", () => ({
  assertAuthRuntimeReady: mocks.assertAuthRuntimeReady,
}));

vi.mock("@/src/server/auth/options", () => ({
  getAuthOptions: mocks.getAuthOptions,
}));

import { GET } from "@/app/api/auth/[...nextauth]/route";

describe("/api/auth/[...nextauth]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertAuthRuntimeReady.mockImplementation(() => undefined);
    mocks.getAuthOptions.mockReturnValue({});
    mocks.nextAuthFactory.mockReturnValue(
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }),
      ),
    );
  });

  it("fails closed with 503 when auth runtime is misconfigured", async () => {
    mocks.assertAuthRuntimeReady.mockImplementation(() => {
      throw new AppError(
        "Autenticacao de producao mal configurada para este ambiente.",
        {
          code: "AUTH_CONFIGURATION_INVALID",
          status: 503,
        },
      );
    });

    const response = await GET(
      new Request("http://localhost/api/auth/session") as never,
      {} as never,
    );
    const payload = (await response.json()) as { code?: string };

    expect(response.status).toBe(503);
    expect(payload.code).toBe("AUTH_CONFIGURATION_INVALID");
    expect(mocks.nextAuthFactory).not.toHaveBeenCalled();
  });

  it("delegates to NextAuth only after auth runtime is ready", async () => {
    const handler = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      }),
    );
    mocks.nextAuthFactory.mockReturnValue(handler);

    const response = await GET(
      new Request("http://localhost/api/auth/session") as never,
      {} as never,
    );

    expect(response.status).toBe(200);
    expect(mocks.assertAuthRuntimeReady).toHaveBeenCalledTimes(1);
    expect(mocks.getAuthOptions).toHaveBeenCalledTimes(1);
    expect(mocks.nextAuthFactory).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("rewrites callback error redirects into explicit non-2xx responses", async () => {
    const handler = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          url: "http://localhost/login?error=AuthStorageNotReady",
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      ),
    );
    mocks.nextAuthFactory.mockReturnValue(handler);

    const response = await GET(
      new Request("http://localhost/api/auth/callback/credentials") as never,
      {} as never,
    );
    const payload = (await response.json()) as {
      code?: string;
      message?: string;
      url?: string;
    };

    expect(response.status).toBe(503);
    expect(payload).toMatchObject({
      code: "AuthStorageNotReady",
      url: "http://localhost/login?error=AuthStorageNotReady",
    });
  });

  it("rewrites redirect locations for interactive callback failures", async () => {
    const handler = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: {
          location: "http://localhost/api/auth/error?error=AuthStorageNotReady",
        },
      }),
    );
    mocks.nextAuthFactory.mockReturnValue(handler);

    const response = await GET(
      new Request("http://localhost/api/auth/callback/oidc") as never,
      {} as never,
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "http://localhost/login?error=AuthStorageNotReady",
    );
  });

  it("rewrites json callback failures for integrity errors with explicit status", async () => {
    const handler = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          url: "http://localhost/login?error=AuthStorageIntegrityInvalid",
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      ),
    );
    mocks.nextAuthFactory.mockReturnValue(handler);

    const response = await GET(
      new Request("http://localhost/api/auth/callback/credentials") as never,
      {} as never,
    );
    const payload = (await response.json()) as {
      code?: string;
      url?: string;
    };

    expect(response.status).toBe(503);
    expect(payload).toMatchObject({
      code: "AuthStorageIntegrityInvalid",
      url: "http://localhost/login?error=AuthStorageIntegrityInvalid",
    });
  });
});
