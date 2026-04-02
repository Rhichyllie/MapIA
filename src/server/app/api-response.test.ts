import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AppError } from "@/src/lib/app-error";
import {
  apiErrorResponse,
  forbiddenResponse,
  unauthorizedResponse,
} from "@/src/server/app/api-response";

describe("api-response", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps code and error aligned for unauthorized responses", async () => {
    const response = unauthorizedResponse();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      error: "UNAUTHORIZED",
      code: "UNAUTHORIZED",
      message: "Autenticacao necessaria.",
    });
  });

  it("keeps code and error aligned for forbidden responses", async () => {
    const response = forbiddenResponse("Acesso restrito.");
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toMatchObject({
      error: "FORBIDDEN",
      code: "FORBIDDEN",
      message: "Acesso restrito.",
    });
  });

  it("returns code for validation errors", async () => {
    const parsed = z
      .object({ value: z.string().min(1) })
      .safeParse({ value: "" });

    if (parsed.success) {
      throw new Error("Expected zod validation to fail in test setup.");
    }

    const response = apiErrorResponse(parsed.error);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      error: "VALIDATION_ERROR",
      code: "VALIDATION_ERROR",
      message: "Dados invalidos.",
    });
  });

  it("returns code for generic internal errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = apiErrorResponse(new Error("boom"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      error: "INTERNAL_SERVER_ERROR",
      code: "INTERNAL_SERVER_ERROR",
      message: "Erro interno inesperado.",
    });
  });

  it("preserves domain error code/status/details", async () => {
    const response = apiErrorResponse(
      new AppError("Conflito de revisao.", {
        code: "CONFLICT",
        status: 409,
        details: {
          currentRevision: 4,
          expectedRevision: 3,
        },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      error: "CONFLICT",
      code: "CONFLICT",
      currentRevision: 4,
      expectedRevision: 3,
    });
  });
});
