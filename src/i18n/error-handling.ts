import { IntlErrorCode, type IntlError } from "next-intl";

const reportedMissingMessages = new Set<string>();

function getMessagePath(namespace: string | undefined, key: string) {
  return [namespace, key].filter(Boolean).join(".");
}

function shouldRevealMissingMessage() {
  return process.env.NODE_ENV !== "production";
}

export function onIntlError(error: IntlError) {
  if (error.code === IntlErrorCode.MISSING_MESSAGE) {
    const messagePath = error.message;

    if (messagePath && !reportedMissingMessages.has(messagePath)) {
      reportedMissingMessages.add(messagePath);
      console.warn(`[i18n] Missing message: ${messagePath}`);
    }
    return;
  }

  console.error(error);
}

export function getIntlMessageFallback(input: {
  namespace?: string;
  key: string;
}) {
  const messagePath = getMessagePath(input.namespace, input.key);
  return shouldRevealMissingMessage()
    ? `[missing] ${messagePath}`
    : messagePath;
}
