import { MarkerType } from "@xyflow/react";
import type { EdgeKind, NodeKind } from "@/src/domain";
import {
  listGraphQuickAddRoleOptions,
  mapGraphRoleToNodeKind,
  resolveDiagramRole,
  resolveGraphDefaultRoleForKind,
  resolveGraphEdgeSemantic,
  resolveGraphNodeSemantic,
  type DiagramRole,
} from "@/src/modules/diagrams/domain";
import type { ProjectTemplate } from "@/src/modules/projects/domain";
import type { EditorTranslationFn } from "../editor-i18n";
import type { RFEdge, RFNode } from "../editor-graph-mappers";
import { translateEditor } from "../editor-i18n";
import { getAllowedKindsForDiagram } from "../presentation/diagram-scoped-options";
import {
  getContextualActionsForDiagram,
  getDefaultEdgeKindForDiagram,
  getDefaultNodeKindForDiagram,
  getEdgeKindDescriptionForDiagram,
  getEdgeKindLabelForDiagram,
  getEdgeKindPresentation,
  getNodeKindDescriptionForDiagram,
  getNodeKindLabelForDiagram,
  getOperationalDisplayLabel,
  type DiagramContextualAction,
} from "../presentation/kinds";
import {
  buildProcessRelationsViewModel,
  getProcessInspectorCopy,
  getProcessQuickAddRoleOptions,
  getProcessRoleMeta,
  resolveProcessNodeRole,
} from "../presentation/process-semantics";
import {
  resolveProcessEdgeInspectorViewModel,
  resolveProcessNodeInspectorViewModel,
} from "../process-inspector/process-inspector-view-model";
import {
  computeFlowContextualNudgePositions,
  computeInsertPosition,
  computeReflow,
} from "../diagram-renderers/layout/diagram-layout";
import { resolveFlowEdgeVisualSemantics } from "../diagram-renderers/flow-edge-visual-grammar";
import { formatFlowEdgeCanvasLabel } from "../diagram-renderers/flow-content-state";
import { resolveFlowEdgeMarker } from "../diagram-renderers/flow-presentation";
import { resolveDiagramRenderer } from "../diagram-renderers";
import type {
  EditorDiagramContextualActionsStrategy,
  EditorDiagramContextualInsertMode,
  EditorDiagramInspectorCopy,
  EditorDiagramInspectorStrategy,
  EditorDiagramLayoutStrategy,
  EditorDiagramModeId,
  EditorDiagramNodeRelationsInput,
  EditorDiagramNodeRelationsView,
  EditorDiagramPolicyLike,
  EditorDiagramPresentationStrategy,
  EditorDiagramQuickAddCopy,
  EditorDiagramQuickAddRoleOption,
  EditorDiagramQuickAddStrategy,
  EditorDiagramRenderStrategy,
  EditorDiagramSelectionQuickAction,
  EditorDiagramSemanticStrategy,
} from "./types";

const QUICK_ACTION_INSERT_MODE_BY_ACTION_ID: Record<
  DiagramContextualAction["id"],
  EditorDiagramContextualInsertMode
> = {
  "tree-add-child": "tree-child",
  "tree-add-sibling": "tree-sibling",
  "sitemap-add-page": "sitemap-child",
  "sitemap-add-subpage": "sitemap-sibling",
  "flow-add-next-step": "flow-next-step",
  "flow-add-decision": "flow-next-step",
  "flow-add-branch-path": "flow-branch",
  "flow-add-note": "flow-note",
  "mindmap-add-branch": "mindmap-branch",
  "mindmap-add-reference": "mindmap-reference",
  "graph-add-component": "graph-neighbor",
  "graph-add-dependency": "graph-dependency",
  "graph-add-supporting-service": "graph-supporting",
  "timeline-add-milestone": "timeline-next",
  "timeline-add-dependency": "timeline-dependency",
  "erd-add-relation": "erd-relation",
  "erd-add-field": "default",
};

function readRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function getMindmapRootNodeId(
  nodes: RFNode[],
  rootNodeName: string | undefined,
) {
  const normalizedRootName = rootNodeName?.trim().toLowerCase();

  if (normalizedRootName) {
    const byName = nodes.find(
      (node) => node.data.label.trim().toLowerCase() === normalizedRootName,
    );

    if (byName) {
      return byName.id;
    }
  }

  if (nodes.length === 0) {
    return null;
  }

  return (
    [...nodes]
      .sort(
        (nodeA, nodeB) =>
          Math.hypot(nodeA.position.x, nodeA.position.y) -
          Math.hypot(nodeB.position.x, nodeB.position.y),
      )
      .at(0)?.id ?? null
  );
}

export function buildQuickAddCopy(
  modeId: EditorDiagramModeId,
  t?: EditorTranslationFn,
): EditorDiagramQuickAddCopy {
  return {
    addPrimary: translateEditor(t, `shell.quickAdd.copy.${modeId}.addPrimary`),
    dialogTitle: translateEditor(
      t,
      `shell.quickAdd.copy.${modeId}.dialogTitle`,
    ),
    dialogHint: translateEditor(t, `shell.quickAdd.copy.${modeId}.dialogHint`),
    addConfirm: translateEditor(t, `shell.quickAdd.copy.${modeId}.addConfirm`),
    quickActionHint: translateEditor(
      t,
      `shell.quickAdd.copy.${modeId}.quickActionHint`,
    ),
  };
}

