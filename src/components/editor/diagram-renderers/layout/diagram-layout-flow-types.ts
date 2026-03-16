import type { NodeKind } from "@/src/domain";
import type { DiagramRole } from "@/src/modules/diagrams/domain";
import type { DiagramLayoutNode } from "./diagram-layout";

export type FlowDirection = "top-down" | "left-right";
export type FlowInsertMode = "default" | "flow-next-step" | "flow-branch" | "flow-note";
export type FlowContextualInsertMode = Exclude<FlowInsertMode, "default">;

export type FlowNodeVariant =
  | "flow-start"
  | "flow-step"
  | "flow-decision"
  | "flow-end"
  | "flow-note";

export type FlowFootprint = {
  width: number;
  height: number;
  paddingPrimary: number;
  paddingSecondary: number;
};

export type FlowLogicalFootprint = {
  primarySpan: number;
  secondarySpan: number;
  paddingPrimary: number;
  paddingSecondary: number;
};

export type FlowLogicalBox = {
  primaryStart: number;
  primaryEnd: number;
  secondaryStart: number;
  secondaryEnd: number;
};

export type FlowLogicalPosition = {
  primary: number;
  secondary: number;
};

export type FlowPlacementKind = "main" | "branch" | "note";

export type FlowTopology = {
  orderedNodes: DiagramLayoutNode[];
  nodeMap: Map<string, DiagramLayoutNode>;
  nonNoteNodes: DiagramLayoutNode[];
  noteNodes: DiagramLayoutNode[];
  flowTargetsBySource: Map<string, string[]>;
  dependsTargetsBySource: Map<string, string[]>;
  incomingFlowByNodeId: Map<string, number>;
  incomingDependsByNodeId: Map<string, number>;
  referenceHostsByNoteId: Map<string, string[]>;
  noteIdsByHost: Map<string, string[]>;
  logicalFootprintByNodeId: Map<string, FlowLogicalFootprint>;
};

export type FlowLaneAssignment = {
  laneByNodeId: Map<string, number>;
  columnByNodeId: Map<string, number>;
};

export type FlowLogicalPlacement = {
  logicalPositions: Record<string, FlowLogicalPosition>;
  placementKindByNodeId: Map<string, FlowPlacementKind>;
};

export type FlowLogicalState = {
  logicalPositions: Map<string, FlowLogicalPosition>;
  logicalFootprints: Map<string, FlowLogicalFootprint>;
};

export type FlowNudgeCandidate = {
  nodeId: string;
  box: FlowLogicalBox;
  footprint: FlowLogicalFootprint;
};

export type FlowNudgeState = FlowLogicalState & {
  anchorNodeId?: string;
  insertedNodeId: string;
  direction: FlowDirection;
  dependsTargetsBySource: Map<string, string[]>;
  noteIdsByHost: Map<string, string[]>;
  nextPositions: Record<string, { x: number; y: number }>;
};

export const FLOW_NODE_FOOTPRINTS: Record<FlowNodeVariant, FlowFootprint> = {
  "flow-start": {
    width: 208,
    height: 112,
    paddingPrimary: 118,
    paddingSecondary: 76,
  },
  "flow-step": {
    width: 236,
    height: 140,
    paddingPrimary: 132,
    paddingSecondary: 84,
  },
  "flow-decision": {
    width: 244,
    height: 148,
    paddingPrimary: 136,
    paddingSecondary: 102,
  },
  "flow-end": {
    width: 208,
    height: 112,
    paddingPrimary: 120,
    paddingSecondary: 76,
  },
  "flow-note": {
    width: 248,
    height: 132,
    paddingPrimary: 102,
    paddingSecondary: 104,
  },
};

export const FLOW_INSERT_LAYOUT = {
  trunkPrimaryGap: 140,
  trunkSecondaryGap: 92,
  branchForwardOffset: 114,
  branchSecondaryGap: 132,
  branchLaneGap: 104,
  branchColumnGap: 86,
  noteForwardOffset: 108,
  noteSecondaryGap: 118,
  noteLaneGap: 86,
  noteClusterGap: 74,
} as const;

