import type {
  Edge as FlowEdge,
  Node as FlowNode,
  Viewport,
} from "@xyflow/react";
import {
  resolveDiagramView,
  type DiagramView,
  type Edge,
  type ExternalRef,
  type GraphSnapshot,
  type Node,
} from "@/src/domain";
import {
  normalizeDiagramSnapshot,
  resolveDiagramRole,
  type DiagramRole,
} from "@/src/modules/diagrams/domain";

export type EditorNodeData = {
  nodeId?: string;
  label: string;
  kind: Node["kind"];
  payload: Record<string, unknown>;
  externalRefs: ExternalRef[];
  diagramRole?: DiagramRole;
  rendererDirection?: "top-down" | "left-right";
  rendererIsRoot?: boolean;
  rendererTreeCollapsed?: boolean;
  rendererCanToggleTreeCollapse?: boolean;
  onToggleTreeCollapse?: (nodeId: string) => void;
  erdBadges?: Array<{
    label: string;
    tone: "warning" | "info" | "suggestion";
  }>;
  presentationMode?: "operational" | "technical";
  displayLabel?: string;
};

export type EditorEdgeData = {
  kind: Edge["kind"];
  payload: Record<string, unknown>;
  externalRefs: ExternalRef[];
  parallelIndex?: number;
  parallelTotal?: number;
};

export type RFNode = FlowNode<EditorNodeData>;
export type RFEdge = FlowEdge<EditorEdgeData>;
export type EditorSnapshotLayoutMetadata = Pick<
  GraphSnapshot,
  | "diagramType"
  | "diagramView"
  | "layoutOptions"
  | "rootNodeName"
  | "allowReapplyLayout"
>;

type DiagramViewEffective = DiagramView | undefined;

function buildNodeTestDomAttributes(nodeId: string): RFNode["domAttributes"] {
  // React's HTMLAttributes typing does not include data-* keys explicitly,
  // but React Flow forwards them to the node wrapper at runtime.
  return {
    "data-testid": `editor-node-${nodeId}`,
  } as unknown as RFNode["domAttributes"];
}

function buildEdgeTestDomAttributes(edgeId: string): RFEdge["domAttributes"] {
  return {
    "data-testid": `editor-edge-${edgeId}`,
  } as unknown as RFEdge["domAttributes"];
}

function resolveDiagramViewEffective(input: {
  diagramType?: string;
  diagramView?: string;
}): DiagramViewEffective {
  return resolveDiagramView(input);
}

export function toFlowNodes(
  snapshot: GraphSnapshot,
  options?: {
    hiddenNodeIds?: Set<string>;
    diagramViewEffective?: DiagramViewEffective;
    rootNodeName?: string;
  },
): RFNode[] {
  const hiddenNodeIds = options?.hiddenNodeIds ?? new Set<string>();
  const diagramViewEffective =
    options?.diagramViewEffective ??
    resolveDiagramViewEffective({
      diagramType: snapshot.diagramType,
      diagramView: snapshot.diagramView,
    });

  return snapshot.nodes.map((node) => {
    const diagramRole = resolveDiagramRole({
      diagramType: diagramViewEffective,
      nodeKind: node.kind,
      nodePayload: node.data,
      nodeLabel: node.label,
      layoutMetadata: { rootNodeName: options?.rootNodeName ?? snapshot.rootNodeName ?? null },
    });

    return {
    id: node.id,
    position: node.position,
    type: node.kind === "project" ? "input" : undefined,
    hidden: hiddenNodeIds.has(node.id),
    domAttributes: buildNodeTestDomAttributes(node.id),
    data: {
      nodeId: node.id,
      label: node.label,
      kind: node.kind,
      payload: node.data,
      externalRefs: node.externalRefs,
      diagramRole,
    },
  };
  });
}

export function toFlowEdges(snapshot: GraphSnapshot): RFEdge[] {
  return snapshot.edges.map((edge) => ({
    id: edge.id,
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
    label: edge.label,
    domAttributes: buildEdgeTestDomAttributes(edge.id),
    data: {
      kind: edge.kind,
      payload: edge.data,
      externalRefs: edge.externalRefs,
    },
  }));
}

export function toCanonicalSnapshotFromFlowState(
  projectId: string,
  nodes: RFNode[],
  edges: RFEdge[],
  viewport: Viewport,
  layoutMetadata?: EditorSnapshotLayoutMetadata,
): GraphSnapshot {
  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      projectId,
      kind: node.data.kind,
      label: node.data.label,
      position: {
        x: node.position.x,
        y: node.position.y,
      },
      data: node.data.payload,
      externalRefs: node.data.externalRefs,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      projectId,
      sourceNodeId: edge.source,
      targetNodeId: edge.target,
      kind: edge.data?.kind ?? "flows-to",
      label: edge.label ? String(edge.label) : undefined,
      data: edge.data?.payload ?? {},
      externalRefs: edge.data?.externalRefs ?? [],
    })),
    viewport: {
      x: viewport.x,
      y: viewport.y,
      zoom: viewport.zoom,
    },
    diagramType: layoutMetadata?.diagramType,
    diagramView: layoutMetadata?.diagramView,
    layoutOptions: layoutMetadata?.layoutOptions,
    rootNodeName: layoutMetadata?.rootNodeName,
    allowReapplyLayout: layoutMetadata?.allowReapplyLayout,
  };
}

export function fromCanonicalSnapshotToFlowState(snapshot: GraphSnapshot): {
  nodes: RFNode[];
  edges: RFEdge[];
  viewport: Viewport;
  layoutMetadata: EditorSnapshotLayoutMetadata;
  hiddenNodeIds: string[];
  computedRootNodeId?: string;
} {
  const diagramViewEffective = resolveDiagramViewEffective({
    diagramType: snapshot.diagramType,
    diagramView: snapshot.diagramView,
  });
  const normalization = normalizeDiagramSnapshot({
    snapshot,
    diagramTypeEffective: diagramViewEffective,
    rootNodeName: snapshot.rootNodeName,
  });
  const hiddenNodeIds = new Set(normalization.hiddenNodeIds);

  return {
    nodes: toFlowNodes(normalization.normalizedSnapshot, {
      hiddenNodeIds,
      diagramViewEffective,
      rootNodeName: snapshot.rootNodeName,
    }),
    edges: toFlowEdges(normalization.normalizedSnapshot),
    viewport: normalization.normalizedSnapshot.viewport,
    layoutMetadata: {
      diagramType: snapshot.diagramType,
      diagramView: snapshot.diagramView,
      layoutOptions: snapshot.layoutOptions,
      rootNodeName: snapshot.rootNodeName,
      allowReapplyLayout: snapshot.allowReapplyLayout,
    },
    hiddenNodeIds: normalization.hiddenNodeIds,
    ...(normalization.computedRootNodeId
      ? { computedRootNodeId: normalization.computedRootNodeId }
      : {}),
  };
}