export function resolveDefaultRoleForModeKind(
  modeId: EditorDiagramModeId,
  kind: NodeKind,
): DiagramRole | undefined {
  if (modeId === "flow") {
    if (kind === "note") {
      return "flow-note";
    }

    if (kind === "flow-step") {
      return "flow-step";
    }

    return undefined;
  }

  if (modeId === "tree") {
    return "hierarchy-node";
  }

  if (modeId === "sitemap") {
    return "sitemap-section";
  }

  if (modeId === "graph") {
    return resolveGraphDefaultRoleForKind(kind);
  }

  if (modeId === "timeline") {
    return "timeline-milestone";
  }

  return undefined;
}

export function resolveDialogDefaultRole(input: {
  modeId: EditorDiagramModeId;
  kind: NodeKind;
  actionId?: EditorDiagramSelectionQuickAction["id"];
  hasSelection: boolean;
}): DiagramRole | undefined {
  if (input.modeId === "flow" && input.hasSelection) {
    if (input.actionId === "flow-add-decision") {
      return "flow-decision";
    }

    if (input.actionId === "flow-add-note") {
      return "flow-note";
    }
  }

  return resolveDefaultRoleForModeKind(input.modeId, input.kind);
}

function resolveFlowContextualAnchorNodeId(
  selectedNode: RFNode,
  edges: RFEdge[],
) {
  const selectedRole = resolveProcessNodeRole({
    diagramRole: selectedNode.data.diagramRole,
    kind: selectedNode.data.kind,
    label: selectedNode.data.label,
  });

  if (selectedRole !== "flow-note") {
    return selectedNode.id;
  }

  const hostEdge = edges.find(
    (edge) =>
      (edge.data?.kind ?? "flows-to") === "references" &&
      (edge.source === selectedNode.id || edge.target === selectedNode.id),
  );

  if (!hostEdge) {
    return selectedNode.id;
  }

  return hostEdge.source === selectedNode.id
    ? hostEdge.target
    : hostEdge.source;
}

export function createPresentationStrategy(
  modeId: EditorDiagramModeId,
): EditorDiagramPresentationStrategy {
  return {
    getDefaultNodeKind: () => getDefaultNodeKindForDiagram(modeId),
    getDefaultEdgeKind: () => getDefaultEdgeKindForDiagram(modeId),
    getAllowedNodeKinds: (inspectorMode, policy: EditorDiagramPolicyLike) =>
      getAllowedKindsForDiagram(modeId, inspectorMode, policy),
    getNodeKindLabel: (kind, mode, t) =>
      getNodeKindLabelForDiagram(modeId, kind, mode, t),
    getNodeKindDescription: (kind, t) =>
      getNodeKindDescriptionForDiagram(modeId, kind, t),
    getEdgeKindLabel: (kind, mode, t) =>
      getEdgeKindLabelForDiagram(modeId, kind, mode, t),
    getEdgeKindDescription: (kind, t) =>
      getEdgeKindDescriptionForDiagram(modeId, kind, t),
    getOperationalDisplayLabel,
  };
}

export function buildSelectionActionsFromDefinitions(
  definitions: DiagramContextualAction[],
): EditorDiagramSelectionQuickAction[] {
  return definitions
    .filter(
      (
        action,
      ): action is DiagramContextualAction & {
        type: "add-connected-node";
        nodeKind: NodeKind;
        edgeKind: EdgeKind;
      } =>
        action.type === "add-connected-node" &&
        Boolean(action.nodeKind && action.edgeKind),
    )
    .map((action) => ({
      id: action.id,
      label: action.label,
      nodeKind: action.nodeKind,
      edgeKind: action.edgeKind,
      insertMode: QUICK_ACTION_INSERT_MODE_BY_ACTION_ID[action.id],
      ...(action.edgeLabel ? { edgeLabel: action.edgeLabel } : {}),
    }));
}

export function createContextualActionsStrategy(
  modeId: EditorDiagramModeId,
): EditorDiagramContextualActionsStrategy {
  return {
    getDefinitions: (t?: EditorTranslationFn) =>
      getContextualActionsForDiagram(modeId, t),
    getSelectionActions: (t?: EditorTranslationFn) =>
      buildSelectionActionsFromDefinitions(
        getContextualActionsForDiagram(modeId, t),
      ),
    getPrimarySelectionAction: (t?: EditorTranslationFn) => {
      const actions = buildSelectionActionsFromDefinitions(
        getContextualActionsForDiagram(modeId, t),
      );

      return (
        actions[0] ?? {
          id: "mindmap-add-branch",
          label: translateEditor(
            t,
            "presentation.contextualActions.defaultAddRelated",
          ),
          nodeKind: getDefaultNodeKindForDiagram(modeId),
          edgeKind: getDefaultEdgeKindForDiagram(modeId),
          insertMode: "default",
        }
      );
    },
    resolveSourceNodeId: ({ action, selectedNode, edges }) => {
      if (!selectedNode) {
        return undefined;
      }

      if (
        action.id === "tree-add-sibling" ||
        action.id === "sitemap-add-subpage"
      ) {
        const parentEdge = edges.find(
          (edge) =>
            (edge.data?.kind ?? "flows-to") === "contains" &&
            edge.target === selectedNode.id,
        );

        return parentEdge?.source ?? selectedNode.id;
      }

      if (modeId === "flow") {
        return resolveFlowContextualAnchorNodeId(selectedNode, edges);
      }

      return selectedNode.id;
    },
  };
}

