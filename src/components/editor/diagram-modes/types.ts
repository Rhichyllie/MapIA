import type { EdgeKind, NodeKind } from "@/src/domain";
import type { DiagramRole } from "@/src/modules/diagrams/domain";
import type { ProjectTemplate } from "@/src/modules/projects/domain";
import type { EditorTranslationFn } from "../editor-i18n";
import type { RFEdge, RFNode } from "../editor-graph-mappers";
import type { InspectorMode } from "../editor-inspector-personas";
import type {
  DiagramLayoutEdge,
  DiagramLayoutNode,
  DiagramLayoutViewport,
} from "../diagram-renderers/layout/diagram-layout";
import type { RendererConfig } from "../diagram-renderers";
import type { DiagramScopedNodeKindOption } from "../presentation/diagram-scoped-options";
import type {
  DiagramContextualAction,
  PresentationMode,
} from "../presentation/kinds";
import type {
  ProcessInspectorCopy,
  ProcessRelationsViewModel,
} from "../presentation/process-semantics";
import type {
  ProcessEdgeInspectorViewModel,
  ProcessNodeInspectorViewModel,
} from "../process-inspector/process-inspector-view-model";

export type EditorDiagramModeId =
  | "tree"
  | "flow"
  | "mindmap"
  | "erd"
  | "sitemap"
  | "graph"
  | "timeline";

export type EditorDiagramModeMaturity = "active" | "prepared";

export type EditorDiagramCapability =
  | "quick-add-roles"
  | "specialized-selection-hud"
  | "specialized-inspector"
  | "specialized-node-relations"
  | "graph-semantic-copy"
  | "contextual-add-field"
  | "tree-subtree-visibility"
  | "erd-quick-relate"
  | "erd-validation-controls"
  | "erd-export-preview";

export type EditorDiagramModeResolutionSource =
  | "diagram-view"
  | "diagram-type"
  | "legacy-alias"
  | "template"
  | "default";

export type EditorDiagramPolicyLike =
  | {
      customRulesJson?: unknown;
    }
  | null
  | undefined;

export type EditorDiagramQuickAddRoleOption = {
  role: DiagramRole;
  label: string;
  description: string;
  baseKind: NodeKind;
};

export type EditorDiagramQuickAddCopy = {
  addPrimary: string;
  dialogTitle: string;
  dialogHint: string;
  addConfirm: string;
  quickActionHint: string;
};

export type EditorDiagramContextualInsertMode =
  | "default"
  | "tree-child"
  | "tree-sibling"
  | "sitemap-child"
  | "sitemap-sibling"
  | "flow-next-step"
  | "flow-branch"
  | "flow-note"
  | "timeline-next"
  | "timeline-dependency"
  | "graph-neighbor"
  | "graph-dependency"
  | "graph-supporting"
  | "mindmap-branch"
  | "mindmap-reference"
  | "erd-relation";

export type EditorDiagramSelectionQuickAction = {
  id: DiagramContextualAction["id"];
  label: string;
  edgeKind: EdgeKind;
  nodeKind: NodeKind;
  insertMode: EditorDiagramContextualInsertMode;
  edgeLabel?: string;
};

export type EditorDiagramRelationPreview = {
  id: string;
  direction: "incoming" | "outgoing";
  directionLabel: string;
  relationTypeLabel: string;
  edgeKind: EdgeKind;
  otherLabel: string;
  otherNodeId: string;
  sourceLabel: string;
  targetLabel: string;
  relationLabel?: string;
  lane?: "before" | "after" | "branch" | "note";
  laneLabel?: string;
  transitionLabel?: string;
  supportingLabel?: string;
};

export type EditorDiagramNodeRelationsView = {
  incomingCount: number;
  outgoingCount: number;
  summaryChips: Array<{
    id: "before" | "after" | "branch" | "note";
    label: string;
    count: number;
  }>;
  preview: EditorDiagramRelationPreview[];
};

export type EditorDiagramInspectorCopy = {
  selectionBadgeLabel: string;
  emptyTitle: string;
  emptySummary: string;
  emptyGuidance: string;
  nodeTitleLabel: string;
  nodeKindLabel: string;
  nodeDescriptionLabel: string;
  nodeDescriptionPlaceholder: string;
  nodeTagsLabel: string;
  nodeTagsPlaceholder: string;
  nodeTagsHelper: string;
  nodeContextTitle: string;
  generalSectionTitle: string;
  detailsSectionTitle: string;
  relationsSectionTitle: string;
  edgeLabelLabel: string;
  edgeGeneralSectionTitle: string;
  edgeKindLabel: string;
  edgeSourceLabel: string;
  edgeTargetLabel: string;
  nodeSubtitle: string;
  edgeSubtitle: string;
};

