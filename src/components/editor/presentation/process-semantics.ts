import type { EdgeKind, NodeKind } from "@/src/domain";
import {
  getProcessRoleSemantics,
  isProcessMainEdgeKind,
  readProcessOperationalContextFromPayload,
  resolveFlowDiagramRole,
  type DiagramRole,
  type ProcessCriticality,
  type ProcessNodeRole as DomainProcessNodeRole,
  type ProcessOperationalContext,
} from "@/src/modules/diagrams/domain";
import { translateEditor, type EditorTranslationFn } from "../editor-i18n";

export type ProcessNodeRole = DomainProcessNodeRole;

export type ProcessQuickActionId =
  | "flow-add-next-step"
  | "flow-add-decision"
  | "flow-add-branch-path"
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
  mainIncomingCount: number;
  mainOutgoingCount: number;
  namedOutgoingCount: number;
  branchOutgoingCount: number;
  supportingCount: number;
  summaryChips: Array<{
    id: "before" | "after" | "branch" | "note";
    label: string;
    count: number;
  }>;
  preview: ProcessRelationPreview[];
};

export type ProcessOperationalHighlight = {
  id: string;
  label: string;
  tone: "neutral" | "attention" | "critical";
};

export type ProcessNodeOverview = {
  badgeLabel: string;
  kindLabel: string;
  summary: string;
  positionLabel: string;
  connectivityLabel: string;
  operationalHighlights: ProcessOperationalHighlight[];
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
  ownerLabel: string;
  ownerPlaceholder: string;
  areaLabel: string;
  areaPlaceholder: string;
  channelLabel: string;
  channelPlaceholder: string;
  criticalityLabel: string;
  slaLabel: string;
  slaPlaceholder: string;
  ruleLabel: string;
  rulePlaceholder: string;
  exceptionLabel: string;
  exceptionPlaceholder: string;
  operationsSummaryTitle: string;
  operationsSummaryEmpty: string;
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

const PROCESS_ACTION_LIBRARY: Record<
  ProcessQuickActionId,
  Omit<ProcessQuickActionDefinition, "label" | "edgeLabel">
> = {
  "flow-add-next-step": {
    id: "flow-add-next-step",
    nodeKind: "flow-step",
    edgeKind: "flows-to",
  },
  "flow-add-decision": {
    id: "flow-add-decision",
    nodeKind: "flow-step",
    edgeKind: "flows-to",
  },
  "flow-add-branch-path": {
    id: "flow-add-branch-path",
    nodeKind: "flow-step",
    edgeKind: "depends-on",
  },
  "flow-add-note": {
    id: "flow-add-note",
    nodeKind: "note",
    edgeKind: "references",
  },
};

const DEFAULT_PROCESS_QUICK_ACTION_IDS: ProcessQuickActionId[] = [
  "flow-add-next-step",
  "flow-add-decision",
  "flow-add-note",
];

const PROCESS_QUICK_ACTION_EDGE_LABEL_IDS: Partial<
  Record<ProcessQuickActionId, string>
> = {
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

function normalizeLabelComparison(label: string | undefined) {
  return label
    ?.normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
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

function buildQuickAction(
  id: ProcessQuickActionId,
  t?: EditorTranslationFn,
  edgeLabel?: string,
): ProcessQuickActionDefinition {
  const action = PROCESS_ACTION_LIBRARY[id];
  const defaultEdgeLabelId = PROCESS_QUICK_ACTION_EDGE_LABEL_IDS[id];

  return {
    ...action,
    label: translateEditor(t, `process.quickActions.${id}.label`),
    ...((edgeLabel ?? (defaultEdgeLabelId ? translateEditor(t, defaultEdgeLabelId) : undefined))
      ? {
          edgeLabel:
            edgeLabel ??
            (defaultEdgeLabelId ? translateEditor(t, defaultEdgeLabelId) : undefined),
        }
      : {}),
  };
}

function buildCriticalityHighlight(
  criticality: ProcessCriticality | undefined,
  t?: EditorTranslationFn,
): ProcessOperationalHighlight | null {
  if (!criticality) {
    return null;
  }

  return {
    id: "criticality",
    label: translateEditor(t, `process.operational.summary.criticality.${criticality}`),
    tone:
      criticality === "critical"
        ? "critical"
        : criticality === "high"
          ? "attention"
          : "neutral",
  };
}

function buildProcessOperationalHighlights(
  context: ProcessOperationalContext | undefined,
  t?: EditorTranslationFn,
) {
  if (!context) {
    return [] as ProcessOperationalHighlight[];
  }

  const highlights: ProcessOperationalHighlight[] = [];

  if (context.owner) {
    highlights.push({
      id: "owner",
      label: translateEditor(t, "process.operational.summary.owner", {
        value: context.owner,
      }),
      tone: "neutral",
    });
  }

  if (context.area) {
    highlights.push({
      id: "area",
      label: translateEditor(t, "process.operational.summary.area", {
        value: context.area,
      }),
      tone: "neutral",
    });
  }

  if (context.channel) {
    highlights.push({
      id: "channel",
      label: translateEditor(t, "process.operational.summary.channel", {
        value: context.channel,
      }),
      tone: "neutral",
    });
  }

  const criticalityHighlight = buildCriticalityHighlight(context.criticality, t);
  if (criticalityHighlight) {
    highlights.push(criticalityHighlight);
  }

  if (context.sla) {
    highlights.push({
      id: "sla",
      label: translateEditor(t, "process.operational.summary.sla", {
        value: context.sla,
      }),
      tone: "attention",
    });
  }

  return highlights;
}

function resolveProcessRelationLane(input: {
  edgeKind: EdgeKind;
  direction: "incoming" | "outgoing";
  otherRole?: DiagramRole;
  selectedRole: ProcessNodeRole;
}) {
  if (
    input.edgeKind === "references" ||
    input.otherRole === "flow-note" ||
    input.selectedRole === "flow-note"
  ) {
    return "note" as const;
  }

  if (
    input.edgeKind === "depends-on" ||
    (input.direction === "outgoing" && input.selectedRole === "flow-decision")
  ) {
    return "branch" as const;
  }

  return input.direction === "incoming" ? ("before" as const) : ("after" as const);
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

export function resolveProcessNodeKindForRole(role: ProcessNodeRole): NodeKind {
  return role === "flow-note" ? "note" : "flow-step";
}

export function resolveProcessNodeShapeForRole(role: ProcessNodeRole) {
  return {
    kind: resolveProcessNodeKindForRole(role),
    diagramRole: role,
  } as const;
}

export function buildDefaultProcessNodeTitle(
  role: ProcessNodeRole,
  nextIndex: number,
  t?: EditorTranslationFn,
) {
  return `${getProcessRoleMeta(role, t).badgeLabel} ${nextIndex}`;
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
  return DEFAULT_PROCESS_QUICK_ACTION_IDS.map((id) => buildQuickAction(id, t));
}

export function buildSuggestedProcessTransitionLabel(input: {
  sourceRole?: ProcessNodeRole;
  edgeKind: EdgeKind;
  existingOutgoingLabels?: string[];
  t?: EditorTranslationFn;
}) {
  if (input.sourceRole !== "flow-decision" || !isProcessMainEdgeKind(input.edgeKind)) {
    return undefined;
  }

  const existingLabels = new Set(
    (input.existingOutgoingLabels ?? [])
      .map((label) => normalizeLabelComparison(label))
      .filter((label): label is string => Boolean(label)),
  );
  const candidateLabels = [
    translateEditor(input.t, "process.branchLabels.yes"),
    translateEditor(input.t, "process.branchLabels.no"),
    translateEditor(input.t, "process.branchLabels.exception"),
    translateEditor(input.t, "process.branchLabels.manualReview"),
  ];

  for (const candidate of candidateLabels) {
    const normalizedCandidate = normalizeLabelComparison(candidate);
    if (!normalizedCandidate || !existingLabels.has(normalizedCandidate)) {
      return candidate;
    }
  }

  return translateEditor(input.t, "process.branchLabels.alternative", {
    index: existingLabels.size + 1,
  });
}

export function resolveDefaultProcessEdgeLabel(input: {
  sourceRole?: ProcessNodeRole;
  edgeKind: EdgeKind;
  existingOutgoingLabels?: string[];
  t?: EditorTranslationFn;
}) {
  if (input.edgeKind === "references") {
    return undefined;
  }

  return buildSuggestedProcessTransitionLabel({
    sourceRole: input.sourceRole,
    edgeKind: input.edgeKind,
    existingOutgoingLabels: input.existingOutgoingLabels,
    t: input.t,
  });
}

export function resolveProcessSelectionQuickActions(input: {
  selectedRole: ProcessNodeRole;
  existingOutgoingLabels?: string[];
  t?: EditorTranslationFn;
}) {
  if (input.selectedRole === "flow-decision") {
    return [
      {
        ...buildQuickAction(
          "flow-add-branch-path",
          input.t,
          buildSuggestedProcessTransitionLabel({
            sourceRole: input.selectedRole,
            edgeKind: "depends-on",
            existingOutgoingLabels: input.existingOutgoingLabels,
            t: input.t,
          }),
        ),
        label: translateEditor(input.t, "process.quickActions.flow-add-branch-path.fromDecisionLabel"),
      },
      {
        ...buildQuickAction("flow-add-note", input.t),
        label: translateEditor(input.t, "process.quickActions.flow-add-note.fromDecisionLabel"),
      },
    ];
  }

  if (input.selectedRole === "flow-end") {
    return [
      {
        ...buildQuickAction("flow-add-note", input.t),
        label: translateEditor(input.t, "process.quickActions.flow-add-note.fromEndLabel"),
      },
    ];
  }

  if (input.selectedRole === "flow-start") {
    return [
      {
        ...buildQuickAction("flow-add-next-step", input.t),
        label: translateEditor(input.t, "process.quickActions.flow-add-next-step.fromStartLabel"),
      },
      buildQuickAction("flow-add-decision", input.t),
      buildQuickAction("flow-add-note", input.t),
    ];
  }

  return getProcessQuickActions(input.t);
}

export function getProcessQuickAddRoleOptions(t?: EditorTranslationFn) {
  return PROCESS_QUICK_ADD_ROLE_OPTIONS.map((option) => ({
    ...option,
    label: translateEditor(t, `process.quickAddRoles.${option.role}.label`),
    description: translateEditor(t, `process.quickAddRoles.${option.role}.description`),
  }));
}

export function getProcessCriticalityOptions(t?: EditorTranslationFn) {
  return [
    {
      value: "",
      label: translateEditor(t, "process.operational.criticalityOptions.none"),
    },
    {
      value: "low",
      label: translateEditor(t, "process.operational.criticalityOptions.low"),
    },
    {
      value: "medium",
      label: translateEditor(t, "process.operational.criticalityOptions.medium"),
    },
    {
      value: "high",
      label: translateEditor(t, "process.operational.criticalityOptions.high"),
    },
    {
      value: "critical",
      label: translateEditor(t, "process.operational.criticalityOptions.critical"),
    },
  ] as const;
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
    ownerLabel: translateEditor(t, "process.inspector.ownerLabel"),
    ownerPlaceholder: translateEditor(t, "process.inspector.ownerPlaceholder"),
    areaLabel: translateEditor(t, "process.inspector.areaLabel"),
    areaPlaceholder: translateEditor(t, "process.inspector.areaPlaceholder"),
    channelLabel: translateEditor(t, "process.inspector.channelLabel"),
    channelPlaceholder: translateEditor(t, "process.inspector.channelPlaceholder"),
    criticalityLabel: translateEditor(t, "process.inspector.criticalityLabel"),
    slaLabel: translateEditor(t, "process.inspector.slaLabel"),
    slaPlaceholder: translateEditor(t, "process.inspector.slaPlaceholder"),
    ruleLabel: translateEditor(t, "process.inspector.ruleLabel"),
    rulePlaceholder: translateEditor(t, "process.inspector.rulePlaceholder"),
    exceptionLabel: translateEditor(t, "process.inspector.exceptionLabel"),
    exceptionPlaceholder: translateEditor(t, "process.inspector.exceptionPlaceholder"),
    operationsSummaryTitle: translateEditor(t, "process.inspector.operationsSummaryTitle"),
    operationsSummaryEmpty: translateEditor(t, "process.inspector.operationsSummaryEmpty"),
  } satisfies ProcessInspectorCopy;
}

export function buildProcessNodeOverview(input: {
  role: ProcessNodeRole;
  incomingCount: number;
  outgoingCount: number;
  relations: ProcessRelationsViewModel;
  operationalContext?: ProcessOperationalContext;
}, t?: EditorTranslationFn) {
  const meta = getProcessRoleMeta(input.role, t);
  const semantics = getProcessRoleSemantics(input.role);
  const hasAnyRelation = input.incomingCount + input.outgoingCount > 0;
  const guidance: string[] = [];
  const operationalHighlights = buildProcessOperationalHighlights(
    input.operationalContext,
    t,
  );

  if (!hasAnyRelation) {
    guidance.push(meta.guidanceWhenSparse);
  } else {
    guidance.push(meta.guidanceWhenConnected);
  }

  if (
    semantics.mainFlow.minIncoming > 0 &&
    input.relations.mainIncomingCount < semantics.mainFlow.minIncoming
  ) {
    guidance.push(translateEditor(t, "process.guidance.needsIncomingPath"));
  }

  if (
    semantics.mainFlow.minOutgoing > 0 &&
    input.relations.mainOutgoingCount < semantics.mainFlow.minOutgoing
  ) {
    guidance.push(
      input.role === "flow-decision"
        ? translateEditor(t, "process.guidance.decisionNeedsPaths")
        : input.role === "flow-start"
          ? translateEditor(t, "process.guidance.startNeedsNext")
          : translateEditor(t, "process.guidance.stepNeedsNext"),
    );
  }

  if (
    input.role === "flow-decision" &&
    input.relations.namedOutgoingCount < Math.min(input.relations.mainOutgoingCount, 2)
  ) {
    guidance.push(
      translateEditor(t, "process.guidance.decisionNeedsNamedPaths"),
    );
  }

  if (input.role === "flow-note" && input.relations.supportingCount === 0) {
    guidance.push(
      translateEditor(t, "process.guidance.noteNeedsAnchor"),
    );
  }

  if (input.role === "flow-end" && input.relations.mainOutgoingCount > 0) {
    guidance.push(
      translateEditor(t, "process.guidance.endShouldTerminate"),
    );
  }

  if (input.role === "flow-start" && input.relations.mainIncomingCount > 0) {
    guidance.push(
      translateEditor(t, "process.guidance.startHasIncoming"),
    );
  }

  if (
    input.role !== "flow-decision" &&
    semantics.mainFlow.maxOutgoing !== null &&
    input.relations.mainOutgoingCount > semantics.mainFlow.maxOutgoing
  ) {
    guidance.push(
      translateEditor(t, "process.guidance.multipleOutputsNeedDecision"),
    );
  }

  if (operationalHighlights.length === 0) {
    guidance.push(
      translateEditor(t, "process.guidance.addOperationalContext"),
    );
  }

  return {
    badgeLabel: meta.badgeLabel,
    kindLabel: meta.kindLabel,
    summary: meta.summary,
    positionLabel:
      input.relations.mainIncomingCount + input.relations.mainOutgoingCount > 0
        ? meta.positionConnectedLabel
        : meta.positionEmptyLabel,
    connectivityLabel: formatProcessConnectivityLabel(
      input.relations.mainIncomingCount,
      input.relations.mainOutgoingCount,
      t,
    ),
    operationalHighlights,
    guidance: [...new Set(guidance)],
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
  const allRelations = [...incoming, ...outgoing].map((edge) => {
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
    const lane = resolveProcessRelationLane({
      edgeKind: edge.edgeKind,
      direction,
      otherRole,
      selectedRole,
    });
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

  const counters = {
    before: 0,
    after: 0,
    branch: 0,
    note: 0,
  };

  for (const relation of allRelations) {
    counters[relation.lane] += 1;
  }

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
    mainIncomingCount: incoming.filter((edge) => isProcessMainEdgeKind(edge.edgeKind)).length,
    mainOutgoingCount: outgoing.filter((edge) => isProcessMainEdgeKind(edge.edgeKind)).length,
    namedOutgoingCount: outgoing.filter(
      (edge) => isProcessMainEdgeKind(edge.edgeKind) && Boolean(formatRelationLabel(edge.label ?? undefined)),
    ).length,
    branchOutgoingCount: outgoing.filter(
      (edge) =>
        edge.edgeKind === "depends-on" ||
        (selectedRole === "flow-decision" && isProcessMainEdgeKind(edge.edgeKind)),
    ).length,
    supportingCount: allRelations.filter((relation) => relation.lane === "note").length,
    summaryChips,
    preview: allRelations.slice(0, input.limit ?? 6),
  } satisfies ProcessRelationsViewModel;
}

export function readProcessOperationalContext(
  payload: Record<string, unknown> | undefined,
) {
  return readProcessOperationalContextFromPayload(payload);
}