export function createQuickAddStrategy(
  modeId: EditorDiagramModeId,
  getRoleOptions: (
    t?: EditorTranslationFn,
  ) => EditorDiagramQuickAddRoleOption[] = () => [],
): EditorDiagramQuickAddStrategy {
  return {
    getCopy: (t?: EditorTranslationFn) => buildQuickAddCopy(modeId, t),
    getRoleOptions,
    resolveDefaultRoleForKind: (kind: NodeKind) =>
      resolveDefaultRoleForModeKind(modeId, kind),
    resolveDialogDefaultRole: (input) =>
      resolveDialogDefaultRole({
        modeId,
        kind: input.kind,
        actionId: input.actionId,
        hasSelection: input.hasSelection,
      }),
    buildDefaultNodeTitle: (input, t?: EditorTranslationFn) =>
      `${getNodeKindLabelForDiagram(modeId, input.kind, "operational", t)} ${input.nextIndex}`,
  };
}

function mapRoleToSemanticNodeKind(
  role: DiagramRole,
  fallbackKind: NodeKind,
): NodeKind {
  if (
    role === "tree-root" ||
    role === "tree-node" ||
    role === "hierarchy-root" ||
    role === "hierarchy-node" ||
    role === "sitemap-home" ||
    role === "sitemap-section"
  ) {
    return "page";
  }

  if (
    role === "flow-start" ||
    role === "flow-step" ||
    role === "flow-end" ||
    role === "flow-decision"
  ) {
    return "flow-step";
  }

  if (role === "flow-note") {
    return "note";
  }

  if (
    role === "mindmap-root" ||
    role === "mindmap-branch" ||
    role === "mindmap-reference"
  ) {
    return "note";
  }

  if (
    role === "graph-core" ||
    role === "graph-topic" ||
    role === "graph-supporting"
  ) {
    return mapGraphRoleToNodeKind(role, fallbackKind);
  }

  if (role === "timeline-milestone") {
    return fallbackKind === "flow-step" ? "flow-step" : "note";
  }

  if (role === "erd-entity") {
    return "entity";
  }

  if (role === "erd-comment") {
    return "note";
  }

  return fallbackKind;
}

export function createSemanticStrategy(
  modeId: EditorDiagramModeId,
): EditorDiagramSemanticStrategy {
  return {
    diagramType: modeId,
    resolveNodeRole: (input) =>
      resolveDiagramRole({
        diagramType: modeId,
        nodeKind: input.kind,
        nodePayload: input.nodePayload,
        nodeLabel: input.nodeLabel,
        layoutMetadata: { rootNodeName: input.rootNodeName ?? null },
      }),
    toRoleAwareNodeRef: (input) => {
      const role = resolveDiagramRole({
        diagramType: modeId,
        nodeKind: input.node.data.kind,
        nodePayload: input.node.data.payload,
        nodeLabel: input.node.data.label,
        layoutMetadata: { rootNodeName: input.rootNodeName ?? null },
      });

      return {
        id: input.node.id,
        kind: mapRoleToSemanticNodeKind(role, input.node.data.kind),
        label: input.node.data.label,
        payload: input.node.data.payload,
      };
    },
    getDiagramRoleLabel: (
      role: DiagramRole | undefined,
      t?: EditorTranslationFn,
    ) => {
      if (!role) {
        return translateEditor(t, "shell.roles.undefined");
      }

      if (
        role === "flow-start" ||
        role === "flow-step" ||
        role === "flow-note" ||
        role === "flow-end" ||
        role === "flow-decision"
      ) {
        return getProcessRoleMeta(role, t).kindLabel;
      }

      if (
        role === "graph-core" ||
        role === "graph-topic" ||
        role === "graph-supporting"
      ) {
        return resolveGraphNodeSemantic(
          {
            diagramRole: role,
            kind: role === "graph-supporting" ? "page" : "entity",
          },
          t,
        ).roleBadgeLabel;
      }

      const labels: Partial<Record<DiagramRole, string>> = {
        "meta-workspace": translateEditor(t, "shell.roles.metaWorkspace"),
        "meta-project": translateEditor(t, "shell.roles.metaProject"),
        "tree-root": translateEditor(t, "shell.roles.treeRoot"),
        "tree-node": translateEditor(t, "shell.roles.treeNode"),
        "hierarchy-root": translateEditor(t, "shell.roles.hierarchyRoot"),
        "hierarchy-node": translateEditor(t, "shell.roles.hierarchyNode"),
        "sitemap-home": translateEditor(t, "shell.roles.sitemapHome"),
        "sitemap-section": translateEditor(t, "shell.roles.sitemapSection"),
        "mindmap-root": translateEditor(t, "shell.roles.mindmapRoot"),
        "mindmap-branch": translateEditor(t, "shell.roles.mindmapBranch"),
        "mindmap-reference": translateEditor(t, "shell.roles.mindmapReference"),
        "timeline-milestone": translateEditor(
          t,
          "shell.roles.timelineMilestone",
        ),
        "erd-entity": translateEditor(t, "shell.roles.erdEntity"),
        "erd-comment": translateEditor(t, "shell.roles.erdComment"),
      };

      return labels[role] ?? translateEditor(t, "shell.roles.undefined");
    },
    getNodeStructureTips: (input, t?: EditorTranslationFn) => {
      if (modeId === "graph") {
        return resolveGraphNodeSemantic(
          {
            diagramRole: input.diagramRole,
            kind: input.diagramRole === "graph-supporting" ? "page" : "entity",
            incomingCount: input.incomingCount,
            outgoingCount: input.outgoingCount,
          },
          t,
        ).structureTips;
      }

      if (modeId === "flow") {
        const role = resolveProcessNodeRole({
          diagramRole: input.diagramRole,
          kind:
            input.nodeKind ??
            (input.diagramRole === "flow-note" ? "note" : "flow-step"),
          label: input.nodeLabel,
        });
        const roleMeta = getProcessRoleMeta(role, t);
        const tips = [roleMeta.summary];
        tips.push(
          input.incomingCount + input.outgoingCount === 0
            ? roleMeta.guidanceWhenSparse
            : roleMeta.guidanceWhenConnected,
        );

        if (role === "flow-decision") {
          tips.push(
            t
              ? t("process.guidance.decisionNeedsShortLabels")
              : "Destaque saidas com nomes curtos para deixar a bifurcacao didatica.",
          );
        }

        return tips;
      }

      if (modeId === "tree" || modeId === "sitemap") {
        return [
          translateEditor(t, "shell.structureTips.treeSitemapFocus"),
          translateEditor(t, "shell.structureTips.treeSitemapCurrent", {
            incomingCount: input.incomingCount,
            outgoingCount: input.outgoingCount,
          }),
        ];
      }

      if (modeId === "erd") {
        return [translateEditor(t, "shell.structureTips.erd")];
      }

      if (modeId === "mindmap") {
        return [translateEditor(t, "shell.structureTips.mindmap")];
      }

      if (modeId === "timeline") {
        return [translateEditor(t, "shell.structureTips.timeline")];
      }

      return [translateEditor(t, "shell.structureTips.default")];
    },
    ...(modeId === "graph"
      ? {
          graph: {
            resolveNodeSemantic: resolveGraphNodeSemantic,
            resolveEdgeSemantic: resolveGraphEdgeSemantic,
          },
        }
      : {}),
  };
}

