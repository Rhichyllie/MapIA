import type { EdgeKind, NodeKind } from "@/src/domain";
import type { DiagramType } from "@/src/modules/graph/domain";
import {
  resolveGraphActionEdgeVerb,
  resolveGraphEdgeSemantic,
  resolveGraphNodeKindCopy,
} from "@/src/modules/diagrams/domain/graph-semantics";
import { translateEditor, type EditorTranslationFn } from "../editor-i18n";
import {
  getProcessEdgeCopy,
  getProcessNodeKindCopy,
  getProcessQuickActions,
} from "./process-semantics";

export type PresentationMode = "operational" | "technical";
export type ContextualDiagramType =
  | DiagramType
  | "erd"
  | "sitemap"
  | "graph"
  | "timeline"
  | undefined;

export type KindIconDefinition = {
  viewBox: string;
  path: string;
};

export type NodeKindPresentation = {
  labelOperational: string;
  labelTechnical: string;
  icon: KindIconDefinition;
  tone: "slate" | "teal" | "blue" | "amber" | "green" | "violet";
  description: string;
};

export type EdgeKindPresentation = {
  labelOperational: string;
  labelTechnical: string;
  lineStyle: "solid" | "dashed" | "dotted";
  arrowStyle: "arrow" | "open" | "none";
  tone: "slate" | "teal" | "blue" | "amber" | "green" | "violet";
  description: string;
};

type NodeKindStaticPresentation = Omit<
  NodeKindPresentation,
  "labelOperational" | "description"
>;
type EdgeKindStaticPresentation = Omit<
  EdgeKindPresentation,
  "labelOperational" | "description"
>;

export type DiagramContextualAddAction = {
  label: string;
  nodeKind: NodeKind;
  edgeKind: EdgeKind;
  edgeLabel?: string;
};

export type DiagramContextualAction = {
  id:
    | "tree-add-child"
    | "tree-add-sibling"
    | "sitemap-add-page"
    | "sitemap-add-subpage"
    | "flow-add-next-step"
    | "flow-add-decision"
    | "flow-add-branch-path"
    | "flow-add-note"
    | "mindmap-add-branch"
    | "mindmap-add-reference"
    | "graph-add-component"
    | "graph-add-dependency"
    | "graph-add-supporting-service"
    | "timeline-add-milestone"
    | "timeline-add-dependency"
    | "erd-add-relation"
    | "erd-add-field";
  type: "add-connected-node" | "add-field";
  label: string;
  nodeKind?: NodeKind;
  edgeKind?: EdgeKind;
  edgeLabel?: string;
};

const NODE_KIND_PRESENTATION: Record<NodeKind, NodeKindStaticPresentation> = {
  workspace: {
    labelTechnical: "workspace",
    icon: {
      viewBox: "0 0 24 24",
      path: "M3 4h18v6H3V4Zm0 10h8v6H3v-6Zm10 0h8v6h-8v-6Z",
    },
    tone: "slate",
  },
  project: {
    labelTechnical: "project",
    icon: {
      viewBox: "0 0 24 24",
      path: "M3 6h8l2 2h8v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z",
    },
    tone: "teal",
  },
  entity: {
    labelTechnical: "entity",
    icon: {
      viewBox: "0 0 24 24",
      path: "M4 4h16v6H4V4Zm0 10h7v6H4v-6Zm9 0h7v6h-7v-6Z",
    },
    tone: "blue",
  },
  page: {
    labelTechnical: "page",
    icon: {
      viewBox: "0 0 24 24",
      path: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm3 4h8v2H8V7Zm0 4h8v2H8v-2Zm0 4h5v2H8v-2Z",
    },
    tone: "amber",
  },
  "flow-step": {
    labelTechnical: "flow-step",
    icon: {
      viewBox: "0 0 24 24",
      path: "M3 7h10v3h4V7l5 5-5 5v-3h-4v3H3V7Z",
    },
    tone: "green",
  },
  note: {
    labelTechnical: "note",
    icon: {
      viewBox: "0 0 24 24",
      path: "M5 3h14a2 2 0 0 1 2 2v11l-5 5H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm3 5h8v2H8V8Zm0 4h8v2H8v-2Z",
    },
    tone: "violet",
  },
};

