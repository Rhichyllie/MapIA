"use client";
import { useLocale } from "next-intl";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  Background,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import type {
  Connection,
  OnConnectStartParams,
  ReactFlowInstance,
} from "@xyflow/react";
import { EdgeKindSchema, type EdgeKind, type NodeKind } from "@/src/domain";
import {
  resolveGraphNodeSemantic,
  writeDiagramRoleToPayload,
  type DiagramRole,
} from "@/src/modules/diagrams/domain";
import type {
  InitialView,
  ProjectProfile,
} from "@/src/modules/creation-assistant/domain";
import type { ProjectTemplate } from "@/src/modules/projects/domain";
import {
  getDiagramTypeLabel,
  isSupportedDiagramType,
  reapplyLayoutForSnapshot,
} from "@/src/modules/graph/domain";
import type { EditorCommand } from "@/src/modules/editor/application";
import { resolveEditorPersona } from "@/src/modules/editor/domain";
import {
  hasEditorDiagramCapability,
  resolveEditorDiagramMode,
  type EditorDiagramProcessInspectorStrategy,
} from "./diagram-modes";
import { resolveEditorDiagramInspectorAdapter } from "./diagram-modes/inspector-adapters";
import { computeParallelEdgeMeta } from "./diagram-renderers";
import { type DiagramLayoutType } from "./diagram-renderers/layout/diagram-layout";
import { EditorRemoteError } from "./editor-command-service";
import { createInitialEditorAutosaveState } from "./editor-autosave-state";
import { getFriendlyInspectorFeedback } from "./editor-inspector-feedback";
import {
  buildUpdateEdgeCommandFromInspectorForm,
  buildUpdateNodeCommandFromInspectorForm,
  formatInspectorJson,
  type EdgeInspectorDraft,
  type NodeInspectorDraft,
} from "./editor-inspector-schemas";
import {
  createOperationalNodeDraft,
  mergeOperationalNodePayload,
  normalizeTagsInput,
} from "./editor-inspector-personas";
import { resolveInspectorSelectionState } from "./inspector-selection-state";
import { CanvasToolbar } from "./canvas-toolbar";
import { CommandPalette } from "./command-palette";
import { filterNodeQuickFindOptions } from "./editor-quick-find";
import {
  type ContextualDiagramType,
  getEdgeKindLabel,
  getEdgeKindLabelForDiagram,
  getEdgeKindPresentation,
  getNodeKindDescriptionForDiagram,
  getNodeKindLabel,
  getNodeKindLabelForDiagram,
  getNodeKindPresentation,
} from "./presentation/kinds";
import {
  buildDefaultProcessNodeTitle,
  resolveDefaultProcessEdgeLabel,
  resolveProcessSelectionQuickActions,
  getProcessRoleMeta,
  resolveProcessNodeShapeForRole,
  resolveProcessNodeRole,
  type ProcessRelationsViewModel,
} from "./presentation/process-semantics";
import {
  fromCanonicalSnapshotToFlowState,
  toCanonicalSnapshotFromFlowState,
  type EditorSnapshotLayoutMetadata,
  type RFEdge,
  type RFNode,
} from "./editor-graph-mappers";
import {
  buildBatchSafeFixCommands,
  buildConvertToAssociativeFix,
  buildMaterializeFkFix,
  buildOneToOneUniqueFix,
  erdCardinalityFromPreset,
  erdCardinalityToPreset,
  inferDependentSide,
  mergeErdPolicyIntoCustomRules,
  normalizeErdEntityPayload,
  normalizeErdGraphFromSemantic,
  normalizeErdPolicyFromCustomRules,
  normalizeErdRelationPayload,
  validateErdGraphFull,
  type ErdCardinalityPreset,
  type ErdEditorCommand,
  type ErdEntityPayload,
  type ErdField,
  type ErdFieldFlag,
  type ErdPolicyConfig,
  type ErdRelationPayload,
  type ErdRelationRef,
} from "@/src/modules/erd/domain";
import {
  exportErdPreviewForEditor,
  EditorQueryError,
  importPrismaSchemaForEditor,
  loadSemanticPolicyForEditor,
  loadWorkingSnapshotForEditor,
  updateSemanticPolicyForEditor,
  type SemanticPolicyPayload,
  type EditorPrismaSchemaImportSummary,
} from "./editor-query-service";
import { usePendingChangesGuard } from "./use-pending-changes-guard";
import { ConnectionAssistant } from "./semantics/connection-assistant";
import { RepairDialog } from "./semantics/repair-dialog";
import { translateEditor, type EditorTranslationFn } from "./editor-i18n";
import { useEditorTranslations } from "./use-editor-translations";
import {
  hasMinimumSemanticOverrideReason,
  MIN_SEMANTIC_OVERRIDE_REASON_LENGTH,
  runGraphAudit,
  validateEdgeCreation,
  type RepairAction,
  type SemanticEngineOptions,
  type RepairPlan,
  type SemanticViolation,
} from "./semantics/semantics";
import {
  type AddNodeDraft,
  type ContextualInsertMode,
  type ErdFieldDraftState,
  type InspectorNodeRelationsView,
  type SemanticIssueLike,
  type SelectionHudQuickAction,
} from "./shell/editor-shell-types";
import { useEditorCanvasUiController } from "./shell/use-editor-canvas-ui-controller";
import { useEditorClipboardController } from "./shell/use-editor-clipboard-controller";
import { useEditorCommandController } from "./shell/use-editor-command-controller";
import { useEditorErdController } from "./shell/use-editor-erd-controller";
import { useEditorInspectorController } from "./shell/use-editor-inspector-controller";
import { useEditorPersistenceController } from "./shell/use-editor-persistence-controller";
import { useEditorSelectionController } from "./shell/use-editor-selection-controller";
import { useEditorSemanticController } from "./shell/use-editor-semantic-controller";
import { useEditorVersionsController } from "./shell/use-editor-versions-controller";
import { EditorShellTopBar } from "./shell/editor-shell-top-bar";
import { EditorSelectionHudSurface } from "./shell/editor-selection-hud-surface";
import { EditorSemanticAuditPanel } from "./shell/editor-semantic-audit-panel";
import { EditorInspectorFrame } from "./shell/editor-inspector-frame";
import { EditorInspectorEmptyState } from "./shell/editor-inspector-empty-state";
import {
  EditorMetadataPanel,
  EditorPrismaImportPanel,
  EditorVersionsPanel,
} from "./shell/editor-shell-panels";

type EditorProjectViewModel = {
  id: string;
  name: string;
  slug: string;
  template: ProjectTemplate;
  creationProfile?: ProjectProfile;
  creationInitialView?: InitialView;
};

type EditorShellProps = {
  project: EditorProjectViewModel;
  initialSnapshot: Parameters<typeof fromCanonicalSnapshotToFlowState>[0];
  initialRevision: number;
};