function createDefaultInspectorCopy(
  modeId: EditorDiagramModeId,
  t?: EditorTranslationFn,
): EditorDiagramInspectorCopy {
  const isGraph = modeId === "graph";

  return {
    selectionBadgeLabel: translateEditor(t, "shell.selection.nodeFocused"),
    emptyTitle: translateEditor(t, "shell.emptyState.title"),
    emptySummary: translateEditor(t, "shell.emptyState.summary"),
    emptyGuidance: translateEditor(t, "shell.emptyState.guidance"),
    nodeTitleLabel: isGraph
      ? translateEditor(t, "shell.nodeFields.graphTitle")
      : translateEditor(t, "shell.nodeFields.title"),
    nodeKindLabel: isGraph
      ? translateEditor(t, "shell.nodeFields.graphKind")
      : translateEditor(t, "shell.nodeFields.kind"),
    nodeDescriptionLabel: isGraph
      ? translateEditor(t, "shell.nodeFields.graphDescription")
      : translateEditor(t, "shell.nodeFields.description"),
    nodeDescriptionPlaceholder: isGraph
      ? translateEditor(t, "shell.nodeFields.graphDescriptionPlaceholder")
      : translateEditor(t, "shell.nodeFields.descriptionPlaceholder"),
    nodeTagsLabel: isGraph
      ? translateEditor(t, "shell.nodeFields.graphTags")
      : translateEditor(t, "shell.nodeFields.tags"),
    nodeTagsPlaceholder: isGraph
      ? translateEditor(t, "shell.nodeFields.graphTagsPlaceholder")
      : translateEditor(t, "shell.nodeFields.tagsPlaceholder"),
    nodeTagsHelper: isGraph
      ? translateEditor(t, "shell.nodeFields.graphTagsHelper")
      : translateEditor(t, "shell.nodeFields.tagsHelper"),
    nodeContextTitle: isGraph
      ? translateEditor(t, "shell.nodeFields.graphContextTitle")
      : translateEditor(t, "shell.nodeFields.contextTitle"),
    generalSectionTitle: isGraph
      ? translateEditor(t, "shell.sections.graphGeneral")
      : translateEditor(t, "shell.sections.general"),
    detailsSectionTitle: isGraph
      ? translateEditor(t, "shell.sections.graphDetails")
      : translateEditor(t, "shell.sections.details"),
    relationsSectionTitle: isGraph
      ? translateEditor(t, "shell.sections.graphRelations")
      : translateEditor(t, "shell.sections.relations"),
    edgeLabelLabel: isGraph
      ? translateEditor(t, "shell.edgeFields.graphLabel")
      : translateEditor(t, "shell.edgeFields.label"),
    edgeGeneralSectionTitle: isGraph
      ? translateEditor(t, "shell.sections.graphEdgeGeneral")
      : translateEditor(t, "shell.sections.general"),
    edgeKindLabel: isGraph
      ? translateEditor(t, "shell.edgeFields.graphKind")
      : translateEditor(t, "shell.edgeFields.kind"),
    edgeSourceLabel: isGraph
      ? translateEditor(t, "shell.edgeFields.graphSource")
      : translateEditor(t, "shell.edgeFields.source"),
    edgeTargetLabel: isGraph
      ? translateEditor(t, "shell.edgeFields.graphTarget")
      : translateEditor(t, "shell.edgeFields.target"),
    nodeSubtitle:
      modeId === "graph"
        ? translateEditor(t, "shell.inspector.subtitle.graphNode")
        : modeId === "sitemap"
          ? translateEditor(t, "shell.inspector.subtitle.sitemap")
          : modeId === "tree"
            ? translateEditor(t, "shell.inspector.subtitle.tree")
            : modeId === "erd"
              ? translateEditor(t, "shell.inspector.subtitle.erd")
              : modeId === "timeline"
                ? translateEditor(t, "shell.inspector.subtitle.timeline")
                : modeId === "mindmap"
                  ? translateEditor(t, "shell.inspector.subtitle.mindmap")
                  : translateEditor(t, "shell.inspector.subtitle.defaultNode"),
    edgeSubtitle:
      modeId === "graph"
        ? translateEditor(t, "shell.inspector.subtitle.graphEdge")
        : translateEditor(t, "shell.inspector.subtitle.defaultEdge"),
  };
}

