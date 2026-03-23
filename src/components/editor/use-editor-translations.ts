import { useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import ptBREditorMessages from "@/messages/editor/pt-BR";
import enUSEditorMessages from "@/messages/editor/en-US";
import {
  formatEditorTemplate,
  isMissingEditorMessage,
  type EditorTranslationFn,
  type EditorTranslationValues,
} from "./editor-i18n";

type EditorCatalog = typeof ptBREditorMessages;

function getEditorCatalog(locale: string) {
  return locale === "en-US" ? enUSEditorMessages : ptBREditorMessages;
}

function getMessageByPath(
  catalog: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = key.split(".").reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }

    return (current as Record<string, unknown>)[segment];
  }, catalog);

  return typeof value === "string" ? value : undefined;
}

function humanizeSegment(segment: string) {
  return segment
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .trim();
}

function humanizeKey(key: string) {
  const normalized = key.split(".").at(-1) ?? key;
  const humanized = humanizeSegment(normalized);
  return humanized
    ? humanized.charAt(0).toUpperCase() + humanized.slice(1)
    : key;
}

export function getEditorFallbackMessage(
  locale: string,
  key: string,
  values?: EditorTranslationValues,
) {
  const catalog = getEditorCatalog(locale) as EditorCatalog as Record<string, unknown>;
  const template = getMessageByPath(catalog, key) ?? humanizeKey(key);

  return formatEditorTemplate(template, values);
}

export function useEditorTranslations(namespace?: string): EditorTranslationFn {
  const locale = useLocale();
  const baseT = useTranslations(
    (namespace ? `Editor.${namespace}` : "Editor") as never,
  ) as unknown as EditorTranslationFn;

  return useCallback<EditorTranslationFn>(
    (key, values) => {
      const result = baseT(key, values);
      if (isMissingEditorMessage(result, key)) {
        const fullKey = namespace ? `${namespace}.${key}` : key;
        return getEditorFallbackMessage(locale, fullKey, values);
      }

      return result;
    },
    [baseT, locale, namespace],
  );
}
