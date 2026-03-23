import { hasLocale, type Formats, IntlErrorCode } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { getIntlMessageFallback, onIntlError } from "./error-handling";
import { loadMessages } from "./messages";
import { routing } from "./routing";

export const formats = {
  dateTime: {
    short: {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    },
    long: {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    },
  },
} satisfies Formats;

export default getRequestConfig(async ({ requestLocale }) => {
  const requestedLocale = await requestLocale;
  const locale = hasLocale(routing.locales, requestedLocale)
    ? requestedLocale
    : routing.defaultLocale;

  return {
    locale,
    messages: await loadMessages(locale),
    formats,
    onError(error) {
      if (error.code === IntlErrorCode.MISSING_MESSAGE) {
        onIntlError(error);
        return;
      }

      onIntlError(error);
    },
    getMessageFallback({ namespace, key }) {
      return getIntlMessageFallback({ namespace, key });
    },
  };
});
