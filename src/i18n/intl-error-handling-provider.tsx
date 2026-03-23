"use client";

import { NextIntlClientProvider, useLocale } from "next-intl";
import { getIntlMessageFallback, onIntlError } from "./error-handling";

type IntlErrorHandlingProviderProps = {
  children: React.ReactNode;
};

export function IntlErrorHandlingProvider({
  children,
}: IntlErrorHandlingProviderProps) {
  const locale = useLocale();

  return (
    <NextIntlClientProvider
      locale={locale}
      onError={onIntlError}
      getMessageFallback={({ namespace, key }) =>
        getIntlMessageFallback({ namespace, key })
      }
    >
      {children}
    </NextIntlClientProvider>
  );
}
