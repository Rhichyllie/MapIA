import type {
  ErdDiagnostic,
  ErdDiagnosticSeverity,
  ErdDiagnosticTarget,
  ErdSuggestedFix,
  ErdValidationLevel,
} from "./types";

type BuildDiagnosticInput = {
  code: string;
  severity: ErdDiagnosticSeverity;
  message: string;
  explanation: string;
  target: ErdDiagnosticTarget;
  suggestedFixes?: ErdSuggestedFix[];
};

export function buildErdDiagnosticId(input: {
  code: string;
  target: ErdDiagnosticTarget;
  index: number;
}) {
  if (input.target.type === "graph") {
    return `${input.code}:graph:${input.index}`;
  }
  if (input.target.type === "relation") {
    return `${input.code}:relation:${input.target.relationId}:${input.index}`;
  }
  if (input.target.type === "entity") {
    return `${input.code}:entity:${input.target.entityId}:${input.index}`;
  }

  return `${input.code}:field:${input.target.entityId}:${input.target.fieldId}:${input.index}`;
}

export function makeErdDiagnostic(
  input: BuildDiagnosticInput & { index: number },
): ErdDiagnostic {
  return {
    id: buildErdDiagnosticId({
      code: input.code,
      target: input.target,
      index: input.index,
    }),
    code: input.code,
    severity: input.severity,
    message: input.message,
    explanation: input.explanation,
    target: input.target,
    suggestedFixes: input.suggestedFixes ?? [],
  };
}

export function severityByValidationLevel(input: {
  level: ErdValidationLevel;
  guided: ErdDiagnosticSeverity;
  strict: ErdDiagnosticSeverity;
  draft?: ErdDiagnosticSeverity;
}) {
  if (input.level === "strict") {
    return input.strict;
  }

  if (input.level === "guided") {
    return input.guided;
  }

  return input.draft ?? "info";
}
