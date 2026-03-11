import type { ErdNamingStyle } from "./types";

function wordsFromSource(source: string) {
  return source
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function toCamelCase(source: string) {
  const words = wordsFromSource(source);
  if (words.length === 0) {
    return "";
  }

  return words
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index === 0) {
        return lower;
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");
}

function toPascalCase(source: string) {
  const words = wordsFromSource(source);
  if (words.length === 0) {
    return "";
  }

  return words
    .map((word) => {
      const lower = word.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");
}

function toSnakeCase(source: string) {
  return wordsFromSource(source)
    .map((word) => word.toLowerCase())
    .join("_");
}

export function applyNamingStyle(source: string, style: ErdNamingStyle) {
  if (style === "snake") {
    return toSnakeCase(source);
  }

  return toCamelCase(source);
}

export function suggestEntityName(input: { label?: string; fallbackIndex?: number }) {
  const fromLabel = toPascalCase(input.label ?? "");
  if (fromLabel) {
    return fromLabel;
  }

  if (typeof input.fallbackIndex === "number" && input.fallbackIndex > 0) {
    return `Entity${input.fallbackIndex}`;
  }

  return "Entity";
}

export function suggestFieldName(input: {
  sourceEntityLabel?: string;
  namingStyle: ErdNamingStyle;
}) {
  const base = input.sourceEntityLabel?.trim()
    ? `${input.sourceEntityLabel} id`
    : "reference id";

  const normalized = applyNamingStyle(base, input.namingStyle);
  return normalized || "referenceId";
}

export function suggestRelationName(input: {
  sourceLabel?: string;
  targetLabel?: string;
  fallback: string;
}) {
  const source = toCamelCase(input.sourceLabel ?? "");
  const target = toPascalCase(input.targetLabel ?? "");
  const concatenated = `${source}${target}`.trim();

  if (concatenated) {
    return concatenated;
  }

  return toCamelCase(input.fallback) || "relation";
}

export function suggestAssociativeEntityName(input: {
  sourceLabel?: string;
  targetLabel?: string;
}) {
  const source = toPascalCase(input.sourceLabel ?? "");
  const target = toPascalCase(input.targetLabel ?? "");

  if (source && target) {
    return `${source}${target}`;
  }

  return source || target || "JoinEntity";
}