function createDefaultNodeRelations(
  modeId: EditorDiagramModeId,
  input: EditorDiagramNodeRelationsInput,
): EditorDiagramNodeRelationsView {
  const incoming = input.edges.filter(
    (edge) => edge.target === input.selectedNode.id,
  );
  const outgoing = input.edges.filter(
    (edge) => edge.source === input.selectedNode.id,
  );

  return {
    incomingCount: incoming.length,
    outgoingCount: outgoing.length,
    summaryChips: [],
    preview: [...incoming, ...outgoing].slice(0, 6).map((edge) => ({
      id: edge.id,
      direction:
        edge.target === input.selectedNode.id ? "incoming" : "outgoing",
      directionLabel:
        modeId === "graph"
          ? edge.target === input.selectedNode.id
            ? translateEditor(input.t, "shell.relations.graphIncoming")
            : translateEditor(input.t, "shell.relations.graphOutgoing")
          : edge.target === input.selectedNode.id
            ? translateEditor(input.t, "shell.relations.incoming")
            : translateEditor(input.t, "shell.relations.outgoing"),
      relationTypeLabel: getEdgeKindLabelForDiagram(
        modeId,
        edge.data?.kind ?? "relates-to",
        input.inspectorMode === "technical" ? "technical" : "operational",
        input.t,
      ),
      relationLabel: edge.label ? String(edge.label) : undefined,
      edgeKind: edge.data?.kind ?? "relates-to",
      otherNodeId:
        edge.target === input.selectedNode.id ? edge.source : edge.target,
      otherLabel:
        input.nodeLabelById.get(
          edge.target === input.selectedNode.id ? edge.source : edge.target,
        ) ?? translateEditor(input.t, "presentation.fallbacks.untitledNode"),
      sourceLabel: input.nodeLabelById.get(edge.source) ?? edge.source,
      targetLabel: input.nodeLabelById.get(edge.target) ?? edge.target,
    })),
  };
}

export function createDefaultInspectorStrategy(
  modeId: EditorDiagramModeId,
): EditorDiagramInspectorStrategy {
  return {
    kind: modeId === "graph" ? "graph" : modeId === "erd" ? "erd" : "default",
    getCopy: (t?: EditorTranslationFn) => createDefaultInspectorCopy(modeId, t),
    getSubtitle: ({ hasSelectedNode, hasSelectedEdge, t }) => {
      if (!hasSelectedNode && !hasSelectedEdge) {
        return translateEditor(t, "shell.inspector.subtitle.noneSelected");
      }

      const copy = createDefaultInspectorCopy(modeId, t);
      return hasSelectedEdge ? copy.edgeSubtitle : copy.nodeSubtitle;
    },
    buildNodeRelations: (input) => createDefaultNodeRelations(modeId, input),
    resolveSelectionBadge: ({ defaultBadge }) => defaultBadge,
  };
}