const EDGE_KIND_PRESENTATION: Record<EdgeKind, EdgeKindStaticPresentation> = {
  contains: {
    labelTechnical: "contains",
    lineStyle: "solid",
    arrowStyle: "arrow",
    tone: "slate",
  },
  references: {
    labelTechnical: "references",
    lineStyle: "dotted",
    arrowStyle: "open",
    tone: "violet",
  },
  "depends-on": {
    labelTechnical: "depends-on",
    lineStyle: "dashed",
    arrowStyle: "arrow",
    tone: "amber",
  },
  "flows-to": {
    labelTechnical: "flows-to",
    lineStyle: "solid",
    arrowStyle: "arrow",
    tone: "green",
  },
  "relates-to": {
    labelTechnical: "relates-to",
    lineStyle: "dashed",
    arrowStyle: "none",
    tone: "blue",
  },
};

const OPERATIONAL_NODE_KIND_OPTIONS: NodeKind[] = [
  "page",
  "flow-step",
  "entity",
  "note",
];

export function getNodeKindPresentation(
  kind: NodeKind,
  t?: EditorTranslationFn,
) {
  const presentation = NODE_KIND_PRESENTATION[kind];

  return {
    ...presentation,
    labelOperational: translateEditor(t, `presentation.nodeKinds.${kind}.labelOperational`),
    description: translateEditor(t, `presentation.nodeKinds.${kind}.description`),
  };
}

export function getEdgeKindPresentation(
  kind: EdgeKind,
  t?: EditorTranslationFn,
) {
  const presentation = EDGE_KIND_PRESENTATION[kind];

  return {
    ...presentation,
    labelOperational: translateEditor(t, `presentation.edgeKinds.${kind}.labelOperational`),
    description: translateEditor(t, `presentation.edgeKinds.${kind}.description`),
  };
}

export function getNodeKindLabel(
  kind: NodeKind,
  mode: PresentationMode,
  t?: EditorTranslationFn,
) {
  const presentation = getNodeKindPresentation(kind, t);
  return mode === "technical"
    ? presentation.labelTechnical
    : presentation.labelOperational;
}

export function getNodeKindLabelForDiagram(
  diagramType: ContextualDiagramType,
  kind: NodeKind,
  mode: PresentationMode,
  t?: EditorTranslationFn,
) {
  if (diagramType === "flow" && mode === "operational") {
    const processCopy = getProcessNodeKindCopy(kind, t);
    if (processCopy) {
      return processCopy.labelOperational;
    }
  }

  if (diagramType === "graph" && mode === "operational") {
    return resolveGraphNodeKindCopy(kind, t).labelOperational;
  }

  return getNodeKindLabel(kind, mode, t);
}

export function getEdgeKindLabel(
  kind: EdgeKind,
  mode: PresentationMode,
  t?: EditorTranslationFn,
) {
  const presentation = getEdgeKindPresentation(kind, t);
  return mode === "technical"
    ? presentation.labelTechnical
    : presentation.labelOperational;
}

export function getEdgeKindLabelForDiagram(
  diagramType: ContextualDiagramType,
  kind: EdgeKind,
  mode: PresentationMode,
  t?: EditorTranslationFn,
) {
  if (diagramType === "flow" && mode === "operational") {
    return getProcessEdgeCopy(kind, t).labelOperational;
  }

  if (diagramType === "graph" && mode === "operational") {
    return resolveGraphEdgeSemantic(kind, t).labelOperational;
  }

  return getEdgeKindLabel(kind, mode, t);
}

export function getNodeKindDescription(kind: NodeKind, t?: EditorTranslationFn) {
  return getNodeKindPresentation(kind, t).description;
}

