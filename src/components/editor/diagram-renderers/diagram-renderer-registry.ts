import {
  BackgroundVariant,
  ConnectionLineType,
  MarkerType,
  type DefaultEdgeOptions,
  type EdgeTypes,
  type NodeTypes,
} from "@xyflow/react";
import type { ProjectTemplate } from "@/src/modules/projects/domain";
import {
  ErdNodeRenderer,
  FlowNodeRenderer,
  GraphNodeRenderer,
  MindmapNodeRenderer,
  SitemapNodeRenderer,
  TreeNodeRenderer,
} from "./diagram-node-renderers";
import { ParallelBezierEdge } from "./parallel-bezier-edge";

export type DiagramRendererKey =
  | "tree"
  | "flow"
  | "mindmap"
  | "erd"
  | "sitemap"
  | "graph";

export type RendererConfig = {
  key: DiagramRendererKey;
  label: string;
  nodeType: string;
  nodeTypes: NodeTypes;
  edgeTypes: EdgeTypes;
  defaultEdgeOptions: DefaultEdgeOptions;
  backgroundConfig: {
    variant: BackgroundVariant;
    gap: number;
    className: string;
  };
  minimapClassName: string;
  canvasClassName: string;
  canvasDataAttributes: Record<string, string>;
  connectionLineType: ConnectionLineType;
  supportsPorts: boolean;
  supportsParallelEdges: boolean;
  treeDirection?: "top-down" | "left-right";
};

type ResolveDiagramRendererInput = {
  diagramType?: string;
  template?: ProjectTemplate;
  layoutOptions?: unknown;
};

const EDGE_TYPES: EdgeTypes = {
  parallelBezier: ParallelBezierEdge,
};

const TREE_NODE_TYPES: NodeTypes = {
  tree: TreeNodeRenderer,
};

const FLOW_NODE_TYPES: NodeTypes = {
  flow: FlowNodeRenderer,
};

const MINDMAP_NODE_TYPES: NodeTypes = {
  mindmap: MindmapNodeRenderer,
};

const ERD_NODE_TYPES: NodeTypes = {
  erd: ErdNodeRenderer,
};

const SITEMAP_NODE_TYPES: NodeTypes = {
  sitemap: SitemapNodeRenderer,
};

const GRAPH_NODE_TYPES: NodeTypes = {
  graph: GraphNodeRenderer,
};

function resolveTreeDirection(
  layoutOptions: unknown,
): "top-down" | "left-right" {
  if (!layoutOptions || typeof layoutOptions !== "object" || Array.isArray(layoutOptions)) {
    return "top-down";
  }

  const direction = (layoutOptions as { direction?: unknown }).direction;

  if (direction === "left-right") {
    return "left-right";
  }

  return "top-down";
}

function createBaseEdgeOptions(className: string): DefaultEdgeOptions {
  return {
    type: "parallelBezier",
    className,
    animated: false,
  };
}

function createTreeRenderer(
  input: ResolveDiagramRendererInput,
): RendererConfig {
  return {
    key: "tree",
    label: "Hierarquia",
    nodeType: "tree",
    nodeTypes: TREE_NODE_TYPES,
    edgeTypes: EDGE_TYPES,
    defaultEdgeOptions: createBaseEdgeOptions("editor-edge editor-edge-tree"),
    backgroundConfig: {
      variant: BackgroundVariant.Lines,
      gap: 24,
      className: "editor-canvas-background-tree",
    },
    minimapClassName: "editor-minimap editor-minimap-tree",
    canvasClassName: "canvas-frame canvas-frame-tree",
    canvasDataAttributes: {
      "data-diagram-renderer": "tree",
    },
    connectionLineType: ConnectionLineType.SmoothStep,
    supportsPorts: true,
    supportsParallelEdges: true,
    treeDirection: resolveTreeDirection(input.layoutOptions),
  };
}

function createFlowRenderer(): RendererConfig {
  return {
    key: "flow",
    label: "Processo",
    nodeType: "flow",
    nodeTypes: FLOW_NODE_TYPES,
    edgeTypes: EDGE_TYPES,
    defaultEdgeOptions: {
      ...createBaseEdgeOptions("editor-edge editor-edge-flow"),
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: "var(--canvas-edge-color)",
      },
    },
    backgroundConfig: {
      variant: BackgroundVariant.Cross,
      gap: 22,
      className: "editor-canvas-background-flow",
    },
    minimapClassName: "editor-minimap editor-minimap-flow",
    canvasClassName: "canvas-frame canvas-frame-flow",
    canvasDataAttributes: {
      "data-diagram-renderer": "flow",
    },
    connectionLineType: ConnectionLineType.Bezier,
    supportsPorts: true,
    supportsParallelEdges: true,
  };
}

