import {
  buildLocalizedPathname,
  normalizePathname,
  stripLocaleFromPathname,
  type AppLocale,
} from "./routing";

export type LocaleSwitcherOptionCopy = {
  label: string;
  description: string;
};

function isAbsoluteUrl(value: string) {
  return /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(value);
}

export function resolveLocaleSwitcherOptions<TLocale extends string>(
  options: Record<TLocale, LocaleSwitcherOptionCopy>,
  availableLocales: readonly TLocale[],
) {
  return availableLocales.map((locale) => ({
    locale,
    ...options[locale],
  }));
}

export function localizeInternalCallbackUrl(
  callbackUrl: string,
  locale: AppLocale,
) {
  try {
    const resolvedUrl = new URL(callbackUrl, "http://mapia.local");

    if (isAbsoluteUrl(callbackUrl) && resolvedUrl.origin !== "http://mapia.local") {
      return callbackUrl;
    }

    const localizedPathname = buildLocalizedPathname(
      stripLocaleFromPathname(resolvedUrl.pathname),
      locale,
    );

    return `${localizedPathname}${resolvedUrl.search}${resolvedUrl.hash}`;
  } catch {
    return callbackUrl;
  }
}

export function buildLocaleSwitcherHref(input: {
  pathname: string;
  search?: string;
  locale: AppLocale;
}) {
  const pathname = normalizePathname(stripLocaleFromPathname(input.pathname));
  const query = new URLSearchParams(input.search ?? "");
  const callbackUrl = query.get("callbackUrl");

  if (callbackUrl) {
    query.set("callbackUrl", localizeInternalCallbackUrl(callbackUrl, input.locale));
  }

  const serializedQuery = query.toString();
  return serializedQuery ? `${pathname}?${serializedQuery}` : pathname;
}
