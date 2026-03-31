import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { IntlErrorHandlingProvider } from "@/src/i18n/intl-error-handling-provider";
import { buildLocalizedLayoutMetadata } from "@/src/i18n/metadata";
import { loadMessages } from "@/src/i18n/messages";
import { formats } from "@/src/i18n/request";
import { routing } from "@/src/i18n/routing";
import { AppProviders } from "../providers";

type LocaleLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: Omit<LocaleLayoutProps, "children">): Promise<Metadata> {
  const { locale } = await params;
  const resolvedLocale = hasLocale(routing.locales, locale)
    ? locale
    : routing.defaultLocale;

  return buildLocalizedLayoutMetadata(resolvedLocale);
}

export default async function LocaleLayout({
  children,
  params,
}: LocaleLayoutProps) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);
  const messages = await loadMessages(locale);

  return (
    <NextIntlClientProvider locale={locale} messages={messages} formats={formats}>
      <IntlErrorHandlingProvider>
        <AppProviders>{children}</AppProviders>
      </IntlErrorHandlingProvider>
    </NextIntlClientProvider>
  );
}
