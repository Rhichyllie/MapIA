import ptBRMessages from "@/messages/pt-BR.json";

export type EditorTranslationValues = Record<
  string,
  string | number | boolean | Date | null | undefined
>;

export type EditorTranslationFn = (
  key: string,
  values?: EditorTranslationValues,
) => string;

type EditorCatalog = typeof ptBRMessages.Editor;

const baseEditorCatalog = ptBRMessages.Editor as EditorCatalog as Record<string, unknown>;
const missingEditorMessages = new Set<string>();

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

function getEditorMessageByPath(
  catalog: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = key.split(".").reduce<unknown>((current, segment) => {
    if (Array.isArray(current)) {
      const index = Number(segment);
      return Number.isInteger(index) ? current[index] : undefined;
    }

    if (!current || typeof current !== "object") {
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

function shouldRevealMissingEditorMessage() {
  return process.env.NODE_ENV !== "production";
}

function shouldLogMissingEditorMessage() {
  return process.env.NODE_ENV !== "test";
}

function reportMissingEditorMessage(key: string) {
  const fullKey = `Editor.${key}`;
  if (missingEditorMessages.has(fullKey)) {
    return;
  }

  missingEditorMessages.add(fullKey);

  if (shouldLogMissingEditorMessage()) {
    console.warn(`[i18n] Missing editor message: ${fullKey}`);
  }
}

export function getEditorMessageTemplate(key: string) {
  return getEditorMessageByPath(baseEditorCatalog, key);
}

export function getEditorBaseMessage(
  key: string,
  values?: EditorTranslationValues,
) {
  const template = getEditorMessageTemplate(key);
  if (template) {
    return formatEditorTemplate(template, values);
  }

  reportMissingEditorMessage(key);
  return shouldRevealMissingEditorMessage()
    ? `[missing] Editor.${key}`
    : humanizeKey(key);
}

export function translateEditor(
  t: EditorTranslationFn | undefined,
  key: string,
  fallbackOrValues?: string | EditorTranslationValues,
  maybeValues?: EditorTranslationValues,
) {
  const fallback =
    typeof fallbackOrValues === "string" ? fallbackOrValues : undefined;
  const values =
    typeof fallbackOrValues === "string" ? maybeValues : fallbackOrValues;

  if (!t) {
    return fallback
      ? formatEditorTemplate(fallback, values)
      : getEditorBaseMessage(key, values);
  }

  const result = t(key, values);
  if (!isMissingEditorMessage(result, key)) {
    return result;
  }

  return fallback
    ? formatEditorTemplate(fallback, values)
    : getEditorBaseMessage(key, values);
}
