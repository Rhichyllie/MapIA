import { hasLocale } from "next-intl";
import { defineRouting } from "next-intl/routing";

export const locales = ["pt-BR", "en-US"] as const;
export type AppLocale = (typeof locales)[number];

export const routing = defineRouting({
  locales,
  defaultLocale: "pt-BR",
  localePrefix: "as-needed",
});

export function isLocale(value: string | undefined): value is AppLocale {
  return Boolean(value && hasLocale(locales, value));
}

export function extractLocaleFromPathname(pathname: string): AppLocale | undefined {
  const [, candidate] = pathname.split("/");
  return isLocale(candidate) ? candidate : undefined;
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
