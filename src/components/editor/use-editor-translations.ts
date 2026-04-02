import { useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  getEditorBaseMessage,
  isMissingEditorMessage,
  type EditorTranslationFn,
} from "./editor-i18n";

export function useEditorTranslations(namespace?: string): EditorTranslationFn {
  const baseT = useTranslations(
    (namespace ? `Editor.${namespace}` : "Editor") as never,
  ) as unknown as EditorTranslationFn;

  return useCallback<EditorTranslationFn>(
    (key, values) => {
      const result = baseT(key, values);
      if (isMissingEditorMessage(result, key)) {
        const fullKey = namespace ? `${namespace}.${key}` : key;
        return getEditorBaseMessage(fullKey, values);
      }

      return result;
    },
    [baseT, namespace],
  );
}
