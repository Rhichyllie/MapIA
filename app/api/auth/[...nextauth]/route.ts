import type { NextRequest } from "next/server";
import NextAuth from "next-auth";
import { apiErrorResponse } from "@/src/server/app/api-response";
import {
  getAuthCallbackErrorMessage,
  getAuthCallbackErrorStatus,
  isAuthCallbackErrorCode,
} from "@/src/server/auth/auth-callback-error";
import { getAuthOptions } from "@/src/server/auth/options";
import { assertAuthRuntimeReady } from "@/src/server/auth/auth-runtime";

function isJsonResponse(response: Response) {
  return response.headers
    .get("content-type")
    ?.toLowerCase()
    .includes("application/json");
}

function buildLoginErrorUrl(request: NextRequest, errorCode: string) {
  const requestUrl = "nextUrl" in request && request.nextUrl
    ? request.nextUrl
    : new URL(request.url);

  return `${requestUrl.origin}/login?error=${encodeURIComponent(errorCode)}`;
}

async function rewriteAuthCallbackFailureResponse(
  request: NextRequest,
  response: Response,
) {
  const location = response.headers.get("location");
  const requestUrl = "nextUrl" in request && request.nextUrl
    ? request.nextUrl
    : new URL(request.url);
  const locationErrorCode = location
    ? new URL(location, requestUrl.origin).searchParams.get("error")
    : null;

  if (isAuthCallbackErrorCode(locationErrorCode)) {
    const headers = new Headers(response.headers);
    headers.set("location", buildLoginErrorUrl(request, locationErrorCode));

    return new Response(response.body, {
      status: response.status,
      headers,
    });
  }

  if (!isJsonResponse(response) || response.status >= 400) {
    return response;
  }

  const payload = (await response.clone().json().catch(() => null)) as {
    url?: string;
  } | null;

  if (!payload?.url) {
    return response;
  }

  const errorCode = new URL(payload.url, requestUrl.origin).searchParams.get("error");

  if (!isAuthCallbackErrorCode(errorCode)) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.set("content-type", "application/json");
  const loginErrorUrl = buildLoginErrorUrl(request, errorCode);

  return new Response(
    JSON.stringify({
      ...payload,
      url: loginErrorUrl,
      error: errorCode,
      code: errorCode,
      message: getAuthCallbackErrorMessage(errorCode),
    }),
    {
      status: getAuthCallbackErrorStatus(errorCode),
      headers,
    },
  );
}

async function handleAuth(request: NextRequest, context: unknown) {
  try {
    assertAuthRuntimeReady();
    const handler = NextAuth(getAuthOptions());
    const response = await handler(request, context);
    return await rewriteAuthCallbackFailureResponse(request, response);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export { handleAuth as GET, handleAuth as POST };
