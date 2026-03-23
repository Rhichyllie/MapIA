import { ZodError } from "zod";
import { translateEditor, type EditorTranslationFn } from "./editor-i18n";

export type InspectorFieldErrors = Partial<
  Record<"label" | "kind" | "dataJson", string>
>;

type InspectorIssue = ZodError["issues"][number];

const DEFAULT_INSPECTOR_VALIDATION_MESSAGE =
  "Nao foi possivel validar o formulario.";
const REVIEW_FIELDS_MESSAGE = "Revise os campos com erro.";
const JSON_INVALID_MESSAGE = "JSON invalido. Verifique chaves, virgulas e aspas.";
const KIND_INVALID_MESSAGE = "Tipo invalido.";
const LABEL_REQUIRED_MESSAGE = "Rotulo e obrigatorio.";

function normalizePathKey(issue: InspectorIssue): keyof InspectorFieldErrors | null {
  const key = issue.path[0];

  if (key === "label" || key === "kind" || key === "dataJson") {
    return key;
  }

  if (typeof issue.message === "string" && isJsonRelatedMessage(issue.message)) {
    return "dataJson";
  }

  return null;
}

function isJsonRelatedMessage(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("json invalido") ||
    normalized.includes("json inválido") ||
    normalized.includes("objeto json")
  );
}

function isLikelySerializedErrorMessage(message: string) {
  const trimmed = message.trim();

  if (!trimmed) {
    return false;
  }

  return (
    (trimmed.startsWith("[") && trimmed.includes("\"message\"")) ||
    (trimmed.startsWith("{") && trimmed.includes("\"issues\""))
  );
}

function normalizeIssueMessage(
  field: keyof InspectorFieldErrors,
  issue: InspectorIssue,
  t?: EditorTranslationFn,
): string {
  if (field === "kind") {
    return translateEditor(
      t,
      "inspectorFeedback.invalidKind",
      KIND_INVALID_MESSAGE,
    );
  }

  if (field === "dataJson" && isJsonRelatedMessage(issue.message)) {
    if (issue.message.toLowerCase().includes("objeto json")) {
      return translateEditor(
        t,
        "inspectorFeedback.jsonObjectRequired",
        "Dados devem ser um objeto JSON (chave/valor).",
      );
    }

    if (
      issue.message.toLowerCase().includes("linha") &&
      issue.message.toLowerCase().includes("coluna")
    ) {
      return issue.message;
    }

    return translateEditor(
      t,
      "inspectorFeedback.invalidJson",
      JSON_INVALID_MESSAGE,
    );
  }

  if (field === "label" && issue.code === "too_small") {
    return translateEditor(
      t,
      "inspectorFeedback.labelRequired",
      LABEL_REQUIRED_MESSAGE,
    );
  }

  return issue.message || translateEditor(
    t,
    "inspectorFeedback.reviewFields",
    REVIEW_FIELDS_MESSAGE,
  );
}

export function extractFriendlyInspectorFieldErrors(
  error: unknown,
  t?: EditorTranslationFn,
): InspectorFieldErrors {
  if (!(error instanceof ZodError)) {
    return {};
  }

  const next: InspectorFieldErrors = {};

  for (const issue of error.issues) {
    const field = normalizePathKey(issue);

    if (!field) {
      continue;
    }

    next[field] ??= normalizeIssueMessage(field, issue, t);
  }

  return next;
}

export function getFriendlyInspectorMessage(
  error: unknown,
  fallback = DEFAULT_INSPECTOR_VALIDATION_MESSAGE,
  t?: EditorTranslationFn,
): string {
  if (error instanceof ZodError) {
    const fieldErrors = extractFriendlyInspectorFieldErrors(error, t);
    const messages = Object.values(fieldErrors);

    if (fieldErrors.dataJson) {
      return fieldErrors.dataJson;
    }

    if (messages.length === 1) {
      return messages[0]!;
    }

    if (messages.length > 1) {
      return translateEditor(t, "inspectorFeedback.reviewFields", REVIEW_FIELDS_MESSAGE);
    }

    return translateEditor(
      t,
      "inspectorFeedback.defaultValidationMessage",
      fallback,
    );
  }

  if (
    error instanceof Error &&
    error.message &&
    !isLikelySerializedErrorMessage(error.message)
  ) {
    return error.message;
  }

  return translateEditor(
    t,
    "inspectorFeedback.defaultValidationMessage",
    fallback,
  );
}

export function getFriendlyInspectorFeedback(
  error: unknown,
  fallback = DEFAULT_INSPECTOR_VALIDATION_MESSAGE,
  t?: EditorTranslationFn,
) {
  return {
    fieldErrors: extractFriendlyInspectorFieldErrors(error, t),
    message: getFriendlyInspectorMessage(error, fallback, t),
  };
}
