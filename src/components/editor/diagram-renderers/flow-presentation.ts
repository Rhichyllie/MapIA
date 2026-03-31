import {
  BackgroundVariant,
  ConnectionLineType,
  MarkerType,
  Position,
  type DefaultEdgeOptions,
} from "@xyflow/react";
import type { EdgeKind } from "@/src/domain";
import type { EditorNodeData } from "../editor-graph-mappers";
import type { EditorTranslationFn } from "../editor-i18n";
import {
  getProcessRoleMeta,
  resolveProcessNodeRole,
  type ProcessNodeRole,
} from "../presentation/process-semantics";

type FlowHandleVisibility = {
  showSourceHandle: boolean;
  showTargetHandle: boolean;
};

type FlowNodeCanvasSemantics = FlowHandleVisibility & {
  visualWeight: "primary" | "supporting" | "terminal";
  notation:
    | "start-event"
    | "activity"
    | "gateway"
    | "end-event"
    | "artifact";
};

type FlowEdgeSemanticKey = Extract<EdgeKind, "flows-to" | "depends-on" | "references">;

type FlowEdgeSemantic = {
  semanticLabel: string;
  markerType: MarkerType;
  colorToken: "--flow-edge-main" | "--flow-edge-branch" | "--flow-edge-note";
};

export type FlowNodePresentation = FlowHandleVisibility & {
  variant: ProcessNodeRole;
  eyebrowLabel: string;
  roleLabel: string;
  summary: string;
  visualWeight: FlowNodeCanvasSemantics["visualWeight"];
  notation: FlowNodeCanvasSemantics["notation"];
};

const FLOW_NODE_VARIANT_PRESENTATION: Record<ProcessNodeRole, FlowNodeCanvasSemantics> = {
  "flow-start": {
    visualWeight: "terminal",
    notation: "start-event",
    showSourceHandle: true,
    showTargetHandle: false,
  },
  "flow-step": {
    visualWeight: "primary",
    notation: "activity",
    showSourceHandle: true,
    showTargetHandle: true,
  },
  "flow-decision": {
    visualWeight: "primary",
    notation: "gateway",
    showSourceHandle: true,
    showTargetHandle: true,
  },
  "flow-end": {
    visualWeight: "terminal",
    notation: "end-event",
    showSourceHandle: false,
    showTargetHandle: true,
  },
  "flow-note": {
    visualWeight: "supporting",
    notation: "artifact",
    showSourceHandle: true,
    showTargetHandle: true,
  },
};

const FLOW_EDGE_SEMANTICS: Record<FlowEdgeSemanticKey, FlowEdgeSemantic> = {
  "flows-to": {
    semanticLabel: "principal",
    markerType: MarkerType.ArrowClosed,
    colorToken: "--flow-edge-main",
  },
  "depends-on": {
    semanticLabel: "condicional",
    markerType: MarkerType.ArrowClosed,
    colorToken: "--flow-edge-branch",
  },
  references: {
    semanticLabel: "apoio",
    markerType: MarkerType.Arrow,
    colorToken: "--flow-edge-note",
  },
};

export const FLOW_EDGE_PRESENTATION: Record<
  FlowEdgeSemanticKey,
  FlowEdgeSemantic & {
    markerColor: string;
  }
> = Object.fromEntries(
  Object.entries(FLOW_EDGE_SEMANTICS).map(([kind, semantic]) => [
    kind,
    {
      ...semantic,
      markerColor: `var(${semantic.colorToken})`,
    },
  ]),
) as Record<
  FlowEdgeSemanticKey,
  FlowEdgeSemantic & {
    markerColor: string;
  }
>;

export function resolveFlowEdgeMarker(kind: EdgeKind) {
  const semantic =
    kind === "flows-to" || kind === "depends-on" || kind === "references"
      ? FLOW_EDGE_PRESENTATION[kind]
      : null;

  if (!semantic) {
    return undefined;
  }

  return {
    type: semantic.markerType,
    color: semantic.markerColor,
  } as const;
}

const FLOW_DEFAULT_EDGE_OPTIONS: DefaultEdgeOptions = {
  type: "parallelBezier",
  className: "editor-edge editor-edge-flow",
  animated: false,
  markerEnd: resolveFlowEdgeMarker("flows-to"),
};

export const FLOW_RENDERER_PRESENTATION = {
  defaultEdgeOptions: FLOW_DEFAULT_EDGE_OPTIONS,
  background: {
    variant: BackgroundVariant.Lines,
    gap: 40,
    className: "editor-canvas-background-flow",
  },
  minimapClassName: "editor-minimap editor-minimap-flow",
  canvasClassName: "canvas-frame canvas-frame-flow",
  connectionLineType: ConnectionLineType.SmoothStep,
} as const;

export function resolveFlowHandlePosition(direction: EditorNodeData["rendererDirection"]) {
  if (direction === "top-down") {
    return {
      source: Position.Bottom,
      target: Position.Top,
    } as const;
  }

  return {
    source: Position.Right,
    target: Position.Left,
  } as const;
}

export function resolveFlowNodePresentation(input: {
  diagramRole?: EditorNodeData["diagramRole"];
  kind: EditorNodeData["kind"];
  label: string;
  t?: EditorTranslationFn;
}): FlowNodePresentation {
  const variant = resolveProcessNodeRole({
    diagramRole: input.diagramRole,
    kind: input.kind,
    label: input.label,
  });
  const meta = getProcessRoleMeta(variant, input.t);
  const semantics = FLOW_NODE_VARIANT_PRESENTATION[variant];

  return {
    variant,
    eyebrowLabel: meta.badgeLabel,
    roleLabel: meta.kindLabel,
    summary: meta.canvasHint,
    visualWeight: semantics.visualWeight,
    notation: semantics.notation,
    showSourceHandle: semantics.showSourceHandle,
    showTargetHandle: semantics.showTargetHandle,
  };
}
