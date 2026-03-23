import { IntlErrorCode, type IntlError } from "next-intl";

function getMessagePath(namespace: string | undefined, key: string) {
  return [namespace, key].filter(Boolean).join(".");
}

export function onIntlError(error: IntlError) {
  if (error.code === IntlErrorCode.MISSING_MESSAGE) {
    console.warn(error);
    return;
  }

  console.error(error);
}

export function getIntlMessageFallback(input: {
  namespace?: string;
  key: string;
}) {
  return getMessagePath(input.namespace, input.key);
}
