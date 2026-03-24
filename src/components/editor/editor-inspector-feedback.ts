import { ZodError } from "zod";
import {
  getEditorBaseMessage,
  translateEditor,
  type EditorTranslationFn,
} from "./editor-i18n";

export type InspectorFieldErrors = Partial<
  Record<"label" | "kind" | "dataJson", string>
>;

type InspectorIssue = ZodError["issues"][number];

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
    return translateEditor(t, "inspectorFeedback.invalidKind");
  }

  if (field === "dataJson" && isJsonRelatedMessage(issue.message)) {
    if (issue.message.toLowerCase().includes("objeto json")) {
      return translateEditor(t, "inspectorFeedback.jsonObjectRequired");
    }

    if (
      issue.message.toLowerCase().includes("linha") &&
      issue.message.toLowerCase().includes("coluna")
    ) {
      return issue.message;
    }

    return translateEditor(t, "inspectorFeedback.invalidJson");
  }

  if (field === "label" && issue.code === "too_small") {
    return translateEditor(t, "inspectorFeedback.labelRequired");
  }

  return issue.message || translateEditor(t, "inspectorFeedback.reviewFields");
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
  fallback = getEditorBaseMessage("inspectorFeedback.defaultValidationMessage"),
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
      return translateEditor(t, "inspectorFeedback.reviewFields");
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
  fallback = getEditorBaseMessage("inspectorFeedback.defaultValidationMessage"),
  t?: EditorTranslationFn,
) {
  return {
    fieldErrors: extractFriendlyInspectorFieldErrors(error, t),
    message: getFriendlyInspectorMessage(error, fallback, t),
  };
}
