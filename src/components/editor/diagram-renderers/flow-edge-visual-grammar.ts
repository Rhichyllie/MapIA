import { MarkerType } from "@xyflow/react";
import type { EdgeKind } from "@/src/domain";
import type { DiagramRole } from "@/src/modules/diagrams/domain";

type FlowRendererDirection = "left-right" | "top-down";

type ProcessDiagramRole =
  | "flow-start"
  | "flow-step"
  | "flow-decision"
  | "flow-end"
  | "flow-note";

export type FlowEdgeVisualRole =
  | "main"
  | "decision"
  | "alternate"
  | "reference";

export type FlowEdgeLabelPlacement = "center" | "source" | "target";

export type FlowEdgeVisualSemantics = {
  role: FlowEdgeVisualRole;
  labelPlacement: FlowEdgeLabelPlacement;
  markerType: MarkerType;
  markerColor: string;
  labelTextColor: string;
  labelBackgroundColor: string;
  labelBorderColor: string;
  labelFontSize: string;
  labelFontWeight: number;
  labelLetterSpacing: string;
  labelBgPadding: [number, number];
  labelBgBorderRadius: number;
  strokeDasharray?: string;
  classNameTokens: string[];
};

function normalizeProcessRole(
  role: DiagramRole | undefined,
): ProcessDiagramRole | undefined {
  if (
    role === "flow-start" ||
    role === "flow-step" ||
    role === "flow-decision" ||
    role === "flow-end" ||
    role === "flow-note"
  ) {
    return role;
  }

  return undefined;
}