function createMindmapRenderer(): RendererConfig {
  return {
    key: "mindmap",
    label: "Mapa mental",
    nodeType: "mindmap",
    nodeTypes: MINDMAP_NODE_TYPES,
    edgeTypes: EDGE_TYPES,
    defaultEdgeOptions: createBaseEdgeOptions("editor-edge editor-edge-mindmap"),
    backgroundConfig: {
      variant: BackgroundVariant.Dots,
      gap: 20,
      className: "editor-canvas-background-mindmap",
    },
    minimapClassName: "editor-minimap editor-minimap-mindmap",
    canvasClassName: "canvas-frame canvas-frame-mindmap",
    canvasDataAttributes: {
      "data-diagram-renderer": "mindmap",
    },
    connectionLineType: ConnectionLineType.Bezier,
    supportsPorts: true,
    supportsParallelEdges: true,
  };
}

function createErdRenderer(): RendererConfig {
  return {
    key: "erd",
    label: "ERD (legado)",
    nodeType: "erd",
    nodeTypes: ERD_NODE_TYPES,
    edgeTypes: EDGE_TYPES,
    defaultEdgeOptions: createBaseEdgeOptions("editor-edge editor-edge-erd"),
    backgroundConfig: {
      variant: BackgroundVariant.Lines,
      gap: 18,
      className: "editor-canvas-background-erd",
    },
    minimapClassName: "editor-minimap editor-minimap-erd",
    canvasClassName: "canvas-frame canvas-frame-erd",
    canvasDataAttributes: {
      "data-diagram-renderer": "erd",
    },
    connectionLineType: ConnectionLineType.SmoothStep,
    supportsPorts: true,
    supportsParallelEdges: true,
  };
}

function createSitemapRenderer(): RendererConfig {
  return {
    key: "sitemap",
    label: "Sitemap (legado)",
    nodeType: "sitemap",
    nodeTypes: SITEMAP_NODE_TYPES,
    edgeTypes: EDGE_TYPES,
    defaultEdgeOptions: createBaseEdgeOptions("editor-edge editor-edge-sitemap"),
    backgroundConfig: {
      variant: BackgroundVariant.Dots,
      gap: 16,
      className: "editor-canvas-background-sitemap",
    },
    minimapClassName: "editor-minimap editor-minimap-sitemap",
    canvasClassName: "canvas-frame canvas-frame-sitemap",
    canvasDataAttributes: {
      "data-diagram-renderer": "sitemap",
    },
    connectionLineType: ConnectionLineType.SmoothStep,
    supportsPorts: true,
    supportsParallelEdges: true,
  };
}

function createGraphRenderer(): RendererConfig {
  return {
    key: "graph",
    label: "Graph (legado)",
    nodeType: "graph",
    nodeTypes: GRAPH_NODE_TYPES,
    edgeTypes: EDGE_TYPES,
    defaultEdgeOptions: createBaseEdgeOptions("editor-edge editor-edge-graph"),
    backgroundConfig: {
      variant: BackgroundVariant.Lines,
      gap: 18,
      className: "editor-canvas-background-graph",
    },
    minimapClassName: "editor-minimap editor-minimap-graph",
    canvasClassName: "canvas-frame canvas-frame-graph",
    canvasDataAttributes: {
      "data-diagram-renderer": "graph",
    },
    connectionLineType: ConnectionLineType.Bezier,
    supportsPorts: true,
    supportsParallelEdges: true,
  };
}

function resolveLegacyRendererFromDiagramType(
  diagramType: string | undefined,
): DiagramRendererKey | undefined {
  if (diagramType === "erd") {
    return "erd";
  }

  if (diagramType === "sitemap") {
    return "sitemap";
  }

  if (diagramType === "graph") {
    return "graph";
  }

  if (diagramType === "flowchart") {
    return "graph";
  }

  return undefined;
}

function resolveLegacyRendererFromTemplate(
  template: ProjectTemplate | undefined,
): DiagramRendererKey {
  if (template === "erd") {
    return "erd";
  }

  if (template === "sitemap") {
    return "sitemap";
  }

  return "graph";
}

export function resolveDiagramRenderer(
  input: ResolveDiagramRendererInput,
): RendererConfig {
  if (input.diagramType === "tree") {
    return createTreeRenderer(input);
  }

  if (input.diagramType === "flow") {
    return createFlowRenderer();
  }

  if (input.diagramType === "mindmap") {
    return createMindmapRenderer();
  }

  const legacyFromDiagramType = resolveLegacyRendererFromDiagramType(
    input.diagramType,
  );
  const legacyKey =
    legacyFromDiagramType ?? resolveLegacyRendererFromTemplate(input.template);

  if (legacyKey === "erd") {
    return createErdRenderer();
  }

  if (legacyKey === "sitemap") {
    return createSitemapRenderer();
  }

  return createGraphRenderer();
}