export function createProcessInspectorStrategy(): EditorDiagramInspectorStrategy {
  return {
    kind: "process",
    getCopy: (t?: EditorTranslationFn) => {
      const copy = getProcessInspectorCopy(t);

      return {
        selectionBadgeLabel: copy.selectionBadgeLabel,
        emptyTitle: copy.emptyTitle,
        emptySummary: copy.emptySummary,
        emptyGuidance: copy.emptyGuidance,
        nodeTitleLabel: copy.titleLabel,
        nodeKindLabel: copy.kindLabel,
        nodeDescriptionLabel: copy.descriptionLabel,
        nodeDescriptionPlaceholder: copy.descriptionPlaceholder,
        nodeTagsLabel: copy.tagsLabel,
        nodeTagsPlaceholder: copy.tagsPlaceholder,
        nodeTagsHelper: copy.tagsHelper,
        nodeContextTitle: copy.contextTitle,
        generalSectionTitle: copy.generalSectionTitle,
        detailsSectionTitle: copy.detailsSectionTitle,
        relationsSectionTitle: copy.relationsSectionTitle,
        edgeLabelLabel: copy.edgeLabelLabel,
        edgeGeneralSectionTitle: copy.edgeGeneralSectionTitle,
        edgeKindLabel: copy.edgeKindLabel,
        edgeSourceLabel: copy.edgeSourceLabel,
        edgeTargetLabel: copy.edgeTargetLabel,
        nodeSubtitle: copy.nodeSubtitle,
        edgeSubtitle: copy.edgeSubtitle,
      };
    },
    getSubtitle: ({ hasSelectedNode, hasSelectedEdge, t }) => {
      if (!hasSelectedNode && !hasSelectedEdge) {
        return translateEditor(t, "shell.inspector.subtitle.noneSelected");
      }

      const copy = getProcessInspectorCopy(t);
      return hasSelectedEdge ? copy.edgeSubtitle : copy.nodeSubtitle;
    },
    buildNodeRelations: (input) =>
      (() => {
        const relations = buildProcessRelationsViewModel(
          {
            selectedNodeId: input.selectedNode.id,
            selectedNodeRole: input.nodeRoleById.get(input.selectedNode.id),
            selectedNodeKind: input.selectedNode.data.kind,
            selectedNodeLabel:
              input.nodeLabelById.get(input.selectedNode.id) ??
              input.selectedNode.data.label,
            edges: input.edges.map((edge) => ({
              id: edge.id,
              source: edge.source,
              target: edge.target,
              label: edge.label ? String(edge.label) : undefined,
              edgeKind: edge.data?.kind ?? "relates-to",
              sourceRole: input.nodeRoleById.get(edge.source),
              targetRole: input.nodeRoleById.get(edge.target),
            })),
            nodeLabelById: input.nodeLabelById,
          },
          input.t,
        );

        return {
          ...relations,
          preview: relations.preview.map((relation) => ({
            ...relation,
            directionLabel:
              relation.direction === "incoming"
                ? translateEditor(input.t, "shell.relations.incoming")
                : translateEditor(input.t, "shell.relations.outgoing"),
            relationTypeLabel: getEdgeKindLabelForDiagram(
              "flow",
              relation.edgeKind,
              input.inspectorMode === "technical" ? "technical" : "operational",
              input.t,
            ),
          })),
        };
      })(),
    resolveSelectionBadge: ({ hasSelectedEdge, defaultBadge, t }) =>
      hasSelectedEdge
        ? translateEditor(t, "shell.selection.transitionInFocus")
        : getProcessInspectorCopy(t).selectionBadgeLabel || defaultBadge,
    process: {
      getCopy: getProcessInspectorCopy,
      resolveNodeViewModel: resolveProcessNodeInspectorViewModel,
      resolveEdgeViewModel: resolveProcessEdgeInspectorViewModel,
    },
  };
}

export function createLayoutStrategy(
  modeId: EditorDiagramModeId,
  input: {
    reapplyStrategy: "snapshot-native" | "local-reflow";
  },
): EditorDiagramLayoutStrategy {
  return {
    reapplyStrategy: input.reapplyStrategy,
    computeInsertPosition: (options) => {
      const basePosition = computeInsertPosition(
        modeId,
        options.referenceNode,
        options.nodes,
        options.viewport,
        {
          ...(readRecord(options.layoutOptions) ?? {}),
          insertMode: options.insertMode,
          insertNodeKind: options.nodeKind,
          insertDiagramRole: options.diagramRole,
        },
      );

      if (!options.referenceNode) {
        return basePosition;
      }

      if (options.insertMode === "timeline-dependency") {
        return {
          x: basePosition.x,
          y: basePosition.y + 140,
        };
      }

      if (
        options.insertMode === "tree-sibling" ||
        options.insertMode === "sitemap-sibling"
      ) {
        const siblingCount = options.edges.filter(
          (edge) =>
            edge.kind === "contains" &&
            edge.sourceNodeId === options.referenceNode!.id,
        ).length;

        return {
          x: basePosition.x + siblingCount * 190,
          y: basePosition.y,
        };
      }

      if (options.insertMode === "mindmap-reference") {
        return {
          x: Number(
            (
              options.referenceNode.position.x +
              (basePosition.x - options.referenceNode.position.x) * 0.8
            ).toFixed(2),
          ),
          y: Number(
            (
              options.referenceNode.position.y +
              (basePosition.y - options.referenceNode.position.y) * 0.8
            ).toFixed(2),
          ),
        };
      }

      if (options.insertMode === "graph-dependency") {
        return {
          x: basePosition.x,
          y: basePosition.y + 110,
        };
      }

      if (options.insertMode === "graph-supporting") {
        return {
          x: basePosition.x - 84,
          y: basePosition.y + 88,
        };
      }

      return basePosition;
    },
    computeReflow: (options) =>
      computeReflow(
        modeId,
        options.nodes,
        options.edges,
        options.rootId,
        options.layoutOptions,
      ),
    applyPostInsertLayout: (options) => {
      if (
        modeId === "flow" &&
        (options.insertMode === "flow-next-step" ||
          options.insertMode === "flow-branch" ||
          options.insertMode === "flow-note")
      ) {
        return {
          kind: "positions" as const,
          positions: computeFlowContextualNudgePositions({
            nodes: options.nodes,
            edges: options.edges,
            anchorNodeId: options.sourceNodeId,
            insertedNodeId: options.insertedNodeId,
            insertMode: options.insertMode,
            layoutOptions: options.layoutOptions,
          }),
        };
      }

      if (
        (modeId === "tree" &&
          (options.insertMode === "tree-child" ||
            options.insertMode === "tree-sibling")) ||
        (modeId === "sitemap" &&
          (options.insertMode === "sitemap-child" ||
            options.insertMode === "sitemap-sibling")) ||
        (modeId === "timeline" &&
          (options.insertMode === "timeline-next" ||
            options.insertMode === "timeline-dependency")) ||
        (modeId === "graph" &&
          (options.insertMode === "graph-neighbor" ||
            options.insertMode === "graph-dependency" ||
            options.insertMode === "graph-supporting"))
      ) {
        return { kind: "reflow" as const };
      }

      return { kind: "none" as const };
    },
    ...(modeId === "mindmap"
      ? {
          resolveRootNodeId: (options) =>
            options.computedRootNodeId &&
            options.nodes.some((node) => node.id === options.computedRootNodeId)
              ? options.computedRootNodeId
              : getMindmapRootNodeId(options.nodes, options.rootNodeName),
        }
      : {}),
  };
}

