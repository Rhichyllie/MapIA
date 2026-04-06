import type { NextRequest } from "next/server";
import NextAuth from "next-auth";
import { apiErrorResponse } from "@/src/server/app/api-response";
import { getAuthOptions } from "@/src/server/auth/options";
import { assertAuthRuntimeReady } from "@/src/server/auth/auth-runtime";

async function handleAuth(request: NextRequest, context: unknown) {
  try {
    assertAuthRuntimeReady();
    const handler = NextAuth(getAuthOptions());
    return await handler(request, context);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export { handleAuth as GET, handleAuth as POST };
