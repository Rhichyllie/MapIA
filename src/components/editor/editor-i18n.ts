export type EditorTranslationValues = Record<
  string,
  string | number | boolean | Date | null | undefined
>;

export type EditorTranslationFn = (
  key: string,
  values?: EditorTranslationValues,
) => string;

export function formatEditorTemplate(
  template: string,
  values?: EditorTranslationValues,
) {
  if (!values) {
    return template;
  }

  return template.replace(/\{([^}]+)\}/g, (_, token: string) => {
    const value = values[token];
    if (value === undefined || value === null) {
      return "";
    }

    return value instanceof Date ? value.toISOString() : String(value);
  });
}

export function isMissingEditorMessage(result: string, key: string) {
  return result === key || result === `Editor.${key}`;
}

export function translateEditor(
  t: EditorTranslationFn | undefined,
  key: string,
  fallback: string,
  values?: EditorTranslationValues,
) {
  if (!t) {
    return formatEditorTemplate(fallback, values);
  }

  const result = t(key, values);
  return isMissingEditorMessage(result, key)
    ? formatEditorTemplate(fallback, values)
    : result;
}
