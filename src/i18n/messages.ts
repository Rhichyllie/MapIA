import ptBRMessages from "@/messages/pt-BR.json";
import enUSMessages from "@/messages/en-US.json";
import { routing, type AppLocale } from "./routing";

type MessageDictionary = Record<string, unknown>;

type DeepStringifyMessages<T> = T extends string
  ? string
  : T extends readonly unknown[]
    ? T
    : T extends Record<string, unknown>
      ? { [Key in keyof T]: DeepStringifyMessages<T[Key]> }
      : T;

function isMessageDictionary(value: unknown): value is MessageDictionary {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function mergeMessagesWithFallback<T extends MessageDictionary>(
  base: T,
  overrides: Partial<T>,
): T {
  const keys = new Set([
    ...Object.keys(base),
    ...Object.keys(overrides as MessageDictionary),
  ]);

  const entries = [...keys].map((key) => {
    const baseValue = base[key];
    const overrideValue = (overrides as MessageDictionary)[key];

    if (isMessageDictionary(baseValue) && isMessageDictionary(overrideValue)) {
      return [key, mergeMessagesWithFallback(baseValue, overrideValue)];
    }

    if (isMessageDictionary(baseValue) && overrideValue === undefined) {
      return [key, baseValue];
    }

    if (baseValue === undefined && isMessageDictionary(overrideValue)) {
      return [key, mergeMessagesWithFallback({}, overrideValue)];
    }

    return [key, overrideValue ?? baseValue];
  });

  return Object.fromEntries(entries) as T;
}

const ptBRCatalog = ptBRMessages;
const enUSCatalog = enUSMessages;

export type AppMessages = DeepStringifyMessages<typeof ptBRCatalog>;

const catalogs = {
  "pt-BR": ptBRCatalog,
  "en-US": enUSCatalog,
} as const satisfies Record<AppLocale, MessageDictionary>;

export async function loadMessages(locale: AppLocale): Promise<AppMessages> {
  const baseMessages = ptBRCatalog as AppMessages;

  if (locale === routing.defaultLocale) {
    return baseMessages;
  }

  return mergeMessagesWithFallback(
    baseMessages,
    catalogs[locale] as Partial<AppMessages>,
  );
}
