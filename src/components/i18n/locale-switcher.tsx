"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useMessages, useTranslations } from "next-intl";
import { Link, usePathname } from "@/src/i18n/navigation";
import {
  buildLocaleSwitcherHref,
  resolveLocaleSwitcherOptions,
} from "@/src/i18n/locale-switcher";
import type { AppMessages } from "@/src/i18n/messages";
import { locales, type AppLocale } from "@/src/i18n/routing";

type LocaleSwitcherProps = {
  showLabel?: boolean;
  variant?: "compact" | "panel";
  className?: string;
};

function joinClassNames(...values: Array<string | undefined | false>) {
  return values.filter(Boolean).join(" ");
}

export function LocaleSwitcher({
  showLabel = false,
  variant = "compact",
  className,
}: LocaleSwitcherProps) {
  const t = useTranslations("Common.localeSwitcher");
  const messages = useMessages() as AppMessages;
  const pathname = usePathname();
  const locale = useLocale() as AppLocale;
  const searchParams = useSearchParams();
  const currentPathname = pathname || "/";
  const currentSearch = searchParams?.toString() ?? "";
  const optionCopy = messages.Common.localeSwitcher.options;

  const options = useMemo(
    () =>
      resolveLocaleSwitcherOptions(optionCopy, locales).map((option) => {
        const href = buildLocaleSwitcherHref({
          pathname: currentPathname,
          search: currentSearch,
          locale: option.locale,
        });

        return {
          ...option,
          href,
        };
      }),
    [currentPathname, currentSearch, optionCopy],
  );

  const currentLocaleDescription =
    optionCopy[locale]?.description ?? locale;

  return (
    <div
      className={joinClassNames(
        "locale-switcher",
        `locale-switcher--${variant}`,
        className,
      )}
      data-testid="locale-switcher"
    >
      {showLabel ? (
        <span className="locale-switcher-label">{t("label")}</span>
      ) : (
        <span className="sr-only">{t("label")}</span>
      )}
      <div
        className="locale-switcher-options"
        role="group"
        aria-label={t("ariaLabel")}
        title={t("currentLocaleTitle", { locale: currentLocaleDescription })}
      >
        {options.map((option) =>
          option.locale === locale ? (
            <span
              key={option.locale}
              className="locale-switcher-option"
              data-active="true"
              data-testid={`locale-switcher-option-${option.locale}`}
              aria-current="true"
              title={t("currentLocaleTitle", { locale: option.description })}
            >
              {option.label}
            </span>
          ) : (
            <Link
              key={option.locale}
              href={option.href}
              locale={option.locale}
              className="locale-switcher-option"
              data-testid={`locale-switcher-option-${option.locale}`}
              title={option.description}
            >
              {option.label}
            </Link>
          ),
        )}
      </div>
    </div>
  );
}