export function resolveFlowDirection(layoutOptions: unknown): FlowDirection {
  if (!layoutOptions || typeof layoutOptions !== "object" || Array.isArray(layoutOptions)) {
    return "left-right";
  }

  const direction = (layoutOptions as { direction?: unknown }).direction;
  if (direction === "top-down") {
    return "top-down";
  }

  return "left-right";
}

export function resolveFlowInsertMode(layoutOptions: unknown): FlowInsertMode {
  if (!layoutOptions || typeof layoutOptions !== "object" || Array.isArray(layoutOptions)) {
    return "default";
  }

  const insertMode = (layoutOptions as { insertMode?: unknown }).insertMode;
  if (
    insertMode === "flow-next-step" ||
    insertMode === "flow-branch" ||
    insertMode === "flow-note"
  ) {
    return insertMode;
  }

  return "default";
}

export function isFlowNoteNode(node: Pick<DiagramLayoutNode, "kind" | "diagramRole">) {
  return node.kind === "note" || node.diagramRole === "flow-note";
}

export function resolveFlowNodeVariant(
  node: Pick<DiagramLayoutNode, "kind" | "diagramRole">,
): FlowNodeVariant {
  if (isFlowNoteNode(node as DiagramLayoutNode)) {
    return "flow-note";
  }

  if (node.kind === "project" || node.diagramRole === "flow-start") {
    return "flow-start";
  }

  if (node.diagramRole === "flow-decision") {
    return "flow-decision";
  }

  if (node.diagramRole === "flow-end") {
    return "flow-end";
  }

  return "flow-step";
}

export function resolveFlowVariantFromInsertMode(
  insertMode: FlowInsertMode,
): FlowNodeVariant {
  if (insertMode === "flow-branch") {
    return "flow-decision";
  }

  if (insertMode === "flow-note") {
    return "flow-note";
  }

  return "flow-step";
}

export function readFlowInsertNodeDescriptor(layoutOptions: unknown) {
  if (!layoutOptions || typeof layoutOptions !== "object" || Array.isArray(layoutOptions)) {
    return null;
  }

  const insertNodeKind = (layoutOptions as { insertNodeKind?: unknown }).insertNodeKind;
  const insertDiagramRole = (layoutOptions as { insertDiagramRole?: unknown }).insertDiagramRole;
  const hasKind = typeof insertNodeKind === "string";
  const hasRole = typeof insertDiagramRole === "string";

  if (!hasKind && !hasRole) {
    return null;
  }

  return {
    kind: (hasKind ? insertNodeKind : "flow-step") as NodeKind,
    diagramRole: hasRole ? (insertDiagramRole as DiagramRole) : undefined,
  } satisfies Pick<DiagramLayoutNode, "kind" | "diagramRole">;
}

export function resolveFlowLogicalFootprint(input: {
  direction: FlowDirection;
  node?: Pick<DiagramLayoutNode, "kind" | "diagramRole"> | null;
  variant?: FlowNodeVariant;
}): FlowLogicalFootprint {
  const variant =
    input.variant ??
    resolveFlowNodeVariant(
      input.node ?? {
        kind: "flow-step",
      },
    );
  const footprint = FLOW_NODE_FOOTPRINTS[variant];

  return input.direction === "left-right"
    ? {
        primarySpan: footprint.width,
        secondarySpan: footprint.height,
        paddingPrimary: footprint.paddingPrimary,
        paddingSecondary: footprint.paddingSecondary,
      }
    : {
        primarySpan: footprint.height,
        secondarySpan: footprint.width,
        paddingPrimary: footprint.paddingSecondary,
        paddingSecondary: footprint.paddingPrimary,
      };
}

export function resolveDefaultFlowLogicalFootprint(direction: FlowDirection) {
  return resolveFlowLogicalFootprint({
    direction,
    variant: "flow-step",
  });
}
