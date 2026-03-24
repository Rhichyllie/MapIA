import { getToken } from "next-auth/jwt";
import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import {
  buildProtectedLoginRedirect,
} from "./src/i18n/proxy-helpers";
import {
  normalizePathname,
  routing,
  stripLocaleFromPathname,
} from "./src/i18n/routing";
import { isProtectedAppPathname } from "./src/lib/routes";

const handleI18nRouting = createMiddleware(routing);

export default async function proxy(request: NextRequest) {
  let response = handleI18nRouting(request);

  if (!response.ok) {
    return response;
  }

  const resolvedUrl = new URL(
    response.headers.get("x-middleware-rewrite") ?? request.url,
  );
  const pathname = normalizePathname(stripLocaleFromPathname(resolvedUrl.pathname));

  if (!isProtectedAppPathname(pathname)) {
    return response;
  }

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (token) {
    return response;
  }

  const loginUrl = buildProtectedLoginRedirect({
    requestUrl: request.url,
    resolvedPathname: resolvedUrl.pathname,
    requestPathname: request.nextUrl.pathname,
    requestSearch: request.nextUrl.search,
  });
  response = NextResponse.redirect(loginUrl, {
    headers: response.headers,
  });

  return response;
}

export const config = {
  matcher: "/((?!api|trpc|_next|_vercel|.*\\..*).*)",
};