export type EditorDiagramRoleAwareNodeRef = {
  id: string;
  kind: NodeKind;
  label: string;
  payload: Record<string, unknown>;
};

export type EditorDiagramLayoutStrategy = {
  reapplyStrategy: "snapshot-native" | "local-reflow";
  computeInsertPosition(input: {
    referenceNode: DiagramLayoutNode | null;
    nodes: DiagramLayoutNode[];
    edges: DiagramLayoutEdge[];
    viewport: DiagramLayoutViewport;
    layoutOptions?: unknown;
    insertMode: EditorDiagramContextualInsertMode;
    nodeKind?: NodeKind;
    diagramRole?: DiagramRole;
  }): { x: number; y: number };
  computeReflow(input: {
    nodes: DiagramLayoutNode[];
    edges: DiagramLayoutEdge[];
    rootId?: string | null;
    layoutOptions?: unknown;
  }): Record<string, { x: number; y: number }>;
  applyPostInsertLayout(input: {
    insertMode: EditorDiagramContextualInsertMode;
    insertedNodeId: string;
    sourceNodeId?: string;
    nodes: DiagramLayoutNode[];
    edges: DiagramLayoutEdge[];
    layoutOptions?: unknown;
  }): {
    kind: "none" | "reflow" | "positions";
    positions?: Record<string, { x: number; y: number }>;
  };
  resolveRootNodeId?(input: {
    nodes: RFNode[];
    computedRootNodeId?: string | null;
    rootNodeName?: string;
  }): string | null;
};

export type EditorDiagramPresentationStrategy = {
  getDefaultNodeKind(): NodeKind;
  getDefaultEdgeKind(): EdgeKind;
  getAllowedNodeKinds(
    inspectorMode: InspectorMode,
    policy: EditorDiagramPolicyLike,
  ): DiagramScopedNodeKindOption[];
  getNodeKindLabel(
    kind: NodeKind,
    mode: PresentationMode,
    t?: EditorTranslationFn,
  ): string;
  getNodeKindDescription(kind: NodeKind, t?: EditorTranslationFn): string;
  getEdgeKindLabel(
    kind: EdgeKind,
    mode: PresentationMode,
    t?: EditorTranslationFn,
  ): string;
  getEdgeKindDescription(kind: EdgeKind, t?: EditorTranslationFn): string;
  getOperationalDisplayLabel(
    input: {
      label: string;
      payload: Record<string, unknown>;
    },
    t?: EditorTranslationFn,
  ): string;
};

export type EditorDiagramContextualActionsStrategy = {
  getDefinitions(t?: EditorTranslationFn): DiagramContextualAction[];
  getSelectionActions(
    t?: EditorTranslationFn,
  ): EditorDiagramSelectionQuickAction[];
  getPrimarySelectionAction(
    t?: EditorTranslationFn,
  ): EditorDiagramSelectionQuickAction;
  resolveSourceNodeId(input: {
    action: EditorDiagramSelectionQuickAction;
    selectedNode: RFNode | null;
    edges: RFEdge[];
  }): string | undefined;
};

export type EditorDiagramQuickAddStrategy = {
  getCopy(t?: EditorTranslationFn): EditorDiagramQuickAddCopy;
  getRoleOptions(t?: EditorTranslationFn): EditorDiagramQuickAddRoleOption[];
  resolveDefaultRoleForKind(kind: NodeKind): DiagramRole | undefined;
  resolveDialogDefaultRole(input: {
    kind: NodeKind;
    actionId?: EditorDiagramSelectionQuickAction["id"];
    hasSelection: boolean;
  }): DiagramRole | undefined;
  buildDefaultNodeTitle(
    input: {
      kind: NodeKind;
      nextIndex: number;
    },
    t?: EditorTranslationFn,
  ): string;
};

export type EditorDiagramNodeRelationsInput = {
  selectedNode: RFNode;
  edges: RFEdge[];
  nodeLabelById: ReadonlyMap<string, string>;
  nodeRoleById: ReadonlyMap<string, DiagramRole | undefined>;
  inspectorMode: InspectorMode;
  t?: EditorTranslationFn;
};

type EditorDiagramBaseInspectorStrategy = {
  kind: "default" | "graph" | "erd" | "process";
  getCopy(t?: EditorTranslationFn): EditorDiagramInspectorCopy;
  getSubtitle(input: {
    hasSelectedNode: boolean;
    hasSelectedEdge: boolean;
    t?: EditorTranslationFn;
  }): string;
  buildNodeRelations(
    input: EditorDiagramNodeRelationsInput,
  ): EditorDiagramNodeRelationsView;
  resolveSelectionBadge(input: {
    hasSelectedNode: boolean;
    hasSelectedEdge: boolean;
    defaultBadge: string;
    t?: EditorTranslationFn;
  }): string;
};

