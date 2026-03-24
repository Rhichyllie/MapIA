import type { EdgeKind, NodeKind } from "@/src/domain";
import {
  resolveFlowDiagramRole,
  type DiagramRole,
  type FlowDiagramRole,
} from "@/src/modules/diagrams/domain";
import { translateEditor, type EditorTranslationFn } from "../editor-i18n";

export type ProcessNodeRole = FlowDiagramRole;

export type ProcessQuickActionId =
  | "flow-add-next-step"
  | "flow-add-branch"
  | "flow-add-note";

export type ProcessQuickActionDefinition = {
  id: ProcessQuickActionId;
  label: string;
  nodeKind: NodeKind;
  edgeKind: EdgeKind;
  edgeLabel?: string;
};

export type ProcessQuickAddRoleOption = {
  role: ProcessNodeRole;
  label: string;
  description: string;
  baseKind: NodeKind;
};

export type ProcessRelationPreview = {
  id: string;
  edgeKind: EdgeKind;
  otherNodeId: string;
  otherLabel: string;
  sourceLabel: string;
  targetLabel: string;
  direction: "incoming" | "outgoing";
  lane: "before" | "after" | "branch" | "note";
  laneLabel: string;
  transitionLabel: string;
  supportingLabel: string;
  relationLabel?: string;
};

export type ProcessRelationsViewModel = {
  incomingCount: number;
  outgoingCount: number;
  summaryChips: Array<{
    id: "before" | "after" | "branch" | "note";
    label: string;
    count: number;
  }>;
  preview: ProcessRelationPreview[];
};

export type ProcessNodeOverview = {
  badgeLabel: string;
  kindLabel: string;
  summary: string;
  positionLabel: string;
  connectivityLabel: string;
  guidance: string[];
};

export type ProcessEdgeOverview = {
  badgeLabel: string;
  transitionTypeLabel: string;
  summary: string;
  guidance: string[];
};

export type ProcessInspectorCopy = {
  selectionBadgeLabel: string;
  emptyTitle: string;
  emptySummary: string;
  emptyGuidance: string;
  titleLabel: string;
  kindLabel: string;
  descriptionLabel: string;
  descriptionPlaceholder: string;
  tagsLabel: string;
  tagsPlaceholder: string;
  tagsHelper: string;
  contextTitle: string;
  generalSectionTitle: string;
  detailsSectionTitle: string;
  relationsSectionTitle: string;
  edgeGeneralSectionTitle: string;
  edgeLabelLabel: string;
  edgeKindLabel: string;
  edgeSourceLabel: string;
  edgeTargetLabel: string;
  nodeSubtitle: string;
  edgeSubtitle: string;
  relationsEmptyState: string;
};

type ProcessRoleMeta = {
  badgeLabel: string;
  kindLabel: string;
  canvasHint: string;
  summary: string;
  positionEmptyLabel: string;
  positionConnectedLabel: string;
  guidanceWhenSparse: string;
  guidanceWhenConnected: string;
};

type ProcessEdgeMeta = {
  labelOperational: string;
  description: string;
  outgoingLaneLabel: string;
  incomingLaneLabel: string;
  supportingLabel: string;
  edgeBadgeLabel: string;
  edgeSummaryTemplate: (sourceLabel: string, targetLabel: string) => string;
  guidance: string[];
};

const PROCESS_EDGE_GUIDANCE_INDEXES: Record<EdgeKind, number[]> = {
  contains: [0],
  references: [0, 1],
  "depends-on": [0, 1],
  "flows-to": [0, 1],
  "relates-to": [0],
};

const PROCESS_QUICK_ACTIONS: Array<
  Omit<ProcessQuickActionDefinition, "label" | "edgeLabel">
> = [
  {
    id: "flow-add-next-step",
    nodeKind: "flow-step",
    edgeKind: "flows-to",
  },
  {
    id: "flow-add-branch",
    nodeKind: "flow-step",
    edgeKind: "depends-on",
  },
  {
    id: "flow-add-note",
    nodeKind: "note",
    edgeKind: "references",
  },
];

const PROCESS_QUICK_ACTION_EDGE_LABEL_IDS: Partial<
  Record<ProcessQuickActionId, string>
> = {
  "flow-add-branch": "process.quickActions.flow-add-branch.edgeLabel",
  "flow-add-note": "process.quickActions.flow-add-note.edgeLabel",
};

const PROCESS_QUICK_ADD_ROLE_OPTIONS: Array<
  Pick<ProcessQuickAddRoleOption, "role" | "baseKind">
