import { getToken } from "next-auth/jwt";
import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { getPathname } from "./src/i18n/navigation";
import {
  normalizePathname,
  routing,
  stripLocaleFromPathname,
  type AppLocale,
} from "./src/i18n/routing";
import { appRoutes, isProtectedAppPathname } from "./src/lib/routes";

const handleI18nRouting = createMiddleware(routing);

function resolveLocaleFromRequestPath(pathname: string): AppLocale {
  const normalizedPathname = normalizePathname(pathname);
  const strippedPathname = stripLocaleFromPathname(normalizedPathname);
  const localeCandidate = normalizedPathname.slice(
    0,
    normalizedPathname.length - strippedPathname.length,
  );

  if (localeCandidate.startsWith("/en-US")) {
    return "en-US";
  }

  return routing.defaultLocale;
}

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

  const locale = resolveLocaleFromRequestPath(resolvedUrl.pathname);
  const loginPathname = getPathname({
    href: appRoutes.login,
    locale,
  });
  const loginUrl = new URL(loginPathname, request.url);
  const callbackUrl = `${request.nextUrl.pathname}${request.nextUrl.search}`;

  loginUrl.searchParams.set("callbackUrl", callbackUrl);
  response = NextResponse.redirect(loginUrl, {
    headers: response.headers,
  });

  return response;
}

export const config = {
  matcher: "/((?!api|trpc|_next|_vercel|.*\\..*).*)",
};