export type EditorDiagramProcessInspectorStrategy =
  EditorDiagramBaseInspectorStrategy & {
    kind: "process";
    process: {
      getCopy(t?: EditorTranslationFn): ProcessInspectorCopy;
      resolveNodeViewModel(
        input: {
          diagramRole?: DiagramRole;
          kind: NodeKind;
          label: string;
          payload?: Record<string, unknown>;
          relations: ProcessRelationsViewModel;
        },
        t?: EditorTranslationFn,
      ): ProcessNodeInspectorViewModel;
      resolveEdgeViewModel(
        input: {
          kind: EdgeKind;
          label?: string;
          sourceLabel: string;
          targetLabel: string;
        },
        t?: EditorTranslationFn,
      ): ProcessEdgeInspectorViewModel;
    };
  };

export type EditorDiagramInspectorStrategy =
  | EditorDiagramBaseInspectorStrategy
  | EditorDiagramProcessInspectorStrategy;

export type EditorDiagramSemanticStrategy = {
  diagramType: EditorDiagramModeId;
  resolveNodeRole(input: {
    kind: NodeKind;
    nodePayload: Record<string, unknown>;
    nodeLabel?: string;
    rootNodeName?: string | null;
  }): DiagramRole;
  toRoleAwareNodeRef(input: {
    node: RFNode;
    rootNodeName?: string;
  }): EditorDiagramRoleAwareNodeRef;
  getDiagramRoleLabel(
    role: DiagramRole | undefined,
    t?: EditorTranslationFn,
  ): string;
  getNodeStructureTips(
    input: {
      diagramRole: DiagramRole | undefined;
      nodeKind?: NodeKind;
      nodeLabel?: string;
      incomingCount: number;
      outgoingCount: number;
    },
    t?: EditorTranslationFn,
  ): string[];
  graph?: {
    resolveNodeSemantic(
      input: {
        diagramRole?: DiagramRole;
        kind: NodeKind;
        label?: string;
        payload?: Record<string, unknown>;
        incomingCount?: number;
        outgoingCount?: number;
      },
      t?: EditorTranslationFn,
    ): ReturnType<
      typeof import("@/src/modules/diagrams/domain").resolveGraphNodeSemantic
    >;
    resolveEdgeSemantic(
      kind: EdgeKind,
      t?: EditorTranslationFn,
    ): ReturnType<
      typeof import("@/src/modules/diagrams/domain").resolveGraphEdgeSemantic
    >;
  };
};

export type EditorDiagramRenderStrategy = {
  resolveEdgePresentation(input: {
    edgeKind: EdgeKind;
    baseLabel?: string;
    payload?: Record<string, unknown>;
    sourceRole?: DiagramRole;
    targetRole?: DiagramRole;
    sourcePosition?: { x: number; y: number };
    targetPosition?: { x: number; y: number };
    direction?: "top-down" | "left-right";
  }): {
    label?: string;
    markerEnd?: RFEdge["markerEnd"];
    labelStyle?: RFEdge["labelStyle"];
    labelBgStyle?: RFEdge["labelBgStyle"];
    labelShowBg?: boolean;
    labelBgPadding?: RFEdge["labelBgPadding"];
    labelBgBorderRadius?: RFEdge["labelBgBorderRadius"];
    strokeDasharray?: string;
    classNameTokens?: string[];
  };
};

export type EditorDiagramSelectionStrategy = {
  hud: "default" | "flow";
  supportsTreeSubtreeVisibility: boolean;
  supportsEntityFieldAdd: boolean;
  supportsQuickRelate: boolean;
};

export type EditorDiagramModule = {
  id: EditorDiagramModeId;
  label: string;
  maturity: EditorDiagramModeMaturity;
  aliases: readonly string[];
  templateFallbacks: readonly ProjectTemplate[];
  capabilities: readonly EditorDiagramCapability[];
  resolveRenderer(input: {
    diagramView?: string;
    template?: ProjectTemplate;
    layoutOptions?: unknown;
  }): RendererConfig;
  presentation: EditorDiagramPresentationStrategy;
  contextualActions: EditorDiagramContextualActionsStrategy;
  quickAdd: EditorDiagramQuickAddStrategy;
  layout: EditorDiagramLayoutStrategy;
  inspector: EditorDiagramInspectorStrategy;
  semantic: EditorDiagramSemanticStrategy;
  render: EditorDiagramRenderStrategy;
  selection: EditorDiagramSelectionStrategy;
};

export type ResolvedEditorDiagramMode = {
  mode: EditorDiagramModule;
  renderer: RendererConfig;
  source: EditorDiagramModeResolutionSource;
  requestedDiagramType?: string;
};