> = [
  {
    role: "flow-start",
    baseKind: "flow-step",
  },
  {
    role: "flow-step",
    baseKind: "flow-step",
  },
  {
    role: "flow-decision",
    baseKind: "flow-step",
  },
  {
    role: "flow-note",
    baseKind: "note",
  },
  {
    role: "flow-end",
    baseKind: "flow-step",
  },
];

function formatRelationLabel(label: string | undefined) {
  const normalized = label?.trim();
  return normalized ? normalized : undefined;
}

function formatProcessConnectivityLabel(
  incomingCount: number,
  outgoingCount: number,
  t?: EditorTranslationFn,
) {
  if (incomingCount === 0 && outgoingCount === 0) {
    return translateEditor(t, "process.connectivity.none");
  }

  return translateEditor(t, "process.connectivity.summary", {
    incomingCount,
    outgoingCount,
  });
}

export function resolveProcessNodeRole(input: {
  diagramRole?: DiagramRole;
  kind: NodeKind;
  label?: string;
}): ProcessNodeRole {
  return resolveFlowDiagramRole({
    explicitRole: input.diagramRole,
    nodeKind: input.kind,
    nodeLabel: input.label,
  });
}

export function getProcessRoleMeta(role: ProcessNodeRole, t?: EditorTranslationFn) {
  return {
    badgeLabel: translateEditor(t, `process.roles.${role}.badgeLabel`),
    kindLabel: translateEditor(t, `process.roles.${role}.kindLabel`),
    canvasHint: translateEditor(t, `process.roles.${role}.canvasHint`),
    summary: translateEditor(t, `process.roles.${role}.summary`),
    positionEmptyLabel: translateEditor(t, `process.roles.${role}.positionEmptyLabel`),
    positionConnectedLabel: translateEditor(
      t,
      `process.roles.${role}.positionConnectedLabel`,
    ),
    guidanceWhenSparse: translateEditor(
      t,
      `process.roles.${role}.guidanceWhenSparse`,
    ),
    guidanceWhenConnected: translateEditor(
      t,
      `process.roles.${role}.guidanceWhenConnected`,
    ),
  } satisfies ProcessRoleMeta;
}

export function getProcessNodeKindCopy(kind: NodeKind, t?: EditorTranslationFn) {
  if (kind === "flow-step") {
    return {
      labelOperational: translateEditor(t, "process.nodeKinds.flow-step.labelOperational"),
      description: translateEditor(t, "process.nodeKinds.flow-step.description"),
    };
  }

  if (kind === "note") {
    return {
      labelOperational: translateEditor(t, "process.nodeKinds.note.labelOperational"),
      description: translateEditor(t, "process.nodeKinds.note.description"),
    };
  }

  return null;
}

export function getProcessEdgeCopy(kind: EdgeKind, t?: EditorTranslationFn) {
  return {
    labelOperational: translateEditor(t, `process.edgeKinds.${kind}.labelOperational`),
    description: translateEditor(t, `process.edgeKinds.${kind}.description`),
    outgoingLaneLabel: translateEditor(t, `process.edgeKinds.${kind}.outgoingLaneLabel`),
    incomingLaneLabel: translateEditor(t, `process.edgeKinds.${kind}.incomingLaneLabel`),
    supportingLabel: translateEditor(t, `process.edgeKinds.${kind}.supportingLabel`),
    edgeBadgeLabel: translateEditor(t, `process.edgeKinds.${kind}.edgeBadgeLabel`),
    edgeSummaryTemplate: (sourceLabel: string, targetLabel: string) =>
      translateEditor(
        t,
        `process.edgeKinds.${kind}.edgeSummary`,
        { sourceLabel, targetLabel },
      ),
    guidance: PROCESS_EDGE_GUIDANCE_INDEXES[kind].map((index) =>
      translateEditor(t, `process.edgeKinds.${kind}.guidance.${index}`),
    ),
  } satisfies ProcessEdgeMeta;
}

export function getProcessQuickActions(t?: EditorTranslationFn) {
  return PROCESS_QUICK_ACTIONS.map((action) => ({
    ...action,
    label: translateEditor(t, `process.quickActions.${action.id}.label`),
    ...(PROCESS_QUICK_ACTION_EDGE_LABEL_IDS[action.id]
      ? {
          edgeLabel: translateEditor(
            t,
            PROCESS_QUICK_ACTION_EDGE_LABEL_IDS[action.id]!,
          ),
        }
      : {}),
  }));
}

