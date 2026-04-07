import {
  BackgroundVariant,
  ConnectionLineType,
  MarkerType,
  type DefaultEdgeOptions,
  type EdgeTypes,
  type NodeTypes,
} from "@xyflow/react";
import type { ProjectTemplate } from "@/src/modules/projects/domain";
import { resolveDiagramView } from "@/src/domain";
import {
  ErdNodeRenderer,
  FlowNodeRenderer,
  GraphNodeRenderer,
  MindmapNodeRenderer,
  SitemapNodeRenderer,
  TimelineNodeRenderer,
  TreeNodeRenderer,
} from "./diagram-node-renderers";
import { FLOW_RENDERER_PRESENTATION } from "./flow-presentation";
import { ParallelBezierEdge } from "./parallel-bezier-edge";

export type DiagramRendererKey =
  | "tree"
  | "flow"
  | "mindmap"
  | "erd"
  | "sitemap"
  | "graph"
  | "timeline";

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
  diagramView?: string;
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

const TIMELINE_NODE_TYPES: NodeTypes = {
  timeline: TimelineNodeRenderer,
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

function resolveFlowDirection(
  layoutOptions: unknown,
): "top-down" | "left-right" {
  if (!layoutOptions || typeof layoutOptions !== "object" || Array.isArray(layoutOptions)) {
    return "left-right";
  }

  const direction = (layoutOptions as { direction?: unknown }).direction;

  if (direction === "top-down") {
    return "top-down";
  }

  return "left-right";
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

function createFlowRenderer(
  input: ResolveDiagramRendererInput,
): RendererConfig {
  return {
    key: "flow",
    label: "Processo",
    nodeType: "flow",
    nodeTypes: FLOW_NODE_TYPES,
    edgeTypes: EDGE_TYPES,
    defaultEdgeOptions: FLOW_RENDERER_PRESENTATION.defaultEdgeOptions,
    backgroundConfig: FLOW_RENDERER_PRESENTATION.background,
    minimapClassName: FLOW_RENDERER_PRESENTATION.minimapClassName,
    canvasClassName: FLOW_RENDERER_PRESENTATION.canvasClassName,
    canvasDataAttributes: {
      "data-diagram-renderer": "flow",
    },
    connectionLineType: FLOW_RENDERER_PRESENTATION.connectionLineType,
    supportsPorts: true,
    supportsParallelEdges: true,
    treeDirection: resolveFlowDirection(input.layoutOptions),
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
    label: "Modelo de dados (ERD)",
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

function createSitemapRenderer(
  input: ResolveDiagramRendererInput,
): RendererConfig {
  return {
    key: "sitemap",
    label: "Sitemap",
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
    treeDirection: resolveTreeDirection(input.layoutOptions),
  };
}

function createGraphRenderer(): RendererConfig {
  return {
    key: "graph",
    label: "Grafo",
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

function createTimelineRenderer(
  input: ResolveDiagramRendererInput,
): RendererConfig {
  return {
    key: "timeline",
    label: "Timeline",
    nodeType: "timeline",
    nodeTypes: TIMELINE_NODE_TYPES,
    edgeTypes: EDGE_TYPES,
    defaultEdgeOptions: {
      ...createBaseEdgeOptions("editor-edge editor-edge-timeline"),
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: "var(--canvas-edge-color)",
      },
    },
    backgroundConfig: {
      variant: BackgroundVariant.Lines,
      gap: 20,
      className: "editor-canvas-background-timeline",
    },
    minimapClassName: "editor-minimap editor-minimap-timeline",
    canvasClassName: "canvas-frame canvas-frame-timeline",
    canvasDataAttributes: {
      "data-diagram-renderer": "timeline",
    },
    connectionLineType: ConnectionLineType.Bezier,
    supportsPorts: true,
    supportsParallelEdges: true,
    treeDirection: resolveFlowDirection(input.layoutOptions),
  };
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

  if (template === "flowchart") {
    return "flow";
  }

  return "graph";
}

export function resolveDiagramRenderer(
  input: ResolveDiagramRendererInput,
): RendererConfig {
  const diagramView = resolveDiagramView({
    diagramType: input.diagramType,
    diagramView: input.diagramView,
  });

  if (diagramView === "tree") {
    return createTreeRenderer(input);
  }

  if (diagramView === "flow") {
    return createFlowRenderer(input);
  }

  if (diagramView === "mindmap") {
    return createMindmapRenderer();
  }

  if (diagramView === "timeline") {
    return createTimelineRenderer(input);
  }

  if (diagramView === "erd") {
    return createErdRenderer();
  }

  if (diagramView === "sitemap") {
    return createSitemapRenderer(input);
  }

  if (diagramView === "graph") {
    return createGraphRenderer();
  }

  const legacyKey = resolveLegacyRendererFromTemplate(input.template);

  if (legacyKey === "flow") {
    return createFlowRenderer(input);
  }

  if (legacyKey === "erd") {
    return createErdRenderer();
  }

  if (legacyKey === "sitemap") {
    return createSitemapRenderer(input);
  }

  if (legacyKey === "timeline") {
    return createTimelineRenderer(input);
  }

  return createGraphRenderer();
}