function resolveErdCardinalityFromPayload(
  payload: Record<string, unknown> | undefined,
) {
  const cardinality = readRecord(payload?.cardinality);
  const maxSource = cardinality?.maxSource;
  const maxTarget = cardinality?.maxTarget;

  if (
    (maxSource === 1 || maxSource === "N") &&
    (maxTarget === 1 || maxTarget === "N")
  ) {
    return `${maxSource === 1 ? "1" : "N"}:${maxTarget === 1 ? "1" : "N"}`;
  }

  return undefined;
}

function resolveErdEdgeClassSuffix(
  payload: Record<string, unknown> | undefined,
) {
  const preset = resolveErdCardinalityFromPayload(payload);
  return preset ? preset.replace(":", "-").toLowerCase() : undefined;
}

function resolveErdEdgeLabel(input: {
  baseLabel: string | undefined;
  edgeKind: EdgeKind;
  payload: Record<string, unknown> | undefined;
  modeId: EditorDiagramModeId;
}) {
  if (input.modeId !== "erd" || input.edgeKind !== "references") {
    return input.baseLabel;
  }

  const preset = resolveErdCardinalityFromPayload(input.payload);
  if (!preset) {
    return input.baseLabel;
  }

  const baseLabel = input.baseLabel?.trim();
  return baseLabel ? `${baseLabel} (${preset})` : preset;
}

export function createRenderStrategy(
  modeId: EditorDiagramModeId,
): EditorDiagramRenderStrategy {
  return {
    resolveEdgePresentation: (input) => {
      const resolvedLabel = resolveErdEdgeLabel({
        baseLabel: input.baseLabel,
        edgeKind: input.edgeKind,
        payload: input.payload,
        modeId,
      });
      const basePresentation = getEdgeKindPresentation(input.edgeKind);
      const graphSemantic =
        modeId === "graph" ? resolveGraphEdgeSemantic(input.edgeKind) : null;
      const flowEdgeVisualSemantics =
        modeId === "flow"
          ? resolveFlowEdgeVisualSemantics({
              edgeKind: input.edgeKind,
              label: resolvedLabel,
              sourceRole: input.sourceRole,
              targetRole: input.targetRole,
              sourcePosition: input.sourcePosition,
              targetPosition: input.targetPosition,
              direction: input.direction,
            })
          : null;
      const erdCardinalityClassSuffix = resolveErdEdgeClassSuffix(
        input.payload,
      );

      return {
        label:
          modeId === "flow"
            ? formatFlowEdgeCanvasLabel(resolvedLabel)
            : resolvedLabel,
        markerEnd:
          modeId === "flow"
            ? basePresentation.arrowStyle === "none"
              ? undefined
              : flowEdgeVisualSemantics
                ? ({
                    type: flowEdgeVisualSemantics.markerType,
                    color: flowEdgeVisualSemantics.markerColor,
                  } as const)
                : (resolveFlowEdgeMarker(input.edgeKind) ??
                  ({
                    type:
                      basePresentation.arrowStyle === "open"
                        ? MarkerType.Arrow
                        : MarkerType.ArrowClosed,
                    color: "var(--flow-edge-main)",
                  } as const))
            : modeId === "graph"
              ? graphSemantic?.markerStyle === "none"
                ? undefined
                : graphSemantic?.markerStyle === "open"
                  ? ({
                      type: MarkerType.Arrow,
                      color: "var(--canvas-edge-color)",
                    } as const)
                  : graphSemantic?.markerStyle === "closed"
                    ? ({
                        type: MarkerType.ArrowClosed,
                        color: "var(--canvas-edge-color)",
                      } as const)
                    : undefined
              : basePresentation.arrowStyle === "none"
                ? undefined
                : ({
                    type:
                      basePresentation.arrowStyle === "open"
                        ? MarkerType.Arrow
                        : MarkerType.ArrowClosed,
                    color: "var(--canvas-edge-color)",
                  } as const),
        labelStyle:
          modeId === "flow"
            ? flowEdgeVisualSemantics
              ? {
                  fill: flowEdgeVisualSemantics.labelTextColor,
                  fontWeight: flowEdgeVisualSemantics.labelFontWeight,
                  fontSize: flowEdgeVisualSemantics.labelFontSize,
                  letterSpacing: flowEdgeVisualSemantics.labelLetterSpacing,
                }
              : undefined
            : modeId === "graph"
              ? graphSemantic?.emphasis === "primary"
                ? {
                    fill: "#92400e",
                    fontWeight: 700,
                    textTransform: "uppercase",
                  }
                : graphSemantic?.emphasis === "secondary"
                  ? {
                      fill: "#1d4ed8",
                      fontWeight: 700,
                    }
                  : graphSemantic?.emphasis === "supporting"
                    ? {
                        fill: "#334155",
                        fontWeight: 700,
                      }
                    : {
                        fontWeight: 700,
                      }
              : undefined,
        labelBgStyle:
          modeId === "flow"
            ? flowEdgeVisualSemantics
              ? {
                  fill: flowEdgeVisualSemantics.labelBackgroundColor,
                  stroke: flowEdgeVisualSemantics.labelBorderColor,
                }
              : undefined
            : modeId === "graph"
              ? graphSemantic?.emphasis === "primary"
                ? {
                    fill: "rgba(254, 243, 199, 0.92)",
                    stroke: "rgba(217, 119, 6, 0.28)",
                  }
                : graphSemantic?.emphasis === "secondary"
                  ? {
                      fill: "rgba(219, 234, 254, 0.92)",
                      stroke: "rgba(37, 99, 235, 0.22)",
                    }
                  : graphSemantic?.emphasis === "supporting"
                    ? {
                        fill: "rgba(241, 245, 249, 0.94)",
                        stroke: "rgba(71, 85, 105, 0.2)",
                      }
                    : undefined
              : undefined,
        labelShowBg: modeId === "graph" || modeId === "flow" ? true : undefined,
        labelBgPadding:
          modeId === "flow"
            ? flowEdgeVisualSemantics?.labelBgPadding
            : modeId === "graph"
              ? [10, 5]
              : undefined,
        labelBgBorderRadius:
          modeId === "flow"
            ? flowEdgeVisualSemantics?.labelBgBorderRadius
            : modeId === "graph"
              ? 10
              : undefined,
        strokeDasharray:
          modeId === "flow"
            ? flowEdgeVisualSemantics?.strokeDasharray
            : modeId === "erd" && input.edgeKind === "references"
              ? erdCardinalityClassSuffix === "1-n" ||
                erdCardinalityClassSuffix === "n-1"
                ? "7 4"
                : erdCardinalityClassSuffix === "n-n"
                  ? "2 5"
                  : undefined
              : modeId === "graph"
                ? graphSemantic?.strokeStyle === "dashed"
                  ? "10 6"
                  : graphSemantic?.strokeStyle === "dotted"
                    ? "2 8"
                    : undefined
                : basePresentation.lineStyle === "dashed"
                  ? "8 6"
                  : basePresentation.lineStyle === "dotted"
                    ? "2 7"
                    : undefined,
        classNameTokens: [
          ...(flowEdgeVisualSemantics?.classNameTokens ?? []),
          ...(erdCardinalityClassSuffix
            ? [`editor-edge-erd-cardinality-${erdCardinalityClassSuffix}`]
            : []),
        ],
      };
    },
  };
}