function normalizeEdgeLabel(label: string | undefined) {
  return label
    ?.normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

function measurePrimaryDelta(
  direction: FlowRendererDirection,
  sourcePosition: { x: number; y: number } | undefined,
  targetPosition: { x: number; y: number } | undefined,
) {
  if (!sourcePosition || !targetPosition) {
    return 0;
  }

  return direction === "top-down"
    ? Math.abs(targetPosition.y - sourcePosition.y)
    : Math.abs(targetPosition.x - sourcePosition.x);
}

function measureSecondaryDelta(
  direction: FlowRendererDirection,
  sourcePosition: { x: number; y: number } | undefined,
  targetPosition: { x: number; y: number } | undefined,
) {
  if (!sourcePosition || !targetPosition) {
    return 0;
  }

  return direction === "top-down"
    ? Math.abs(targetPosition.x - sourcePosition.x)
    : Math.abs(targetPosition.y - sourcePosition.y);
}

function looksLikeAlternateOutcome(label: string | undefined) {
  const normalizedLabel = normalizeEdgeLabel(label);
  if (!normalizedLabel) {
    return false;
  }

  return (
    normalizedLabel.includes("exce") ||
    normalizedLabel.includes("erro") ||
    normalizedLabel.includes("falha") ||
    normalizedLabel.includes("escal") ||
    normalizedLabel.includes("manual") ||
    normalizedLabel.includes("ajuste")
  );
}

function resolveDecisionOutcomeClass(label: string | undefined) {
  const normalizedLabel = normalizeEdgeLabel(label);
  if (!normalizedLabel) {
    return "editor-edge-flow-outcome-branch";
  }

  if (
    normalizedLabel === "nao" ||
    normalizedLabel === "não" ||
    normalizedLabel.includes("seguir") ||
    normalizedLabel.includes("direto") ||
    normalizedLabel.includes("ok")
  ) {
    return "editor-edge-flow-outcome-main";
  }

  return "editor-edge-flow-outcome-branch";
}

function resolveAlternateEdgeClass(
  targetRole: ProcessDiagramRole | undefined,
  label: string | undefined,
) {
  if (targetRole === "flow-end") {
    return "editor-edge-flow-outcome-terminal";
  }

  if (looksLikeAlternateOutcome(label)) {
    return "editor-edge-flow-outcome-exception";
  }

  return "editor-edge-flow-outcome-return";
}

export function resolveFlowEdgeVisualSemantics(input: {
  edgeKind: EdgeKind;
  label?: string;
  sourceRole?: DiagramRole;
  targetRole?: DiagramRole;
  sourcePosition?: { x: number; y: number };
  targetPosition?: { x: number; y: number };
  direction?: FlowRendererDirection;
}): FlowEdgeVisualSemantics {
  const direction = input.direction ?? "left-right";
  const sourceRole = normalizeProcessRole(input.sourceRole);
  const targetRole = normalizeProcessRole(input.targetRole);
  const primaryDelta = measurePrimaryDelta(
    direction,
    input.sourcePosition,
    input.targetPosition,
  );
  const secondaryDelta = measureSecondaryDelta(
    direction,
    input.sourcePosition,
    input.targetPosition,
  );
  const isCrossLane = secondaryDelta >= 132 && primaryDelta >= 120;
  const isDecisionPath =
    sourceRole === "flow-decision" &&
    (input.edgeKind === "flows-to" || input.edgeKind === "depends-on");

  if (input.edgeKind === "references") {
    const sourceAnchorsNote = sourceRole === "flow-note";

    return {
      role: "reference",
      labelPlacement: sourceAnchorsNote ? "source" : "target",
      markerType: MarkerType.Arrow,
      markerColor: "var(--flow-edge-note)",
      labelTextColor: "var(--flow-edge-note-label-text)",
      labelBackgroundColor: "var(--flow-edge-note-label-bg)",
      labelBorderColor: "var(--flow-edge-note-label-border)",
      labelFontSize: "0.72rem",
      labelFontWeight: 760,
      labelLetterSpacing: "0.04em",
      labelBgPadding: [11, 6],
      labelBgBorderRadius: 10,
      strokeDasharray: "4 10",
      classNameTokens: [
        "editor-edge-flow-role-reference",
        sourceAnchorsNote
          ? "editor-edge-flow-label-source"
          : "editor-edge-flow-label-target",
      ],
    };
  }

  if (isDecisionPath) {
    const outcomeClass = resolveDecisionOutcomeClass(input.label);
    const strokeDasharray =
      input.edgeKind === "depends-on" ||
      outcomeClass !== "editor-edge-flow-outcome-main"
        ? "12 8"
        : undefined;

    return {
      role: "decision",
      labelPlacement: "source",
      markerType: MarkerType.ArrowClosed,
      markerColor: "var(--flow-edge-branch)",
      labelTextColor: "var(--flow-edge-branch-label-text)",
      labelBackgroundColor: "var(--flow-edge-branch-label-bg)",
      labelBorderColor: "var(--flow-edge-branch-label-border)",
      labelFontSize: "0.76rem",
      labelFontWeight: 840,
      labelLetterSpacing: "0.055em",
      labelBgPadding: [14, 7],
      labelBgBorderRadius: 13,
      strokeDasharray,
      classNameTokens: [
        "editor-edge-flow-role-decision",
        outcomeClass,
        "editor-edge-flow-label-source",
      ],
    };
  }

  if (
    input.edgeKind === "depends-on" ||
    (input.edgeKind === "flows-to" &&
      sourceRole !== "flow-start" &&
      sourceRole !== "flow-decision" &&
      isCrossLane)
  ) {
    return {
      role: "alternate",
      labelPlacement: "target",
      markerType: MarkerType.ArrowClosed,
      markerColor: "var(--flow-edge-alternate)",
      labelTextColor: "var(--flow-edge-alternate-label-text)",
      labelBackgroundColor: "var(--flow-edge-alternate-label-bg)",
      labelBorderColor: "var(--flow-edge-alternate-label-border)",
      labelFontSize: "0.73rem",
      labelFontWeight: 790,
      labelLetterSpacing: "0.05em",
      labelBgPadding: [12, 6],
      labelBgBorderRadius: 12,
      strokeDasharray: "15 8 4 8",
      classNameTokens: [
        "editor-edge-flow-role-alternate",
        resolveAlternateEdgeClass(targetRole, input.label),
        "editor-edge-flow-label-target",
      ],
    };
  }

  return {
    role: "main",
    labelPlacement: targetRole === "flow-end" ? "target" : "center",
    markerType: MarkerType.ArrowClosed,
    markerColor: "var(--flow-edge-main)",
    labelTextColor: "var(--flow-edge-main-label-text)",
    labelBackgroundColor: "var(--flow-edge-main-label-bg)",
    labelBorderColor: "var(--flow-edge-main-label-border)",
    labelFontSize: "0.74rem",
    labelFontWeight: 820,
    labelLetterSpacing: "0.05em",
    labelBgPadding: [12, 6],
    labelBgBorderRadius: 13,
    classNameTokens: [
      "editor-edge-flow-role-main",
      targetRole === "flow-end"
        ? "editor-edge-flow-outcome-terminal"
        : "editor-edge-flow-outcome-main",
      targetRole === "flow-end"
        ? "editor-edge-flow-label-target"
        : "editor-edge-flow-label-center",
    ],
  };
}
