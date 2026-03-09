import type {
  Edge as FlowEdge,
  Node as FlowNode,
  Viewport,
} from "@xyflow/react";
import type { Edge, ExternalRef, GraphSnapshot, Node } from "@/src/domain";

export type EditorNodeData = {
  nodeId?: string;
  label: string;
  kind: Node["kind"];
  payload: Record<string, unknown>;
  externalRefs: ExternalRef[];
  rendererDirection?: "top-down" | "left-right";
  rendererIsRoot?: boolean;
  rendererTreeCollapsed?: boolean;
  onToggleTreeCollapse?: (nodeId: string) => void;
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
  "diagramType" | "layoutOptions" | "rootNodeName" | "allowReapplyLayout"
>;

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

export function toFlowNodes(snapshot: GraphSnapshot): RFNode[] {
  return snapshot.nodes.map((node) => ({
    id: node.id,
    position: node.position,
    type: node.kind === "project" ? "input" : undefined,
    domAttributes: buildNodeTestDomAttributes(node.id),
    data: {
      nodeId: node.id,
      label: node.label,
      kind: node.kind,
      payload: node.data,
      externalRefs: node.externalRefs,
    },
  }));
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
} {
  return {
    nodes: toFlowNodes(snapshot),
    edges: toFlowEdges(snapshot),
    viewport: snapshot.viewport,
    layoutMetadata: {
      diagramType: snapshot.diagramType,
      layoutOptions: snapshot.layoutOptions,
      rootNodeName: snapshot.rootNodeName,
      allowReapplyLayout: snapshot.allowReapplyLayout,
    },
  };
}