export function createRendererResolver(modeId: EditorDiagramModeId) {
  return (input: {
    diagramView?: string;
    template?: ProjectTemplate;
    layoutOptions?: unknown;
  }) =>
    resolveDiagramRenderer({
      diagramView: input.diagramView ?? modeId,
      template: input.template,
      layoutOptions: input.layoutOptions,
    });
}

export function createTreeQuickAddRoleOptions(
  t?: EditorTranslationFn,
): EditorDiagramQuickAddRoleOption[] {
  return [
    {
      role: "hierarchy-root",
      label: translateEditor(t, "shell.quickAdd.roles.hierarchyRoot.label"),
      description: translateEditor(
        t,
        "shell.quickAdd.roles.hierarchyRoot.description",
      ),
      baseKind: "page",
    },
    {
      role: "hierarchy-node",
      label: translateEditor(t, "shell.quickAdd.roles.hierarchyNode.label"),
      description: translateEditor(
        t,
        "shell.quickAdd.roles.hierarchyNode.description",
      ),
      baseKind: "page",
    },
  ];
}

export function createSitemapQuickAddRoleOptions(
  t?: EditorTranslationFn,
): EditorDiagramQuickAddRoleOption[] {
  return [
    {
      role: "sitemap-home",
      label: translateEditor(t, "shell.quickAdd.roles.sitemapHome.label"),
      description: translateEditor(
        t,
        "shell.quickAdd.roles.sitemapHome.description",
      ),
      baseKind: "page",
    },
    {
      role: "sitemap-section",
      label: translateEditor(t, "shell.quickAdd.roles.sitemapSection.label"),
      description: translateEditor(
        t,
        "shell.quickAdd.roles.sitemapSection.description",
      ),
      baseKind: "page",
    },
  ];
}

export function createTimelineQuickAddRoleOptions(
  t?: EditorTranslationFn,
): EditorDiagramQuickAddRoleOption[] {
  return [
    {
      role: "timeline-milestone",
      label: translateEditor(t, "shell.quickAdd.roles.timelineMilestone.label"),
      description: translateEditor(
        t,
        "shell.quickAdd.roles.timelineMilestone.description",
      ),
      baseKind: "note",
    },
  ];
}

export const graphQuickAddRoleOptions = listGraphQuickAddRoleOptions;
export const processQuickAddRoleOptions = getProcessQuickAddRoleOptions;
