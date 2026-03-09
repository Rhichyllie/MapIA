import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { isAppError } from "@/src/lib/app-error";

function flattenZodIssues(error: ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
    code: issue.code,
  }));
}

export function apiErrorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: "VALIDATION_ERROR",
        message: "Dados invalidos.",
        issues: flattenZodIssues(error),
      },
      { status: 400 },
    );
  }

  if (isAppError(error)) {
    return NextResponse.json(
      {
        error: error.code,
        code: error.code,
        message: error.message,
        ...(error.details ?? {}),
      },
      { status: error.status },
    );
  }

  console.error(error);

  return NextResponse.json(
    {
      error: "INTERNAL_SERVER_ERROR",
      message: "Erro interno inesperado.",
    },
    { status: 500 },
  );
}

export function apiSuccessResponse<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ data }, init);
}

export function unauthorizedResponse() {
  return NextResponse.json(
    { error: "UNAUTHORIZED", message: "Autenticacao necessaria." },
    { status: 401 },
  );
}