function formatErrorMessage(error: unknown, fallback: string) {
  if (error instanceof EditorQueryError || error instanceof EditorRemoteError) {
    const payloadMessage = error.payload?.message?.trim();
    return payloadMessage ? payloadMessage : fallback;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

function buildPrismaSchemaImportFeedbackMessage(
  summary: EditorPrismaSchemaImportSummary | undefined,
  t?: EditorTranslationFn,
) {
  if (!summary) {
    return translateEditor(t, "shell.prisma.feedbackSuccess");
  }

  return translateEditor(t, "shell.prisma.feedbackSuccessWithCounts", {
    modelsCount: summary.modelsCount,
    relationsCount: summary.relationsCount,
    scalarFieldsCount: summary.scalarFieldsCount,
  });
}

function toSemanticEngineOptionsFromPolicy(
  policy: SemanticPolicyPayload | null,
): SemanticEngineOptions | undefined {
  if (!policy) {
    return undefined;
  }

  const customRulesJson =
    policy.customRulesJson &&
    typeof policy.customRulesJson === "object" &&
    !Array.isArray(policy.customRulesJson)
      ? policy.customRulesJson
      : undefined;

  return {
    strictEnabled: policy.strictEnabled,
    ...(customRulesJson ? { customRulesJson } : {}),
  };
}

function buildDefaultNodeTitle(
  kind: NodeKind,
  nextIndex: number,
  diagramType?: ContextualDiagramType,
  t?: EditorTranslationFn,
  diagramRole?: DiagramRole,
) {
  if (
    diagramType === "flow" &&
    (diagramRole === "flow-start" ||
      diagramRole === "flow-step" ||
      diagramRole === "flow-decision" ||
      diagramRole === "flow-note" ||
      diagramRole === "flow-end")
  ) {
    return buildDefaultProcessNodeTitle(diagramRole, nextIndex, t);
  }

  const nodeKindLabel = diagramType
    ? getNodeKindLabelForDiagram(diagramType, kind, "operational", t)
    : getNodeKindLabel(kind, "operational", t);
  return `${nodeKindLabel} ${nextIndex}`;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function toErdPolicyConfig(
  policy: SemanticPolicyPayload | null | undefined,
): ErdPolicyConfig {
  return normalizeErdPolicyFromCustomRules(readRecord(policy?.customRulesJson));
}

function normalizeErdEntityPayloadFromNode(node: RFNode): ErdEntityPayload {
  return normalizeErdEntityPayload(readRecord(node.data.payload), {
    entityId: node.id,
    fallbackLabel: node.data.label,
  });
}

function normalizeErdRelationPayloadFromEdge(edge: RFEdge): ErdRelationPayload {
  return normalizeErdRelationPayload(readRecord(edge.data?.payload), {
    sourceEntityId: edge.source,
    targetEntityId: edge.target,
  });
}

function createErdField(input: { entityId: string; index: number }): ErdField {
  return {
    id: `${input.entityId}-field-${crypto.randomUUID()}`,
    name: `campo_${input.index}`,
    type: "string",
    flags: ["NULLABLE"],
  };
}

function toggleErdFieldFlag(input: {
  field: ErdField;
  flag: ErdFieldFlag;
}): ErdField {
  const nextFlags = new Set<ErdFieldFlag>(input.field.flags);
  if (nextFlags.has(input.flag)) {
    nextFlags.delete(input.flag);
  } else {
    nextFlags.add(input.flag);
  }

  if (input.flag === "NOT_NULL" && nextFlags.has("NOT_NULL")) {
    nextFlags.delete("NULLABLE");
  } else if (input.flag === "NOT_NULL" && !nextFlags.has("NOT_NULL")) {
    nextFlags.add("NULLABLE");
  }

  if (input.flag === "NULLABLE" && nextFlags.has("NULLABLE")) {
    nextFlags.delete("NOT_NULL");
  }

  if (input.flag === "PK" && nextFlags.has("PK")) {
    nextFlags.add("NOT_NULL");
    nextFlags.delete("NULLABLE");
  }

  return {
    ...input.field,
    flags: [...nextFlags],
  };
}

function flipErdRelationPayloadDirection(
  payload: ErdRelationPayload,
): ErdRelationPayload {
  const currentCardinality = payload.cardinality;
  const swappedCardinality = currentCardinality
    ? {
        minSource: currentCardinality.minTarget,
        maxSource: currentCardinality.maxTarget,
        minTarget: currentCardinality.minSource,
        maxTarget: currentCardinality.maxSource,
      }
    : undefined;
  const roles = payload.roles
    ? {
        sourceRole: payload.roles.targetRole,
        targetRole: payload.roles.sourceRole,
      }
    : undefined;
  const materialization =
    payload.materialization?.mode === "fk"
      ? {
          ...payload.materialization,
          dependentSide:
            payload.materialization.dependentSide === "source"
              ? ("target" as const)
              : ("source" as const),
        }
      : payload.materialization;

  return {
    ...payload,
    ...(swappedCardinality ? { cardinality: swappedCardinality } : {}),
    ...(roles ? { roles } : {}),
    ...(materialization ? { materialization } : {}),
  };
}

function readIssueSuggestedFixCommands(value: unknown): ErdEditorCommand[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const commands: ErdEditorCommand[] = [];
  for (const command of value) {
    if (!command || typeof command !== "object" || Array.isArray(command)) {
      continue;
    }

    const parsed = command as ErdEditorCommand;
    if (typeof (parsed as { type?: unknown }).type !== "string") {
      continue;
    }

    commands.push(parsed);
  }

  return commands;
}

function readIssueSuggestedFixes(issue: SemanticIssueLike) {
  const rawFixes = Array.isArray(issue.suggestedFixes)
    ? issue.suggestedFixes
    : [];

  return rawFixes
    .map((fix) => {
      if (!fix || typeof fix !== "object") {
        return null;
      }

      const parsed = fix as {
        id?: unknown;
        label?: unknown;
        description?: unknown;
        safety?: unknown;
        commands?: unknown;
      };
      if (typeof parsed.id !== "string" || typeof parsed.label !== "string") {
        return null;
      }

      const safety = parsed.safety === "manual" ? "manual" : "safe";
      const commands = readIssueSuggestedFixCommands(parsed.commands);
      if (commands.length === 0) {
        return null;
      }

      return {
        id: parsed.id,
        label: parsed.label,
        ...(typeof parsed.description === "string"
          ? { description: parsed.description }
          : {}),
        safety,
        commands,
      };
    })
    .filter(
      (
        fix,
      ): fix is {
        id: string;
        label: string;
        description?: string;
        safety: "safe" | "manual";
        commands: ErdEditorCommand[];
      } => Boolean(fix),
    );
}

function getSemanticSeverityLabel(
  severity: SemanticIssueLike["severity"],
  t?: EditorTranslationFn,
) {
  if (severity === "error") {
    return translateEditor(t, "shell.semanticSeverity.error");
  }
  if (severity === "warning") {
    return translateEditor(t, "shell.semanticSeverity.warning");
  }
  if (severity === "suggestion") {
    return translateEditor(t, "shell.semanticSeverity.suggestion");
  }

  return translateEditor(t, "shell.semanticSeverity.info");
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

function createNodeInspectorDraft(node: RFNode): NodeInspectorDraft {
  return {
    label: node.data.label,
    kind: node.data.kind,
    dataJson: formatInspectorJson(node.data.payload),
  };
}

function createEdgeInspectorDraft(edge: RFEdge): EdgeInspectorDraft {
  return {
    label: edge.label ? String(edge.label) : "",
    kind: edge.data?.kind ?? "flows-to",
    dataJson: formatInspectorJson(edge.data?.payload ?? {}),
  };
}

function isEditableKeyboardTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return (
    target.isContentEditable ||
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select"
  );
}

export function EditorShell({
  project,
  initialSnapshot,
  initialRevision,
}: EditorShellProps) {
  const locale = useLocale();
  const editorT = useEditorTranslations();
  const initialFlowState = useMemo(
    () => fromCanonicalSnapshotToFlowState(initialSnapshot),
    [initialSnapshot],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<RFNode>(
    initialFlowState.nodes,
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<RFEdge>(
    initialFlowState.edges,
  );
  const [viewport, setViewport] = useState(initialFlowState.viewport);
  const [layoutMetadata, setLayoutMetadata] =
    useState<EditorSnapshotLayoutMetadata>(initialFlowState.layoutMetadata);
  const [hiddenDiagramNodeIds, setHiddenDiagramNodeIds] = useState<string[]>(
    initialFlowState.hiddenNodeIds,
  );
  const [computedMindmapRootNodeId, setComputedMindmapRootNodeId] = useState<
    string | null
  >(initialFlowState.computedRootNodeId ?? null);
  const [querySyncMessage, setQuerySyncMessage] = useState<string | null>(null);
  const [globalErrorMessage, setGlobalErrorMessage] = useState<string | null>(
    null,
  );
  const [isRefreshingFromQuery, setIsRefreshingFromQuery] = useState(false);
  const [isAddNodeDialogOpen, setIsAddNodeDialogOpen] = useState(false);
  const [addNodeErrorMessage, setAddNodeErrorMessage] = useState<string | null>(
    null,
  );
  const [inlineRenameNodeId, setInlineRenameNodeId] = useState<string | null>(
    null,
  );
  const [inlineRenameDraft, setInlineRenameDraft] = useState("");
  const [inlineRenameErrorMessage, setInlineRenameErrorMessage] = useState<
    string | null
  >(null);
  const [activeConnectionSourceNodeId, setActiveConnectionSourceNodeId] =
    useState<string | null>(null);
  const [addNodeDraft, setAddNodeDraft] = useState<AddNodeDraft>({
    kind: "note",
    diagramRole: undefined,
    title: "",
    description: "",
    tagsText: "",
  });
  const [collapsedTreeNodeIds, setCollapsedTreeNodeIds] = useState<string[]>(
    [],
  );
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const viewportRef = useRef(viewport);
  const layoutMetadataRef = useRef(layoutMetadata);
  const canvasRegionRef = useRef<HTMLDivElement | null>(null);
  const reactFlowInstanceRef = useRef<ReactFlowInstance<RFNode, RFEdge> | null>(
    null,
  );
  const syncFromSnapshot = useCallback(
    (snapshot: Parameters<typeof fromCanonicalSnapshotToFlowState>[0]) => {
      const next = fromCanonicalSnapshotToFlowState(snapshot);
      nodesRef.current = next.nodes;
      edgesRef.current = next.edges;
      viewportRef.current = next.viewport;
      layoutMetadataRef.current = next.layoutMetadata;
      setNodes(next.nodes);
      setEdges(next.edges);
      setViewport(next.viewport);
      setLayoutMetadata(next.layoutMetadata);
      setHiddenDiagramNodeIds(next.hiddenNodeIds);
      setComputedMindmapRootNodeId(next.computedRootNodeId ?? null);
    },
    [setEdges, setNodes],
  );
  const getCurrentSnapshot = useCallback(
    () =>
      toCanonicalSnapshotFromFlowState(
        project.id,
        nodesRef.current,
        edgesRef.current,
        viewportRef.current,
        layoutMetadataRef.current,
      ),
    [project.id],
  );
  const {
    selectedNodeId,
    setSelectedNodeId,
    selectedEdgeId,
    setSelectedEdgeId,
    selectedNode,
    selectedEdge,
    selectItem: selectEditorItem,
  } = useEditorSelectionController({
    nodes,
    edges,
  });
  const {
    panelState,
    setPanelState,
    isCanvasFocusMode,
    setIsCanvasFocusMode,
    isFocusInspectorCollapsed,
    setIsFocusInspectorCollapsed,
    isQuickFindOpen,
    setIsQuickFindOpen,
    quickFindQuery,
    setQuickFindQuery,
    quickFindActiveIndex,
    setQuickFindActiveIndex,
    panelStateBeforeFocusRef,
    quickFindReturnFocusRef,
    handleTogglePanel,
    handleToggleCanvasFocusMode,
    handleToggleInspectorVisibility,
    handleOpenQuickFind,
    handleCloseQuickFind,
  } = useEditorCanvasUiController({
    projectId: project.id,
    canvasRegionRef,
  });
  const {
    inspectorMode,
    setInspectorMode,
    inspectorSections,
    handleToggleInspectorSection,
    nodeInspectorDraft,
    setNodeInspectorDraft,
    edgeInspectorDraft,
    setEdgeInspectorDraft,
    operationalNodeDraft,
    setOperationalNodeDraft,
    operationalEdgeDraft,
    setOperationalEdgeDraft,
    nodeInspectorErrors,
    setNodeInspectorErrors,
    edgeInspectorErrors,
    setEdgeInspectorErrors,
    nodeInspectorMessage,
    setNodeInspectorMessage,
    edgeInspectorMessage,
    setEdgeInspectorMessage,
    nodeInspectorDirty,
    edgeInspectorDirty,
    nodeInspectorHasErrors,
    edgeInspectorHasErrors,
    hasInspectorDirtyDraft,
    confirmInspectorDraftDiscardIfNeeded,
  } = useEditorInspectorController({
    projectId: project.id,
    selectedNode,
    selectedEdge,
    editorT,
  });
  const {
    pendingConnectionAssistant,
    setPendingConnectionAssistant,
    pendingNodeRepair,
    setPendingNodeRepair,
    pendingSemanticOverride,
    setPendingSemanticOverride,
    semanticOverrideReason,
    setSemanticOverrideReason,
    isValidationPanelOpen,
    serverSemanticAudit,
    setServerSemanticAudit,
    semanticPolicy,
    setSemanticPolicy,
    handleToggleValidationPanel: toggleValidationPanelController,
    handleCancelConnectionAssistant,
    handleCancelPendingNodeRepair: dismissPendingNodeRepair,
    handleCancelSemanticOverride: dismissSemanticOverride,
  } = useEditorSemanticController({
    projectId: project.id,
    inspectorMode,
    editorT,
    setQuerySyncMessage,
    setGlobalErrorMessage,
  });
  const selectedErdEntityPayload = useMemo(() => {
    if (!selectedNode || selectedNode.data.kind !== "entity") {
      return null;
    }

    return normalizeErdEntityPayloadFromNode(selectedNode);
  }, [selectedNode]);
  const selectedErdRelationPayload = useMemo(() => {
    if (
      !selectedEdge ||
      (selectedEdge.data?.kind ?? "flows-to") !== "references"
    ) {
      return null;
    }

    return normalizeErdRelationPayloadFromEdge(selectedEdge);
  }, [selectedEdge]);
  const selectedErdSourceEntityNode = useMemo(() => {
    if (!selectedEdge) {
      return null;
    }

    const node = nodes.find(
      (candidate) => candidate.id === selectedEdge.source,
    );
    return node && node.data.kind === "entity" ? node : null;
  }, [nodes, selectedEdge]);
  const selectedErdTargetEntityNode = useMemo(() => {
    if (!selectedEdge) {
      return null;
    }

    const node = nodes.find(
      (candidate) => candidate.id === selectedEdge.target,
    );
    return node && node.data.kind === "entity" ? node : null;
  }, [nodes, selectedEdge]);
  const {
    prismaSchemaImportText,
    setPrismaSchemaImportText,
    isImportingPrismaSchema,
    setIsImportingPrismaSchema,
    prismaSchemaImportFeedback,
    setPrismaSchemaImportFeedback,
    isExportingErdPreview,
    setIsExportingErdPreview,
    erdExportFeedback,
    setErdExportFeedback,
    setLastErdExportPreview,
    pendingErdQuickRelate,
    setPendingErdQuickRelate,
    erdFieldDrafts,
    setErdFieldDrafts,
    setErdPendingFieldFocusId,
    erdMaterializeDependentSide,
    setErdMaterializeDependentSide,
    erdMaterializeExistingFieldId,
    setErdMaterializeExistingFieldId,
    erdMaterializeUnique,
    setErdMaterializeUnique,
    canImportPrismaSchema,
  } = useEditorErdController({
    selectedNode,
    selectedEdge,
    selectedErdEntityPayload,
    selectedErdRelationPayload,
    selectedErdSourceEntityNode,
    selectedErdTargetEntityNode,
  });
  const {
    saveState,
    setSaveState,
    pendingCommands,
    pendingCommandsRef,
    setPendingCommandsState,
    setCurrentRevision,
    currentRevisionRef,
    localMutationVersionRef,
    isSaveInFlightRef,
    autosaveDebouncerRef,
    markDirtyState,
    applyLocalCommandAndQueue,
    flushPendingCommands,
    handleManualSave,
    resetPendingCommands,
    resetLocalMutationVersion,
  } = useEditorPersistenceController({
    projectId: project.id,
    initialRevision,
    editorT,
    inspectorMode,
    getCurrentSnapshot,
    syncFromSnapshot,
    setNodeInspectorMessage,
    setEdgeInspectorMessage,
    clearDerivedRemoteState: () => {
      setServerSemanticAudit(null);
      setLastErdExportPreview(null);
    },
    setGlobalErrorMessage,
  });
  const {
    ensureQueueFlushedBeforeDirectWrite,
    createEdgeDirect,
    updateNodeDirect,
    updateEdgeDirect,
  } = useEditorCommandController({
    projectId: project.id,
    saveState,
    pendingCommandsRef,
    isSaveInFlightRef,
    currentRevisionRef,
    flushPendingCommands,
    syncFromSnapshot,
    setCurrentRevision,
  });
  const {
    isCreatingVersion,
    versionCreateFeedback,
    newVersionName,
    setNewVersionName,
    snapshotVersions,
    isRefreshingVersionList,
    versionActionFeedback,
    versionDiffFeedback,
    versionDiffSummary,
    setVersionDiffFeedback,
    setVersionDiffSummary,
    activeVersionCompareId,
    activeVersionRestoreId,
    versionNameDrafts,
    handleCreateVersion,
    handleRefreshVersionList,
    handleVersionNameDraftChange,
    handleSaveVersionName,
    handleCompareVersion,
    handleRestoreVersion,
    getVersionDisplayName,
  } = useEditorVersionsController({
    projectId: project.id,
    editorT,
    saveState,
    pendingCommandsRef,
    handleManualSave,
    getCurrentSnapshot,
    syncFromSnapshot,
    setCurrentRevision,
    clearSelection: () => {
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
    },
    resetPendingCommands,
    resetLocalMutationVersion,
    setSaveState,
    setGlobalErrorMessage,
    setQuerySyncMessage,
    cancelAutosave: () => autosaveDebouncerRef.current.cancel(),
  });
  const hasPendingChangesGuard =
    pendingCommands.length > 0 ||
    saveState.isDirty ||
    saveState.status === "saving";

  usePendingChangesGuard(hasPendingChangesGuard);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    setCollapsedTreeNodeIds((current) =>
      current.filter((nodeId) => nodes.some((node) => node.id === nodeId)),
    );
  }, [nodes]);

  useEffect(() => {
    if (!inlineRenameNodeId) {
      return;
    }

    const renameNodeStillExists = nodes.some(
      (node) => node.id === inlineRenameNodeId,
    );
    if (renameNodeStillExists) {
      return;
    }

    setInlineRenameNodeId(null);
    setInlineRenameDraft("");
    setInlineRenameErrorMessage(null);
  }, [inlineRenameNodeId, nodes]);

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  useEffect(() => {
    layoutMetadataRef.current = layoutMetadata;
  }, [layoutMetadata]);

  useEffect(() => {
    if (selectedNodeId && selectedEdgeId) {
      setSelectedEdgeId(null);
    }
  }, [selectedEdgeId, selectedNodeId, setSelectedEdgeId]);

  useEffect(() => {
    if (selectedNodeId && !selectedNode) {
      setSelectedNodeId(null);
    }
  }, [selectedNode, selectedNodeId, setSelectedNodeId]);

  useEffect(() => {
    if (selectedEdgeId && !selectedEdge) {
      setSelectedEdgeId(null);
    }
  }, [selectedEdge, selectedEdgeId, setSelectedEdgeId]);
  const diagramModeResolution = useMemo(
    () =>
      resolveEditorDiagramMode({
        diagramType: layoutMetadata.diagramType,
        template: project.template,
        layoutOptions: layoutMetadata.layoutOptions,
      }),
    [
      layoutMetadata.diagramType,
      layoutMetadata.layoutOptions,
      project.template,
    ],
  );
  const diagramMode = diagramModeResolution.mode;
  const renderer = diagramModeResolution.renderer;
  const semanticDiagramType = diagramMode.semantic.diagramType;
  const isErdDiagram = hasEditorDiagramCapability(
    diagramMode,
    "erd-validation-controls",
  );
  const erdPolicy = useMemo(
    () => toErdPolicyConfig(semanticPolicy),
    [semanticPolicy],
  );
  const semanticEngineOptions = useMemo(
    () => toSemanticEngineOptionsFromPolicy(semanticPolicy),
    [semanticPolicy],
  );
  const {
    copyTextToClipboard,
    handleCopySelectionToClipboard,
    handleCutSelectionToClipboard,
    handleDuplicateSelection,
    handlePasteFromClipboard,
  } = useEditorClipboardController({
    projectId: project.id,
    editorT,
    selectedNode,
    selectedEdge,
    nodesRef,
    getCurrentSnapshot,
    applyLocalCommandAndQueue,
    selectItem,
    handleRemoveSelected,
    inspectorMode,
    semanticDiagramType,
    semanticEngineOptions,
    semanticPolicy,
    setSemanticPolicy,
    setQuerySyncMessage,
    setGlobalErrorMessage,
  });
  const hiddenDiagramNodeIdSet = useMemo(
    () => new Set(hiddenDiagramNodeIds),
    [hiddenDiagramNodeIds],
  );
  const semanticRootNodeId =
    diagramMode.layout.resolveRootNodeId?.({
      nodes: nodes.filter((node) => !hiddenDiagramNodeIdSet.has(node.id)),
      computedRootNodeId: computedMindmapRootNodeId,
      rootNodeName: layoutMetadata.rootNodeName,
    }) ?? null;
  const semanticAudit = useMemo(
    () =>
      runGraphAudit(
        {
          nodes: nodes.map((node) => ({
            id: node.id,
            kind: node.data.kind,
            label: node.data.label,
            payload: node.data.payload,
          })),
          edges: edges.map((edge) => ({
            id: edge.id,
            sourceNodeId: edge.source,
            targetNodeId: edge.target,
            kind: edge.data?.kind ?? "flows-to",
            label: edge.label ? String(edge.label) : undefined,
            payload: edge.data?.payload,
          })),
          rootNodeId: semanticRootNodeId,
        },
        semanticDiagramType,
        inspectorMode,
        semanticEngineOptions,
      ),
    [
      edges,
      inspectorMode,
      nodes,
      semanticDiagramType,
      semanticEngineOptions,
      semanticRootNodeId,
    ],
  );
  const displayedSemanticAudit = serverSemanticAudit ?? semanticAudit;
  const selectedErdRelationIssues = useMemo(
    () =>
      selectedEdge
        ? displayedSemanticAudit.issues.filter(
            (issue) =>
              issue.targetType === "edge" && issue.targetId === selectedEdge.id,
          )
        : [],
    [displayedSemanticAudit.issues, selectedEdge],
  );
  const localErdValidation = useMemo(() => {
    if (!isErdDiagram) {
      return null;
    }

    const graph = normalizeErdGraphFromSemantic({
      nodes: nodes.map((node) => ({
        id: node.id,
        kind: node.data.kind,
        label: node.data.label,
        payload: node.data.payload,
      })),
      edges: edges.map((edge) => ({
        id: edge.id,
        sourceNodeId: edge.source,
        targetNodeId: edge.target,
        kind: edge.data?.kind ?? "flows-to",
        label: edge.label ? String(edge.label) : undefined,
        payload: edge.data?.payload,
      })),
    });

    return validateErdGraphFull({
      graph,
      policy: erdPolicy,
    });
  }, [edges, erdPolicy, isErdDiagram, nodes]);
  const localErdSafeBatchFix = useMemo(
    () =>
      localErdValidation
        ? buildBatchSafeFixCommands(localErdValidation.diagnostics)
        : null,
    [localErdValidation],
  );
  const semanticIssuesByNodeId = useMemo(() => {
    const map = new Map<string, SemanticIssueLike[]>();
    for (const issue of displayedSemanticAudit.issues) {
      if (issue.targetType !== "node" || !issue.targetId) {
        continue;
      }

      const current = map.get(issue.targetId) ?? [];
      current.push(issue);
      map.set(issue.targetId, current);
    }
    return map;
  }, [displayedSemanticAudit.issues]);
  const semanticIssuesByEdgeId = useMemo(() => {
    const map = new Map<string, SemanticIssueLike[]>();
    for (const issue of displayedSemanticAudit.issues) {
      if (issue.targetType !== "edge" || !issue.targetId) {
        continue;
      }

      const current = map.get(issue.targetId) ?? [];
      current.push(issue);
      map.set(issue.targetId, current);
    }
    return map;
  }, [displayedSemanticAudit.issues]);
  const selectedSemanticIssues = useMemo(() => {
    if (selectedNode) {
      return semanticIssuesByNodeId.get(selectedNode.id) ?? [];
    }

    if (selectedEdge) {
      return semanticIssuesByEdgeId.get(selectedEdge.id) ?? [];
    }

    return [];
  }, [
    selectedEdge,
    selectedNode,
    semanticIssuesByEdgeId,
    semanticIssuesByNodeId,
  ]);
  const selectedSemanticSeverity:
    | "error"
    | "warning"
    | "suggestion"
    | "info"
    | null = selectedSemanticIssues.some((issue) => issue.severity === "error")
    ? "error"
    : selectedSemanticIssues.some((issue) => issue.severity === "warning")
      ? "warning"
      : selectedSemanticIssues.some((issue) => issue.severity === "suggestion")
        ? "suggestion"
        : selectedSemanticIssues.some((issue) => issue.severity === "info")
          ? "info"
          : null;
  const selectedSemanticStatusLabel = selectedSemanticSeverity
    ? selectedSemanticSeverity === "error"
      ? editorT("shell.selection.semanticAttention")
      : selectedSemanticSeverity === "warning"
        ? editorT("shell.selection.semanticWarning")
        : selectedSemanticSeverity === "suggestion"
          ? editorT("shell.selection.semanticSuggestion")
          : editorT("shell.selection.semanticInfo")
    : editorT("shell.selection.semanticOk");
  const collapsedTreeNodeIdSet = useMemo(
    () => new Set(collapsedTreeNodeIds),
    [collapsedTreeNodeIds],
  );
  const hiddenTreeNodeIdSet = useMemo(() => {
    if (renderer.key !== "tree" || collapsedTreeNodeIdSet.size === 0) {
      return new Set<string>();
    }

    const containsAdjacency = new Map<string, string[]>();
    for (const edge of edges) {
      if ((edge.data?.kind ?? "flows-to") !== "contains") {
        continue;
      }

      const current = containsAdjacency.get(edge.source) ?? [];
      current.push(edge.target);
      containsAdjacency.set(edge.source, current);
    }

    const hidden = new Set<string>();
    for (const rootId of collapsedTreeNodeIdSet) {
      const queue = [...(containsAdjacency.get(rootId) ?? [])];

      while (queue.length > 0) {
        const currentId = queue.shift();
        if (!currentId || hidden.has(currentId)) {
          continue;
        }

        hidden.add(currentId);
        const next = containsAdjacency.get(currentId);
        if (next?.length) {
          queue.push(...next);
        }
      }
    }

    return hidden;
  }, [collapsedTreeNodeIdSet, edges, renderer.key]);
  const hiddenCanvasNodeIdSet = useMemo(() => {
    const combined = new Set(hiddenDiagramNodeIdSet);
    for (const nodeId of hiddenTreeNodeIdSet) {
      combined.add(nodeId);
    }
    return combined;
  }, [hiddenDiagramNodeIdSet, hiddenTreeNodeIdSet]);

  useEffect(() => {
    if (!selectedNodeId) {
      return;
    }

    if (hiddenCanvasNodeIdSet.has(selectedNodeId)) {
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
    }
  }, [
    hiddenCanvasNodeIdSet,
    selectedNodeId,
    setSelectedEdgeId,
    setSelectedNodeId,
  ]);

  useEffect(() => {
    if (!selectedEdgeId) {
      return;
    }

    const selected = edges.find((edge) => edge.id === selectedEdgeId);
    if (!selected) {
      return;
    }

    if (
      hiddenCanvasNodeIdSet.has(selected.source) ||
      hiddenCanvasNodeIdSet.has(selected.target)
    ) {
      setSelectedEdgeId(null);
      setSelectedNodeId(null);
    }
  }, [
    edges,
    hiddenCanvasNodeIdSet,
    selectedEdgeId,
    setSelectedEdgeId,
    setSelectedNodeId,
  ]);

  const renderedNodes = useMemo(() => {
    const visibleNodes = nodes.filter(
      (node) => !hiddenCanvasNodeIdSet.has(node.id) && node.hidden !== true,
    );
    const diagramVisibleNodeIdSet = new Set(
      nodes
        .filter(
          (node) =>
            !hiddenDiagramNodeIdSet.has(node.id) && node.hidden !== true,
        )
        .map((node) => node.id),
    );
    const treeNodesWithContainsChildren = new Set<string>();
    if (renderer.key === "tree") {
      for (const edge of edges) {
        if ((edge.data?.kind ?? "flows-to") !== "contains") {
          continue;
        }

        if (
          diagramVisibleNodeIdSet.has(edge.source) &&
          diagramVisibleNodeIdSet.has(edge.target)
        ) {
          treeNodesWithContainsChildren.add(edge.source);
        }
      }
    }
    const mindmapRootNodeId =
      renderer.key === "mindmap"
        ? computedMindmapRootNodeId &&
          visibleNodes.some((node) => node.id === computedMindmapRootNodeId)
          ? computedMindmapRootNodeId
          : getMindmapRootNodeId(visibleNodes, layoutMetadata.rootNodeName)
        : null;
    const connectionTargetStateByNodeId = new Map<
      string,
      "allowed" | "blocked"
    >();
    const erdNnSuggestedNodeIds = new Set<string>();

    if (renderer.key === "erd") {
      for (const edge of edges) {
        const edgeIssues = semanticIssuesByEdgeId.get(edge.id) ?? [];
        if (
          edgeIssues.some(
            (issue) =>
              issue.code === "ERD_REL_NN_ASSOCIATIVE_SUGGESTED" ||
              issue.code === "ERD_REL_NN_STRICT_REQUIRES_ASSOCIATIVE",
          )
        ) {
          erdNnSuggestedNodeIds.add(edge.source);
          erdNnSuggestedNodeIds.add(edge.target);
        }
      }
    }
    const activeSourceNode = activeConnectionSourceNodeId
      ? (visibleNodes.find(
          (node) => node.id === activeConnectionSourceNodeId,
        ) ?? null)
      : null;

    if (activeSourceNode) {
      const sourceNodeRef = diagramMode.semantic.toRoleAwareNodeRef({
        node: activeSourceNode,
        rootNodeName: layoutMetadata.rootNodeName,
      });

      for (const candidate of visibleNodes) {
        if (candidate.id === activeSourceNode.id) {
          continue;
        }

        const validation = validateEdgeCreation(
          {
            diagramType: semanticDiagramType,
            sourceNode: sourceNodeRef,
            targetNode: diagramMode.semantic.toRoleAwareNodeRef({
              node: candidate,
              rootNodeName: layoutMetadata.rootNodeName,
            }),
            mode: inspectorMode,
          },
          semanticEngineOptions,
        );

        connectionTargetStateByNodeId.set(
          candidate.id,
          validation.allowedEdgeKinds.length > 0 ? "allowed" : "blocked",
        );
      }
    }

    return visibleNodes.map((node) => {
      const nodeIssues = semanticIssuesByNodeId.get(node.id) ?? [];
      const erdBadges =
        renderer.key === "erd" && node.data.kind === "entity"
          ? (() => {
              const entityPayload = normalizeErdEntityPayloadFromNode(node);
              const badges: Array<{
                label: string;
                tone: "warning" | "info" | "suggestion";
              }> = [];
              const hasPk = entityPayload.fields.some((field) =>
                field.flags.includes("PK"),
              );

              if (!hasPk) {
                badges.push({
                  label: editorT("shell.erd.badges.noPk"),
                  tone: "warning",
                });
              }

              const fkPending = entityPayload.fields.some(
                (field) =>
                  field.flags.includes("FK") &&
                  (!field.references?.entityId ||
                    !field.references?.relationEdgeId),
              );
              if (fkPending) {
                badges.push({
                  label: editorT("shell.erd.badges.fkPending"),
                  tone: "info",
                });
              }

              if (erdNnSuggestedNodeIds.has(node.id)) {
                badges.push({
                  label: editorT("shell.erd.badges.nnSuggestsAssociative"),
                  tone: "suggestion",
                });
              }

              return badges;
            })()
          : [];
      const highlightedIssueClass =
        nodeIssues.length > 0 &&
        (isValidationPanelOpen || selectedNodeId === node.id)
          ? nodeIssues.some((issue) => issue.severity === "error")
            ? "editor-node-has-issue editor-node-issue-error"
            : "editor-node-has-issue editor-node-issue-warning"
          : null;
      const graphNodeSemantic =
        renderer.key === "graph"
          ? resolveGraphNodeSemantic(
              {
                diagramRole: node.data.diagramRole,
                kind: node.data.kind,
                label: node.data.label,
                payload: node.data.payload,
              },
              editorT,
            )
          : null;

      return {
        ...node,
        type: renderer.nodeType,
        hidden: hiddenCanvasNodeIdSet.has(node.id) || node.hidden === true,
        style: graphNodeSemantic
          ? {
              ...(node.style ?? {}),
              zIndex:
                graphNodeSemantic.variant === "core"
                  ? 3
                  : graphNodeSemantic.variant === "component"
                    ? 2
                    : 1,
            }
          : node.style,
        className: [
          node.className,
          `editor-node-renderer-${renderer.key}`,
          renderer.key === "tree" && collapsedTreeNodeIdSet.has(node.id)
            ? "editor-node-tree-collapsed"
            : null,
          activeConnectionSourceNodeId === node.id
            ? "editor-node-connection-source"
            : null,
          activeConnectionSourceNodeId &&
          node.id !== activeConnectionSourceNodeId
            ? connectionTargetStateByNodeId.get(node.id) === "allowed"
              ? "editor-node-connection-allowed"
              : "editor-node-connection-blocked"
            : null,
          highlightedIssueClass,
        ]
          .filter(Boolean)
          .join(" "),
        data: {
          ...node.data,
          nodeId: node.id,
          rendererDirection: renderer.treeDirection,
          rendererIsRoot: node.id === mindmapRootNodeId,
          rendererTreeCollapsed:
            renderer.key === "tree" && collapsedTreeNodeIdSet.has(node.id),
          rendererCanToggleTreeCollapse:
            renderer.key === "tree" &&
            treeNodesWithContainsChildren.has(node.id),
          erdBadges,
          onToggleTreeCollapse:
            renderer.key === "tree" &&
            treeNodesWithContainsChildren.has(node.id)
              ? (targetNodeId: string) => {
                  setCollapsedTreeNodeIds((current) =>
                    current.includes(targetNodeId)
                      ? current.filter((item) => item !== targetNodeId)
                      : [...current, targetNodeId],
                  );
                }
              : undefined,
          presentationMode: inspectorMode,
          displayLabel:
            inspectorMode === "operational"
              ? diagramMode.presentation.getOperationalDisplayLabel(
                  {
                    label: node.data.label,
                    payload: node.data.payload,
                  },
                  editorT,
                )
              : node.data.label,
        },
      };
    });
  }, [
    activeConnectionSourceNodeId,
    collapsedTreeNodeIdSet,
    computedMindmapRootNodeId,
    diagramMode.presentation,
    diagramMode.semantic,
    edges,
    editorT,
    hiddenCanvasNodeIdSet,
    hiddenDiagramNodeIdSet,
    inspectorMode,
    isValidationPanelOpen,
    layoutMetadata.rootNodeName,
    nodes,
    renderer,
    selectedNodeId,
    semanticDiagramType,
    semanticEngineOptions,
    semanticIssuesByEdgeId,
    semanticIssuesByNodeId,
  ]);
  const renderedEdges = useMemo(() => {
    const visibleEdges = edges.filter(
      (edge) =>
        !hiddenCanvasNodeIdSet.has(edge.source) &&
        !hiddenCanvasNodeIdSet.has(edge.target),
    );
    const nodeById = new Map(nodes.map((node) => [node.id, node] as const));
    const baseEdges = visibleEdges.map((edge) => {
      const edgeKind = edge.data?.kind ?? "flows-to";
      const payload = edge.data?.payload ?? {};
      const sourceNode = nodeById.get(edge.source);
      const targetNode = nodeById.get(edge.target);
      const renderedPresentation = diagramMode.render.resolveEdgePresentation({
        baseLabel: edge.label ? String(edge.label) : undefined,
        edgeKind,
        payload,
        sourceRole: sourceNode?.data.diagramRole,
        targetRole: targetNode?.data.diagramRole,
        sourcePosition: sourceNode?.position,
        targetPosition: targetNode?.position,
        direction: renderer.treeDirection,
      });
      const edgeIssues = semanticIssuesByEdgeId.get(edge.id) ?? [];
      const highlightedIssueClass =
        edgeIssues.length > 0 &&
        (isValidationPanelOpen || selectedEdgeId === edge.id)
          ? edgeIssues.some((issue) => issue.severity === "error")
            ? "editor-edge-invalid editor-edge-invalid-error"
            : "editor-edge-invalid editor-edge-invalid-warning"
          : null;

      return {
        ...edge,
        data: {
          kind: edgeKind,
          payload,
          externalRefs: edge.data?.externalRefs ?? [],
          parallelIndex: edge.data?.parallelIndex,
          parallelTotal: edge.data?.parallelTotal,
        },
        label: renderedPresentation.label,
        type: edge.type ?? renderer.defaultEdgeOptions.type,
        markerEnd:
          renderedPresentation.markerEnd ??
          edge.markerEnd ??
          renderer.defaultEdgeOptions.markerEnd,
        labelStyle: renderedPresentation.labelStyle,
        labelBgStyle: renderedPresentation.labelBgStyle,
        labelShowBg: renderedPresentation.labelShowBg ?? edge.labelShowBg,
        labelBgPadding:
          renderedPresentation.labelBgPadding ?? edge.labelBgPadding,
        labelBgBorderRadius:
          renderedPresentation.labelBgBorderRadius ?? edge.labelBgBorderRadius,
        animated: edge.animated ?? renderer.defaultEdgeOptions.animated,
        style: {
          ...(edge.style ?? {}),
          strokeDasharray: renderedPresentation.strokeDasharray,
        },
        className: [
          edge.className,
          renderer.defaultEdgeOptions.className,
          `editor-edge-kind-${edgeKind}`,
          `editor-edge-tone-${getEdgeKindPresentation(edgeKind).tone}`,
          `editor-edge-renderer-${renderer.key}`,
          ...(renderedPresentation.classNameTokens ?? []),
          highlightedIssueClass,
        ]
          .filter(Boolean)
          .join(" "),
      };
    });

    if (!renderer.supportsParallelEdges) {
      return baseEdges;
    }

    return computeParallelEdgeMeta(baseEdges);
  }, [
    edges,
    diagramMode,
    hiddenCanvasNodeIdSet,
    isValidationPanelOpen,
    nodes,
    renderer,
    selectedEdgeId,
    semanticIssuesByEdgeId,
  ]);
  const isReapplyLayoutBlockedByPolicy =
    layoutMetadata.allowReapplyLayout === false;
  const canReapplyLayout = useMemo(
    () =>
      isSupportedDiagramType(layoutMetadata.diagramType) &&
      !isReapplyLayoutBlockedByPolicy,
    [layoutMetadata.diagramType, isReapplyLayoutBlockedByPolicy],
  );

  function selectItem(next: { nodeId: string | null; edgeId: string | null }) {
    selectEditorItem(next, confirmInspectorDraftDiscardIfNeeded);
  }

  async function handleImportPrismaSchema() {
    if (isImportingPrismaSchema || saveState.status === "saving") {
      return;
    }

    if (!confirmInspectorDraftDiscardIfNeeded()) {
      return;
    }

    const schemaText = prismaSchemaImportText.trim();

    if (!schemaText) {
      setPrismaSchemaImportFeedback({
        kind: "error",
        message: editorT("shell.prisma.errors.emptySchema"),
      });
      return;
    }

    const hasLocalPendingChanges =
      pendingCommandsRef.current.length > 0 || saveState.isDirty;
    const confirmMessage = hasLocalPendingChanges
      ? editorT("shell.prisma.confirmImportDiscard")
      : editorT("shell.prisma.confirmImport");

    if (!window.confirm(confirmMessage)) {
      return;
    }

    autosaveDebouncerRef.current.cancel();
    setIsImportingPrismaSchema(true);
    setPrismaSchemaImportFeedback(null);

    try {
      const result = await importPrismaSchemaForEditor({
        projectId: project.id,
        schema: schemaText,
        expectedRevision: currentRevisionRef.current,
        semanticMode: inspectorMode,
      });

      syncFromSnapshot(result.workingSnapshot.snapshot);
      setCurrentRevision(result.newRevision);
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setPendingCommandsState([]);
      localMutationVersionRef.current = 0;
      setSaveState({
        status: "saved",
        isDirty: false,
        message: editorT("shell.prisma.saved"),
        lastSavedAt: Date.now(),
      });
      setVersionDiffFeedback(null);
      setVersionDiffSummary(null);
      setGlobalErrorMessage(null);
      setQuerySyncMessage(editorT("shell.prisma.synced"));
      setPrismaSchemaImportFeedback({
        kind: "success",
        message: buildPrismaSchemaImportFeedbackMessage(
          result.importSummary,
          editorT,
        ),
      });
    } catch (error) {
      setPrismaSchemaImportFeedback({
        kind: "error",
        message: formatErrorMessage(
          error,
          editorT("shell.prisma.errors.import"),
        ),
      });
    } finally {
      setIsImportingPrismaSchema(false);
    }
  }

  useEffect(() => {
    let active = true;

    async function refreshFromQuery() {
      setIsRefreshingFromQuery(true);
      setQuerySyncMessage(null);

      try {
        const [result, policy] = await Promise.all([
          loadWorkingSnapshotForEditor(project.id),
          loadSemanticPolicyForEditor(project.id),
        ]);
        if (!active) return;

        setSemanticPolicy(policy);

        if (result?.snapshot) {
          if (
            pendingCommandsRef.current.length > 0 ||
            localMutationVersionRef.current > 0
          ) {
            setCurrentRevision(result.revision);
            setQuerySyncMessage(editorT("shell.sync.initialIgnored"));
            return;
          }

          syncFromSnapshot(result.snapshot);
          setPendingCommandsState([]);
          localMutationVersionRef.current = 0;
          setCurrentRevision(result.revision);
          setSaveState(createInitialEditorAutosaveState(editorT));
          setQuerySyncMessage(editorT("shell.sync.snapshotSynced"));
          setGlobalErrorMessage(null);
        }
      } catch (error) {
        if (!active) return;

        setQuerySyncMessage(
          formatErrorMessage(error, editorT("shell.sync.errors.snapshot")),
        );
      } finally {
        if (active) {
          setIsRefreshingFromQuery(false);
        }
      }
    }

    void refreshFromQuery();
    return () => {
      active = false;
    };
  }, [
    editorT,
    localMutationVersionRef,
    pendingCommandsRef,
    project.id,
    setCurrentRevision,
    setEdges,
    setNodes,
    setPendingCommandsState,
    setSaveState,
    setSemanticPolicy,
    syncFromSnapshot,
  ]);

  const saveStatusLabel = useMemo(() => {
    switch (saveState.status) {
      case "dirty":
        return editorT("autosave.pendingChanges");
      case "saving":
        return editorT("autosave.saving");
      case "saved":
        return editorT("autosave.saved");
      case "error":
        return editorT("shell.saveStatus.error");
    }
  }, [editorT, saveState.status]);

  const saveStatusClassName = `badge editor-save-badge editor-save-badge-${saveState.status}`;
  const lastSavedAtLabel = saveState.lastSavedAt
    ? new Date(saveState.lastSavedAt).toLocaleTimeString(locale)
    : null;
  const layoutPolicyLabel = isReapplyLayoutBlockedByPolicy
    ? editorT("shell.layoutPolicy.blocked")
    : editorT("shell.layoutPolicy.allowed");
  const operationalTagPreview = operationalNodeDraft
    ? normalizeTagsInput(operationalNodeDraft.tagsText)
    : [];
  const currentSupportedDiagramType = diagramMode.id;
  const editorPersona = useMemo(
    () =>
      resolveEditorPersona(
        project.creationProfile,
        project.creationInitialView,
      ),
    [project.creationInitialView, project.creationProfile],
  );

  const nodeKindOptions = useMemo(() => {
    const scopedOptions = diagramMode.presentation.getAllowedNodeKinds(
      inspectorMode,
      semanticPolicy,
    );
    const options = [...scopedOptions];
    const selectedKind = selectedNode?.data.kind;

    if (
      selectedKind &&
      !options.some((option) => option.kind === selectedKind)
    ) {
      options.push({
        kind: selectedKind,
        outOfProfile: true,
        group: "fora-do-perfil",
      });
    }

    return options;
  }, [diagramMode, inspectorMode, selectedNode?.data.kind, semanticPolicy]);
  const quickAddKindOptions = useMemo(
    () =>
      diagramMode.presentation.getAllowedNodeKinds(
        "operational",
        semanticPolicy,
      ),
    [diagramMode, semanticPolicy],
  );
  const personaDefaultNodeKind = useMemo(() => {
    const preferredKind = editorPersona.quickAdd.defaultNodeKind;
    if (quickAddKindOptions.some((option) => option.kind === preferredKind)) {
      return preferredKind;
    }

    return diagramMode.presentation.getDefaultNodeKind();
  }, [
    diagramMode,
    editorPersona.quickAdd.defaultNodeKind,
    quickAddKindOptions,
  ]);
  const quickAddRoleOptions = useMemo(
    () => diagramMode.quickAdd.getRoleOptions(editorT),
    [diagramMode, editorT],
  );
  const quickAddCopy = useMemo(
    () => diagramMode.quickAdd.getCopy(editorT),
    [diagramMode, editorT],
  );
  const edgeKindOptions = EdgeKindSchema.options;
  const nodeLabelById = useMemo(
    () =>
      new Map(
        nodes.map((node) => [
          node.id,
          inspectorMode === "operational"
            ? diagramMode.presentation.getOperationalDisplayLabel(
                {
                  label: node.data.label,
                  payload: node.data.payload,
                },
                editorT,
              )
            : node.data.label,
        ]),
      ),
    [diagramMode, editorT, inspectorMode, nodes],
  );
  const nodeRoleById = useMemo(
    () =>
      new Map(
        nodes.map((node) => [
          node.id,
          diagramMode.semantic.resolveNodeRole({
            kind: node.data.kind,
            nodePayload: node.data.payload,
            nodeLabel: node.data.label,
            rootNodeName: layoutMetadata.rootNodeName ?? null,
          }),
        ]),
      ),
    [diagramMode, layoutMetadata.rootNodeName, nodes],
  );
  const selectedNodeRelations = useMemo<InspectorNodeRelationsView>(() => {
    if (!selectedNode) {
      return {
        incomingCount: 0,
        outgoingCount: 0,
        summaryChips: [],
        preview: [],
      };
    }

    return diagramMode.inspector.buildNodeRelations({
      selectedNode,
      edges,
      nodeLabelById,
      nodeRoleById,
      inspectorMode,
      t: editorT,
    });
  }, [
    diagramMode,
    edges,
    editorT,
    inspectorMode,
    nodeLabelById,
    nodeRoleById,
    selectedNode,
  ]);
  const processSelectedNodeRelations = useMemo(
    () =>
      diagramMode.inspector.kind === "process" && selectedNode
        ? (selectedNodeRelations as unknown as ProcessRelationsViewModel)
        : null,
    [diagramMode.inspector.kind, selectedNode, selectedNodeRelations],
  );
  const selectedNodeRoleLabel = selectedNode
    ? diagramMode.semantic.getDiagramRoleLabel(
        nodeRoleById.get(selectedNode.id),
        editorT,
      )
    : null;
  const selectedNodeStructureTips = useMemo(() => {
    if (!selectedNode) {
      return [] as string[];
    }

    return diagramMode.semantic.getNodeStructureTips(
      {
        diagramRole: nodeRoleById.get(selectedNode.id),
        nodeKind: selectedNode.data.kind,
        nodeLabel:
          nodeLabelById.get(selectedNode.id) ?? selectedNode.data.label,
        incomingCount: selectedNodeRelations.incomingCount,
        outgoingCount: selectedNodeRelations.outgoingCount,
      },
      editorT,
    );
  }, [
    diagramMode,
    editorT,
    nodeLabelById,
    nodeRoleById,
    selectedNode,
    selectedNodeRelations,
  ]);
  const selectedEdgeSourceLabel = selectedEdge
    ? (nodeLabelById.get(selectedEdge.source) ?? selectedEdge.source)
    : null;
  const selectedEdgeTargetLabel = selectedEdge
    ? (nodeLabelById.get(selectedEdge.target) ?? selectedEdge.target)
    : null;
  const quickFindOptions = useMemo(
    () =>
      filterNodeQuickFindOptions(nodes, quickFindQuery, inspectorMode, editorT),
    [editorT, inspectorMode, nodes, quickFindQuery],
  );
  const selectedItemLabel = selectedNode
    ? (nodeLabelById.get(selectedNode.id) ?? selectedNode.data.label)
    : selectedEdge
      ? selectedEdge.label
        ? String(selectedEdge.label)
        : `${selectedEdgeSourceLabel ?? selectedEdge.source} -> ${
            selectedEdgeTargetLabel ?? selectedEdge.target
          }`
      : editorT("shell.selection.none");
  const inspectorSelectionState = resolveInspectorSelectionState(
    {
      hasSelectedNode: Boolean(selectedNode),
      hasSelectedEdge: Boolean(selectedEdge),
    },
    editorT,
  );
  const isProcessDiagram = diagramMode.inspector.kind === "process";
  const isGraphDiagram = Boolean(diagramMode.semantic.graph);
  const DiagramInspectorAdapter = useMemo(
    () => resolveEditorDiagramInspectorAdapter(diagramMode.inspector.kind),
    [diagramMode.inspector.kind],
  );
  const processInspectorStrategy: EditorDiagramProcessInspectorStrategy | null =
    diagramMode.inspector.kind === "process"
      ? (diagramMode.inspector as EditorDiagramProcessInspectorStrategy)
      : null;
  const inspectorCopy = useMemo(
    () => diagramMode.inspector.getCopy(editorT),
    [diagramMode, editorT],
  );
  const processNodeInspectorModel =
    processInspectorStrategy && selectedNode && processSelectedNodeRelations
      ? processInspectorStrategy.process.resolveNodeViewModel(
          {
            diagramRole: nodeRoleById.get(selectedNode.id),
            kind: selectedNode.data.kind,
            label:
              nodeLabelById.get(selectedNode.id) ?? selectedNode.data.label,
            payload: selectedNode.data.payload,
            relations: processSelectedNodeRelations,
          },
          editorT,
        )
      : null;
  const flowSelectionKindLabel =
    processNodeInspectorModel?.selectionKindLabel ??
    (isProcessDiagram && selectedNode
      ? (() => {
          const role = resolveProcessNodeRole({
            diagramRole: nodeRoleById.get(selectedNode.id),
            kind: selectedNode.data.kind,
            label:
              nodeLabelById.get(selectedNode.id) ?? selectedNode.data.label,
          });
          const roleMeta = getProcessRoleMeta(role, editorT);

          return role === "flow-step"
            ? roleMeta.kindLabel
            : roleMeta.badgeLabel;
        })()
      : null);
  const flowSelectionChipLabel = isProcessDiagram
    ? selectedNode
      ? `${flowSelectionKindLabel ?? ""}${
          inspectorMode === "technical"
            ? ` (kind: ${selectedNode.data.kind})`
            : ""
        }`
      : selectedEdge
        ? `${getEdgeKindLabelForDiagram(
            currentSupportedDiagramType,
            selectedEdge.data?.kind ?? "flows-to",
            "operational",
            editorT,
          )}${
            inspectorMode === "technical"
              ? ` (kind: ${selectedEdge.data?.kind ?? "flows-to"})`
              : ""
          }`
        : null
    : null;
  const processEdgeInspectorModel =
    processInspectorStrategy &&
    selectedEdge &&
    selectedEdgeSourceLabel &&
    selectedEdgeTargetLabel
      ? processInspectorStrategy.process.resolveEdgeViewModel(
          {
            kind: selectedEdge.data?.kind ?? "flows-to",
            label: selectedEdge.label ? String(selectedEdge.label) : undefined,
            sourceLabel: selectedEdgeSourceLabel,
            targetLabel: selectedEdgeTargetLabel,
          },
          editorT,
        )
      : null;
  const graphSelectedNodeSemantic =
    isGraphDiagram && selectedNode
      ? diagramMode.semantic.graph?.resolveNodeSemantic(
          {
            diagramRole: nodeRoleById.get(selectedNode.id),
            kind: selectedNode.data.kind,
            label: selectedNode.data.label,
            payload: selectedNode.data.payload,
            incomingCount: selectedNodeRelations.incomingCount,
            outgoingCount: selectedNodeRelations.outgoingCount,
          },
          editorT,
        )
      : null;
  const graphSelectedEdgeSemantic =
    isGraphDiagram && selectedEdge
      ? diagramMode.semantic.graph?.resolveEdgeSemantic(
          selectedEdge.data?.kind ?? "flows-to",
          editorT,
        )
      : null;
  const inspectorSelectionBadge = graphSelectedNodeSemantic
    ? graphSelectedNodeSemantic.selectionBadgeLabel
    : diagramMode.inspector.resolveSelectionBadge({
        hasSelectedNode: Boolean(selectedNode),
        hasSelectedEdge: Boolean(selectedEdge),
        defaultBadge: inspectorSelectionState.badgeLabel,
        t: editorT,
      });
  const graphSelectedNodeKindLabel = graphSelectedNodeSemantic
    ? graphSelectedNodeSemantic.kindLabel
    : null;
  const graphSelectedNodeKindDescription = graphSelectedNodeSemantic
    ? graphSelectedNodeSemantic.kindDescription
    : null;
  const isInspectorVisible = !isFocusInspectorCollapsed;
  const shouldShowMetadataPanel = !isCanvasFocusMode;
  const shouldShowPrismaPanel = !isCanvasFocusMode;
  const shouldShowVersionsPanel = !isCanvasFocusMode;
  const processContextualSourceNode = useMemo(() => {
    if (!isProcessDiagram || !selectedNode) {
      return selectedNode;
    }

    const selectedRole = resolveProcessNodeRole({
      diagramRole: nodeRoleById.get(selectedNode.id),
      kind: selectedNode.data.kind,
      label: nodeLabelById.get(selectedNode.id) ?? selectedNode.data.label,
    });

    if (selectedRole !== "flow-note") {
      return selectedNode;
    }

    const hostEdge = edges.find(
      (edge) =>
        (edge.data?.kind ?? "flows-to") === "references" &&
        (edge.source === selectedNode.id || edge.target === selectedNode.id),
    );
    const hostNodeId =
      hostEdge?.source === selectedNode.id ? hostEdge.target : hostEdge?.source;

    return hostNodeId
      ? (nodes.find((node) => node.id === hostNodeId) ?? selectedNode)
      : selectedNode;
  }, [
    edges,
    isProcessDiagram,
    nodeLabelById,
    nodeRoleById,
    nodes,
    selectedNode,
  ]);
  const contextualActions = useMemo(() => {
    if (isProcessDiagram && processContextualSourceNode) {
      const contextualRole = resolveProcessNodeRole({
        diagramRole: nodeRoleById.get(processContextualSourceNode.id),
        kind: processContextualSourceNode.data.kind,
        label:
          nodeLabelById.get(processContextualSourceNode.id) ??
          processContextualSourceNode.data.label,
      });
      const existingOutgoingLabels = edges
        .filter(
          (edge) =>
            edge.source === processContextualSourceNode.id &&
            ((edge.data?.kind ?? "flows-to") === "flows-to" ||
              (edge.data?.kind ?? "flows-to") === "depends-on"),
        )
        .map((edge) => (edge.label ? String(edge.label) : undefined))
        .filter((label): label is string => Boolean(label));

      return resolveProcessSelectionQuickActions({
        selectedRole: contextualRole,
        existingOutgoingLabels,
        t: editorT,
      }).map((action) => ({
        ...action,
        insertMode:
          action.id === "flow-add-note"
            ? ("flow-note" as const)
            : action.id === "flow-add-branch-path"
              ? ("flow-branch" as const)
              : ("flow-next-step" as const),
      }));
    }

    return diagramMode.contextualActions.getSelectionActions(editorT);
  }, [
    diagramMode,
    editorT,
    edges,
    isProcessDiagram,
    nodeLabelById,
    nodeRoleById,
    processContextualSourceNode,
  ]);
  const quickAction = useMemo(() => {
    if (contextualActions[0]) {
      return contextualActions[0];
    }

    const fallbackAction =
      diagramMode.contextualActions.getPrimarySelectionAction(editorT);
    return {
      ...fallbackAction,
      label: quickAddCopy.addPrimary,
      nodeKind: personaDefaultNodeKind,
      edgeKind: editorPersona.quickAdd.defaultEdgeKind,
    };
  }, [
    contextualActions,
    diagramMode,
    editorT,
    editorPersona.quickAdd.defaultEdgeKind,
    quickAddCopy.addPrimary,
    personaDefaultNodeKind,
  ]);
  const quickAddDefaultRelationLabel = selectedNode
    ? diagramMode.presentation.getEdgeKindLabel(
        quickAction.edgeKind,
        "operational",
        editorT,
      )
    : null;
  const inlineRenameNode = useMemo(
    () =>
      inlineRenameNodeId
        ? (nodes.find((node) => node.id === inlineRenameNodeId) ?? null)
        : null,
    [inlineRenameNodeId, nodes],
  );
  const secondarySelectionActions = useMemo(
    () => contextualActions.slice(1),
    [contextualActions],
  );
  const hasErdAddFieldAction = useMemo(
    () => hasEditorDiagramCapability(diagramMode, "contextual-add-field"),
    [diagramMode],
  );
  const selectionNodeKindPresentation = selectedNode
    ? getNodeKindPresentation(selectedNode.data.kind, editorT)
    : null;
  const normalizeProcessViewportPresence = useCallback(
    (
      instance: ReactFlowInstance<
        RFNode,
        RFEdge
      > | null = reactFlowInstanceRef.current,
    ) => {
      if (!isProcessDiagram || !instance) {
        return;
      }

      const currentViewport = instance.getViewport();
      if (currentViewport.zoom >= 0.78) {
        return;
      }

      const currentNodes = instance.getNodes();
      if (currentNodes.length === 0) {
        return;
      }

      const bounds = instance.getNodesBounds(currentNodes);
      instance.setCenter(
        bounds.x + bounds.width / 2,
        bounds.y + bounds.height / 2,
        {
          zoom: 0.78,
          duration: 220,
        },
      );
    },
    [isProcessDiagram],
  );
  const flowSelectionDismissKey = `${selectedNodeId ?? ""}:${selectedEdgeId ?? ""}:${inspectorMode}:${isCanvasFocusMode}`;
  const isSelectedTreeSubtreeCollapsed = selectedNode
    ? collapsedTreeNodeIdSet.has(selectedNode.id)
    : false;
  const inspectorToggleLabel = isInspectorVisible
    ? editorT("shell.inspector.hide")
    : editorT("shell.inspector.show");
  const inspectorSubtitle = useMemo(
    () =>
      diagramMode.inspector.getSubtitle({
        hasSelectedNode: Boolean(selectedNode),
        hasSelectedEdge: Boolean(selectedEdge),
        t: editorT,
      }),
    [diagramMode, editorT, selectedEdge, selectedNode],
  );
  const diagramDefinitionLabel = layoutMetadata.diagramType
    ? editorT("shell.diagram.current", {
        diagramType: getDiagramTypeLabel(layoutMetadata.diagramType),
      })
    : editorT("shell.diagram.pending");
  const hasDiagramRendererMismatch =
    isSupportedDiagramType(layoutMetadata.diagramType) &&
    renderer.key !== layoutMetadata.diagramType;
  const inlineRenamePopoverStyle = useMemo(() => {
    if (!inlineRenameNode) {
      return undefined;
    }

    const canvasRect = canvasRegionRef.current?.getBoundingClientRect();
    const fallbackWidth = canvasRect?.width ?? 960;
    const fallbackHeight = canvasRect?.height ?? 620;
    const topBarOffset = 72;
    const left = inlineRenameNode.position.x * viewport.zoom + viewport.x + 24;
    const top =
      inlineRenameNode.position.y * viewport.zoom + viewport.y + topBarOffset;

    return {
      left: `${Math.max(16, Math.min(left, fallbackWidth - 280))}px`,
      top: `${Math.max(topBarOffset, Math.min(top, fallbackHeight - 128))}px`,
    };
  }, [inlineRenameNode, viewport]);

  useEffect(() => {
    if (quickFindOptions.length === 0) {
      setQuickFindActiveIndex(0);
      return;
    }

    if (quickFindActiveIndex > quickFindOptions.length - 1) {
      setQuickFindActiveIndex(quickFindOptions.length - 1);
    }
  }, [quickFindActiveIndex, quickFindOptions.length, setQuickFindActiveIndex]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const globalWindow = window as Window & {
      __mapiaE2eConnectNodes?: (
        sourceNodeId: string,
        targetNodeId: string,
      ) => Promise<boolean>;
    };

    globalWindow.__mapiaE2eConnectNodes = async (
      sourceNodeId: string,
      targetNodeId: string,
    ) => {
      const ready = await ensureQueueFlushedBeforeDirectWrite();
      if (!ready) {
        return false;
      }

      return createEdgeOnServer({
        sourceNodeId,
        targetNodeId,
        edgeKind: quickAction.edgeKind,
        openAssistantOnInvalid: true,
      });
    };

    return () => {
      delete globalWindow.__mapiaE2eConnectNodes;
    };
    // E2E hook only depends on the quick-action default kind; runtime refs handle fresh graph state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickAction.edgeKind]);

  useEffect(() => {
    if (isAddNodeDialogOpen) {
      return;
    }

    const defaultKind = personaDefaultNodeKind;

    setAddNodeDraft((current) => ({
      ...current,
      kind: defaultKind,
      diagramRole: diagramMode.quickAdd.resolveDefaultRoleForKind(defaultKind),
    }));
  }, [diagramMode, isAddNodeDialogOpen, personaDefaultNodeKind]);

  function handleZoomIn() {
    reactFlowInstanceRef.current?.zoomIn({ duration: 180 });
  }

  function handleZoomOut() {
    reactFlowInstanceRef.current?.zoomOut({ duration: 180 });
  }

  function handleFitView() {
    reactFlowInstanceRef.current?.fitView({
      padding: isProcessDiagram ? 0.04 : 0.2,
      minZoom: isProcessDiagram ? 0.78 : undefined,
      duration: 220,
    });
    if (isProcessDiagram) {
      window.setTimeout(() => {
        normalizeProcessViewportPresence();
      }, 240);
    }
  }

  function handleCenterView() {
    const instance = reactFlowInstanceRef.current;

    if (!instance) {
      return;
    }

    if (selectedNode) {
      instance.setCenter(selectedNode.position.x, selectedNode.position.y, {
        zoom: Math.max(viewportRef.current.zoom, 1),
        duration: 220,
      });
      return;
    }

    if (selectedEdge) {
      const source = nodesRef.current.find(
        (node) => node.id === selectedEdge.source,
      );
      const target = nodesRef.current.find(
        (node) => node.id === selectedEdge.target,
      );
      if (source && target) {
        instance.setCenter(
          (source.position.x + target.position.x) / 2,
          (source.position.y + target.position.y) / 2,
          {
            zoom: Math.max(viewportRef.current.zoom, 1),
            duration: 220,
          },
        );
        return;
      }
    }

    handleFitView();
  }

  function handleMoveQuickFindActiveIndex(direction: "next" | "previous") {
    if (quickFindOptions.length === 0) {
      setQuickFindActiveIndex(0);
      return;
    }

    setQuickFindActiveIndex((current) => {
      if (direction === "next") {
        return (current + 1) % quickFindOptions.length;
      }

      return current - 1 < 0 ? quickFindOptions.length - 1 : current - 1;
    });
  }

  function handleSelectQuickFindByIndex(index: number) {
    const option = quickFindOptions[index];

    if (!option) {
      return;
    }

    focusNodeById(option.id);
    setQuickFindActiveIndex(index);
    handleCloseQuickFind();
  }

  function focusNodeById(nodeId: string) {
    const targetNode = nodesRef.current.find((node) => node.id === nodeId);
    if (!targetNode) {
      return;
    }

    selectItem({ nodeId: targetNode.id, edgeId: null });
    reactFlowInstanceRef.current?.setCenter(
      targetNode.position.x,
      targetNode.position.y,
      {
        zoom: Math.max(viewportRef.current.zoom, 1.05),
        duration: 220,
      },
    );
  }

  function handleOpenRelatedNodeFromRelation(
    _edgeId: string,
    relatedNodeId: string,
  ) {
    selectItem({ nodeId: relatedNodeId, edgeId: null });
    setIsFocusInspectorCollapsed(false);

    const relatedNode = nodesRef.current.find(
      (node) => node.id === relatedNodeId,
    );
    if (!relatedNode) {
      return;
    }

    reactFlowInstanceRef.current?.setCenter(
      relatedNode.position.x,
      relatedNode.position.y,
      {
        zoom: Math.max(viewportRef.current.zoom, 1.05),
        duration: 220,
      },
    );
  }

  function handleOpenTransitionFromRelation(edgeId: string) {
    const edge = edgesRef.current.find((candidate) => candidate.id === edgeId);
    if (!edge) {
      return;
    }

    selectItem({ nodeId: null, edgeId: edge.id });
    setIsFocusInspectorCollapsed(false);
    const sourceNode = nodesRef.current.find((node) => node.id === edge.source);
    const targetNode = nodesRef.current.find((node) => node.id === edge.target);
    if (!sourceNode || !targetNode) {
      return;
    }

    reactFlowInstanceRef.current?.setCenter(
      (sourceNode.position.x + targetNode.position.x) / 2,
      (sourceNode.position.y + targetNode.position.y) / 2,
      {
        zoom: Math.max(viewportRef.current.zoom, 1),
        duration: 220,
      },
    );
  }

  function handleRemoveRelation(edgeId: string) {
    const removed = applyLocalCommandAndQueue({
      type: "removeEdge",
      edgeId,
    });

    if (removed) {
      setQuerySyncMessage(
        isProcessDiagram
          ? editorT("shell.messages.transitionRemoved")
          : editorT("shell.messages.relationRemoved"),
      );
    }
  }

  function handleFocusSemanticIssue(issue: SemanticIssueLike) {
    if (issue.targetType === "node" && issue.targetId) {
      focusNodeById(issue.targetId);
      return;
    }

    if (issue.targetType === "edge" && issue.targetId) {
      const edge = edgesRef.current.find(
        (candidate) => candidate.id === issue.targetId,
      );
      if (!edge) {
        return;
      }

      selectItem({ nodeId: null, edgeId: edge.id });
      const sourceNode = nodesRef.current.find(
        (node) => node.id === edge.source,
      );
      const targetNode = nodesRef.current.find(
        (node) => node.id === edge.target,
      );

      if (sourceNode && targetNode) {
        reactFlowInstanceRef.current?.setCenter(
          (sourceNode.position.x + targetNode.position.x) / 2,
          (sourceNode.position.y + targetNode.position.y) / 2,
          {
            zoom: Math.max(viewportRef.current.zoom, 1),
            duration: 220,
          },
        );
      }
      return;
    }

    handleFitView();
  }

  function applySemanticRepairAction(
    action: RepairAction,
    markAsRepairApplied: boolean,
  ) {
    const commandMeta = markAsRepairApplied
      ? { meta: { repairApplied: true } }
      : {};

    if (action.type === "updateEdgeKind") {
      return applyLocalCommandAndQueue({
        type: "updateEdge",
        edgeId: action.edgeId,
        patch: {
          kind: action.nextKind,
          label: getEdgeKindLabel(action.nextKind, "operational"),
        },
        ...commandMeta,
      });
    }

    if (action.type === "removeEdge") {
      return applyLocalCommandAndQueue({
        type: "removeEdge",
        edgeId: action.edgeId,
        ...commandMeta,
      });
    }

    return applyLocalCommandAndQueue({
      type: "updateNode",
      nodeId: action.nodeId,
      patch: {
        kind: action.nextKind,
      },
      ...commandMeta,
    });
  }

  function openTechnicalOverrideDialog(input: {
    title: string;
    message: string;
    requireReason: boolean;
    onConfirm: (reason: string) => Promise<void>;
  }) {
    setSemanticOverrideReason("");
    setPendingSemanticOverride({
      title: input.title,
      message: input.message,
      requireReason: input.requireReason,
      onConfirm: input.onConfirm,
    });
  }

  function resolvePreferredEdgeLabel(input: {
    sourceNode: RFNode;
    targetNode: RFNode;
    edgeKind: EdgeKind;
    explicitLabel?: string;
  }) {
    if (input.explicitLabel !== undefined) {
      return input.explicitLabel;
    }

    if (currentSupportedDiagramType !== "flow") {
      return getEdgeKindLabel(input.edgeKind, "operational");
    }

    const sourceRole = resolveProcessNodeRole({
      diagramRole: input.sourceNode.data.diagramRole,
      kind: input.sourceNode.data.kind,
      label: input.sourceNode.data.label,
    });
    const targetRole = resolveProcessNodeRole({
      diagramRole: input.targetNode.data.diagramRole,
      kind: input.targetNode.data.kind,
      label: input.targetNode.data.label,
    });
    const existingOutgoingLabels = edgesRef.current
      .filter(
        (edge) =>
          edge.source === input.sourceNode.id &&
          ((edge.data?.kind ?? "flows-to") === "flows-to" ||
            (edge.data?.kind ?? "flows-to") === "depends-on"),
      )
      .map((edge) => (edge.label ? String(edge.label) : undefined))
      .filter((label): label is string => Boolean(label));

    const processLabel = resolveDefaultProcessEdgeLabel({
      sourceRole,
      edgeKind: input.edgeKind,
      existingOutgoingLabels,
      t: editorT,
    });

    if (processLabel !== undefined) {
      return processLabel;
    }

    if (sourceRole === "flow-note" || targetRole === "flow-note") {
      return undefined;
    }

    return undefined;
  }

  async function createEdgeOnServer(input: {
    sourceNodeId: string;
    targetNodeId: string;
    edgeKind: EdgeKind;
    openAssistantOnInvalid: boolean;
    allowSemanticOverride?: boolean;
    overrideReason?: string;
  }) {
    const sourceNode = nodesRef.current.find(
      (node) => node.id === input.sourceNodeId,
    );
    const targetNode = nodesRef.current.find(
      (node) => node.id === input.targetNodeId,
    );

    if (!sourceNode || !targetNode) {
      setGlobalErrorMessage(editorT("shell.errors.connectionNodesNotFound"));
      return false;
    }

    try {
      const result = await createEdgeDirect({
        edge: {
          id: crypto.randomUUID(),
          sourceNodeId: input.sourceNodeId,
          targetNodeId: input.targetNodeId,
          kind: input.edgeKind,
          label: resolvePreferredEdgeLabel({
            sourceNode,
            targetNode,
            edgeKind: input.edgeKind,
          }),
          data: {},
        },
        semanticMode: inspectorMode,
        allowSemanticOverride: input.allowSemanticOverride,
        overrideReason: input.overrideReason,
      });
      if (!result.ok) {
        setGlobalErrorMessage(
          editorT("shell.errors.finishPendingSaveBeforeApply"),
        );
        return false;
      }

      setPendingConnectionAssistant(null);
      setGlobalErrorMessage(null);
      return true;
    } catch (error) {
      if (error instanceof EditorQueryError) {
        if (
          error.code === "SEMANTIC_VIOLATION" &&
          input.openAssistantOnInvalid
        ) {
          const allowedKinds = Array.isArray(error.payload?.allowedEdgeKinds)
            ? error.payload.allowedEdgeKinds.filter(
                (kind): kind is EdgeKind =>
                  EdgeKindSchema.safeParse(kind).success,
              )
            : [];
          const recommendedEdgeKindResult = EdgeKindSchema.safeParse(
            error.payload?.recommendedEdgeKind,
          );

          setPendingConnectionAssistant({
            sourceNodeId: input.sourceNodeId,
            targetNodeId: input.targetNodeId,
            sourceLabel:
              nodeLabelById.get(input.sourceNodeId) ??
              sourceNode.data.label ??
              sourceNode.id,
            targetLabel:
              nodeLabelById.get(input.targetNodeId) ??
              targetNode.data.label ??
              targetNode.id,
            attemptedEdgeKind: input.edgeKind,
            allowedEdgeKinds: allowedKinds,
            recommendedEdgeKind: recommendedEdgeKindResult.success
              ? recommendedEdgeKindResult.data
              : undefined,
            message: error.message,
            details:
              typeof error.payload?.details === "string"
                ? error.payload.details
                : undefined,
          });
          return false;
        }

        if (
          error.code === "SEMANTIC_VIOLATION" &&
          inspectorMode === "technical" &&
          error.payload?.overrideAllowed
        ) {
          openTechnicalOverrideDialog({
            title: editorT("shell.semanticOverride.ariaLabel"),
            message: error.message,
            requireReason: error.payload.requireOverrideReason ?? true,
            onConfirm: async (reason) => {
              await createEdgeOnServer({
                sourceNodeId: input.sourceNodeId,
                targetNodeId: input.targetNodeId,
                edgeKind: input.edgeKind,
                openAssistantOnInvalid: input.openAssistantOnInvalid,
                allowSemanticOverride: true,
                overrideReason: reason,
              });
            },
          });
          return false;
        }

        if (error.code === "CONFLICT") {
          if (typeof error.payload?.currentRevision === "number") {
            setCurrentRevision(error.payload.currentRevision);
          }
          setGlobalErrorMessage(error.message);
          return false;
        }
      }

      setGlobalErrorMessage(
        formatErrorMessage(
          error,
          isProcessDiagram
            ? editorT("shell.errors.createTransitionOnServer")
            : editorT("shell.errors.createRelationOnServer"),
        ),
      );
      return false;
    }
  }

  function tryCreateEdgeWithSemanticRules(input: {
    sourceNodeId: string;
    targetNodeId: string;
    edgeKind: EdgeKind;
    edgeLabel?: string;
    explicitKind: boolean;
    openAssistantOnInvalid: boolean;
  }) {
    const sourceNode = nodesRef.current.find(
      (node) => node.id === input.sourceNodeId,
    );
    const targetNode = nodesRef.current.find(
      (node) => node.id === input.targetNodeId,
    );

    if (!sourceNode || !targetNode) {
      setGlobalErrorMessage(editorT("shell.errors.connectionNodesNotFound"));
      return false;
    }

    const validation = validateEdgeCreation(
      {
        diagramType: semanticDiagramType,
        sourceNode: diagramMode.semantic.toRoleAwareNodeRef({
          node: sourceNode,
          rootNodeName: layoutMetadata.rootNodeName,
        }),
        targetNode: diagramMode.semantic.toRoleAwareNodeRef({
          node: targetNode,
          rootNodeName: layoutMetadata.rootNodeName,
        }),
        edgeKind: input.edgeKind,
        mode: inspectorMode,
      },
      semanticEngineOptions,
    );

    let nextEdgeKind = input.edgeKind;

    if (!validation.ok) {
      if (input.openAssistantOnInvalid) {
        setPendingConnectionAssistant({
          sourceNodeId: sourceNode.id,
          targetNodeId: targetNode.id,
          sourceLabel:
            nodeLabelById.get(sourceNode.id) ??
            sourceNode.data.label ??
            sourceNode.id,
          targetLabel:
            nodeLabelById.get(targetNode.id) ??
            targetNode.data.label ??
            targetNode.id,
          attemptedEdgeKind: input.edgeKind,
          allowedEdgeKinds: validation.allowedEdgeKinds,
          recommendedEdgeKind: validation.recommendedEdgeKind,
          message:
            validation.violation?.message ??
            editorT("shell.connection.invalidRules"),
          details: validation.violation?.details,
        });
        return false;
      }

      if (validation.allowedEdgeKinds.length === 0) {
        setGlobalErrorMessage(
          validation.violation?.message ??
            editorT("shell.errors.invalidConnectionForDiagram"),
        );
        return false;
      }

      nextEdgeKind =
        validation.recommendedEdgeKind ?? validation.allowedEdgeKinds[0];
      setQuerySyncMessage(
        isProcessDiagram
          ? editorT("shell.messages.transitionAutoAdjusted", {
              nextKind: getEdgeKindLabel(nextEdgeKind, "operational", editorT),
            })
          : editorT("shell.messages.relationAutoAdjusted", {
              nextKind: getEdgeKindLabel(nextEdgeKind, "operational", editorT),
            }),
      );
    } else if (
      !input.explicitKind &&
      inspectorMode === "operational" &&
      validation.recommendedEdgeKind &&
      validation.recommendedEdgeKind !== input.edgeKind
    ) {
      nextEdgeKind = validation.recommendedEdgeKind;
    }

    return applyLocalCommandAndQueue({
      type: "addEdge",
      edge: {
        id: crypto.randomUUID(),
        sourceNodeId: sourceNode.id,
        targetNodeId: targetNode.id,
        kind: nextEdgeKind,
        label: resolvePreferredEdgeLabel({
          sourceNode,
          targetNode,
          edgeKind: nextEdgeKind,
          explicitLabel: input.edgeLabel,
        }),
        data: {},
      },
    });
  }
  async function handleToggleValidationPanel() {
    setIsFocusInspectorCollapsed(false);
    await toggleValidationPanelController();
  }

  function buildLayoutNodesFromFlowNodes(
    inputNodes: RFNode[] = nodesRef.current,
  ) {
    return inputNodes
      .filter(
        (node) => !hiddenCanvasNodeIdSet.has(node.id) && node.hidden !== true,
      )
      .map((node) => ({
        id: node.id,
        kind: node.data.kind,
        diagramRole: node.data.diagramRole,
        position: {
          x: node.position.x,
          y: node.position.y,
        },
      }));
  }

  function buildLayoutEdgesFromFlowEdges(
    inputEdges: RFEdge[] = edgesRef.current,
  ) {
    return inputEdges
      .filter(
        (edge) =>
          !hiddenCanvasNodeIdSet.has(edge.source) &&
          !hiddenCanvasNodeIdSet.has(edge.target),
      )
      .map((edge) => ({
        id: edge.id,
        sourceNodeId: edge.source,
        targetNodeId: edge.target,
        kind: edge.data?.kind ?? "flows-to",
      }));
  }

  function resolveNodeInsertPosition(input: {
    referenceNode: RFNode | null;
    insertMode: ContextualInsertMode;
    nodeKind?: NodeKind;
    diagramRole?: DiagramRole;
  }) {
    const containerRect = canvasRegionRef.current?.getBoundingClientRect();
    const currentViewport = viewportRef.current;
    return diagramMode.layout.computeInsertPosition({
      referenceNode: input.referenceNode
        ? {
            id: input.referenceNode.id,
            kind: input.referenceNode.data.kind,
            diagramRole: input.referenceNode.data.diagramRole,
            position: {
              x: input.referenceNode.position.x,
              y: input.referenceNode.position.y,
            },
          }
        : null,
      nodes: buildLayoutNodesFromFlowNodes(),
      edges: buildLayoutEdgesFromFlowEdges(),
      viewport: {
        x: currentViewport.x,
        y: currentViewport.y,
        zoom: currentViewport.zoom,
        ...(containerRect
          ? {
              width: containerRect.width,
              height: containerRect.height,
            }
          : {}),
      },
      layoutOptions: layoutMetadata.layoutOptions,
      insertMode: input.insertMode,
      nodeKind: input.nodeKind,
      diagramRole: input.diagramRole,
    });
  }

  function resolveSourceNodeIdForContextAction(
    action: SelectionHudQuickAction,
  ) {
    return diagramMode.contextualActions.resolveSourceNodeId({
      action,
      selectedNode,
      edges: edgesRef.current,
    });
  }

  function applyDiagramReflow(input: {
    diagramType: DiagramLayoutType;
    rootId?: string | null;
  }) {
    if (input.diagramType !== diagramMode.id) {
      return 0;
    }

    const reflowedPositions = diagramMode.layout.computeReflow({
      nodes: buildLayoutNodesFromFlowNodes(),
      edges: buildLayoutEdgesFromFlowEdges(),
      rootId: input.rootId,
      layoutOptions: layoutMetadata.layoutOptions,
    });

    let movedNodes = 0;
    for (const node of nodesRef.current) {
      const nextPosition = reflowedPositions[node.id];
      if (!nextPosition) {
        continue;
      }

      const hasPositionChanged =
        Math.abs(node.position.x - nextPosition.x) > 0.5 ||
        Math.abs(node.position.y - nextPosition.y) > 0.5;
      if (!hasPositionChanged) {
        continue;
      }

      movedNodes += 1;
      applyLocalCommandAndQueue({
        type: "moveNode",
        nodeId: node.id,
        position: {
          x: nextPosition.x,
          y: nextPosition.y,
        },
      });
    }

    return movedNodes;
  }

  function applyContextualLayoutAdjustmentsIfNeeded(input: {
    insertMode: ContextualInsertMode;
    insertedNodeId: string;
    sourceNodeId?: string;
  }) {
    const adjustment = diagramMode.layout.applyPostInsertLayout({
      insertMode: input.insertMode,
      insertedNodeId: input.insertedNodeId,
      sourceNodeId: input.sourceNodeId,
      nodes: buildLayoutNodesFromFlowNodes(),
      edges: buildLayoutEdgesFromFlowEdges(),
      layoutOptions: layoutMetadata.layoutOptions,
    });

    if (adjustment.kind === "reflow") {
      applyDiagramReflow({
        diagramType: diagramMode.id,
      });
      return;
    }

    if (adjustment.kind !== "positions" || !adjustment.positions) {
      return;
    }

    for (const node of nodesRef.current) {
      const nextPosition = adjustment.positions[node.id];
      if (!nextPosition) {
        continue;
      }

      const hasPositionChanged =
        Math.abs(node.position.x - nextPosition.x) > 0.5 ||
        Math.abs(node.position.y - nextPosition.y) > 0.5;
      if (!hasPositionChanged) {
        continue;
      }

      applyLocalCommandAndQueue({
        type: "moveNode",
        nodeId: node.id,
        position: nextPosition,
      });
    }
  }

  function buildAddNodePayloadFromDraft(draft: AddNodeDraft) {
    const nextPayload: Record<string, unknown> = {};
    const normalizedDescription = draft.description.trim();
    const normalizedTags = normalizeTagsInput(draft.tagsText);

    if (normalizedDescription) {
      nextPayload.description = normalizedDescription;
    }

    if (normalizedTags.length > 0) {
      nextPayload.tags = normalizedTags;
    }

    return draft.diagramRole
      ? writeDiagramRoleToPayload(nextPayload, draft.diagramRole)
      : nextPayload;
  }

  function insertNodeFromDraft(input: {
    draft: AddNodeDraft;
    sourceNodeId?: string;
    relationKind?: EdgeKind;
    relationLabel?: string;
    insertMode?: ContextualInsertMode;
  }) {
    const referenceNode = input.sourceNodeId
      ? (nodesRef.current.find((node) => node.id === input.sourceNodeId) ??
        null)
      : null;
    const nextNodeId = crypto.randomUUID();
    const nextNodeIndex = nodesRef.current.length + 1;
    const title =
      input.draft.title.trim() ||
      buildDefaultNodeTitle(
        input.draft.kind,
        nextNodeIndex,
        currentSupportedDiagramType,
        editorT,
        input.draft.diagramRole,
      );
    const basePayload =
      inspectorMode === "operational"
        ? buildAddNodePayloadFromDraft(input.draft)
        : {};
    const payload =
      inspectorMode === "technical" && input.draft.diagramRole
        ? writeDiagramRoleToPayload(basePayload, input.draft.diagramRole)
        : basePayload;

    const nodeApplied = applyLocalCommandAndQueue({
      type: "addNode",
      node: {
        id: nextNodeId,
        kind: input.draft.kind,
        label: title,
        position: resolveNodeInsertPosition({
          referenceNode,
          insertMode: input.insertMode ?? "default",
          nodeKind: input.draft.kind,
          diagramRole: input.draft.diagramRole,
        }),
        data: payload,
      },
    });

    if (!nodeApplied) {
      return null;
    }

    if (input.sourceNodeId && input.relationKind) {
      tryCreateEdgeWithSemanticRules({
        sourceNodeId: input.sourceNodeId,
        targetNodeId: nextNodeId,
        edgeKind: input.relationKind,
        edgeLabel: input.relationLabel,
        explicitKind: false,
        openAssistantOnInvalid: false,
      });
    }

    if (input.insertMode) {
      applyContextualLayoutAdjustmentsIfNeeded({
        insertMode: input.insertMode,
        insertedNodeId: nextNodeId,
        sourceNodeId: input.sourceNodeId,
      });
    }

    selectItem({ nodeId: nextNodeId, edgeId: null });
    return nextNodeId;
  }

  const handleOpenAddDialog = useCallback(() => {
    const defaultKind = selectedNodeId
      ? quickAction.nodeKind
      : personaDefaultNodeKind;
    const defaultRole = diagramMode.quickAdd.resolveDialogDefaultRole({
      kind: defaultKind,
      actionId: quickAction.id,
      hasSelection: Boolean(selectedNodeId),
    });

    setAddNodeErrorMessage(null);
    setAddNodeDraft({
      kind: defaultKind,
      diagramRole: defaultRole,
      title: "",
      description: "",
      tagsText: "",
    });
    setIsAddNodeDialogOpen(true);
  }, [
    diagramMode,
    personaDefaultNodeKind,
    quickAction.id,
    quickAction.nodeKind,
    selectedNodeId,
  ]);

  function handleStartInlineRename(node: RFNode) {
    setInlineRenameNodeId(node.id);
    setInlineRenameDraft(node.data.label);
    setInlineRenameErrorMessage(null);
    selectItem({ nodeId: node.id, edgeId: null });
  }

  function handleCancelInlineRename() {
    setInlineRenameNodeId(null);
    setInlineRenameDraft("");
    setInlineRenameErrorMessage(null);
  }

  function handleConfirmInlineRename() {
    if (!inlineRenameNodeId) {
      return;
    }

    const nextLabel = inlineRenameDraft.trim();
    if (!nextLabel) {
      setInlineRenameErrorMessage(editorT("shell.errors.requiredTitle"));
      return;
    }

    const applied = applyLocalCommandAndQueue({
      type: "updateNode",
      nodeId: inlineRenameNodeId,
      patch: {
        label: nextLabel,
      },
    });
    if (!applied) {
      setInlineRenameErrorMessage(editorT("shell.errors.renameNode"));
      return;
    }

    setQuerySyncMessage(editorT("shell.messages.titleUpdated"));
    handleCancelInlineRename();
  }

  const handleGlobalKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === "Escape" && pendingConnectionAssistant) {
      event.preventDefault();
      setPendingConnectionAssistant(null);
      return;
    }

    if (event.key === "Escape" && pendingErdQuickRelate) {
      event.preventDefault();
      setPendingErdQuickRelate(null);
      return;
    }

    if (event.key === "Escape" && pendingNodeRepair) {
      event.preventDefault();
      setPendingNodeRepair(null);
      return;
    }

    if (event.key === "Escape" && pendingSemanticOverride) {
      event.preventDefault();
      handleCancelSemanticOverride();
      return;
    }

    if (event.key === "Escape" && inlineRenameNodeId) {
      event.preventDefault();
      handleCancelInlineRename();
      return;
    }

    if (
      pendingConnectionAssistant ||
      pendingNodeRepair ||
      pendingSemanticOverride
    ) {
      return;
    }

    if (event.key === "Escape" && isAddNodeDialogOpen) {
      event.preventDefault();
      setIsAddNodeDialogOpen(false);
      setAddNodeErrorMessage(null);
      return;
    }

    const normalizedKey = event.key.toLowerCase();
    const hasCommandModifier = event.ctrlKey || event.metaKey;
    const targetIsEditable = isEditableKeyboardTarget(event.target);

    if (
      hasCommandModifier &&
      !event.altKey &&
      normalizedKey === "c" &&
      !targetIsEditable
    ) {
      event.preventDefault();
      void handleCopySelectionToClipboard().catch(() => {
        setGlobalErrorMessage(editorT("shell.errors.copySelection"));
      });
      return;
    }

    if (
      hasCommandModifier &&
      !event.altKey &&
      normalizedKey === "v" &&
      !targetIsEditable
    ) {
      event.preventDefault();
      void handlePasteFromClipboard().catch(() => {
        setGlobalErrorMessage(editorT("shell.errors.pasteSelection"));
      });
      return;
    }

    if (
      hasCommandModifier &&
      !event.altKey &&
      normalizedKey === "x" &&
      !targetIsEditable
    ) {
      event.preventDefault();
      void handleCutSelectionToClipboard().catch(() => {
        setGlobalErrorMessage(editorT("shell.errors.cutSelection"));
      });
      return;
    }

    if (
      hasCommandModifier &&
      !event.altKey &&
      normalizedKey === "d" &&
      !targetIsEditable
    ) {
      event.preventDefault();
      void handleDuplicateSelection().catch(() => {
        setGlobalErrorMessage(editorT("shell.errors.duplicateSelection"));
      });
      return;
    }

    if (
      (event.key === "Delete" || event.key === "Backspace") &&
      !hasCommandModifier &&
      !event.altKey &&
      !targetIsEditable
    ) {
      event.preventDefault();
      if (selectedNodeId || selectedEdgeId) {
        handleRemoveSelected();
      }
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      quickFindReturnFocusRef.current =
        document.activeElement as HTMLElement | null;
      setQuickFindQuery("");
      setQuickFindActiveIndex(0);
      setIsQuickFindOpen(true);
      return;
    }

    if (event.key === "Escape" && isQuickFindOpen) {
      event.preventDefault();
      setIsQuickFindOpen(false);
      setQuickFindQuery("");
      window.requestAnimationFrame(() => {
        quickFindReturnFocusRef.current?.focus();
      });
      return;
    }

    if (event.key === "Escape" && isCanvasFocusMode) {
      event.preventDefault();
      setIsCanvasFocusMode(false);
      setPanelState(panelStateBeforeFocusRef.current);
      setIsFocusInspectorCollapsed(false);
      return;
    }

    if (event.shiftKey && event.key.toLowerCase() === "f") {
      event.preventDefault();

      if (isCanvasFocusMode) {
        setIsCanvasFocusMode(false);
        setPanelState(panelStateBeforeFocusRef.current);
        setIsFocusInspectorCollapsed(false);
        return;
      }

      panelStateBeforeFocusRef.current = panelState;
      setPanelState({
        metadata: false,
        prismaImport: false,
        versions: false,
      });
      setIsCanvasFocusMode(true);
      setIsFocusInspectorCollapsed(true);
      window.requestAnimationFrame(() => {
        canvasRegionRef.current?.focus();
      });
      return;
    }

    if (
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !event.shiftKey &&
      event.key.toLowerCase() === "a" &&
      !isEditableKeyboardTarget(event.target)
    ) {
      event.preventDefault();
      handleOpenAddDialog();
    }
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      handleGlobalKeyDown(event);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  function handleCloseAddDialog() {
    setIsAddNodeDialogOpen(false);
    setAddNodeErrorMessage(null);
  }

  function handleSubmitAddDialog() {
    const normalizedTitle = addNodeDraft.title.trim();
    if (!normalizedTitle) {
      setAddNodeErrorMessage(editorT("shell.errors.requiredTitle"));
      return;
    }

    const appliedNodeId = insertNodeFromDraft({
      draft: {
        ...addNodeDraft,
        title: normalizedTitle,
      },
      sourceNodeId: selectedNode
        ? resolveSourceNodeIdForContextAction(quickAction)
        : undefined,
      relationKind: selectedNode ? quickAction.edgeKind : undefined,
      relationLabel: selectedNode ? quickAction.edgeLabel : undefined,
      insertMode: selectedNode ? quickAction.insertMode : "default",
    });

    if (!appliedNodeId) {
      setAddNodeErrorMessage(editorT("shell.errors.insertNode"));
      return;
    }

    handleCloseAddDialog();
  }

  function handleAddNode() {
    handleOpenAddDialog();
  }

  function handleAddContextualNode(
    action: SelectionHudQuickAction = quickAction,
  ) {
    if (!selectedNode) {
      handleOpenAddDialog();
      return;
    }

    const nextNodeIndex = nodesRef.current.length + 1;
    const contextualRole = diagramMode.quickAdd.resolveDialogDefaultRole({
      kind: action.nodeKind,
      actionId: action.id,
      hasSelection: true,
    });
    insertNodeFromDraft({
      draft: {
        kind: action.nodeKind,
        diagramRole: contextualRole,
        title: buildDefaultNodeTitle(
          action.nodeKind,
          nextNodeIndex,
          currentSupportedDiagramType,
          editorT,
          contextualRole,
        ),
        description: "",
        tagsText: "",
      },
      sourceNodeId: resolveSourceNodeIdForContextAction(action),
      relationKind: action.edgeKind,
      relationLabel: action.edgeLabel,
      insertMode: action.insertMode,
    });
  }

  function handleOpenSelectedItemInInspector() {
    setIsFocusInspectorCollapsed(false);
  }

  function updateEntityPayloadById(input: {
    entityId: string;
    updater: (payload: ErdEntityPayload) => ErdEntityPayload;
    successMessage?: string;
  }) {
    const entityNode = nodesRef.current.find(
      (node) => node.id === input.entityId,
    );
    if (!entityNode || entityNode.data.kind !== "entity") {
      return false;
    }

    const currentPayload = normalizeErdEntityPayloadFromNode(entityNode);
    const nextPayload = input.updater(currentPayload);
    return applyLocalCommandAndQueue(
      {
        type: "updateNode",
        nodeId: entityNode.id,
        patch: {
          data: nextPayload as unknown as Record<string, unknown>,
        },
      },
      input.successMessage,
    );
  }

  function updateSelectedErdEntityPayload(
    updater: (payload: ErdEntityPayload) => ErdEntityPayload,
    successMessage?: string,
  ) {
    if (!selectedNode || selectedNode.data.kind !== "entity") {
      setGlobalErrorMessage(editorT("shell.errors.selectErdEntityToEdit"));
      return false;
    }

    return updateEntityPayloadById({
      entityId: selectedNode.id,
      updater,
      successMessage,
    });
  }

  function handleAddErdField() {
    if (
      !selectedErdEntityPayload ||
      !selectedNode ||
      selectedNode.data.kind !== "entity"
    ) {
      setGlobalErrorMessage(editorT("shell.errors.selectErdEntityToAddField"));
      return;
    }

    const nextField = createErdField({
      entityId: selectedNode.id,
      index: selectedErdEntityPayload.fields.length + 1,
    });
    const applied = updateSelectedErdEntityPayload((payload) => ({
      ...payload,
      fields: [...payload.fields, nextField],
    }));

    if (!applied) {
      return;
    }

    setErdFieldDrafts((current) => ({
      ...current,
      [nextField.id]: {
        name: nextField.name,
        type: nextField.type,
      },
    }));
    setErdPendingFieldFocusId(nextField.id);
    setQuerySyncMessage(
      editorT("shell.messages.fieldAdded", {
        fieldName: nextField.name,
        entityName: selectedNode.data.label,
      }),
    );
    setGlobalErrorMessage(null);
  }

  function handleUpdateErdFieldDraft(
    fieldId: string,
    patch: Partial<ErdFieldDraftState>,
  ) {
    setErdFieldDrafts((current) => {
      const baseline = current[fieldId] ?? { name: "", type: "" };
      return {
        ...current,
        [fieldId]: {
          ...baseline,
          ...patch,
        },
      };
    });
  }

  function commitErdFieldDraft(fieldId: string) {
    if (!selectedErdEntityPayload) {
      return;
    }

    const draft = erdFieldDrafts[fieldId];
    if (!draft) {
      return;
    }

    updateSelectedErdEntityPayload((payload) => ({
      ...payload,
      fields: payload.fields.map((field) =>
        field.id === fieldId
          ? {
              ...field,
              name: draft.name.trim() || field.name,
              type: draft.type.trim(),
            }
          : field,
      ),
    }));
  }

  function handleRemoveErdField(fieldId: string) {
    updateSelectedErdEntityPayload((payload) => ({
      ...payload,
      fields: payload.fields.filter((field) => field.id !== fieldId),
    }));
    setErdFieldDrafts((current) => {
      const next = { ...current };
      delete next[fieldId];
      return next;
    });
  }

  function handleToggleErdFieldFlag(fieldId: string, flag: ErdFieldFlag) {
    updateSelectedErdEntityPayload((payload) => ({
      ...payload,
      fields: payload.fields.map((field) =>
        field.id === fieldId ? toggleErdFieldFlag({ field, flag }) : field,
      ),
    }));
  }

  function handleMoveErdField(fieldId: string, direction: "up" | "down") {
    updateSelectedErdEntityPayload((payload) => {
      const index = payload.fields.findIndex((field) => field.id === fieldId);
      if (index < 0) {
        return payload;
      }

      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= payload.fields.length) {
        return payload;
      }

      const nextFields = [...payload.fields];
      const [field] = nextFields.splice(index, 1);
      if (!field) {
        return payload;
      }
      nextFields.splice(targetIndex, 0, field);
      return {
        ...payload,
        fields: nextFields,
      };
    });
  }

  function handleErdFieldShortcut(
    event: ReactKeyboardEvent<HTMLInputElement>,
    fieldId: string,
  ) {
    if (event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }

    const key = event.key.toUpperCase();
    if (key === "P") {
      event.preventDefault();
      handleToggleErdFieldFlag(fieldId, "PK");
      return;
    }
    if (key === "F") {
      event.preventDefault();
      handleToggleErdFieldFlag(fieldId, "FK");
      return;
    }
    if (key === "U") {
      event.preventDefault();
      handleToggleErdFieldFlag(fieldId, "UQ");
      return;
    }
    if (key === "N") {
      event.preventDefault();
      handleToggleErdFieldFlag(fieldId, "NOT_NULL");
    }
  }

  function handleToggleTreeSubtreeVisibility() {
    if (!selectedNode || !diagramMode.selection.supportsTreeSubtreeVisibility) {
      return;
    }

    const nodeId = selectedNode.id;
    setCollapsedTreeNodeIds((current) =>
      current.includes(nodeId)
        ? current.filter((item) => item !== nodeId)
        : [...current, nodeId],
    );
  }

  function handleCancelErdQuickRelate() {
    setPendingErdQuickRelate(null);
  }

  function applyErdEditorCommands(commands: ErdEditorCommand[]) {
    let applied = 0;

    for (const command of commands) {
      if (applyLocalCommandAndQueue(command as unknown as EditorCommand)) {
        applied += 1;
      }
    }

    return {
      applied,
      total: commands.length,
    };
  }

  function updateSelectedErdRelationPayload(
    updater: (payload: ErdRelationPayload) => ErdRelationPayload,
    options?: { successMessage?: string },
  ) {
    if (
      !selectedEdge ||
      (selectedEdge.data?.kind ?? "flows-to") !== "references"
    ) {
      return false;
    }

    const currentPayload = normalizeErdRelationPayloadFromEdge(selectedEdge);
    const nextPayload = updater(currentPayload);
    return applyLocalCommandAndQueue(
      {
        type: "updateEdge",
        edgeId: selectedEdge.id,
        patch: {
          data: normalizeErdRelationPayload(
            nextPayload as unknown as Record<string, unknown>,
            {
              sourceEntityId: selectedEdge.source,
              targetEntityId: selectedEdge.target,
            },
          ) as unknown as Record<string, unknown>,
        },
      },
      options?.successMessage,
    );
  }

  function updateSelectedErdRelationName(name: string) {
    if (
      !selectedEdge ||
      (selectedEdge.data?.kind ?? "flows-to") !== "references"
    ) {
      return false;
    }

    const normalizedName = name.trim();
    const currentPayload = normalizeErdRelationPayloadFromEdge(selectedEdge);
    const nextPayload = {
      ...currentPayload,
      ...(normalizedName ? { name: normalizedName } : { name: undefined }),
    };
    return applyLocalCommandAndQueue({
      type: "updateEdge",
      edgeId: selectedEdge.id,
      patch: {
        label: normalizedName || undefined,
        data: normalizeErdRelationPayload(
          nextPayload as unknown as Record<string, unknown>,
          {
            sourceEntityId: selectedEdge.source,
            targetEntityId: selectedEdge.target,
          },
        ) as unknown as Record<string, unknown>,
      },
    });
  }

  function resolveSelectedErdRelationContext() {
    if (
      !selectedEdge ||
      (selectedEdge.data?.kind ?? "flows-to") !== "references" ||
      !selectedErdRelationPayload
    ) {
      return null;
    }

    const sourceNode = nodesRef.current.find(
      (node) => node.id === selectedEdge.source,
    );
    const targetNode = nodesRef.current.find(
      (node) => node.id === selectedEdge.target,
    );
    if (!sourceNode || !targetNode) {
      return null;
    }
    if (
      sourceNode.data.kind !== "entity" ||
      targetNode.data.kind !== "entity"
    ) {
      return null;
    }

    const sourceEntity: ErdEntityPayload =
      normalizeErdEntityPayloadFromNode(sourceNode);
    const targetEntity: ErdEntityPayload =
      normalizeErdEntityPayloadFromNode(targetNode);

    return {
      relation: {
        id: selectedEdge.id,
        sourceEntityId: selectedEdge.source,
        targetEntityId: selectedEdge.target,
        kind: "references" as const,
        payload: selectedErdRelationPayload,
      } satisfies ErdRelationRef,
      sourceEntity: {
        id: sourceNode.id,
        label: sourceNode.data.label,
        kind: "entity" as const,
        payload: sourceEntity,
      },
      targetEntity: {
        id: targetNode.id,
        label: targetNode.data.label,
        kind: "entity" as const,
        payload: targetEntity,
      },
    };
  }

  function handleApplyErdSuggestedFix(commands: ErdEditorCommand[]) {
    const result = applyErdEditorCommands(commands);
    if (result.applied === 0) {
      setGlobalErrorMessage(editorT("shell.errors.applySuggestedFix"));
      return;
    }

    setGlobalErrorMessage(null);
    setQuerySyncMessage(
      editorT("shell.messages.fixApplied", {
        applied: result.applied,
        total: result.total,
      }),
    );
  }

  function handleApplyAllSafeErdFixes() {
    if (!localErdSafeBatchFix || localErdSafeBatchFix.commands.length === 0) {
      setQuerySyncMessage(editorT("shell.messages.noSafeFixes"));
      return;
    }

    const result = applyErdEditorCommands(localErdSafeBatchFix.commands);
    if (result.applied === 0) {
      setGlobalErrorMessage(editorT("shell.errors.applySafeFixes"));
      return;
    }

    setGlobalErrorMessage(null);
    setQuerySyncMessage(
      editorT("shell.messages.safeFixesApplied", {
        applied: result.applied,
        total: result.total,
      }),
    );
  }

  async function handleUpdateErdValidationLevel(
    level: ErdPolicyConfig["validationLevel"],
  ) {
    try {
      const currentPolicy = semanticPolicy;
      const nextCustomRules = mergeErdPolicyIntoCustomRules({
        customRulesJson: readRecord(currentPolicy?.customRulesJson),
        policyPatch: {
          validationLevel: level,
        },
      });
      const updated = await updateSemanticPolicyForEditor({
        projectId: project.id,
        patch: {
          customRulesJson: nextCustomRules,
        },
      });
      setSemanticPolicy(updated);
      setQuerySyncMessage(
        editorT("shell.messages.erdValidationLevelUpdated", { level }),
      );
      setGlobalErrorMessage(null);
    } catch (error) {
      setGlobalErrorMessage(
        formatErrorMessage(error, editorT("shell.errors.updateErdValidation")),
      );
    }
  }

  async function handleExportErdPreview() {
    if (!isErdDiagram) {
      setGlobalErrorMessage(editorT("shell.errors.erdExportOnly"));
      return;
    }

    setIsExportingErdPreview(true);
    setErdExportFeedback(null);

    try {
      const result = await exportErdPreviewForEditor({
        projectId: project.id,
        expectedRevision: currentRevisionRef.current,
        format: "json",
      });

      setLastErdExportPreview(result);
      setErdExportFeedback({
        kind: "success",
        message: editorT("shell.erd.exportPreviewSuccess", {
          entitiesCount: result.export.entities.length,
          relationsCount: result.export.relations.length,
        }),
      });
      setGlobalErrorMessage(null);
    } catch (error) {
      if (
        error instanceof EditorQueryError &&
        error.code === "REPAIR_REQUIRED"
      ) {
        const safeFixCount = Array.isArray(
          (error.payload as { suggestedFixes?: unknown })?.suggestedFixes,
        )
          ? ((error.payload as { suggestedFixes?: unknown[] }).suggestedFixes
              ?.length ?? 0)
          : 0;
        setErdExportFeedback({
          kind: "info",
          message:
            safeFixCount > 0
              ? editorT("shell.erd.exportBlockedStrictWithSafeFixes", {
                  count: safeFixCount,
                })
              : editorT("shell.erd.exportBlockedStrict"),
        });
      } else {
        setErdExportFeedback({
          kind: "error",
          message: formatErrorMessage(
            error,
            editorT("shell.errors.erdExportPreview"),
          ),
        });
      }
    } finally {
      setIsExportingErdPreview(false);
    }
  }

  function handleSwapSelectedErdRelationDirection() {
    if (
      !selectedEdge ||
      (selectedEdge.data?.kind ?? "flows-to") !== "references" ||
      !selectedErdRelationPayload
    ) {
      return;
    }

    const nextPayload = flipErdRelationPayloadDirection(
      selectedErdRelationPayload,
    );
    const commands: ErdEditorCommand[] = [
      {
        type: "removeEdge",
        edgeId: selectedEdge.id,
      },
      {
        type: "addEdge",
        edge: {
          id: selectedEdge.id,
          sourceNodeId: selectedEdge.target,
          targetNodeId: selectedEdge.source,
          kind: "references",
          label: selectedEdge.label ? String(selectedEdge.label) : undefined,
          data: normalizeErdRelationPayload(
            nextPayload as unknown as Record<string, unknown>,
            {
              sourceEntityId: selectedEdge.target,
              targetEntityId: selectedEdge.source,
            },
          ) as unknown as Record<string, unknown>,
        },
      },
    ];
    const result = applyErdEditorCommands(commands);
    if (result.applied > 0) {
      setSelectedEdgeId(selectedEdge.id);
      setSelectedNodeId(null);
      setQuerySyncMessage(editorT("shell.messages.relationDirectionSwapped"));
      setGlobalErrorMessage(null);
    }
  }

  function handleMaterializeSelectedErdRelationAsFk() {
    const context = resolveSelectedErdRelationContext();
    if (!context || !selectedEdge) {
      return;
    }

    const dependentEntity =
      erdMaterializeDependentSide === "source"
        ? context.sourceEntity
        : context.targetEntity;
    const referencesEntity =
      erdMaterializeDependentSide === "source"
        ? context.targetEntity
        : context.sourceEntity;
    const selectedExistingField =
      erdMaterializeExistingFieldId !== "__new__"
        ? dependentEntity.payload.fields.find(
            (field) => field.id === erdMaterializeExistingFieldId,
          )
        : undefined;
    const cardinality = context.relation.payload.cardinality;
    const isRequired =
      erdMaterializeDependentSide === "source"
        ? cardinality?.minSource === 1
        : cardinality?.minTarget === 1;
    const referencedPkFieldIds = referencesEntity.payload.fields
      .filter((field) => field.flags.includes("PK"))
      .map((field) => field.id);
    const shouldApplyUnique =
      erdMaterializeUnique || erdCardinalityToPreset(cardinality) === "1:1";

    if (selectedExistingField) {
      const currentFlags = new Set<ErdFieldFlag>(selectedExistingField.flags);
      currentFlags.add("FK");
      if (isRequired) {
        currentFlags.add("NOT_NULL");
        currentFlags.delete("NULLABLE");
      } else if (!currentFlags.has("NOT_NULL")) {
        currentFlags.add("NULLABLE");
      }
      if (shouldApplyUnique) {
        currentFlags.add("UQ");
      }

      const nextField: ErdField = {
        ...selectedExistingField,
        flags: [...currentFlags],
        references: {
          entityId: referencesEntity.id,
          relationEdgeId: selectedEdge.id,
        },
      };
      const nextDependentPayload = {
        ...dependentEntity.payload,
        fields: dependentEntity.payload.fields.map((field) =>
          field.id === nextField.id ? nextField : field,
        ),
      };
      const nextRelationPayload: ErdRelationPayload = {
        ...context.relation.payload,
        materialization: {
          mode: "fk",
          dependentSide: erdMaterializeDependentSide,
          fk: {
            dependentEntityId: dependentEntity.id,
            fkFieldIds: [nextField.id],
            referencesEntityId: referencesEntity.id,
            referencesFieldIds: referencedPkFieldIds,
            ...(shouldApplyUnique ? { unique: true } : {}),
          },
        },
      };
      const result = applyErdEditorCommands([
        {
          type: "updateNode",
          nodeId: dependentEntity.id,
          patch: {
            data: nextDependentPayload as unknown as Record<string, unknown>,
          },
        },
        {
          type: "updateEdge",
          edgeId: selectedEdge.id,
          patch: {
            data: normalizeErdRelationPayload(
              nextRelationPayload as unknown as Record<string, unknown>,
              {
                sourceEntityId: selectedEdge.source,
                targetEntityId: selectedEdge.target,
              },
            ) as unknown as Record<string, unknown>,
          },
        },
      ]);
      if (result.applied > 0) {
        setQuerySyncMessage(
          editorT("shell.messages.relationMaterializedExistingField"),
        );
      }
      return;
    }

    const fkFix = buildMaterializeFkFix({
      relation: context.relation,
      sourceEntity: context.sourceEntity,
      targetEntity: context.targetEntity,
      policy: erdPolicy,
      preferredDependentSide: erdMaterializeDependentSide,
    });
    handleApplyErdSuggestedFix(fkFix.commands);
  }

  function handleConvertSelectedErdRelationToAssociative() {
    const context = resolveSelectedErdRelationContext();
    if (!context) {
      return;
    }

    const fix = buildConvertToAssociativeFix({
      relation: context.relation,
      sourceEntity: context.sourceEntity,
      targetEntity: context.targetEntity,
      policy: erdPolicy,
    });
    if (!fix) {
      return;
    }

    handleApplyErdSuggestedFix(fix.commands);
  }

  function handleMarkSelectedErdRelationConceptual() {
    updateSelectedErdRelationPayload((payload) => ({
      ...payload,
      materialization: {
        mode: "conceptual",
      },
    }));
  }

  function handleApplySelectedErdOneToOneUniqueFix() {
    const context = resolveSelectedErdRelationContext();
    if (!context) {
      return;
    }

    const fix = buildOneToOneUniqueFix({
      relation: context.relation,
      sourceEntity: context.sourceEntity,
      targetEntity: context.targetEntity,
    });
    if (!fix) {
      return;
    }

    handleApplyErdSuggestedFix(fix.commands);
  }

  function resolveRolesForQuickRelatePreset(
    preset: ErdCardinalityPreset,
  ): NonNullable<ErdRelationPayload["roles"]> {
    if (preset === "1:N") {
      return {
        sourceRole: "hasMany",
        targetRole: "belongsTo",
      };
    }

    if (preset === "N:1") {
      return {
        sourceRole: "belongsTo",
        targetRole: "hasMany",
      };
    }

    if (preset === "1:1") {
      return {
        sourceRole: "hasOne",
        targetRole: "belongsTo",
      };
    }

    return {
      sourceRole: "manyToMany",
      targetRole: "manyToMany",
    };
  }

  function buildBaseQuickRelatePayload(
    preset: ErdCardinalityPreset,
  ): ErdRelationPayload {
    return {
      cardinality: erdCardinalityFromPreset(preset),
      roles: resolveRolesForQuickRelatePreset(preset),
      materialization: {
        mode: "conceptual",
      },
    };
  }

  function handleSelectErdQuickRelatePreset(preset: ErdCardinalityPreset) {
    const pending = pendingErdQuickRelate;
    if (!pending) {
      return;
    }

    const sourceNode = nodesRef.current.find(
      (node) => node.id === pending.sourceNodeId,
    );
    const targetNode = nodesRef.current.find(
      (node) => node.id === pending.targetNodeId,
    );
    setPendingErdQuickRelate(null);

    if (!sourceNode || !targetNode) {
      setGlobalErrorMessage(
        editorT("shell.errors.quickRelationEntityNotFound"),
      );
      return;
    }

    const relationId = crypto.randomUUID();
    const relationPayload = buildBaseQuickRelatePayload(preset);
    const commands: ErdEditorCommand[] = [
      {
        type: "addEdge",
        edge: {
          id: relationId,
          sourceNodeId: sourceNode.id,
          targetNodeId: targetNode.id,
          kind: "references",
          data: normalizeErdRelationPayload(
            relationPayload as unknown as Record<string, unknown>,
            {
              sourceEntityId: sourceNode.id,
              targetEntityId: targetNode.id,
            },
          ) as unknown as Record<string, unknown>,
        },
      },
    ];
    const sourceEntity: ErdRelationRef["sourceEntityId"] = sourceNode.id;
    const targetEntity: ErdRelationRef["targetEntityId"] = targetNode.id;
    const relationRef: ErdRelationRef = {
      id: relationId,
      sourceEntityId: sourceEntity,
      targetEntityId: targetEntity,
      kind: "references",
      payload: relationPayload,
    };
    const sourceEntityRef = {
      id: sourceNode.id,
      label: sourceNode.data.label,
      kind: "entity" as const,
      payload: normalizeErdEntityPayloadFromNode(sourceNode),
    };
    const targetEntityRef = {
      id: targetNode.id,
      label: targetNode.data.label,
      kind: "entity" as const,
      payload: normalizeErdEntityPayloadFromNode(targetNode),
    };

    if (!erdPolicy.allowConceptualRelations) {
      if (preset === "N:N") {
        const associativeFix = buildConvertToAssociativeFix({
          relation: relationRef,
          sourceEntity: sourceEntityRef,
          targetEntity: targetEntityRef,
          policy: erdPolicy,
        });

        if (associativeFix) {
          commands.push(...associativeFix.commands);
        }
      } else {
        const fkFix = buildMaterializeFkFix({
          relation: relationRef,
          sourceEntity: sourceEntityRef,
          targetEntity: targetEntityRef,
          policy: erdPolicy,
        });
        commands.push(...fkFix.commands);
      }
    }

    const result = applyErdEditorCommands(commands);
    if (result.applied === 0) {
      setGlobalErrorMessage(editorT("shell.errors.createQuickRelation"));
      return;
    }

    const latestAddedEdgeId = [...commands]
      .reverse()
      .find((command) => command.type === "addEdge")?.edge.id;
    if (latestAddedEdgeId) {
      setSelectedEdgeId(latestAddedEdgeId);
      setSelectedNodeId(null);
    }

    if (preset === "N:N") {
      setQuerySyncMessage(
        erdPolicy.allowConceptualRelations
          ? editorT("shell.messages.quickRelationCreatedSuggestAssociative")
          : editorT("shell.messages.quickRelationConvertedAssociative"),
      );
    } else if (erdPolicy.allowConceptualRelations) {
      const inferredDependentSide = inferDependentSide({
        relation: relationRef,
        sourceEntity: sourceEntityRef,
        targetEntity: targetEntityRef,
      });
      const dependentLabel =
        inferredDependentSide === "source"
          ? (sourceEntityRef.label ?? sourceEntityRef.id)
          : (targetEntityRef.label ?? targetEntityRef.id);
      const referencedLabel =
        inferredDependentSide === "source"
          ? (targetEntityRef.label ?? targetEntityRef.id)
          : (sourceEntityRef.label ?? sourceEntityRef.id);
      setQuerySyncMessage(
        editorT("shell.messages.quickRelationSuggestMaterialize", {
          dependentLabel,
          referencedLabel,
        }),
      );
    } else {
      setQuerySyncMessage(
        editorT("shell.messages.quickRelationMaterializedAutomatically"),
      );
    }

    setGlobalErrorMessage(null);
  }

  function handleSelectConnectionAssistantKind(kind: EdgeKind) {
    const pending = pendingConnectionAssistant;
    if (!pending) {
      return;
    }

    void (async () => {
      setPendingConnectionAssistant(null);
      const ready = await ensureQueueFlushedBeforeDirectWrite();
      if (!ready) {
        setGlobalErrorMessage(
          editorT("shell.errors.finishPendingSaveBeforeRelation"),
        );
        return;
      }

      await createEdgeOnServer({
        sourceNodeId: pending.sourceNodeId,
        targetNodeId: pending.targetNodeId,
        edgeKind: kind,
        openAssistantOnInvalid: false,
      });
    })();
  }

  function handleCancelPendingNodeRepair() {
    dismissPendingNodeRepair();
    setNodeInspectorMessage(editorT("shell.messages.kindChangeCancelled"));
  }

  function handleApplyPendingNodeRepair(mode: "repair" | "remove") {
    const pending = pendingNodeRepair;
    if (!pending) {
      return;
    }

    const nodeApplied = applyLocalCommandAndQueue(
      {
        ...pending.command,
        meta: {
          ...(pending.command.meta ?? {}),
          repairApplied: true,
        },
      },
      editorT("shell.messages.nodeUpdatedAutosaveQueued"),
    );

    if (!nodeApplied) {
      return;
    }

    const selectedActions =
      mode === "repair"
        ? pending.repairPlan.actions
        : pending.repairPlan.actions.filter(
            (action) =>
              action.type === "removeEdge" || action.type === "updateNodeKind",
          );

    let appliedActions = 0;
    for (const action of selectedActions) {
      if (applySemanticRepairAction(action, true)) {
        appliedActions += 1;
      }
    }

    setPendingNodeRepair(null);
    setNodeInspectorMessage(
      mode === "repair"
        ? editorT("shell.messages.kindAppliedWithRepair", {
            count: appliedActions,
          })
        : editorT("shell.messages.kindAppliedWithRemoval", {
            count: appliedActions,
          }),
    );
  }

  function handleCancelSemanticOverride() {
    dismissSemanticOverride();
  }

  async function handleConfirmSemanticOverride() {
    const pending = pendingSemanticOverride;
    if (!pending) {
      return;
    }

    const reason = semanticOverrideReason.trim();
    if (pending.requireReason && !hasMinimumSemanticOverrideReason(reason)) {
      setGlobalErrorMessage(
        editorT("shell.errors.semanticOverrideReasonRequired", {
          min: MIN_SEMANTIC_OVERRIDE_REASON_LENGTH,
        }),
      );
      return;
    }

    try {
      await pending.onConfirm(reason);
      setPendingSemanticOverride(null);
      setSemanticOverrideReason("");
      setGlobalErrorMessage(null);
    } catch (error) {
      setGlobalErrorMessage(
        formatErrorMessage(
          error,
          editorT("shell.errors.applySemanticOverride"),
        ),
      );
    }
  }

  function handleOrganizeDiagram() {
    const currentSnapshot = getCurrentSnapshot();

    if (currentSnapshot.allowReapplyLayout === false) {
      setGlobalErrorMessage(editorT("shell.errors.layoutBlockedByAssistant"));
      return;
    }

    const movedNodes = applyDiagramReflow({
      diagramType: diagramMode.id,
      rootId: semanticRootNodeId ?? undefined,
    });

    setGlobalErrorMessage(null);
    if (movedNodes === 0) {
      setQuerySyncMessage(editorT("shell.messages.diagramAlreadyOrganized"));
      return;
    }

    markDirtyState(
      editorT("shell.messages.organizeApplied", { count: movedNodes }),
    );
  }

  function handleReapplyLayout() {
    const currentSnapshot = getCurrentSnapshot();

    if (currentSnapshot.allowReapplyLayout === false) {
      setGlobalErrorMessage(editorT("shell.errors.layoutBlockedByAssistant"));
      return;
    }

    if (diagramMode.layout.reapplyStrategy === "local-reflow") {
      const movedNodes = applyDiagramReflow({
        diagramType: diagramMode.id,
        rootId: semanticRootNodeId ?? undefined,
      });

      setGlobalErrorMessage(null);
      if (movedNodes === 0) {
        setQuerySyncMessage(editorT("shell.messages.layoutAlreadyConsistent"));
        return;
      }

      markDirtyState(
        editorT("shell.messages.layoutReapplied", { count: movedNodes }),
      );
      return;
    }

    if (!isSupportedDiagramType(currentSnapshot.diagramType)) {
      setGlobalErrorMessage(
        editorT("shell.errors.reapplyLayoutRequiresSupportedType"),
      );
      return;
    }

    const nextSnapshot = reapplyLayoutForSnapshot(currentSnapshot);
    syncFromSnapshot(nextSnapshot);
    setGlobalErrorMessage(null);
    markDirtyState(editorT("shell.messages.layoutReappliedGeneric"));
  }

  function handleRemoveSelected() {
    if (selectedNodeId) {
      const removed = applyLocalCommandAndQueue({
        type: "removeNode",
        nodeId: selectedNodeId,
      });

      if (removed) {
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
      }
      return;
    }

    if (!selectedEdgeId) {
      return;
    }

    const removed = applyLocalCommandAndQueue({
      type: "removeEdge",
      edgeId: selectedEdgeId,
    });

    if (removed) {
      setSelectedEdgeId(null);
      setSelectedNodeId(null);
    }
  }

  function handleConnect(connection: Connection) {
    if (!connection.source || !connection.target) {
      return;
    }

    if (isErdDiagram) {
      const sourceNode = nodesRef.current.find(
        (node) => node.id === connection.source,
      );
      const targetNode = nodesRef.current.find(
        (node) => node.id === connection.target,
      );
      if (
        sourceNode &&
        targetNode &&
        sourceNode.data.kind === "entity" &&
        targetNode.data.kind === "entity"
      ) {
        const canvasRect = canvasRegionRef.current?.getBoundingClientRect();
        const viewportState = viewportRef.current;
        const topBarOffset = 78;
        const rawLeft =
          targetNode.position.x * viewportState.zoom + viewportState.x + 48;
        const rawTop =
          targetNode.position.y * viewportState.zoom +
          viewportState.y +
          topBarOffset;
        const maxLeft = (canvasRect?.width ?? 920) - 240;
        const maxTop = (canvasRect?.height ?? 620) - 220;
        const left = Math.max(12, Math.min(rawLeft, maxLeft));
        const top = Math.max(topBarOffset, Math.min(rawTop, maxTop));

        setPendingConnectionAssistant(null);
        setPendingErdQuickRelate({
          sourceNodeId: sourceNode.id,
          targetNodeId: targetNode.id,
          sourceLabel: sourceNode.data.label,
          targetLabel: targetNode.data.label,
          style: {
            left: `${left}px`,
            top: `${top}px`,
          },
        });
        return;
      }
    }

    void (async () => {
      setActiveConnectionSourceNodeId(null);
      setPendingConnectionAssistant(null);
      const ready = await ensureQueueFlushedBeforeDirectWrite();
      if (!ready) {
        setGlobalErrorMessage(
          editorT("shell.errors.finishPendingSaveBeforeRelation"),
        );
        return;
      }

      await createEdgeOnServer({
        sourceNodeId: connection.source,
        targetNodeId: connection.target,
        edgeKind: quickAction.edgeKind,
        openAssistantOnInvalid: true,
      });
    })();
  }

  function handleNodeDragStop(node: RFNode) {
    applyLocalCommandAndQueue({
      type: "moveNode",
      nodeId: node.id,
      position: { x: node.position.x, y: node.position.y },
    });
  }

  function handleNodeInspectorReset() {
    if (!selectedNode) return;
    setNodeInspectorDraft(createNodeInspectorDraft(selectedNode));
    setOperationalNodeDraft(
      createOperationalNodeDraft({
        label: selectedNode.data.label,
        kind: selectedNode.data.kind,
        payload: selectedNode.data.payload,
      }),
    );
    setNodeInspectorErrors({});
    setNodeInspectorMessage(null);
  }

  function handleEdgeInspectorReset() {
    if (!selectedEdge) return;
    setEdgeInspectorDraft(createEdgeInspectorDraft(selectedEdge));
    setOperationalEdgeDraft({
      label: selectedEdge.label ? String(selectedEdge.label) : "",
      kind: selectedEdge.data?.kind ?? "flows-to",
    });
    setEdgeInspectorErrors({});
    setEdgeInspectorMessage(null);
  }

  function handleFormatNodeJson() {
    if (!nodeInspectorDraft) {
      return;
    }

    try {
      const parsed = JSON.parse(nodeInspectorDraft.dataJson || "{}") as Record<
        string,
        unknown
      >;
      setNodeInspectorDraft((current) =>
        current
          ? {
              ...current,
              dataJson: formatInspectorJson(parsed),
            }
          : current,
      );
      setNodeInspectorMessage(editorT("shell.messages.jsonFormatted"));
      setNodeInspectorErrors((current) => {
        const next = { ...current };
        delete next.dataJson;
        return next;
      });
    } catch {
      setNodeInspectorMessage(editorT("shell.errors.invalidJsonFormat"));
    }
  }

  function handleFormatEdgeJson() {
    if (!edgeInspectorDraft) {
      return;
    }

    try {
      const parsed = JSON.parse(edgeInspectorDraft.dataJson || "{}") as Record<
        string,
        unknown
      >;
      setEdgeInspectorDraft((current) =>
        current
          ? {
              ...current,
              dataJson: formatInspectorJson(parsed),
            }
          : current,
      );
      setEdgeInspectorMessage(editorT("shell.messages.jsonFormatted"));
      setEdgeInspectorErrors((current) => {
        const next = { ...current };
        delete next.dataJson;
        return next;
      });
    } catch {
      setEdgeInspectorMessage(editorT("shell.errors.invalidJsonFormat"));
    }
  }

  async function handleCopyNodeId() {
    if (!selectedNode) {
      return;
    }

    try {
      await copyTextToClipboard(selectedNode.id);
      setNodeInspectorMessage(editorT("shell.messages.idCopied"));
    } catch {
      setNodeInspectorMessage(editorT("shell.errors.copyNodeId"));
    }
  }

  async function handleCopyEdgeId() {
    if (!selectedEdge) {
      return;
    }

    try {
      await copyTextToClipboard(selectedEdge.id);
      setEdgeInspectorMessage(editorT("shell.messages.idCopied"));
    } catch {
      setEdgeInspectorMessage(editorT("shell.errors.copyEdgeId"));
    }
  }

  async function handleCopyNodeJson() {
    if (!nodeInspectorDraft) {
      return;
    }

    try {
      await copyTextToClipboard(nodeInspectorDraft.dataJson);
      setNodeInspectorMessage(editorT("shell.messages.jsonCopied"));
    } catch {
      setNodeInspectorMessage(editorT("shell.errors.copyJson"));
    }
  }

  async function handleCopyEdgeJson() {
    if (!edgeInspectorDraft) {
      return;
    }

    try {
      await copyTextToClipboard(edgeInspectorDraft.dataJson);
      setEdgeInspectorMessage(editorT("shell.messages.jsonCopied"));
    } catch {
      setEdgeInspectorMessage(editorT("shell.errors.copyJson"));
    }
  }

  async function handleApplyNodeInspector() {
    if (!selectedNode) return;

    setNodeInspectorErrors({});
    setNodeInspectorMessage(null);

    try {
      const command =
        inspectorMode === "operational" && operationalNodeDraft
          ? (() => {
              const processRole =
                currentSupportedDiagramType === "flow"
                  ? resolveProcessNodeRole({
                      diagramRole:
                        operationalNodeDraft.diagramRole ??
                        selectedNode.data.diagramRole,
                      kind: operationalNodeDraft.kind,
                      label: operationalNodeDraft.label,
                    })
                  : undefined;
              const nextShape = processRole
                ? resolveProcessNodeShapeForRole(processRole)
                : {
                    kind: operationalNodeDraft.kind,
                    diagramRole: operationalNodeDraft.diagramRole,
                  };
              const payload = mergeOperationalNodePayload(
                selectedNode.data.payload,
                {
                  description: operationalNodeDraft.description,
                  tagsText: operationalNodeDraft.tagsText,
                  owner: operationalNodeDraft.owner,
                  area: operationalNodeDraft.area,
                  channel: operationalNodeDraft.channel,
                  criticality: operationalNodeDraft.criticality,
                  sla: operationalNodeDraft.sla,
                  rule: operationalNodeDraft.rule,
                  exception: operationalNodeDraft.exception,
                },
              );
              const nextPayload = nextShape.diagramRole
                ? writeDiagramRoleToPayload(payload, nextShape.diagramRole)
                : payload;

              return buildUpdateNodeCommandFromInspectorForm({
                nodeId: selectedNode.id,
                label: operationalNodeDraft.label,
                kind: nextShape.kind,
                dataJson: formatInspectorJson(nextPayload),
              });
            })()
          : nodeInspectorDraft
            ? buildUpdateNodeCommandFromInspectorForm({
                nodeId: selectedNode.id,
                label: nodeInspectorDraft.label,
                kind: nodeInspectorDraft.kind,
                dataJson: nodeInspectorDraft.dataJson,
              })
            : null;

      if (!command) {
        return;
      }

      if (command.type !== "updateNode") {
        return;
      }

      const ready = await ensureQueueFlushedBeforeDirectWrite();
      if (!ready) {
        setNodeInspectorMessage(
          editorT("shell.errors.finishPendingSaveBeforeApply"),
        );
        return;
      }

      try {
        const result = await updateNodeDirect({
          nodeId: command.nodeId,
          patch: command.patch,
          semanticMode: inspectorMode,
        });
        if (!result.ok) {
          setNodeInspectorMessage(
            editorT("shell.errors.finishPendingSaveBeforeApply"),
          );
          return;
        }

        setNodeInspectorMessage(editorT("shell.messages.nodeUpdatedSynced"));
        setGlobalErrorMessage(null);
      } catch (error) {
        if (error instanceof EditorQueryError) {
          if (error.code === "REPAIR_REQUIRED") {
            const repairPlan = error.payload?.repairPlan as
              | RepairPlan
              | undefined;
            const violations = Array.isArray(error.payload?.violations)
              ? (error.payload.violations as SemanticViolation[])
              : [];

            if (repairPlan && Array.isArray(repairPlan.actions)) {
              setPendingNodeRepair({
                command,
                repairPlan,
                violations,
              });
              return;
            }
          }

          if (
            error.code === "SEMANTIC_VIOLATION" &&
            inspectorMode === "technical" &&
            error.payload?.overrideAllowed
          ) {
            openTechnicalOverrideDialog({
              title: editorT("shell.semanticOverride.ariaLabel"),
              message: error.message,
              requireReason: error.payload.requireOverrideReason ?? true,
              onConfirm: async (reason) => {
                const overrideResult = await updateNodeDirect({
                  nodeId: command.nodeId,
                  patch: command.patch,
                  semanticMode: inspectorMode,
                  allowSemanticOverride: true,
                  overrideReason: reason,
                });
                if (!overrideResult.ok) {
                  setNodeInspectorMessage(
                    editorT("shell.errors.finishPendingSaveBeforeApply"),
                  );
                  return;
                }
                setNodeInspectorMessage(
                  editorT("shell.messages.nodeUpdatedWithOverride"),
                );
              },
            });
            return;
          }

          setNodeInspectorErrors({
            kind: error.message,
          });
          setNodeInspectorMessage(
            typeof error.payload?.details === "string"
              ? error.payload.details
              : error.message,
          );
          return;
        }

        throw error;
      }
    } catch (error) {
      const feedback = getFriendlyInspectorFeedback(error, undefined, editorT);
      setNodeInspectorErrors(feedback.fieldErrors);
      setNodeInspectorMessage(feedback.message);
    }
  }

  async function handleApplyEdgeInspector() {
    if (!selectedEdge) return;

    setEdgeInspectorErrors({});
    setEdgeInspectorMessage(null);

    try {
      const command =
        inspectorMode === "operational" && operationalEdgeDraft
          ? buildUpdateEdgeCommandFromInspectorForm({
              edgeId: selectedEdge.id,
              label: operationalEdgeDraft.label,
              kind: operationalEdgeDraft.kind,
              dataJson: formatInspectorJson(selectedEdge.data?.payload ?? {}),
            })
          : edgeInspectorDraft
            ? buildUpdateEdgeCommandFromInspectorForm({
                edgeId: selectedEdge.id,
                label: edgeInspectorDraft.label,
                kind: edgeInspectorDraft.kind,
                dataJson: edgeInspectorDraft.dataJson,
              })
            : null;

      if (!command) {
        return;
      }

      if (command.type !== "updateEdge") {
        return;
      }

      const ready = await ensureQueueFlushedBeforeDirectWrite();
      if (!ready) {
        setEdgeInspectorMessage(
          editorT("shell.errors.finishPendingSaveBeforeApply"),
        );
        return;
      }

      try {
        const result = await updateEdgeDirect({
          edgeId: command.edgeId,
          patch: command.patch,
          semanticMode: inspectorMode,
        });
        if (!result.ok) {
          setEdgeInspectorMessage(
            editorT("shell.errors.finishPendingSaveBeforeApply"),
          );
          return;
        }

        setEdgeInspectorMessage(editorT("shell.messages.edgeUpdatedSynced"));
        setGlobalErrorMessage(null);
      } catch (error) {
        if (error instanceof EditorQueryError) {
          if (
            error.code === "SEMANTIC_VIOLATION" &&
            inspectorMode === "technical" &&
            error.payload?.overrideAllowed
          ) {
            openTechnicalOverrideDialog({
              title: editorT("shell.semanticOverride.ariaLabel"),
              message: error.message,
              requireReason: error.payload.requireOverrideReason ?? true,
              onConfirm: async (reason) => {
                const overrideResult = await updateEdgeDirect({
                  edgeId: command.edgeId,
                  patch: command.patch,
                  semanticMode: inspectorMode,
                  allowSemanticOverride: true,
                  overrideReason: reason,
                });
                if (!overrideResult.ok) {
                  setEdgeInspectorMessage(
                    editorT("shell.errors.finishPendingSaveBeforeApply"),
                  );
                  return;
                }
                setEdgeInspectorMessage(
                  editorT("shell.messages.edgeUpdatedWithOverride"),
                );
              },
            });
            return;
          }

          setEdgeInspectorErrors({
            kind: error.message,
          });
          setEdgeInspectorMessage(
            typeof error.payload?.details === "string"
              ? error.payload.details
              : error.message,
          );
          return;
        }

        throw error;
      }
    } catch (error) {
      const feedback = getFriendlyInspectorFeedback(error, undefined, editorT);
      setEdgeInspectorErrors(feedback.fieldErrors);
      setEdgeInspectorMessage(feedback.message);
    }
  }

  return (
    <div
      className={`editor-grid ${isCanvasFocusMode ? "editor-grid-focus" : ""} ${
        isProcessDiagram ? "editor-grid-process" : ""
      } ${isInspectorVisible ? "" : "editor-grid-inspector-hidden"}`}
    >
      <div
        className={`editor-main-column ${isProcessDiagram ? "editor-main-column-process" : ""}`}
      >
        {shouldShowMetadataPanel ? (
          <EditorMetadataPanel
            editorT={editorT}
            project={project}
            diagramDefinitionLabel={diagramDefinitionLabel}
            rendererLabel={editorT(`shell.rendererLabels.${renderer.key}`)}
            isSupportedDiagramType={isSupportedDiagramType(
              layoutMetadata.diagramType,
            )}
            layoutPolicyLabel={layoutPolicyLabel}
            isReapplyLayoutBlockedByPolicy={isReapplyLayoutBlockedByPolicy}
            isOpen={panelState.metadata}
            onToggle={() => handleTogglePanel("metadata")}
            pendingCount={pendingCommands.length}
            nodeCount={nodes.length}
            edgeCount={edges.length}
            lastSavedAtLabel={lastSavedAtLabel}
            saveMessage={saveState.message}
            isRefreshingFromQuery={isRefreshingFromQuery}
            querySyncMessage={querySyncMessage}
            onRemoveSelected={handleRemoveSelected}
            isRemoveSelectedDisabled={
              saveState.status === "saving" ||
              (!selectedNodeId && !selectedEdgeId)
            }
            onManualSave={() => {
              void handleManualSave();
            }}
            isManualSaveDisabled={
              saveState.status === "saving" || isCreatingVersion
            }
            isSaving={saveState.status === "saving"}
            newVersionName={newVersionName}
            onNewVersionNameChange={setNewVersionName}
            onCreateVersion={() => {
              void handleCreateVersion();
            }}
            isCreateVersionDisabled={
              saveState.status === "saving" || isCreatingVersion
            }
            isCreatingVersion={isCreatingVersion}
            onReapplyLayout={handleReapplyLayout}
            isReapplyLayoutDisabled={
              saveState.status === "saving" || !canReapplyLayout
            }
            hasDiagramRendererMismatch={hasDiagramRendererMismatch}
            versionCreateFeedback={versionCreateFeedback}
          />
        ) : null}

        {shouldShowPrismaPanel ? (
          <EditorPrismaImportPanel
            editorT={editorT}
            isOpen={panelState.prismaImport}
            onToggle={() => handleTogglePanel("prismaImport")}
            onImport={() => {
              void handleImportPrismaSchema();
            }}
            isImportDisabled={
              saveState.status === "saving" || isImportingPrismaSchema
            }
            isImporting={isImportingPrismaSchema}
            canImport={canImportPrismaSchema}
            value={prismaSchemaImportText}
            onValueChange={setPrismaSchemaImportText}
            feedback={prismaSchemaImportFeedback}
          />
        ) : null}

        {shouldShowVersionsPanel ? (
          <EditorVersionsPanel
            editorT={editorT}
            locale={locale}
            isOpen={panelState.versions}
            onToggle={() => handleTogglePanel("versions")}
            onRefresh={() => {
              void handleRefreshVersionList();
            }}
            isRefreshing={isRefreshingVersionList}
            isSaving={saveState.status === "saving"}
            isCreatingVersion={isCreatingVersion}
            activeVersionCompareId={activeVersionCompareId}
            activeVersionRestoreId={activeVersionRestoreId}
            versionActionFeedback={versionActionFeedback}
            versionDiffFeedback={versionDiffFeedback}
            versionDiffSummary={versionDiffSummary}
            snapshotVersions={snapshotVersions}
            versionNameDrafts={versionNameDrafts}
            onVersionNameDraftChange={handleVersionNameDraftChange}
            onSaveVersionName={handleSaveVersionName}
            onCompareVersion={(versionId) => {
              void handleCompareVersion(versionId);
            }}
            onRestoreVersion={(version) => {
              void handleRestoreVersion(version);
            }}
            getVersionDisplayName={getVersionDisplayName}
          />
        ) : null}

        {globalErrorMessage ? (
          <div
            className="error-box editor-global-error"
            data-testid="global-error"
          >
            {globalErrorMessage}
          </div>
        ) : null}

        <div
          ref={canvasRegionRef}
          className={`editor-primary-canvas ${renderer.canvasClassName} ${
            isCanvasFocusMode ? "canvas-frame-focus" : ""
          }`}
          role="region"
          aria-label={editorT("shell.canvasAriaLabel")}
          tabIndex={0}
          data-testid="editor-canvas"
          data-diagram-renderer={
            renderer.canvasDataAttributes["data-diagram-renderer"] ??
            renderer.key
          }
        >
          <EditorShellTopBar
            projectName={project.name}
            isCanvasFocusMode={isCanvasFocusMode}
            ariaLabel={editorT("shell.topBar.canvasBarAriaLabel")}
            saveStatusClassName={saveStatusClassName}
            saveStatusLabel={saveStatusLabel}
            isSaving={saveState.status === "saving"}
            addPrimaryLabel={quickAddCopy.addPrimary}
            quickActionHint={quickAddCopy.quickActionHint}
            quickFindLabel={editorT("shell.topBar.quickFind")}
            fitViewLabel={editorT("shell.topBar.fitView")}
            organizeLabel={editorT("shell.topBar.organize")}
            validationLabel={
              isValidationPanelOpen
                ? editorT("shell.topBar.hideValidation")
                : editorT("shell.topBar.showValidation")
            }
            inspectorToggleLabel={inspectorToggleLabel}
            focusToggleLabel={
              isCanvasFocusMode
                ? editorT("shell.topBar.exitFocus")
                : editorT("shell.topBar.enterFocus")
            }
            onAddNode={handleAddNode}
            onOpenQuickFind={handleOpenQuickFind}
            onFitView={handleFitView}
            onOrganizeDiagram={handleOrganizeDiagram}
            onToggleValidationPanel={handleToggleValidationPanel}
            onToggleInspectorVisibility={handleToggleInspectorVisibility}
            onToggleCanvasFocusMode={handleToggleCanvasFocusMode}
            extraActions={
              <>
                {isErdDiagram ? (
                  <label className="erd-validation-level-control">
                    <span>{editorT("shell.topBar.erdValidationLevel")}</span>
                    <select
                      value={erdPolicy.validationLevel}
                      onChange={(event) => {
                        void handleUpdateErdValidationLevel(
                          event.target
                            .value as ErdPolicyConfig["validationLevel"],
                        );
                      }}
                      data-testid="erd-validation-level-select"
                    >
                      <option value="draft">Draft</option>
                      <option value="guided">Guided</option>
                      <option value="strict">Strict</option>
                    </select>
                  </label>
                ) : null}
                {isErdDiagram ? (
                  <button
                    className="btn"
                    type="button"
                    onClick={() => {
                      void handleExportErdPreview();
                    }}
                    disabled={isExportingErdPreview}
                    data-testid="erd-export-preview-button"
                  >
                    {isExportingErdPreview
                      ? editorT("shell.topBar.exportPreviewGenerating")
                      : editorT("shell.topBar.exportPreview")}
                  </button>
                ) : null}
              </>
            }
          />
          {erdExportFeedback ? (
            <div
              className={`helper erd-export-feedback erd-export-feedback-${erdExportFeedback.kind}`}
              role={erdExportFeedback.kind === "error" ? "alert" : "status"}
              data-testid="erd-export-feedback"
            >
              {erdExportFeedback.message}
            </div>
          ) : null}

          <CanvasToolbar
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onCenterView={handleCenterView}
            isInFocusMode={isCanvasFocusMode}
          />

          {selectedNode || selectedEdge ? (
            <EditorSelectionHudSurface
              variant={isProcessDiagram ? "process" : "default"}
              processHudProps={
                isProcessDiagram
                  ? {
                      dismissKey: flowSelectionDismissKey,
                      selectedItemLabel,
                      kindChipLabel: flowSelectionChipLabel ?? "",
                      kindChipTone: selectedNode
                        ? (selectionNodeKindPresentation?.tone ?? "slate")
                        : null,
                      semanticStatusLabel: selectedSemanticStatusLabel,
                      semanticStatusSeverity: selectedSemanticSeverity,
                      openInspectorLabel: selectedEdge
                        ? editorT("shell.selection.openTransition")
                        : editorT("shell.selection.openInspector"),
                      primaryAction: selectedNode
                        ? {
                            id: quickAction.id,
                            label: quickAction.label,
                            onClick: () => handleAddContextualNode(),
                          }
                        : undefined,
                      secondaryActions: selectedNode
                        ? secondarySelectionActions.map((action) => ({
                            id: action.id,
                            label: action.label,
                            onClick: () => handleAddContextualNode(action),
                          }))
                        : [],
                      onOpenInspector: handleOpenSelectedItemInInspector,
                      onCenterView: handleCenterView,
                      onDuplicate: selectedNode
                        ? handleDuplicateSelection
                        : undefined,
                      onRemove: handleRemoveSelected,
                    }
                  : undefined
              }
              selectedItemLabel={selectedItemLabel}
              kindChipLabel={
                selectedNode
                  ? `${getNodeKindLabelForDiagram(
                      currentSupportedDiagramType,
                      selectedNode.data.kind,
                      "operational",
                      editorT,
                    )}${
                      inspectorMode === "technical"
                        ? editorT("shell.selection.technicalKind", {
                            kind: selectedNode.data.kind,
                          })
                        : ""
                    }`
                  : selectedEdge
                    ? `${getEdgeKindLabelForDiagram(
                        currentSupportedDiagramType,
                        selectedEdge.data?.kind ?? "flows-to",
                        "operational",
                        editorT,
                      )}${
                        inspectorMode === "technical"
                          ? editorT("shell.selection.technicalKind", {
                              kind: selectedEdge.data?.kind ?? "flows-to",
                            })
                          : ""
                      }`
                    : null
              }
              kindChipTone={
                selectedNode
                  ? (selectionNodeKindPresentation?.tone ?? "slate")
                  : null
              }
              semanticStatusLabel={selectedSemanticStatusLabel}
              semanticStatusSeverity={selectedSemanticSeverity}
              editLabel={editorT("shell.selection.edit")}
              centerLabel={editorT("shell.selection.center")}
              duplicateAction={
                selectedNode
                  ? {
                      id: "duplicate",
                      label: editorT("selectionHud.duplicate"),
                      onClick: () => {
                        void handleDuplicateSelection();
                      },
                      testId: "selection-hud-duplicate-button",
                    }
                  : undefined
              }
              primaryAction={
                selectedNode
                  ? {
                      id: quickAction.id,
                      label: quickAction.label,
                      onClick: () => handleAddContextualNode(),
                      testId: "selection-hud-contextual-add-button",
                    }
                  : undefined
              }
              secondaryActions={
                selectedNode
                  ? secondarySelectionActions.map((action) => ({
                      id: action.id,
                      label: action.label,
                      onClick: () => handleAddContextualNode(action),
                      testId: `selection-hud-contextual-secondary-${action.id}`,
                    }))
                  : []
              }
              extraActions={
                <>
                  {selectedNode &&
                  hasErdAddFieldAction &&
                  selectedNode.data.kind === "entity" ? (
                    <button
                      className="btn"
                      type="button"
                      onClick={handleAddErdField}
                      data-testid="selection-hud-erd-add-field-button"
                    >
                      {editorT("shell.selection.addField")}
                    </button>
                  ) : null}
                  {selectedNode &&
                  diagramMode.selection.supportsTreeSubtreeVisibility ? (
                    <button
                      className="btn"
                      type="button"
                      onClick={handleToggleTreeSubtreeVisibility}
                      data-testid="selection-hud-toggle-subtree-button"
                    >
                      {isSelectedTreeSubtreeCollapsed
                        ? editorT("shell.selection.expandSubtree")
                        : editorT("shell.selection.collapseSubtree")}
                    </button>
                  ) : null}
                </>
              }
              removeLabel={editorT("selectionHud.remove")}
              onOpenInspector={handleOpenSelectedItemInInspector}
              onCenterView={handleCenterView}
              onRemove={handleRemoveSelected}
            />
          ) : null}

          <ReactFlow<RFNode, RFEdge>
            fitView
            fitViewOptions={
              isProcessDiagram
                ? {
                    padding: 0.04,
                    minZoom: 0.78,
                  }
                : { padding: 0.18 }
            }
            nodes={renderedNodes}
            edges={renderedEdges}
            onInit={(instance) => {
              reactFlowInstanceRef.current = instance;
              if (isProcessDiagram) {
                window.setTimeout(() => {
                  normalizeProcessViewportPresence(instance);
                }, 120);
              }
            }}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={handleConnect}
            onConnectStart={(_, params: OnConnectStartParams) => {
              if (params.handleType === "source" && params.nodeId) {
                setActiveConnectionSourceNodeId(params.nodeId);
                return;
              }

              setActiveConnectionSourceNodeId(null);
            }}
            onConnectEnd={() => {
              setActiveConnectionSourceNodeId(null);
            }}
            onMoveEnd={(_, nextViewport) => setViewport(nextViewport)}
            onNodeDragStop={(_, node) => handleNodeDragStop(node)}
            onNodeClick={(_, node) => {
              selectItem({ nodeId: node.id, edgeId: null });
            }}
            onNodeDoubleClick={(_, node) => {
              handleStartInlineRename(node);
            }}
            onEdgeClick={(_, edge) => {
              selectItem({ nodeId: null, edgeId: edge.id });
            }}
            onPaneClick={() => {
              selectItem({ nodeId: null, edgeId: null });
              setActiveConnectionSourceNodeId(null);
              setPendingErdQuickRelate(null);
              handleCancelInlineRename();
            }}
            colorMode="light"
            defaultViewport={initialFlowState.viewport}
            deleteKeyCode={null}
            nodeTypes={renderer.nodeTypes}
            edgeTypes={renderer.edgeTypes}
            defaultEdgeOptions={renderer.defaultEdgeOptions}
            connectionLineType={renderer.connectionLineType}
            className={`editor-react-flow editor-react-flow-${renderer.key}`}
          >
            <Background
              gap={renderer.backgroundConfig.gap}
              variant={renderer.backgroundConfig.variant}
              color="var(--canvas-grid-color)"
              className={`editor-canvas-background ${renderer.backgroundConfig.className}`}
            />
            <MiniMap pannable zoomable className={renderer.minimapClassName} />
          </ReactFlow>

          {pendingErdQuickRelate ? (
            <div
              className="erd-quick-relate-popover"
              style={pendingErdQuickRelate.style}
              data-testid="erd-quick-relate-popover"
            >
              <div className="erd-quick-relate-popover-header">
                <strong>{editorT("shell.quickRelate.title")}</strong>
                <span className="helper">
                  {pendingErdQuickRelate.sourceLabel} -{" "}
                  {pendingErdQuickRelate.targetLabel}
                </span>
              </div>
              <div className="row-actions">
                {(["1:1", "1:N", "N:1", "N:N"] as ErdCardinalityPreset[]).map(
                  (preset) => (
                    <button
                      key={preset}
                      type="button"
                      className="btn"
                      onClick={() => handleSelectErdQuickRelatePreset(preset)}
                      data-testid={`erd-quick-relate-preset-${preset.replace(":", "-")}`}
                    >
                      {preset}
                    </button>
                  ),
                )}
              </div>
              <div className="row-actions">
                <button
                  className="btn btn-link"
                  type="button"
                  onClick={handleCancelErdQuickRelate}
                  data-testid="erd-quick-relate-cancel"
                >
                  {editorT("shell.common.cancel")}
                </button>
              </div>
            </div>
          ) : null}

          {inlineRenameNode && inlineRenamePopoverStyle ? (
            <form
              className="inline-rename-popover"
              style={inlineRenamePopoverStyle}
              onSubmit={(event) => {
                event.preventDefault();
                handleConfirmInlineRename();
              }}
              data-testid="inline-rename-popover"
            >
              <label htmlFor="inline-rename-input">
                {editorT("shell.inlineRename.label")}
              </label>
              <input
                id="inline-rename-input"
                value={inlineRenameDraft}
                onChange={(event) => {
                  setInlineRenameDraft(event.target.value);
                  setInlineRenameErrorMessage(null);
                }}
                autoFocus
                data-testid="inline-rename-input"
              />
              {inlineRenameErrorMessage ? (
                <span className="helper field-error" role="alert">
                  {inlineRenameErrorMessage}
                </span>
              ) : null}
              <div className="row-actions inline-rename-actions">
                <button
                  className="btn"
                  type="button"
                  onClick={handleCancelInlineRename}
                  data-testid="inline-rename-cancel"
                >
                  {editorT("shell.common.cancel")}
                </button>
                <button
                  className="btn btn-primary"
                  type="submit"
                  data-testid="inline-rename-confirm"
                >
                  {editorT("shell.common.save")}
                </button>
              </div>
            </form>
          ) : null}
        </div>

        {isAddNodeDialogOpen ? (
          <div
            className="add-node-dialog-backdrop"
            role="presentation"
            onClick={handleCloseAddDialog}
          >
            <form
              className="add-node-dialog"
              role="dialog"
              aria-modal="true"
              aria-label={quickAddCopy.dialogTitle}
              data-testid="add-node-dialog"
              data-quick-add="true"
              onClick={(event) => event.stopPropagation()}
              onSubmit={(event) => {
                event.preventDefault();
                handleSubmitAddDialog();
              }}
            >
              <header className="add-node-dialog-header">
                <h3>{quickAddCopy.dialogTitle}</h3>
                <p className="helper">{quickAddCopy.dialogHint}</p>
                {selectedNode && quickAddDefaultRelationLabel ? (
                  <p
                    className="helper"
                    data-testid="quick-add-default-connection"
                  >
                    {isProcessDiagram
                      ? editorT("shell.quickAdd.defaultProcessConnection", {
                          nodeLabel: selectedNode.data.label,
                          relationLabel:
                            quickAddDefaultRelationLabel.toLowerCase(),
                        })
                      : editorT("shell.quickAdd.defaultConnection", {
                          nodeLabel: selectedNode.data.label,
                          relationLabel: quickAddDefaultRelationLabel,
                        })}
                  </p>
                ) : null}
              </header>

              <div className="add-node-kind-grid">
                {quickAddKindOptions.map((option) => {
                  const presentation = getNodeKindPresentation(option.kind);
                  const isSelected = addNodeDraft.kind === option.kind;

                  return (
                    <button
                      key={option.kind}
                      type="button"
                      className={`add-node-kind-card ${isSelected ? "is-selected" : ""}`}
                      onClick={() =>
                        setAddNodeDraft((current) => ({
                          ...current,
                          kind: option.kind,
                          diagramRole:
                            diagramMode.quickAdd.resolveDefaultRoleForKind(
                              option.kind,
                            ),
                        }))
                      }
                      data-testid={`add-node-kind-${option.kind}`}
                    >
                      <span
                        className={`badge add-node-kind-chip tone-${presentation.tone}`}
                      >
                        <svg
                          viewBox={presentation.icon.viewBox}
                          aria-hidden="true"
                          focusable="false"
                        >
                          <path
                            d={presentation.icon.path}
                            fill="currentColor"
                          />
                        </svg>
                        {diagramMode.presentation.getNodeKindLabel(
                          option.kind,
                          "operational",
                        )}
                      </span>
                      <span className="helper">
                        {getNodeKindDescriptionForDiagram(
                          currentSupportedDiagramType,
                          option.kind,
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>

              {quickAddRoleOptions.length > 0 ? (
                <div className="field">
                  <label>
                    {isProcessDiagram
                      ? editorT("shell.addNode.roleLabelFlow")
                      : editorT("shell.addNode.roleLabelDefault")}
                  </label>
                  <div className="add-node-kind-grid">
                    {quickAddRoleOptions.map((roleOption) => {
                      const isSelected =
                        addNodeDraft.diagramRole === roleOption.role;

                      return (
                        <button
                          key={roleOption.role}
                          type="button"
                          className={`add-node-kind-card ${isSelected ? "is-selected" : ""}`}
                          onClick={() =>
                            setAddNodeDraft((current) => ({
                              ...current,
                              kind: roleOption.baseKind,
                              diagramRole: roleOption.role,
                            }))
                          }
                          data-testid={`quick-add-role-${roleOption.role}`}
                        >
                          <span className="badge">{roleOption.label}</span>
                          <span className="helper">
                            {roleOption.description}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div className="field">
                <label htmlFor="add-node-title-input">
                  {isGraphDiagram
                    ? editorT("shell.addNode.titleLabelGraph")
                    : isProcessDiagram
                      ? editorT("shell.addNode.titleLabelFlow")
                      : editorT("shell.addNode.titleLabelDefault")}
                </label>
                <input
                  id="add-node-title-input"
                  value={addNodeDraft.title}
                  onChange={(event) =>
                    setAddNodeDraft((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  placeholder={editorT("shell.addNode.titlePlaceholder", {
                    title: buildDefaultNodeTitle(
                      addNodeDraft.kind,
                      nodes.length + 1,
                      currentSupportedDiagramType,
                      editorT,
                      addNodeDraft.diagramRole,
                    ),
                  })}
                  required
                  autoFocus
                  data-testid="add-node-title-input"
                />
              </div>

              {inspectorMode === "operational" ? (
                <>
                  <div className="field">
                    <label htmlFor="add-node-description-input">
                      {isProcessDiagram
                        ? editorT("shell.addNode.descriptionLabelFlow")
                        : editorT("shell.addNode.descriptionLabelDefault")}
                    </label>
                    <textarea
                      id="add-node-description-input"
                      rows={3}
                      value={addNodeDraft.description}
                      onChange={(event) =>
                        setAddNodeDraft((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                      data-testid="add-node-description-input"
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="add-node-tags-input">
                      {isProcessDiagram
                        ? editorT("shell.addNode.tagsLabelFlow")
                        : editorT("shell.addNode.tagsLabelDefault")}
                    </label>
                    <input
                      id="add-node-tags-input"
                      value={addNodeDraft.tagsText}
                      onChange={(event) =>
                        setAddNodeDraft((current) => ({
                          ...current,
                          tagsText: event.target.value,
                        }))
                      }
                      placeholder={editorT("shell.addNode.tagsPlaceholder")}
                      data-testid="add-node-tags-input"
                    />
                  </div>
                </>
              ) : null}

              {addNodeErrorMessage ? (
                <div
                  className="error-box"
                  role="alert"
                  data-testid="add-node-error"
                >
                  {addNodeErrorMessage}
                </div>
              ) : null}

              <div className="row-actions add-node-dialog-actions">
                <button
                  className="btn"
                  type="button"
                  onClick={handleCloseAddDialog}
                  data-testid="add-node-cancel-button"
                >
                  {editorT("shell.common.cancel")}
                </button>
                <button
                  className="btn btn-primary"
                  type="submit"
                  data-testid="add-node-confirm-button"
                >
                  {quickAddCopy.addConfirm}
                </button>
              </div>
            </form>
          </div>
        ) : null}

        <ConnectionAssistant
          open={pendingConnectionAssistant !== null}
          mode={inspectorMode}
          diagramType={currentSupportedDiagramType}
          message={
            pendingConnectionAssistant?.message ??
            editorT("shell.connection.invalidRules")
          }
          details={pendingConnectionAssistant?.details}
          sourceLabel={pendingConnectionAssistant?.sourceLabel}
          targetLabel={pendingConnectionAssistant?.targetLabel}
          allowedEdgeKinds={pendingConnectionAssistant?.allowedEdgeKinds ?? []}
          recommendedEdgeKind={pendingConnectionAssistant?.recommendedEdgeKind}
          onCancel={handleCancelConnectionAssistant}
          onSelectKind={handleSelectConnectionAssistantKind}
        />

        <RepairDialog
          open={pendingNodeRepair !== null}
          summary={
            pendingNodeRepair?.repairPlan.summary ??
            editorT("shell.repair.summaryFallback")
          }
          bullets={
            pendingNodeRepair
              ? [
                  ...pendingNodeRepair.violations.map(
                    (violation) =>
                      `${violation.severity.toUpperCase()}: ${violation.message}`,
                  ),
                  ...pendingNodeRepair.repairPlan.actions.map((action) => {
                    if (action.type === "updateEdgeKind") {
                      return editorT("shell.repair.updateRelation", {
                        edgeId: action.edgeId,
                        nextKind: getEdgeKindLabel(
                          action.nextKind,
                          "operational",
                          editorT,
                        ),
                      });
                    }
                    if (action.type === "removeEdge") {
                      return editorT("shell.repair.removeInvalidRelation", {
                        edgeId: action.edgeId,
                      });
                    }
                    return editorT("shell.repair.adjustNodeKind", {
                      nextKind: getNodeKindLabel(
                        action.nextKind,
                        "operational",
                        editorT,
                      ),
                    });
                  }),
                ].slice(0, 8)
              : []
          }
          onApplyAndRepair={() => handleApplyPendingNodeRepair("repair")}
          onApplyAndRemoveInvalid={() => handleApplyPendingNodeRepair("remove")}
          onCancel={handleCancelPendingNodeRepair}
        />

        {pendingSemanticOverride ? (
          <div
            className="semantic-dialog-backdrop"
            role="presentation"
            onClick={handleCancelSemanticOverride}
          >
            <div
              className="semantic-dialog semantic-override-dialog"
              role="dialog"
              aria-modal="true"
              aria-label={editorT("shell.semanticOverride.ariaLabel")}
              data-testid="semantic-override-dialog"
              onClick={(event) => event.stopPropagation()}
            >
              <header className="semantic-dialog-header">
                <h3>{pendingSemanticOverride.title}</h3>
                <p className="helper">{pendingSemanticOverride.message}</p>
                <p className="helper">
                  {editorT("shell.semanticOverride.complianceHint")}
                </p>
              </header>

              <div className="field">
                <label htmlFor="semantic-override-reason-input">
                  {editorT("shell.semanticOverride.reasonLabel")}
                  {pendingSemanticOverride.requireReason
                    ? editorT("shell.semanticOverride.reasonRequiredSuffix", {
                        min: MIN_SEMANTIC_OVERRIDE_REASON_LENGTH,
                      })
                    : editorT("shell.semanticOverride.reasonOptionalSuffix")}
                </label>
                <textarea
                  id="semantic-override-reason-input"
                  rows={3}
                  value={semanticOverrideReason}
                  onChange={(event) =>
                    setSemanticOverrideReason(event.target.value)
                  }
                  placeholder={editorT("shell.semanticOverride.placeholder")}
                  data-testid="semantic-override-reason-input"
                />
              </div>

              <div className="row-actions semantic-dialog-actions">
                <button
                  className="btn"
                  type="button"
                  onClick={handleCancelSemanticOverride}
                  data-testid="semantic-override-cancel"
                >
                  {editorT("shell.common.cancel")}
                </button>
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => {
                    void handleConfirmSemanticOverride();
                  }}
                  data-testid="semantic-override-confirm"
                >
                  {editorT("shell.semanticOverride.apply")}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <CommandPalette
          isOpen={isQuickFindOpen}
          query={quickFindQuery}
          options={quickFindOptions}
          activeIndex={quickFindActiveIndex}
          mode={inspectorMode}
          onQueryChange={(value) => {
            setQuickFindQuery(value);
            setQuickFindActiveIndex(0);
          }}
          onMoveActiveIndex={handleMoveQuickFindActiveIndex}
          onSelectByIndex={handleSelectQuickFindByIndex}
          onClose={handleCloseQuickFind}
        />
      </div>

      {isInspectorVisible ? (
        <EditorInspectorFrame
          ariaLabel={editorT("shell.inspector.ariaLabel")}
          isProcessDiagram={isProcessDiagram}
          selectionBadge={inspectorSelectionBadge}
          draftBadgeLabel={editorT("shell.inspector.draftBadge")}
          hasDirtyDraft={hasInspectorDirtyDraft}
          selectedItemLabel={selectedItemLabel}
          inspectorSubtitle={inspectorSubtitle}
          mode={inspectorMode}
          modeAriaLabel={editorT("shell.inspector.modeAria")}
          operationalLabel={editorT("shell.inspector.modeOperational")}
          technicalLabel={editorT("shell.inspector.modeTechnical")}
          onModeChange={setInspectorMode}
          semanticAudit={
            <EditorSemanticAuditPanel
              ariaLabel={editorT("shell.audit.ariaLabel")}
              title={editorT("shell.audit.title")}
              summaryLabel={editorT("shell.audit.summary", {
                total: displayedSemanticAudit.counters.total,
                errors: displayedSemanticAudit.bySeverity.error,
              })}
              applyAllSafeFixesLabel={
                isErdDiagram && localErdSafeBatchFix?.safeFixes.length
                  ? editorT("shell.audit.applyAllSafeFixes")
                  : undefined
              }
              onApplyAllSafeFixes={
                isErdDiagram && localErdSafeBatchFix?.safeFixes.length
                  ? handleApplyAllSafeErdFixes
                  : undefined
              }
              isOpen={isValidationPanelOpen}
              safeFixPreviewItems={
                isErdDiagram && localErdSafeBatchFix?.safeFixes.length
                  ? localErdSafeBatchFix.safeFixes
                      .slice(0, 6)
                      .map((fix) =>
                        fix.description
                          ? `${fix.label}: ${fix.description}`
                          : fix.label,
                      )
                  : []
              }
              issues={displayedSemanticAudit.issues}
              emptyLabel={editorT("shell.audit.empty")}
              collapsedHint={editorT("shell.audit.collapsedHint")}
              renderSeverityLabel={(severity) =>
                getSemanticSeverityLabel(severity, editorT)
              }
              renderIssueActions={(issue, index) => {
                const issueFixes = readIssueSuggestedFixes(issue);

                return (
                  <>
                    <button
                      className="btn btn-link"
                      type="button"
                      onClick={() => handleFocusSemanticIssue(issue)}
                      data-testid={`semantic-issue-goto-${index}`}
                    >
                      {editorT("shell.audit.goToIssue")}
                    </button>
                    {issueFixes.map((fix) => (
                      <button
                        key={fix.id}
                        className="btn"
                        type="button"
                        onClick={() => handleApplyErdSuggestedFix(fix.commands)}
                        data-testid={`semantic-issue-fix-${index}-${fix.id}`}
                      >
                        {fix.label}
                      </button>
                    ))}
                  </>
                );
              }}
            />
          }
        >
          {selectedNode || selectedEdge ? (
            <DiagramInspectorAdapter
              editorT={editorT}
              diagramType={currentSupportedDiagramType}
              inspectorCopy={inspectorCopy}
              inspectorMode={inspectorMode}
              inspectorSections={inspectorSections}
              inspectorSelectionBadge={inspectorSelectionBadge}
              inspectorSelectionState={inspectorSelectionState}
              selectedNode={selectedNode}
              selectedEdge={selectedEdge}
              selectedEdgeSourceLabel={selectedEdgeSourceLabel}
              selectedEdgeTargetLabel={selectedEdgeTargetLabel}
              saveStatus={saveState.status}
              nodeKindOptions={nodeKindOptions}
              edgeKindOptions={edgeKindOptions}
              nodeInspectorDraft={nodeInspectorDraft}
              setNodeInspectorDraft={setNodeInspectorDraft}
              edgeInspectorDraft={edgeInspectorDraft}
              setEdgeInspectorDraft={setEdgeInspectorDraft}
              operationalNodeDraft={operationalNodeDraft}
              setOperationalNodeDraft={setOperationalNodeDraft}
              operationalEdgeDraft={operationalEdgeDraft}
              setOperationalEdgeDraft={setOperationalEdgeDraft}
              nodeInspectorDirty={nodeInspectorDirty}
              edgeInspectorDirty={edgeInspectorDirty}
              nodeInspectorErrors={nodeInspectorErrors}
              edgeInspectorErrors={edgeInspectorErrors}
              nodeInspectorMessage={nodeInspectorMessage}
              edgeInspectorMessage={edgeInspectorMessage}
              nodeInspectorHasErrors={nodeInspectorHasErrors}
              edgeInspectorHasErrors={edgeInspectorHasErrors}
              graphSelectedNodeSemantic={graphSelectedNodeSemantic}
              graphSelectedEdgeSemantic={graphSelectedEdgeSemantic}
              graphSelectedNodeKindLabel={graphSelectedNodeKindLabel}
              graphSelectedNodeKindDescription={
                graphSelectedNodeKindDescription
              }
              selectedNodeRelations={selectedNodeRelations}
              selectedNodeRoleLabel={selectedNodeRoleLabel}
              selectedNodeStructureTips={selectedNodeStructureTips}
              operationalTagPreview={operationalTagPreview}
              quickAction={quickAction}
              secondarySelectionActions={secondarySelectionActions}
              processSelectedNodeRelations={processSelectedNodeRelations}
              processNodeInspectorModel={processNodeInspectorModel}
              processEdgeInspectorModel={processEdgeInspectorModel}
              selectedErdEntityPayload={selectedErdEntityPayload}
              selectedErdRelationPayload={selectedErdRelationPayload}
              selectedErdSourceEntityNode={selectedErdSourceEntityNode}
              selectedErdTargetEntityNode={selectedErdTargetEntityNode}
              erdFieldDrafts={erdFieldDrafts}
              erdMaterializeDependentSide={erdMaterializeDependentSide}
              setErdMaterializeDependentSide={setErdMaterializeDependentSide}
              erdMaterializeExistingFieldId={erdMaterializeExistingFieldId}
              setErdMaterializeExistingFieldId={
                setErdMaterializeExistingFieldId
              }
              erdMaterializeUnique={erdMaterializeUnique}
              setErdMaterializeUnique={setErdMaterializeUnique}
              selectedErdRelationIssues={selectedErdRelationIssues}
              erdPolicy={erdPolicy}
              onToggleInspectorSection={handleToggleInspectorSection}
              onHandleAddContextualNode={handleAddContextualNode}
              onOpenRelatedNodeFromRelation={handleOpenRelatedNodeFromRelation}
              onOpenTransitionFromRelation={handleOpenTransitionFromRelation}
              onRemoveRelation={handleRemoveRelation}
              onApplyNodeInspector={handleApplyNodeInspector}
              onResetNodeInspector={handleNodeInspectorReset}
              onFormatNodeJson={handleFormatNodeJson}
              onCopyNodeId={handleCopyNodeId}
              onCopyNodeJson={handleCopyNodeJson}
              onApplyEdgeInspector={handleApplyEdgeInspector}
              onResetEdgeInspector={handleEdgeInspectorReset}
              onFormatEdgeJson={handleFormatEdgeJson}
              onCopyEdgeId={handleCopyEdgeId}
              onCopyEdgeJson={handleCopyEdgeJson}
              onRemoveSelected={handleRemoveSelected}
              onUpdateSelectedErdEntityPayload={updateSelectedErdEntityPayload}
              onAddErdField={handleAddErdField}
              onUpdateErdFieldDraft={handleUpdateErdFieldDraft}
              onCommitErdFieldDraft={commitErdFieldDraft}
              onRemoveErdField={handleRemoveErdField}
              onToggleErdFieldFlag={handleToggleErdFieldFlag}
              onMoveErdField={handleMoveErdField}
              onErdFieldShortcut={handleErdFieldShortcut}
              onUpdateSelectedErdRelationPayload={
                updateSelectedErdRelationPayload
              }
              onUpdateSelectedErdRelationName={updateSelectedErdRelationName}
              onApplyErdSuggestedFix={handleApplyErdSuggestedFix}
              onFocusSemanticIssue={handleFocusSemanticIssue}
              onSwapSelectedErdRelationDirection={
                handleSwapSelectedErdRelationDirection
              }
              onMaterializeSelectedErdRelationAsFk={
                handleMaterializeSelectedErdRelationAsFk
              }
              onApplySelectedErdOneToOneUniqueFix={
                handleApplySelectedErdOneToOneUniqueFix
              }
              onConvertSelectedErdRelationToAssociative={
                handleConvertSelectedErdRelationToAssociative
              }
              onMarkSelectedErdRelationConceptual={
                handleMarkSelectedErdRelationConceptual
              }
            />
          ) : (
            <EditorInspectorEmptyState
              editorT={editorT}
              inspectorCopy={inspectorCopy}
              nodesCount={nodes.length}
              edgesCount={edges.length}
              viewport={viewport}
            />
          )}
        </EditorInspectorFrame>
      ) : null}
    </div>
  );
}