export function getNodeKindDescriptionForDiagram(
  diagramType: ContextualDiagramType,
  kind: NodeKind,
  t?: EditorTranslationFn,
) {
  if (diagramType === "flow") {
    const processCopy = getProcessNodeKindCopy(kind, t);
    if (processCopy) {
      return processCopy.description;
    }
  }

  if (diagramType === "graph") {
    return resolveGraphNodeKindCopy(kind, t).description;
  }

  return getNodeKindDescription(kind, t);
}

export function getEdgeKindDescription(kind: EdgeKind, t?: EditorTranslationFn) {
  return getEdgeKindPresentation(kind, t).description;
}

export function getEdgeKindDescriptionForDiagram(
  diagramType: ContextualDiagramType,
  kind: EdgeKind,
  t?: EditorTranslationFn,
) {
  if (diagramType === "flow") {
    return getProcessEdgeCopy(kind, t).description;
  }

  if (diagramType === "graph") {
    return resolveGraphEdgeSemantic(kind, t).description;
  }

  return getEdgeKindDescription(kind, t);
}

export function getNodeKindOptions(mode: PresentationMode) {
  if (mode === "technical") {
    return Object.keys(NODE_KIND_PRESENTATION) as NodeKind[];
  }

  return OPERATIONAL_NODE_KIND_OPTIONS;
}

export function getDefaultNodeKindForDiagram(
  diagramType: ContextualDiagramType,
): NodeKind {
  if (diagramType === "tree") {
    return "page";
  }

  if (diagramType === "sitemap") {
    return "page";
  }

  if (diagramType === "flow") {
    return "flow-step";
  }

  if (diagramType === "mindmap") {
    return "note";
  }

  if (diagramType === "erd") {
    return "entity";
  }

  if (diagramType === "graph") {
    return "entity";
  }

  if (diagramType === "timeline") {
    return "note";
  }

  return "note";
}

export function getDefaultEdgeKindForDiagram(
  diagramType: ContextualDiagramType,
): EdgeKind {
  if (diagramType === "tree") {
    return "contains";
  }

  if (diagramType === "sitemap") {
    return "contains";
  }

  if (diagramType === "flow") {
    return "flows-to";
  }

  if (diagramType === "mindmap") {
    return "relates-to";
  }

  if (diagramType === "erd") {
    return "references";
  }

  if (diagramType === "graph") {
    return "depends-on";
  }

  if (diagramType === "timeline") {
    return "flows-to";
  }

  return "relates-to";
}

