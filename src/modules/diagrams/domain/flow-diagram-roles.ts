import type { NodeKind } from "@/src/domain";

export type FlowDiagramRole =
  | "flow-start"
  | "flow-step"
  | "flow-note"
  | "flow-end"
  | "flow-decision";

function normalizeFlowNodeLabel(label: string | undefined) {
  return label
    ?.normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

function inferFlowDiagramRoleFromLabel(label: string | undefined): FlowDiagramRole | null {
  const normalized = normalizeFlowNodeLabel(label);

  if (!normalized) {
    return null;
  }

  if (
    normalized === "inicio" ||
    normalized.startsWith("inicio ") ||
    normalized.startsWith("inicio:")
  ) {
    return "flow-start";
  }

  if (
    normalized === "fim" ||
    normalized.startsWith("fim ") ||
    normalized.startsWith("fim:") ||
    normalized === "final" ||
    normalized.startsWith("final ")
  ) {
    return "flow-end";
  }

  if (normalized.includes("decis")) {
    return "flow-decision";
  }

  return null;
}

export function resolveFlowDiagramRole(input: {
  explicitRole?: string;
  nodeKind: NodeKind;
  nodeLabel?: string;
}): FlowDiagramRole {
  if (input.nodeKind === "project") {
    return "flow-start";
  }

  if (input.nodeKind === "note") {
    return "flow-note";
  }

  if (
    input.explicitRole === "flow-start" ||
    input.explicitRole === "flow-step" ||
    input.explicitRole === "flow-note" ||
    input.explicitRole === "flow-end" ||
    input.explicitRole === "flow-decision"
  ) {
    return input.explicitRole;
  }

  return inferFlowDiagramRoleFromLabel(input.nodeLabel) ?? "flow-step";
}