export function getProcessQuickAddRoleOptions(t?: EditorTranslationFn) {
  return PROCESS_QUICK_ADD_ROLE_OPTIONS.map((option) => ({
    ...option,
    label: translateEditor(t, `process.quickAddRoles.${option.role}.label`),
    description: translateEditor(t, `process.quickAddRoles.${option.role}.description`),
  }));
}

export function getProcessInspectorCopy(t?: EditorTranslationFn) {
  return {
    selectionBadgeLabel: translateEditor(t, "process.inspector.selectionBadgeLabel"),
    emptyTitle: translateEditor(t, "process.inspector.emptyTitle"),
    emptySummary: translateEditor(t, "process.inspector.emptySummary"),
    emptyGuidance: translateEditor(t, "process.inspector.emptyGuidance"),
    titleLabel: translateEditor(t, "process.inspector.titleLabel"),
    kindLabel: translateEditor(t, "process.inspector.kindLabel"),
    descriptionLabel: translateEditor(t, "process.inspector.descriptionLabel"),
    descriptionPlaceholder: translateEditor(
      t,
      "process.inspector.descriptionPlaceholder",
    ),
    tagsLabel: translateEditor(t, "process.inspector.tagsLabel"),
    tagsPlaceholder: translateEditor(t, "process.inspector.tagsPlaceholder"),
    tagsHelper: translateEditor(t, "process.inspector.tagsHelper"),
    contextTitle: translateEditor(t, "process.inspector.contextTitle"),
    generalSectionTitle: translateEditor(t, "process.inspector.generalSectionTitle"),
    detailsSectionTitle: translateEditor(t, "process.inspector.detailsSectionTitle"),
    relationsSectionTitle: translateEditor(t, "process.inspector.relationsSectionTitle"),
    edgeGeneralSectionTitle: translateEditor(
      t,
      "process.inspector.edgeGeneralSectionTitle",
    ),
    edgeLabelLabel: translateEditor(t, "process.inspector.edgeLabelLabel"),
    edgeKindLabel: translateEditor(t, "process.inspector.edgeKindLabel"),
    edgeSourceLabel: translateEditor(t, "process.inspector.edgeSourceLabel"),
    edgeTargetLabel: translateEditor(t, "process.inspector.edgeTargetLabel"),
    nodeSubtitle: translateEditor(t, "process.inspector.nodeSubtitle"),
    edgeSubtitle: translateEditor(t, "process.inspector.edgeSubtitle"),
    relationsEmptyState: translateEditor(t, "process.inspector.relationsEmptyState"),
  } satisfies ProcessInspectorCopy;
}

export function buildProcessNodeOverview(input: {
  role: ProcessNodeRole;
  incomingCount: number;
  outgoingCount: number;
  relations: ProcessRelationsViewModel;
}, t?: EditorTranslationFn) {
  const meta = getProcessRoleMeta(input.role, t);
  const hasAnyRelation = input.incomingCount + input.outgoingCount > 0;
  const branchCount =
    input.relations.summaryChips.find((chip) => chip.id === "branch")?.count ?? 0;
  const noteCount =
    input.relations.summaryChips.find((chip) => chip.id === "note")?.count ?? 0;
  const guidance: string[] = [];

  if (!hasAnyRelation) {
    guidance.push(meta.guidanceWhenSparse);
  } else {
    guidance.push(meta.guidanceWhenConnected);
  }

  if (input.role === "flow-decision" && branchCount < 2) {
    guidance.push(
      translateEditor(
        t,
        "process.guidance.decisionNeedsPaths",
      ),
    );
  }

  if (input.role === "flow-note" && noteCount === 0) {
    guidance.push(
      translateEditor(
        t,
        "process.guidance.noteNeedsAnchor",
      ),
    );
  }

  if (input.role === "flow-end" && input.outgoingCount > 0) {
    guidance.push(
      translateEditor(
        t,
        "process.guidance.endShouldTerminate",
      ),
    );
  }

  if (input.role === "flow-start" && input.incomingCount > 0) {
    guidance.push(
      translateEditor(
        t,
        "process.guidance.startHasIncoming",
      ),
    );
  }

  return {
    badgeLabel: meta.badgeLabel,
    kindLabel: meta.kindLabel,
    summary: meta.summary,
    positionLabel:
      hasAnyRelation && input.incomingCount > 0
        ? meta.positionConnectedLabel
        : meta.positionEmptyLabel,
    connectivityLabel: formatProcessConnectivityLabel(
      input.incomingCount,
      input.outgoingCount,
      t,
    ),
    guidance,
  } satisfies ProcessNodeOverview;
}

