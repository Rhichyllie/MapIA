import { ZodError } from "zod";

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
): string {
  if (field === "kind") {
    return KIND_INVALID_MESSAGE;
  }

  if (field === "dataJson" && isJsonRelatedMessage(issue.message)) {
    if (issue.message.toLowerCase().includes("objeto json")) {
      return "Dados devem ser um objeto JSON (chave/valor).";
    }

    if (
      issue.message.toLowerCase().includes("linha") &&
      issue.message.toLowerCase().includes("coluna")
    ) {
      return issue.message;
    }

    return JSON_INVALID_MESSAGE;
  }

  if (field === "label" && issue.code === "too_small") {
    return LABEL_REQUIRED_MESSAGE;
  }

  return issue.message || REVIEW_FIELDS_MESSAGE;
}

export function extractFriendlyInspectorFieldErrors(
  error: unknown,
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

    next[field] ??= normalizeIssueMessage(field, issue);
  }

  return next;
}

export function getFriendlyInspectorMessage(
  error: unknown,
  fallback = DEFAULT_INSPECTOR_VALIDATION_MESSAGE,
): string {
  if (error instanceof ZodError) {
    const fieldErrors = extractFriendlyInspectorFieldErrors(error);
    const messages = Object.values(fieldErrors);

    if (fieldErrors.dataJson) {
      return fieldErrors.dataJson;
    }

    if (messages.length === 1) {
      return messages[0]!;
    }

    if (messages.length > 1) {
      return REVIEW_FIELDS_MESSAGE;
    }

    return fallback;
  }

  if (
    error instanceof Error &&
    error.message &&
    !isLikelySerializedErrorMessage(error.message)
  ) {
    return error.message;
  }

  return fallback;
}

export function getFriendlyInspectorFeedback(
  error: unknown,
  fallback = DEFAULT_INSPECTOR_VALIDATION_MESSAGE,
) {
  return {
    fieldErrors: extractFriendlyInspectorFieldErrors(error),
    message: getFriendlyInspectorMessage(error, fallback),
  };
}
