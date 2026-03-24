import { hasLocale } from "next-intl";
import { defineRouting } from "next-intl/routing";

export const locales = ["pt-BR", "en-US"] as const;
export type AppLocale = (typeof locales)[number];
export const LOCALE_COOKIE_NAME = "NEXT_LOCALE";
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const routing = defineRouting({
  locales,
  defaultLocale: "pt-BR",
  localePrefix: "as-needed",
  localeCookie: {
    name: LOCALE_COOKIE_NAME,
    sameSite: "lax",
    maxAge: LOCALE_COOKIE_MAX_AGE,
  },
});

export function isLocale(value: string | undefined): value is AppLocale {
  return Boolean(value && hasLocale(locales, value));
}

export function extractLocaleFromPathname(pathname: string): AppLocale | undefined {
  const normalizedPathname = normalizePathname(pathname);
  const [, candidate] = normalizedPathname.split("/");
  return isLocale(candidate) ? candidate : undefined;
}

export function resolveLocaleFromPathname(pathname: string): AppLocale {
  return extractLocaleFromPathname(pathname) ?? routing.defaultLocale;
}

export function stripLocaleFromPathname(pathname: string): string {
  const locale = extractLocaleFromPathname(pathname);

  if (!locale) {
    return normalizePathname(pathname);
  }

  const withoutLocale = pathname.slice(`/${locale}`.length);
  return normalizePathname(withoutLocale);
}

export function buildLocalizedPathname(pathname: string, locale: AppLocale): string {
  const normalizedPathname = normalizePathname(pathname);

  if (locale === routing.defaultLocale) {
    return normalizedPathname;
  }

  if (normalizedPathname === "/") {
    return `/${locale}`;
  }

  return `/${locale}${normalizedPathname}`;
}

export function normalizePathname(pathname: string): string {
  if (!pathname || pathname === "/") {
    return "/";
  }

  return pathname.endsWith("/") ? pathname.slice(0, -1) || "/" : pathname;
}