export function buildProcessEdgeOverview(input: {
  kind: EdgeKind;
  label?: string;
  sourceLabel: string;
  targetLabel: string;
}, t?: EditorTranslationFn) {
  const meta = getProcessEdgeCopy(input.kind, t);
  const relationLabel = formatRelationLabel(input.label);
  const guidance = [...meta.guidance];

  if (relationLabel) {
    guidance.unshift(
      translateEditor(
        t,
        "process.edgeOverview.currentLabel",
        { relationLabel },
      ),
    );
  }

  return {
    badgeLabel: meta.edgeBadgeLabel,
    transitionTypeLabel: meta.labelOperational,
    summary: meta.edgeSummaryTemplate(input.sourceLabel, input.targetLabel),
    guidance,
  } satisfies ProcessEdgeOverview;
}

export function buildProcessRelationsViewModel(input: {
  selectedNodeId: string;
  selectedNodeRole?: DiagramRole;
  selectedNodeKind?: NodeKind;
  selectedNodeLabel?: string;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    label?: string | null;
    edgeKind: EdgeKind;
    sourceRole?: DiagramRole;
    targetRole?: DiagramRole;
  }>;
  nodeLabelById: ReadonlyMap<string, string>;
  limit?: number;
}, t?: EditorTranslationFn) {
  const selectedRole = resolveProcessNodeRole({
    diagramRole: input.selectedNodeRole,
    kind: input.selectedNodeKind ?? "flow-step",
    label: input.selectedNodeLabel,
  });
  const incoming = input.edges.filter((edge) => edge.target === input.selectedNodeId);
  const outgoing = input.edges.filter((edge) => edge.source === input.selectedNodeId);
  const counters = {
    before: 0,
    after: 0,
    branch: 0,
    note: 0,
  };

  const preview = [...incoming, ...outgoing]
    .slice(0, input.limit ?? 6)
    .map((edge) => {
      const direction = edge.target === input.selectedNodeId ? "incoming" : "outgoing";
      const otherNodeId =
        direction === "incoming" ? edge.source : edge.target;
      const otherLabel =
        input.nodeLabelById.get(otherNodeId) ??
        translateEditor(t, "process.fallbacks.untitledItem");
      const sourceLabel = input.nodeLabelById.get(edge.source) ?? edge.source;
      const targetLabel = input.nodeLabelById.get(edge.target) ?? edge.target;
      const otherRole =
        direction === "incoming" ? edge.sourceRole : edge.targetRole;

      let lane: ProcessRelationPreview["lane"];
      if (
        edge.edgeKind === "references" ||
        otherRole === "flow-note" ||
        selectedRole === "flow-note"
      ) {
        lane = "note";
      } else if (
        edge.edgeKind === "depends-on" ||
        otherRole === "flow-decision" ||
        selectedRole === "flow-decision"
      ) {
        lane = "branch";
      } else if (direction === "incoming") {
        lane = "before";
      } else {
        lane = "after";
      }

      counters[lane] += 1;

      const edgeMeta = getProcessEdgeCopy(edge.edgeKind, t);
      const relationLabel = formatRelationLabel(edge.label ?? undefined);

      return {
        id: edge.id,
        edgeKind: edge.edgeKind,
        otherNodeId,
        otherLabel,
        sourceLabel,
        targetLabel,
        direction,
        lane,
        laneLabel:
          lane === "before"
            ? translateEditor(t, "process.lanes.before")
            : lane === "after"
              ? translateEditor(t, "process.lanes.after")
              : lane === "branch"
                ? translateEditor(t, "process.lanes.branch")
                : translateEditor(t, "process.lanes.note"),
        transitionLabel:
          direction === "incoming"
            ? edgeMeta.incomingLaneLabel
            : edgeMeta.outgoingLaneLabel,
        supportingLabel: edgeMeta.supportingLabel,
        ...(relationLabel ? { relationLabel } : {}),
      } satisfies ProcessRelationPreview;
    });

  const summaryChips = [
    {
      id: "before" as const,
      label: translateEditor(t, "process.summaryChips.before"),
      count: counters.before,
    },
    {
      id: "after" as const,
      label: translateEditor(t, "process.summaryChips.after"),
      count: counters.after,
    },
    {
      id: "branch" as const,
      label: translateEditor(t, "process.summaryChips.branch"),
      count: counters.branch,
    },
    {
      id: "note" as const,
      label: translateEditor(t, "process.summaryChips.note"),
      count: counters.note,
    },
  ].filter((chip) => chip.count > 0);

  return {
    incomingCount: incoming.length,
    outgoingCount: outgoing.length,
    summaryChips,
    preview,
  } satisfies ProcessRelationsViewModel;
}
