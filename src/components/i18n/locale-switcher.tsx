"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/src/i18n/navigation";
import {
  buildLocaleSwitcherHref,
} from "@/src/i18n/locale-switcher";
import { locales, type AppLocale } from "@/src/i18n/routing";

type LocaleSwitcherProps = {
  showLabel?: boolean;
  variant?: "compact" | "panel";
  className?: string;
};

const localeOptionKeys = {
  "pt-BR": "ptBR",
  "en-US": "enUS",
} as const satisfies Record<AppLocale, "ptBR" | "enUS">;

function joinClassNames(...values: Array<string | undefined | false>) {
  return values.filter(Boolean).join(" ");
}

export function LocaleSwitcher({
  showLabel = false,
  variant = "compact",
  className,
}: LocaleSwitcherProps) {
  const t = useTranslations("Common.localeSwitcher");
  const pathname = usePathname();
  const locale = useLocale() as AppLocale;
  const searchParams = useSearchParams();
  const currentPathname = pathname || "/";
  const currentSearch = searchParams?.toString() ?? "";

  const options = useMemo(
    () =>
      locales.map((nextLocale) => {
        const optionKey = localeOptionKeys[nextLocale];
        const href = buildLocaleSwitcherHref({
          pathname: currentPathname,
          search: currentSearch,
          locale: nextLocale,
        });

        return {
          locale: nextLocale,
          href,
          label: t(`options.${optionKey}.label`),
          description: t(`options.${optionKey}.description`),
        };
      }),
    [currentPathname, currentSearch, t],
  );

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