export function getContextualActionsForDiagram(
  diagramType: ContextualDiagramType,
  t?: EditorTranslationFn,
): DiagramContextualAction[] {
  if (diagramType === "tree") {
    return [
      {
        id: "tree-add-child",
        type: "add-connected-node",
        label: translateEditor(t, "presentation.contextualActions.treeAddChild"),
        nodeKind: "page",
        edgeKind: "contains",
      },
      {
        id: "tree-add-sibling",
        type: "add-connected-node",
        label: translateEditor(t, "presentation.contextualActions.treeAddSibling"),
        nodeKind: "page",
        edgeKind: "contains",
      },
    ];
  }

  if (diagramType === "flow") {
    return getProcessQuickActions(t).map((action) => ({
      ...action,
      type: "add-connected-node" as const,
    }));
  }

  if (diagramType === "sitemap") {
    return [
      {
        id: "sitemap-add-page",
        type: "add-connected-node",
        label: translateEditor(t, "presentation.contextualActions.sitemapAddPage"),
        nodeKind: "page",
        edgeKind: "contains",
      },
      {
        id: "sitemap-add-subpage",
        type: "add-connected-node",
        label: translateEditor(t, "presentation.contextualActions.sitemapAddSubpage"),
        nodeKind: "page",
        edgeKind: "contains",
      },
    ];
  }

  if (diagramType === "mindmap") {
    return [
      {
        id: "mindmap-add-branch",
        type: "add-connected-node",
        label: translateEditor(t, "presentation.contextualActions.mindmapAddBranch"),
        nodeKind: "note",
        edgeKind: "relates-to",
      },
      {
        id: "mindmap-add-reference",
        type: "add-connected-node",
        label: translateEditor(t, "presentation.contextualActions.mindmapAddReference"),
        nodeKind: "note",
        edgeKind: "references",
      },
    ];
  }

  if (diagramType === "erd") {
    return [
      {
        id: "erd-add-relation",
        type: "add-connected-node",
        label: translateEditor(t, "presentation.contextualActions.erdAddRelation"),
        nodeKind: "entity",
        edgeKind: "references",
      },
      {
        id: "erd-add-field",
        type: "add-field",
        label: translateEditor(t, "presentation.contextualActions.erdAddField"),
      },
    ];
  }

  if (diagramType === "graph") {
    return [
      {
        id: "graph-add-component",
        type: "add-connected-node",
        label: translateEditor(t, "presentation.contextualActions.graphAddComponent"),
        nodeKind: "entity",
        edgeKind: "relates-to",
        edgeLabel: resolveGraphActionEdgeVerb("graph-add-component", t),
      },
      {
        id: "graph-add-dependency",
        type: "add-connected-node",
        label: translateEditor(t, "presentation.contextualActions.graphAddDependency"),
        nodeKind: "entity",
        edgeKind: "depends-on",
        edgeLabel: resolveGraphActionEdgeVerb("graph-add-dependency", t),
      },
      {
        id: "graph-add-supporting-service",
        type: "add-connected-node",
        label: translateEditor(
          t,
          "presentation.contextualActions.graphAddSupportingService",
        ),
        nodeKind: "page",
        edgeKind: "references",
        edgeLabel: resolveGraphActionEdgeVerb("graph-add-supporting-service", t),
      },
    ];
  }

  if (diagramType === "timeline") {
    return [
      {
        id: "timeline-add-milestone",
        type: "add-connected-node",
        label: translateEditor(t, "presentation.contextualActions.timelineAddMilestone"),
        nodeKind: "note",
        edgeKind: "flows-to",
        edgeLabel: translateEditor(t, "presentation.contextualActionEdgeLabels.timelineNext"),
      },
      {
        id: "timeline-add-dependency",
        type: "add-connected-node",
        label: translateEditor(t, "presentation.contextualActions.timelineAddDependency"),
        nodeKind: "note",
        edgeKind: "depends-on",
        edgeLabel: translateEditor(
          t,
          "presentation.contextualActionEdgeLabels.timelineDependency",
        ),
      },
    ];
  }

  return [
    {
      id: "mindmap-add-branch",
      type: "add-connected-node",
      label: translateEditor(t, "presentation.contextualActions.defaultAddRelated"),
      nodeKind: "note",
      edgeKind: "relates-to",
    },
  ];
}

export function getContextualAddActionForDiagram(
  diagramType: ContextualDiagramType,
  t?: EditorTranslationFn,
): DiagramContextualAddAction {
  const firstAddAction = getContextualActionsForDiagram(diagramType, t).find(
    (action): action is DiagramContextualAction & {
      type: "add-connected-node";
      nodeKind: NodeKind;
      edgeKind: EdgeKind;
    } => action.type === "add-connected-node" && Boolean(action.nodeKind && action.edgeKind),
  );

  if (firstAddAction) {
    return {
      label: firstAddAction.label,
      nodeKind: firstAddAction.nodeKind,
      edgeKind: firstAddAction.edgeKind,
      ...(firstAddAction.edgeLabel ? { edgeLabel: firstAddAction.edgeLabel } : {}),
    };
  }

  return {
    label: translateEditor(t, "presentation.contextualActions.defaultAddRelated"),
    nodeKind: getDefaultNodeKindForDiagram(diagramType),
    edgeKind: getDefaultEdgeKindForDiagram(diagramType),
  };
}

export function getOperationalDisplayLabel(input: {
  label: string;
  payload: Record<string, unknown>;
}, t?: EditorTranslationFn) {
  const rawLabel = input.label.trim();

  if (!rawLabel) {
    return translateEditor(t, "presentation.fallbacks.untitled");
  }

  if (
    rawLabel.toLowerCase() === "manual source" &&
    input.payload.sourceMode === "manual"
  ) {
    return translateEditor(t, "presentation.fallbacks.manualSource");
  }

  return input.label;
}

