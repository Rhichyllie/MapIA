import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError, isAppError } from "@/src/lib/app-error";
import {
  getRedactedValueMask,
  redactSensitiveStrings,
} from "@/src/modules/creation-assistant/domain";

const sensitiveKeyPattern =
  /password|token|secret|connectionstring|apikey|api_key|bearer|authorization/i;
const redactedValue = getRedactedValueMask();

function redactErrorDetails(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => redactErrorDetails(entry));
  }

  if (value && typeof value === "object") {
    const redacted: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (sensitiveKeyPattern.test(key)) {
        if (nested === undefined || nested === null || nested === "") {
          continue;
        }
        redacted[key] = redactedValue;
        continue;
      }
      redacted[key] = redactErrorDetails(nested);
    }
    return redactSensitiveStrings(redacted);
  }

  return redactSensitiveStrings(value);
}

function flattenZodIssues(error: ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
    code: issue.code,
    ...("params" in issue && (issue as { params?: unknown }).params
      ? {
          params: redactErrorDetails((issue as { params?: unknown }).params),
        }
      : {}),
  }));
}

export function apiErrorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: "VALIDATION_ERROR",
        code: "VALIDATION_ERROR",
        message: "Dados invalidos.",
        issues: flattenZodIssues(error),
      },
      { status: 400 },
    );
  }

  if (isAppError(error)) {
    const safeDetails = redactErrorDetails(error.details ?? {});
    const safeMessage = redactSensitiveStrings(error.message);
    return NextResponse.json(
      {
        error: error.code,
        code: error.code,
        message: typeof safeMessage === "string" ? safeMessage : error.message,
        ...(safeDetails as Record<string, unknown>),
      },
      { status: error.status },
    );
  }

  if (error instanceof Error) {
    console.error(redactSensitiveStrings(error.message));
    if (error.stack) {
      console.error(redactSensitiveStrings(error.stack));
    }
  } else {
    console.error(redactSensitiveStrings(error));
  }

  return NextResponse.json(
    {
      error: "INTERNAL_SERVER_ERROR",
      code: "INTERNAL_SERVER_ERROR",
      message: "Erro interno inesperado.",
    },
    { status: 500 },
  );
}

export function apiSuccessResponse<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ data }, init);
}

export function unauthorizedError(message = "Autenticacao necessaria.") {
  return new AppError(message, {
    code: "UNAUTHORIZED",
    status: 401,
  });
}

export function unauthorizedResponse() {
  return apiErrorResponse(unauthorizedError());
}

export function forbiddenError(message = "Acesso nao autorizado.") {
  return new AppError(message, {
    code: "FORBIDDEN",
    status: 403,
  });
}

export function forbiddenResponse(message = "Acesso nao autorizado.") {
  return apiErrorResponse(forbiddenError(message));
}
