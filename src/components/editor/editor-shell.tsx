"use client";

import Link from "next/link";
import { useLocale } from "next-intl";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  Background,
  MarkerType,
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
  listGraphQuickAddRoleOptions,
  mapGraphRoleToNodeKind,
  resolveGraphDefaultRoleForKind,
  resolveGraphEdgeSemantic,
  resolveGraphNodeSemantic,
  resolveDiagramRole,
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
  computeParallelEdgeMeta,
  resolveDiagramRenderer,
  type DiagramRendererKey,
} from "./diagram-renderers";
import { resolveFlowEdgeMarker } from "./diagram-renderers/flow-presentation";
import { FlowSelectionHud } from "./flow-interactions/flow-selection-hud";
import {
  computeFlowContextualNudgePositions,
  computeInsertPosition,
  computeReflow,
  type DiagramLayoutType,
} from "./diagram-renderers/layout/diagram-layout";
import {
  applyEditorCommandLocally,
  applyEditorCommandsLocally,
  applyEditorCommandRemotely,
  EditorRemoteError,
} from "./editor-command-service";
import {
  createDebouncedTask,
  createEditorSaveRequestTracker,
} from "./editor-autosave-helpers";
import {
  createInitialEditorAutosaveState,
  markEditorDirty,
  markEditorSaveError,
  markEditorSaveSuccess,
  markEditorSaving,
  type EditorAutosaveState,
} from "./editor-autosave-state";
import {
  getFriendlyInspectorFeedback,
  type InspectorFieldErrors,
} from "./editor-inspector-feedback";
import {
  buildUpdateEdgeCommandFromInspectorForm,
  buildUpdateNodeCommandFromInspectorForm,
  formatInspectorJson,
  type EdgeInspectorDraft,
  type NodeInspectorDraft,
} from "./editor-inspector-schemas";
import {
  createOperationalNodeDraft,
  getFriendlyEdgeKindDescription,
  getFriendlyEdgeKindLabel,
  getFriendlyNodeKindDescription,
  getFriendlyNodeKindLabel,
  mergeOperationalNodePayload,
  normalizeTagsInput,
  type InspectorMode,
  type OperationalNodeDraft,
} from "./editor-inspector-personas";
import { resolveInspectorSelectionState } from "./inspector-selection-state";
import { CanvasToolbar } from "./canvas-toolbar";
import { CommandPalette } from "./command-palette";
import { filterNodeQuickFindOptions } from "./editor-quick-find";
import {
  getContextualAddActionForDiagram,
  getContextualActionsForDiagram,
  type DiagramContextualAction,
  type ContextualDiagramType,
  getDefaultNodeKindForDiagram,
  getEdgeKindDescriptionForDiagram,
  getEdgeKindLabel,
  getEdgeKindLabelForDiagram,
  getEdgeKindPresentation,
  getNodeKindDescription,
  getNodeKindDescriptionForDiagram,
  getNodeKindLabel,
  getNodeKindLabelForDiagram,
  getNodeKindPresentation,
  getOperationalDisplayLabel,
} from "./presentation/kinds";
import {
  buildProcessRelationsViewModel,
  getProcessInspectorCopy,
  getProcessQuickAddRoleOptions,
  getProcessRoleMeta,
  resolveProcessNodeRole,
} from "./presentation/process-semantics";
import {
  ProcessOperationalEdgeInspector,
} from "./process-inspector/process-operational-edge-inspector";
import {
  ProcessOperationalNodeInspector,
} from "./process-inspector/process-operational-node-inspector";
import {
  resolveProcessEdgeInspectorViewModel,
  resolveProcessNodeInspectorViewModel,
} from "./process-inspector/process-inspector-view-model";
import {
  getAllowedKindsForDiagram,
} from "./presentation/diagram-scoped-options";
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
  formatErdCardinalityLabel,
  inferDependentSide,
  mergeErdPolicyIntoCustomRules,
  normalizeErdEntityPayload,
  normalizeErdGraphFromSemantic,
  normalizeErdPolicyFromCustomRules,
  normalizeErdRelationPayload,
  suggestAssociativeEntityName,
  validateErdGraphFull,
  type ErdCardinality,
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
  createEdgeForEditor,
  createSnapshotVersionForEditor,
  exportErdPreviewForEditor,
  EditorQueryError,
  importPrismaSchemaForEditor,
  listSnapshotVersionsForEditor,
  loadSemanticPolicyForEditor,
  loadSnapshotVersionDetailForEditor,
  loadSnapshotVersionDiffForEditor,
  loadWorkingSnapshotForEditor,
  runSemanticAuditForEditor,
  validateSemanticDraftForEditor,
  restoreSnapshotVersionForEditor,
  saveWorkingSnapshotForEditor,
  updateEdgeForEditor,
  updateNodeForEditor,
  updateSemanticPolicyForEditor,
  type ErdExportPreviewPayload,
  type SemanticAuditPayload,
  type SemanticPolicyPayload,
  type EditorPrismaSchemaImportSummary,
  type EditorSnapshotVersionDiff,
  type EditorSnapshotVersionSummary,
} from "./editor-query-service";
import { usePendingChangesGuard } from "./use-pending-changes-guard";
import {
  buildVersionDiffSummary,
  type VersionDiffSummaryResult,
} from "./versions/diff-summary";
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
  type SemanticIssue,
  type SemanticViolation,
} from "./semantics/semantics";

const AUTOSAVE_DELAY_MS = 1000;
const DEFAULT_SNAPSHOT_LABEL = "fase1-working-v1";
const VERSION_NAMES_STORAGE_KEY_PREFIX = "mapia.editor.version-names";
const EDITOR_PANELS_STORAGE_KEY_PREFIX = "mapia-editor-panels";
const EDITOR_FOCUS_STORAGE_KEY_PREFIX = "mapia-editor-focus";
const INSPECTOR_MODE_STORAGE_KEY = "mapia-inspector-mode";
const INSPECTOR_SECTIONS_STORAGE_KEY_PREFIX = "mapia-inspector-sections";
const MAPIA_CLIPBOARD_MIME = "application/x-mapia-fragment+json";

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

type PendingEditorCommand = {
  localVersion: number;
  command: EditorCommand;
};

type VersionCreateFeedback =
  | { kind: "success" | "error"; message: string }
  | null;
type VersionActionFeedback =
  | { kind: "success" | "error"; message: string }
  | null;
type VersionDiffFeedback =
  | { kind: "info" | "error"; message: string }
  | null;
type PrismaSchemaImportFeedback =
  | { kind: "success" | "error"; message: string }
  | null;
type ErdExportFeedback =
  | { kind: "success" | "error" | "info"; message: string }
  | null;

type OperationalEdgeDraft = {
  label: string;
  kind: EdgeInspectorDraft["kind"];
};

type AddNodeDraft = {
  kind: NodeKind;
  diagramRole?: DiagramRole;
  title: string;
  description: string;
  tagsText: string;
};

type SelectionHudQuickAction = {
  id: DiagramContextualAction["id"];
  label: string;
  edgeKind: EdgeKind;
  nodeKind: NodeKind;
  edgeLabel?: string;
};

type InspectorRelationPreview = {
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

type InspectorNodeRelationsView = {
  incomingCount: number;
  outgoingCount: number;
  summaryChips: Array<{
    id: "before" | "after" | "branch" | "note";
    label: string;
    count: number;
  }>;
  preview: InspectorRelationPreview[];
};

type QuickAddRoleOption = {
  role: DiagramRole;
  label: string;
  description: string;
  baseKind: NodeKind;
};

type ContextualInsertMode =
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

type ClipboardAddNodeCommand = Extract<EditorCommand, { type: "addNode" }>;
type ClipboardAddEdgeCommand = Extract<EditorCommand, { type: "addEdge" }>;

type ClipboardCommandsDraft = {
  nodeCommands: ClipboardAddNodeCommand[];
  edgeCommands: ClipboardAddEdgeCommand[];
  skippedEdges: number;
  firstInsertedNodeId?: string;
};

type PendingConnectionAssistantState = {
  sourceNodeId: string;
  targetNodeId: string;
  sourceLabel: string;
  targetLabel: string;
  attemptedEdgeKind: EdgeKind;
  allowedEdgeKinds: EdgeKind[];
  recommendedEdgeKind?: EdgeKind;
  message: string;
  details?: string;
};

type PendingErdQuickRelateState = {
  sourceNodeId: string;
  targetNodeId: string;
  sourceLabel: string;
  targetLabel: string;
  style: {
    left: string;
    top: string;
  };
};

type PendingNodeRepairState = {
  command: Extract<EditorCommand, { type: "updateNode" }>;
  repairPlan: RepairPlan;
  violations: SemanticViolation[];
};

type PendingSemanticOverrideState = {
  title: string;
  message: string;
  requireReason: boolean;
  onConfirm: (reason: string) => Promise<void>;
};

type SemanticIssueLike = {
  id: string;
  code: string;
  severity: "error" | "warning" | "info" | "suggestion";
  message: string;
  explanation?: string;
  details?: string;
  suggestedFixes?: unknown;
  targetType: "graph" | "node" | "edge";
  targetId?: string;
};

type MapiaClipboardFragment = {
  version: 1;
  sourceProjectId: string;
  nodes: Array<{
    id: string;
    kind: NodeKind;
    label: string;
    position: { x: number; y: number };
    data: Record<string, unknown>;
  }>;
  edges: Array<{
    id: string;
    sourceNodeId: string;
    targetNodeId: string;
    kind: EdgeKind;
    label?: string;
    data: Record<string, unknown>;
  }>;
};

type ErdFieldDraftState = {
  name: string;
  type: string;
};

type EditorPanelState = {
  metadata: boolean;
  prismaImport: boolean;
  versions: boolean;
};

type InspectorSectionState = {
  general: boolean;
  details: boolean;
  relations: boolean;
  advanced: boolean;
};

const DEFAULT_EDITOR_PANEL_STATE: EditorPanelState = {
  metadata: true,
  prismaImport: true,
  versions: true,
};

const DEFAULT_INSPECTOR_SECTION_STATE: InspectorSectionState = {
  general: true,
  details: true,
  relations: true,
  advanced: false,
};

const DEFAULT_ADD_NODE_OFFSET = {
  x: 220,
  y: 64,
};

function formatErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

function formatVersionCreatedAtLabel(createdAt: string, locale: string) {
  const parsed = new Date(createdAt);

  if (Number.isNaN(parsed.getTime())) {
    return createdAt;
  }

  return parsed.toLocaleString(locale);
}

function formatVersionOriginLabel(
  origin: EditorSnapshotVersionSummary["origin"],
  t?: EditorTranslationFn,
) {
  if (origin === "manual") {
    return t ? t("shell.versions.origin.manual") : "Manual";
  }

  return origin;
}

function buildVersionDiffFeedbackMessage(
  diff: EditorSnapshotVersionDiff,
  t?: EditorTranslationFn,
) {
  if (!diff.hasChanges) {
    return t
      ? t("shell.versions.diff.noChanges")
      : "Sem alteracoes entre a versao selecionada e o snapshot de trabalho.";
  }

  const parts: string[] = [];

  if (diff.nodesAdded.length > 0) {
    parts.push(
      t
        ? t("shell.versions.diff.nodesAdded", { count: diff.nodesAdded.length })
        : `${diff.nodesAdded.length} no(s) adicionados`,
    );
  }
  if (diff.nodesRemoved.length > 0) {
    parts.push(
      t
        ? t("shell.versions.diff.nodesRemoved", { count: diff.nodesRemoved.length })
        : `${diff.nodesRemoved.length} no(s) removidos`,
    );
  }
  if (diff.nodesChanged.length > 0) {
    parts.push(
      t
        ? t("shell.versions.diff.nodesChanged", { count: diff.nodesChanged.length })
        : `${diff.nodesChanged.length} no(s) alterados`,
    );
  }
  if (diff.edgesAdded.length > 0) {
    parts.push(
      t
        ? t("shell.versions.diff.edgesAdded", { count: diff.edgesAdded.length })
        : `${diff.edgesAdded.length} aresta(s) adicionadas`,
    );
  }
  if (diff.edgesRemoved.length > 0) {
    parts.push(
      t
        ? t("shell.versions.diff.edgesRemoved", { count: diff.edgesRemoved.length })
        : `${diff.edgesRemoved.length} aresta(s) removidas`,
    );
  }
  if (diff.edgesChanged.length > 0) {
    parts.push(
      t
        ? t("shell.versions.diff.edgesChanged", { count: diff.edgesChanged.length })
        : `${diff.edgesChanged.length} aresta(s) alteradas`,
    );
  }
  if (diff.viewportChanged) {
    parts.push(t ? t("shell.versions.diff.viewportChanged") : "viewport alterado");
  }

  return t
    ? t("shell.versions.diff.summary", { parts: parts.join("; ") })
    : `Resumo: ${parts.join("; ")}.`;
}

function buildPrismaSchemaImportFeedbackMessage(
  summary: EditorPrismaSchemaImportSummary | undefined,
  t?: EditorTranslationFn,
) {
  if (!summary) {
    return t
      ? t("shell.prisma.feedbackSuccess")
      : "Schema Prisma importado com sucesso para o snapshot de trabalho.";
  }

  return t
    ? t("shell.prisma.feedbackSuccessWithCounts", {
        modelsCount: summary.modelsCount,
        relationsCount: summary.relationsCount,
        scalarFieldsCount: summary.scalarFieldsCount,
      })
    : `Schema Prisma importado com sucesso (${summary.modelsCount} modelo(s), ${summary.relationsCount} relacao(oes), ${summary.scalarFieldsCount} campo(s) escalar(es)).`;
}

function resolveDiagramTypeForQuickActions(
  rendererKey: DiagramRendererKey,
): ContextualDiagramType {
  if (rendererKey === "tree") {
    return "tree";
  }

  if (rendererKey === "flow") {
    return "flow";
  }

  if (rendererKey === "sitemap") {
    return "sitemap";
  }

  if (rendererKey === "mindmap") {
    return "mindmap";
  }

  if (rendererKey === "graph") {
    return "graph";
  }

  if (rendererKey === "timeline") {
    return "timeline";
  }

  return undefined;
}

function resolveSemanticDiagramType(
  diagramType: string | undefined,
  rendererKey: DiagramRendererKey,
) {
  if (
    diagramType === "tree" ||
    diagramType === "flow" ||
    diagramType === "mindmap" ||
    diagramType === "erd" ||
    diagramType === "sitemap" ||
    diagramType === "graph" ||
    diagramType === "timeline"
  ) {
    return diagramType;
  }

  if (rendererKey === "erd") {
    return "erd";
  }

  if (rendererKey === "sitemap") {
    return "sitemap";
  }

  if (rendererKey === "graph") {
    return "graph";
  }

  if (rendererKey === "timeline") {
    return "timeline";
  }

  return undefined;
}

function isDiagramLayoutType(diagramType: DiagramLayoutType) {
  return (
    diagramType === "tree" ||
    diagramType === "flow" ||
    diagramType === "mindmap" ||
    diagramType === "erd" ||
    diagramType === "sitemap" ||
    diagramType === "graph" ||
    diagramType === "timeline"
  );
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
) {
  const nodeKindLabel = diagramType
    ? getNodeKindLabelForDiagram(diagramType, kind, "operational", t)
    : getNodeKindLabel(kind, "operational", t);
  return `${nodeKindLabel} ${nextIndex}`;
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

  if (role === "graph-core" || role === "graph-topic") {
    return mapGraphRoleToNodeKind(role, fallbackKind);
  }

  if (role === "graph-supporting") {
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

function toRoleAwareSemanticNodeRef(input: {
  diagramType: ContextualDiagramType;
  node: RFNode;
  rootNodeName?: string;
}) {
  const role = resolveDiagramRole({
    diagramType: input.diagramType,
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
  } as const;
}

function resolveQuickAddRoleOptions(
  diagramType: ContextualDiagramType,
  t?: EditorTranslationFn,
): QuickAddRoleOption[] {
  if (diagramType === "flow") {
    return getProcessQuickAddRoleOptions(t);
  }

  if (diagramType === "tree") {
    return [
      {
        role: "hierarchy-root",
        label: t ? t("shell.quickAdd.roles.hierarchyRoot.label") : "No raiz",
        description: t
          ? t("shell.quickAdd.roles.hierarchyRoot.description")
          : "Ponto principal da hierarquia.",
        baseKind: "page",
      },
      {
        role: "hierarchy-node",
        label: t ? t("shell.quickAdd.roles.hierarchyNode.label") : "No hierarquico",
        description: t
          ? t("shell.quickAdd.roles.hierarchyNode.description")
          : "Nivel da estrutura em arvore.",
        baseKind: "page",
      },
    ];
  }

  if (diagramType === "sitemap") {
    return [
      {
        role: "sitemap-home",
        label: t ? t("shell.quickAdd.roles.sitemapHome.label") : "Home",
        description: t
          ? t("shell.quickAdd.roles.sitemapHome.description")
          : "Pagina inicial de navegacao.",
        baseKind: "page",
      },
      {
        role: "sitemap-section",
        label: t ? t("shell.quickAdd.roles.sitemapSection.label") : "Secao",
        description: t
          ? t("shell.quickAdd.roles.sitemapSection.description")
          : "Secao navegavel do sitemap.",
        baseKind: "page",
      },
    ];
  }

  if (diagramType === "graph") {
    return listGraphQuickAddRoleOptions(t);
  }

  if (diagramType === "timeline") {
    return [
      {
        role: "timeline-milestone",
        label: t ? t("shell.quickAdd.roles.timelineMilestone.label") : "Marco",
        description: t
          ? t("shell.quickAdd.roles.timelineMilestone.description")
          : "Evento em uma sequencia temporal.",
        baseKind: "note",
      },
    ];
  }

  return [];
}

function resolveDefaultRoleForKind(input: {
  diagramType: ContextualDiagramType;
  kind: NodeKind;
}) {
  if (input.diagramType === "flow") {
    if (input.kind === "note") {
      return "flow-note" as const;
    }

    if (input.kind === "flow-step") {
      return "flow-step" as const;
    }

    return undefined;
  }

  if (input.diagramType === "tree") {
    return "hierarchy-node" as const;
  }

  if (input.diagramType === "sitemap") {
    return "sitemap-section" as const;
  }

  if (input.diagramType === "graph") {
    return resolveGraphDefaultRoleForKind(input.kind);
  }

  if (input.diagramType === "timeline") {
    return "timeline-milestone" as const;
  }

  return undefined;
}

function buildContextualActionsFromDiagramType(
  diagramType: ContextualDiagramType,
  t?: EditorTranslationFn,
): SelectionHudQuickAction[] {
  return getContextualActionsForDiagram(diagramType, t)
    .filter((action): action is DiagramContextualAction & {
      type: "add-connected-node";
      nodeKind: NodeKind;
      edgeKind: EdgeKind;
    } => action.type === "add-connected-node" && Boolean(action.nodeKind && action.edgeKind))
    .map((action) => ({
      id: action.id,
      label: action.label,
      nodeKind: action.nodeKind,
      edgeKind: action.edgeKind,
      ...(action.edgeLabel ? { edgeLabel: action.edgeLabel } : {}),
    }));
}

function buildQuickActionFromDiagramType(
  diagramType: ContextualDiagramType,
  t?: EditorTranslationFn,
): SelectionHudQuickAction {
  const action = getContextualAddActionForDiagram(diagramType, t);
  return {
    id: getContextualActionsForDiagram(diagramType, t)[0]?.id ?? "mindmap-add-branch",
    label: action.label,
    nodeKind: action.nodeKind,
    edgeKind: action.edgeKind,
    ...(action.edgeLabel ? { edgeLabel: action.edgeLabel } : {}),
  };
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function isClipboardPartialEdgePasteEnabled(
  policy: SemanticPolicyPayload | null | undefined,
) {
  const customRules = readRecord(policy?.customRulesJson);
  const clipboardRules = readRecord(customRules?.clipboard);

  return (
    readBoolean(clipboardRules?.allowPasteWithoutInvalidEdges) === true ||
    readBoolean(clipboardRules?.allowPartialEdgePaste) === true
  );
}

function resolveErdCardinalityFromPayload(
  payload: Record<string, unknown> | undefined,
): ErdCardinalityPreset | undefined {
  if (!payload) {
    return undefined;
  }

  const normalized = normalizeErdRelationPayload(payload, {
    sourceEntityId: "",
    targetEntityId: "",
  });

  return erdCardinalityToPreset(normalized.cardinality);
}

function resolveErdEdgeLabel(input: {
  baseLabel: string | undefined;
  edgeKind: EdgeKind;
  payload: Record<string, unknown> | undefined;
  rendererKey: DiagramRendererKey;
}) {
  if (input.rendererKey !== "erd" || input.edgeKind !== "references") {
    return input.baseLabel;
  }

  const normalized = normalizeErdRelationPayload(input.payload, {
    sourceEntityId: "",
    targetEntityId: "",
  });
  const cardinalityPreset = erdCardinalityToPreset(normalized.cardinality);
  const cardinalityLabel = cardinalityPreset ?? formatErdCardinalityLabel(normalized.cardinality);
  if (!normalized.cardinality) {
    return input.baseLabel;
  }

  const normalizedBaseLabel = input.baseLabel?.trim();
  if (normalizedBaseLabel) {
    return `${normalizedBaseLabel} (${cardinalityLabel})`;
  }

  return cardinalityLabel;
}

function resolveErdEdgeClassSuffix(
  payload: Record<string, unknown> | undefined,
) {
  const preset = resolveErdCardinalityFromPayload(payload);
  if (!preset) {
    return undefined;
  }

  return preset.replace(":", "-").toLowerCase();
}

function getDiagramRoleLabel(role: DiagramRole | undefined, t?: EditorTranslationFn) {
  if (!role) {
    return t ? t("shell.roles.undefined") : "Sem papel definido";
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
    return resolveGraphNodeSemantic({
      diagramRole: role,
      kind: role === "graph-supporting" ? "page" : "entity",
    }, t).roleBadgeLabel;
  }

  const map: Partial<Record<DiagramRole, string>> = {
    "meta-workspace": translateEditor(t, "shell.roles.metaWorkspace", "Workspace"),
    "meta-project": translateEditor(t, "shell.roles.metaProject", "Projeto"),
    "tree-root": translateEditor(t, "shell.roles.treeRoot", "Raiz"),
    "tree-node": translateEditor(t, "shell.roles.treeNode", "No de hierarquia"),
    "hierarchy-root": translateEditor(t, "shell.roles.hierarchyRoot", "No raiz"),
    "hierarchy-node": translateEditor(t, "shell.roles.hierarchyNode", "No hierarquico"),
    "sitemap-home": translateEditor(t, "shell.roles.sitemapHome", "Pagina Home"),
    "sitemap-section": translateEditor(t, "shell.roles.sitemapSection", "Secao navegavel"),
    "mindmap-root": translateEditor(t, "shell.roles.mindmapRoot", "Tema central"),
    "mindmap-branch": translateEditor(t, "shell.roles.mindmapBranch", "Ramificacao"),
    "mindmap-reference": translateEditor(t, "shell.roles.mindmapReference", "Referencia"),
    "graph-core": translateEditor(t, "shell.roles.graphCore", "Nucleo da rede"),
    "graph-topic": translateEditor(t, "shell.roles.graphTopic", "Componente conectado"),
    "graph-supporting": translateEditor(
      t,
      "shell.roles.graphSupporting",
      "Apoio arquitetural",
    ),
    "timeline-milestone": translateEditor(
      t,
      "shell.roles.timelineMilestone",
      "Marco temporal",
    ),
    "erd-entity": translateEditor(t, "shell.roles.erdEntity", "Entidade"),
    "erd-comment": translateEditor(t, "shell.roles.erdComment", "Comentario ERD"),
  };

  return map[role] ?? (t ? t("shell.roles.undefined") : "Sem papel definido");
}

function buildNodeStructureTips(input: {
  diagramType: ContextualDiagramType;
  diagramRole: DiagramRole | undefined;
  nodeKind?: NodeKind;
  nodeLabel?: string;
  incomingCount: number;
  outgoingCount: number;
}, t?: EditorTranslationFn) {
  const tips: string[] = [];

  if (input.diagramType === "graph") {
    return resolveGraphNodeSemantic({
      diagramRole: input.diagramRole,
      kind: input.diagramRole === "graph-supporting" ? "page" : "entity",
      incomingCount: input.incomingCount,
      outgoingCount: input.outgoingCount,
    }, t).structureTips;
  } else if (input.diagramType === "flow") {
    const role = resolveProcessNodeRole({
      diagramRole: input.diagramRole,
      kind: input.nodeKind ?? (input.diagramRole === "flow-note" ? "note" : "flow-step"),
      label: input.nodeLabel,
    });
    const roleMeta = getProcessRoleMeta(role, t);
    tips.push(roleMeta.summary);
    if (input.incomingCount + input.outgoingCount === 0) {
      tips.push(roleMeta.guidanceWhenSparse);
    } else {
      tips.push(roleMeta.guidanceWhenConnected);
    }
    if (role === "flow-decision") {
      tips.push(
        t
          ? t("process.guidance.decisionNeedsShortLabels")
          : "Destaque saídas com nomes curtos para deixar a bifurcacao didatica.",
      );
    }
  } else if (input.diagramType === "tree" || input.diagramType === "sitemap") {
    tips.push(
      t ? t("shell.structureTips.treeSitemapFocus") : "Foco em pai, filhos, nivel e ordem.",
    );
    tips.push(
      t
        ? t("shell.structureTips.treeSitemapCurrent", {
            incomingCount: input.incomingCount,
            outgoingCount: input.outgoingCount,
          })
        : `Estrutura atual: ${input.incomingCount} vinculo(s) acima e ${input.outgoingCount} abaixo.`,
    );
  } else if (input.diagramType === "erd") {
    tips.push(t ? t("shell.structureTips.erd") : "Foco em campos, chaves e cardinalidade.");
  } else if (input.diagramType === "mindmap") {
    tips.push(
      t ? t("shell.structureTips.mindmap") : "Foco em ramificacoes e temas relacionados.",
    );
  } else if (input.diagramType === "timeline") {
    tips.push(
      t
        ? t("shell.structureTips.timeline")
        : "Foco em marcos, sequencia e dependencias temporais.",
    );
  } else {
    tips.push(
      t ? t("shell.structureTips.default") : "Foco em contexto e conexoes principais.",
    );
  }

  return tips;
}

function resolveEdgeMarker(
  edgeKind: EdgeKind,
  input?: { rendererKey?: DiagramRendererKey },
) {
  const presentation = getEdgeKindPresentation(edgeKind);

  if (input?.rendererKey === "flow") {
    if (presentation.arrowStyle === "none") {
      return undefined;
    }

    return (
      resolveFlowEdgeMarker(edgeKind) ??
      ({
        type:
          presentation.arrowStyle === "open"
            ? MarkerType.Arrow
            : MarkerType.ArrowClosed,
        color: "var(--flow-edge-main)",
      } as const)
    );
  }

  if (input?.rendererKey === "graph") {
      const graphEdgeSemantic = resolveGraphEdgeSemantic(edgeKind);

    if (graphEdgeSemantic.markerStyle === "none") {
      return undefined;
    }

    if (graphEdgeSemantic.markerStyle === "open") {
      return {
        type: MarkerType.Arrow,
        color: "var(--canvas-edge-color)",
      } as const;
    }

    if (graphEdgeSemantic.markerStyle === "closed") {
      return {
        type: MarkerType.ArrowClosed,
        color: "var(--canvas-edge-color)",
      } as const;
    }
  }

  if (presentation.arrowStyle === "none") {
    return undefined;
  }

  if (presentation.arrowStyle === "open") {
    return {
      type: MarkerType.Arrow,
      color: "var(--canvas-edge-color)",
    } as const;
  }

  return {
    type: MarkerType.ArrowClosed,
    color: "var(--canvas-edge-color)",
  } as const;
}

function resolveEdgeDashArray(
  edgeKind: EdgeKind,
  input?: { rendererKey?: DiagramRendererKey; payload?: Record<string, unknown> },
) {
  if (input?.rendererKey === "flow") {
    if (edgeKind === "depends-on") {
      return "12 8";
    }

    if (edgeKind === "references") {
      return "4 10";
    }

    return undefined;
  }

  if (input?.rendererKey === "erd" && edgeKind === "references") {
    const cardinality = resolveErdCardinalityFromPayload(input.payload);
    if (cardinality === "1:1") {
      return undefined;
    }

    if (cardinality === "1:N" || cardinality === "N:1") {
      return "7 4";
    }

    if (cardinality === "N:N") {
      return "2 5";
    }
  }

  if (input?.rendererKey === "graph") {
    const graphEdgeSemantic = resolveGraphEdgeSemantic(edgeKind);
    if (graphEdgeSemantic.strokeStyle === "dashed") {
      return "10 6";
    }

    if (graphEdgeSemantic.strokeStyle === "dotted") {
      return "2 8";
    }

    return undefined;
  }

  const presentation = getEdgeKindPresentation(edgeKind);

  if (presentation.lineStyle === "dashed") {
    return "8 6";
  }

  if (presentation.lineStyle === "dotted") {
    return "2 7";
  }

  return undefined;
}

function resolveEdgeLabelStyle(
  edgeKind: EdgeKind,
  input?: { rendererKey?: DiagramRendererKey },
) {
  if (input?.rendererKey === "flow") {
    if (edgeKind === "depends-on") {
      return {
        fill: "#9a3412",
        fontWeight: 800,
        fontSize: "0.7rem",
        letterSpacing: "0.02em",
      } as const;
    }

    if (edgeKind === "references") {
      return {
        fill: "#5b21b6",
        fontWeight: 700,
        fontSize: "0.68rem",
      } as const;
    }

    return {
      fill: "#14532d",
      fontWeight: 800,
      fontSize: "0.7rem",
      letterSpacing: "0.04em",
      textTransform: "uppercase",
    } as const;
  }

  if (input?.rendererKey !== "graph") {
    return undefined;
  }

  const graphEdgeSemantic = resolveGraphEdgeSemantic(edgeKind);

  if (graphEdgeSemantic.emphasis === "primary") {
    return {
      fill: "#92400e",
      fontWeight: 700,
      textTransform: "uppercase",
    } as const;
  }

  if (graphEdgeSemantic.emphasis === "secondary") {
    return {
      fill: "#1d4ed8",
      fontWeight: 700,
    } as const;
  }

  if (graphEdgeSemantic.emphasis === "supporting") {
    return {
      fill: "#334155",
      fontWeight: 700,
    } as const;
  }

  return {
    fontWeight: 700,
  } as const;
}

function resolveEdgeLabelBgStyle(
  edgeKind: EdgeKind,
  input?: { rendererKey?: DiagramRendererKey },
) {
  if (input?.rendererKey === "flow") {
    if (edgeKind === "depends-on") {
      return {
        fill: "rgba(255, 247, 237, 0.94)",
        stroke: "rgba(194, 65, 12, 0.18)",
      } as const;
    }

    if (edgeKind === "references") {
      return {
        fill: "rgba(248, 245, 255, 0.94)",
        stroke: "rgba(109, 40, 217, 0.14)",
      } as const;
    }

    return {
      fill: "rgba(240, 253, 244, 0.94)",
      stroke: "rgba(21, 128, 61, 0.14)",
    } as const;
  }

  if (input?.rendererKey !== "graph") {
    return undefined;
  }

  const graphEdgeSemantic = resolveGraphEdgeSemantic(edgeKind);

  if (graphEdgeSemantic.emphasis === "primary") {
    return {
      fill: "rgba(254, 243, 199, 0.92)",
      stroke: "rgba(217, 119, 6, 0.28)",
    } as const;
  }

  if (graphEdgeSemantic.emphasis === "secondary") {
    return {
      fill: "rgba(219, 234, 254, 0.92)",
      stroke: "rgba(37, 99, 235, 0.22)",
    } as const;
  }

  if (graphEdgeSemantic.emphasis === "supporting") {
    return {
      fill: "rgba(241, 245, 249, 0.94)",
      stroke: "rgba(71, 85, 105, 0.2)",
    } as const;
  }

  return undefined;
}

function resolveEdgeLabelBgPadding(
  edgeKind: EdgeKind,
  input?: { rendererKey?: DiagramRendererKey },
) {
  if (input?.rendererKey === "flow") {
    if (edgeKind === "references") {
      return [8, 4] as [number, number];
    }

    if (edgeKind === "depends-on") {
      return [10, 5] as [number, number];
    }

    return [9, 4] as [number, number];
  }

  if (input?.rendererKey === "graph") {
    return [10, 5] as [number, number];
  }

  return undefined;
}

function resolveEdgeLabelBgBorderRadius(
  edgeKind: EdgeKind,
  input?: { rendererKey?: DiagramRendererKey },
) {
  if (input?.rendererKey === "flow") {
    if (edgeKind === "references") {
      return 12;
    }

    return 999;
  }

  if (input?.rendererKey === "graph") {
    return 10;
  }

  return undefined;
}

function toErdPolicyConfig(
  policy: SemanticPolicyPayload | null | undefined,
): ErdPolicyConfig {
  return normalizeErdPolicyFromCustomRules(
    readRecord(policy?.customRulesJson),
  );
}

function isErdStrictValidationLevel(
  policy: SemanticPolicyPayload | null | undefined,
) {
  return toErdPolicyConfig(policy).validationLevel === "strict";
}

function isErdDraftValidationLevel(
  policy: SemanticPolicyPayload | null | undefined,
) {
  return toErdPolicyConfig(policy).validationLevel === "draft";
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

function toggleErdFieldFlag(input: { field: ErdField; flag: ErdFieldFlag }): ErdField {
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

function flipErdRelationPayloadDirection(payload: ErdRelationPayload): ErdRelationPayload {
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
  const rawFixes = Array.isArray(issue.suggestedFixes) ? issue.suggestedFixes : [];

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
      (fix): fix is {
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
    return translateEditor(t, "shell.semanticSeverity.error", "Erro");
  }
  if (severity === "warning") {
    return translateEditor(t, "shell.semanticSeverity.warning", "Aviso");
  }
  if (severity === "suggestion") {
    return translateEditor(t, "shell.semanticSeverity.suggestion", "Sugestao");
  }

  return translateEditor(t, "shell.semanticSeverity.info", "Info");
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

  return [...nodes]
    .sort(
      (nodeA, nodeB) =>
        Math.hypot(nodeA.position.x, nodeA.position.y) -
        Math.hypot(nodeB.position.x, nodeB.position.y),
    )
    .at(0)?.id ?? null;
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

function getNodeSelectionSyncKey(node: RFNode | null) {
  if (!node) {
    return null;
  }

  return `${node.id}:${node.data.label}:${node.data.kind}:${JSON.stringify(node.data.payload)}`;
}

function getEdgeSelectionSyncKey(edge: RFEdge | null) {
  if (!edge) {
    return null;
  }

  return `${edge.id}:${edge.label ? String(edge.label) : ""}:${edge.data?.kind ?? "flows-to"}:${JSON.stringify(edge.data?.payload ?? {})}`;
}

function areNodeDraftValuesEqual(node: RFNode | null, draft: NodeInspectorDraft | null) {
  if (!node || !draft) {
    return false;
  }

  return (
    node.data.label === draft.label &&
    node.data.kind === draft.kind &&
    formatInspectorJson(node.data.payload) === draft.dataJson
  );
}

function areEdgeDraftValuesEqual(edge: RFEdge | null, draft: EdgeInspectorDraft | null) {
  if (!edge || !draft) {
    return false;
  }

  return (
    (edge.label ? String(edge.label) : "") === draft.label &&
    (edge.data?.kind ?? "flows-to") === draft.kind &&
    formatInspectorJson(edge.data?.payload ?? {}) === draft.dataJson
  );
}

function sanitizeVersionNameMap(value: unknown) {
  if (!value || typeof value !== "object") {
    return {} as Record<string, string>;
  }

  return Object.entries(value).reduce<Record<string, string>>((acc, entry) => {
    const [versionId, versionName] = entry;
    if (typeof versionName !== "string") {
      return acc;
    }

    const trimmed = versionName.trim();
    if (!trimmed) {
      return acc;
    }

    acc[versionId] = trimmed.slice(0, 120);
    return acc;
  }, {});
}

function sanitizeEditorPanelState(value: unknown): EditorPanelState {
  if (!value || typeof value !== "object") {
    return DEFAULT_EDITOR_PANEL_STATE;
  }

  const candidate = value as Record<string, unknown>;

  return {
    metadata:
      typeof candidate.metadata === "boolean"
        ? candidate.metadata
        : DEFAULT_EDITOR_PANEL_STATE.metadata,
    prismaImport:
      typeof candidate.prismaImport === "boolean"
        ? candidate.prismaImport
        : DEFAULT_EDITOR_PANEL_STATE.prismaImport,
    versions:
      typeof candidate.versions === "boolean"
        ? candidate.versions
        : DEFAULT_EDITOR_PANEL_STATE.versions,
  };
}

function sanitizeInspectorSectionState(value: unknown): InspectorSectionState {
  if (!value || typeof value !== "object") {
    return DEFAULT_INSPECTOR_SECTION_STATE;
  }

  const candidate = value as Record<string, unknown>;

  return {
    general:
      typeof candidate.general === "boolean"
        ? candidate.general
        : DEFAULT_INSPECTOR_SECTION_STATE.general,
    details:
      typeof candidate.details === "boolean"
        ? candidate.details
        : DEFAULT_INSPECTOR_SECTION_STATE.details,
    relations:
      typeof candidate.relations === "boolean"
        ? candidate.relations
        : DEFAULT_INSPECTOR_SECTION_STATE.relations,
    advanced:
      typeof candidate.advanced === "boolean"
        ? candidate.advanced
        : DEFAULT_INSPECTOR_SECTION_STATE.advanced,
  };
}

async function copyTextToClipboard(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
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

function areOperationalNodeDraftValuesEqual(
  node: RFNode | null,
  draft: OperationalNodeDraft | null,
) {
  if (!node || !draft) {
    return false;
  }

  const baseline = createOperationalNodeDraft({
    label: node.data.label,
    kind: node.data.kind,
    payload: node.data.payload,
  });

  const baselineTags = normalizeTagsInput(baseline.tagsText).join("|");
  const draftTags = normalizeTagsInput(draft.tagsText).join("|");

  return (
    baseline.label === draft.label &&
    baseline.kind === draft.kind &&
    baseline.description.trim() === draft.description.trim() &&
    baselineTags === draftTags
  );
}

function areOperationalEdgeDraftValuesEqual(
  edge: RFEdge | null,
  draft: OperationalEdgeDraft | null,
) {
  if (!edge || !draft) {
    return false;
  }

  return (
    (edge.label ? String(edge.label) : "") === draft.label &&
    (edge.data?.kind ?? "flows-to") === draft.kind
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
  const [layoutMetadata, setLayoutMetadata] = useState<EditorSnapshotLayoutMetadata>(
    initialFlowState.layoutMetadata,
  );
  const [hiddenDiagramNodeIds, setHiddenDiagramNodeIds] = useState<string[]>(
    initialFlowState.hiddenNodeIds,
  );
  const [computedMindmapRootNodeId, setComputedMindmapRootNodeId] = useState<
    string | null
  >(initialFlowState.computedRootNodeId ?? null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<EditorAutosaveState>(
    createInitialEditorAutosaveState(editorT),
  );
  const [pendingCommands, setPendingCommands] = useState<PendingEditorCommand[]>(
    [],
  );
  const [querySyncMessage, setQuerySyncMessage] = useState<string | null>(null);
  const [globalErrorMessage, setGlobalErrorMessage] = useState<string | null>(null);
  const [isCreatingVersion, setIsCreatingVersion] = useState(false);
  const [versionCreateFeedback, setVersionCreateFeedback] =
    useState<VersionCreateFeedback>(null);
  const [newVersionName, setNewVersionName] = useState("");
  const [prismaSchemaImportText, setPrismaSchemaImportText] = useState("");
  const [isImportingPrismaSchema, setIsImportingPrismaSchema] = useState(false);
  const [prismaSchemaImportFeedback, setPrismaSchemaImportFeedback] =
    useState<PrismaSchemaImportFeedback>(null);
  const [isExportingErdPreview, setIsExportingErdPreview] = useState(false);
  const [erdExportFeedback, setErdExportFeedback] = useState<ErdExportFeedback>(null);
  const [lastErdExportPreview, setLastErdExportPreview] =
    useState<ErdExportPreviewPayload | null>(null);
  const [snapshotVersions, setSnapshotVersions] = useState<
    EditorSnapshotVersionSummary[]
  >([]);
  const [isRefreshingVersionList, setIsRefreshingVersionList] = useState(false);
  const [versionActionFeedback, setVersionActionFeedback] =
    useState<VersionActionFeedback>(null);
  const [versionDiffFeedback, setVersionDiffFeedback] =
    useState<VersionDiffFeedback>(null);
  const [versionDiffSummary, setVersionDiffSummary] =
    useState<VersionDiffSummaryResult | null>(null);
  const [activeVersionCompareId, setActiveVersionCompareId] = useState<
    string | null
  >(null);
  const [activeVersionRestoreId, setActiveVersionRestoreId] = useState<
    string | null
  >(null);
  const [localVersionNames, setLocalVersionNames] = useState<
    Record<string, string>
  >({});
  const [versionNameDrafts, setVersionNameDrafts] = useState<
    Record<string, string>
  >({});
  const [nodeInspectorDraft, setNodeInspectorDraft] =
    useState<NodeInspectorDraft | null>(null);
  const [edgeInspectorDraft, setEdgeInspectorDraft] =
    useState<EdgeInspectorDraft | null>(null);
  const [operationalNodeDraft, setOperationalNodeDraft] =
    useState<OperationalNodeDraft | null>(null);
  const [operationalEdgeDraft, setOperationalEdgeDraft] =
    useState<OperationalEdgeDraft | null>(null);
  const [nodeInspectorErrors, setNodeInspectorErrors] =
    useState<InspectorFieldErrors>({});
  const [edgeInspectorErrors, setEdgeInspectorErrors] =
    useState<InspectorFieldErrors>({});
  const [nodeInspectorMessage, setNodeInspectorMessage] = useState<string | null>(
    null,
  );
  const [edgeInspectorMessage, setEdgeInspectorMessage] = useState<string | null>(
    null,
  );
  const [isRefreshingFromQuery, setIsRefreshingFromQuery] = useState(false);
  const versionNamesStorageKey = `${VERSION_NAMES_STORAGE_KEY_PREFIX}:${project.id}`;
  const editorPanelsStorageKey = `${EDITOR_PANELS_STORAGE_KEY_PREFIX}:${project.id}`;
  const editorFocusStorageKey = `${EDITOR_FOCUS_STORAGE_KEY_PREFIX}:${project.id}`;
  const inspectorSectionsStorageKey = `${INSPECTOR_SECTIONS_STORAGE_KEY_PREFIX}:${project.id}`;
  const canImportPrismaSchema = prismaSchemaImportText.trim().length > 0;
  const hasPendingChangesGuard =
    pendingCommands.length > 0 || saveState.isDirty || saveState.status === "saving";
  const [panelState, setPanelState] = useState<EditorPanelState>(
    DEFAULT_EDITOR_PANEL_STATE,
  );
  const [isCanvasFocusMode, setIsCanvasFocusMode] = useState(false);
  const [isFocusInspectorCollapsed, setIsFocusInspectorCollapsed] = useState(false);
  const [inspectorMode, setInspectorMode] = useState<InspectorMode>("operational");
  const [hasHydratedEditorPreferences, setHasHydratedEditorPreferences] =
    useState(false);
  const [hasHydratedInspectorMode, setHasHydratedInspectorMode] = useState(false);
  const [inspectorSections, setInspectorSections] = useState<InspectorSectionState>(
    DEFAULT_INSPECTOR_SECTION_STATE,
  );
  const [hasHydratedInspectorSections, setHasHydratedInspectorSections] =
    useState(false);
  const [isQuickFindOpen, setIsQuickFindOpen] = useState(false);
  const [quickFindQuery, setQuickFindQuery] = useState("");
  const [quickFindActiveIndex, setQuickFindActiveIndex] = useState(0);
  const [isAddNodeDialogOpen, setIsAddNodeDialogOpen] = useState(false);
  const [addNodeErrorMessage, setAddNodeErrorMessage] = useState<string | null>(null);
  const [inlineRenameNodeId, setInlineRenameNodeId] = useState<string | null>(null);
  const [inlineRenameDraft, setInlineRenameDraft] = useState("");
  const [inlineRenameErrorMessage, setInlineRenameErrorMessage] =
    useState<string | null>(null);
  const [activeConnectionSourceNodeId, setActiveConnectionSourceNodeId] =
    useState<string | null>(null);
  const [addNodeDraft, setAddNodeDraft] = useState<AddNodeDraft>({
    kind: "note",
    diagramRole: undefined,
    title: "",
    description: "",
    tagsText: "",
  });
  const [collapsedTreeNodeIds, setCollapsedTreeNodeIds] = useState<string[]>([]);
  const [pendingConnectionAssistant, setPendingConnectionAssistant] =
    useState<PendingConnectionAssistantState | null>(null);
  const [pendingErdQuickRelate, setPendingErdQuickRelate] =
    useState<PendingErdQuickRelateState | null>(null);
  const [erdFieldDrafts, setErdFieldDrafts] = useState<Record<string, ErdFieldDraftState>>(
    {},
  );
  const [erdPendingFieldFocusId, setErdPendingFieldFocusId] = useState<string | null>(null);
  const [erdMaterializeDependentSide, setErdMaterializeDependentSide] = useState<
    "source" | "target"
  >("target");
  const [erdMaterializeExistingFieldId, setErdMaterializeExistingFieldId] =
    useState<string>("__new__");
  const [erdMaterializeUnique, setErdMaterializeUnique] = useState(false);
  const [pendingNodeRepair, setPendingNodeRepair] =
    useState<PendingNodeRepairState | null>(null);
  const [pendingSemanticOverride, setPendingSemanticOverride] =
    useState<PendingSemanticOverrideState | null>(null);
  const [semanticOverrideReason, setSemanticOverrideReason] = useState("");
  const [isValidationPanelOpen, setIsValidationPanelOpen] = useState(false);
  const [serverSemanticAudit, setServerSemanticAudit] =
    useState<SemanticAuditPayload | null>(null);
  const [semanticPolicy, setSemanticPolicy] = useState<SemanticPolicyPayload | null>(null);
  const [currentRevision, setCurrentRevision] = useState<number>(initialRevision);

  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const viewportRef = useRef(viewport);
  const layoutMetadataRef = useRef(layoutMetadata);
  const pendingCommandsRef = useRef(pendingCommands);
  const selectedNodeRef = useRef<RFNode | null>(null);
  const selectedEdgeRef = useRef<RFEdge | null>(null);
  const localMutationVersionRef = useRef(0);
  const isSaveInFlightRef = useRef(false);
  const requestTrackerRef = useRef(createEditorSaveRequestTracker());
  const saveInFlightRequestIdRef = useRef<number | null>(null);
  const autosaveFlushRef = useRef<null | (() => Promise<void>)>(null);
  const autosaveDebouncerRef = useRef(
    createDebouncedTask(() => {
      void autosaveFlushRef.current?.();
    }, AUTOSAVE_DELAY_MS),
  );
  const panelStateBeforeFocusRef = useRef<EditorPanelState>(
    DEFAULT_EDITOR_PANEL_STATE,
  );
  const canvasRegionRef = useRef<HTMLDivElement | null>(null);
  const reactFlowInstanceRef = useRef<ReactFlowInstance<RFNode, RFEdge> | null>(
    null,
  );
  const quickFindReturnFocusRef = useRef<HTMLElement | null>(null);
  const currentRevisionRef = useRef(currentRevision);

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

    const renameNodeStillExists = nodes.some((node) => node.id === inlineRenameNodeId);
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
    currentRevisionRef.current = currentRevision;
  }, [currentRevision]);

  useEffect(() => {
    layoutMetadataRef.current = layoutMetadata;
  }, [layoutMetadata]);

  useEffect(() => {
    const debouncer = autosaveDebouncerRef.current;
    return () => {
      debouncer.cancel();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const rawPanelState = window.localStorage.getItem(editorPanelsStorageKey);
      const parsedPanelState = rawPanelState
        ? sanitizeEditorPanelState(JSON.parse(rawPanelState))
        : DEFAULT_EDITOR_PANEL_STATE;
      const persistedFocus = window.localStorage.getItem(editorFocusStorageKey) === "true";

      panelStateBeforeFocusRef.current = parsedPanelState;
      setPanelState(persistedFocus ? {
        metadata: false,
        prismaImport: false,
        versions: false,
      } : parsedPanelState);
      setIsCanvasFocusMode(persistedFocus);
      setIsFocusInspectorCollapsed(persistedFocus);
    } catch {
      panelStateBeforeFocusRef.current = DEFAULT_EDITOR_PANEL_STATE;
      setPanelState(DEFAULT_EDITOR_PANEL_STATE);
      setIsCanvasFocusMode(false);
      setIsFocusInspectorCollapsed(false);
    } finally {
      setHasHydratedEditorPreferences(true);
    }
  }, [editorFocusStorageKey, editorPanelsStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined" || !hasHydratedEditorPreferences) {
      return;
    }

    try {
      window.localStorage.setItem(editorPanelsStorageKey, JSON.stringify(panelState));
    } catch {
      // Ignora indisponibilidade de storage local.
    }
  }, [editorPanelsStorageKey, hasHydratedEditorPreferences, panelState]);

  useEffect(() => {
    if (typeof window === "undefined" || !hasHydratedEditorPreferences) {
      return;
    }

    try {
      window.localStorage.setItem(editorFocusStorageKey, String(isCanvasFocusMode));
    } catch {
      // Ignora indisponibilidade de storage local.
    }
  }, [editorFocusStorageKey, hasHydratedEditorPreferences, isCanvasFocusMode]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const persistedMode = window.localStorage.getItem(INSPECTOR_MODE_STORAGE_KEY);
      if (persistedMode === "technical" || persistedMode === "operational") {
        setInspectorMode(persistedMode);
      } else {
        setInspectorMode("operational");
      }
    } catch {
      setInspectorMode("operational");
    } finally {
      setHasHydratedInspectorMode(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !hasHydratedInspectorMode) {
      return;
    }

    try {
      window.localStorage.setItem(INSPECTOR_MODE_STORAGE_KEY, inspectorMode);
    } catch {
      // Ignora indisponibilidade de storage local.
    }
  }, [hasHydratedInspectorMode, inspectorMode]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const persisted = window.localStorage.getItem(inspectorSectionsStorageKey);
      if (!persisted) {
        setInspectorSections(DEFAULT_INSPECTOR_SECTION_STATE);
      } else {
        const parsed = JSON.parse(persisted);
        setInspectorSections(sanitizeInspectorSectionState(parsed));
      }
    } catch {
      setInspectorSections(DEFAULT_INSPECTOR_SECTION_STATE);
    } finally {
      setHasHydratedInspectorSections(true);
    }
  }, [inspectorSectionsStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined" || !hasHydratedInspectorSections) {
      return;
    }

    try {
      window.localStorage.setItem(
        inspectorSectionsStorageKey,
        JSON.stringify(inspectorSections),
      );
    } catch {
      // Ignora indisponibilidade de storage local.
    }
  }, [hasHydratedInspectorSections, inspectorSections, inspectorSectionsStorageKey]);

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );
  const selectedEdge = useMemo(
    () => edges.find((edge) => edge.id === selectedEdgeId) ?? null,
    [edges, selectedEdgeId],
  );

  useEffect(() => {
    if (selectedNodeId && selectedEdgeId) {
      setSelectedEdgeId(null);
    }
  }, [selectedEdgeId, selectedNodeId]);

  useEffect(() => {
    if (selectedNodeId && !selectedNode) {
      setSelectedNodeId(null);
    }
  }, [selectedNode, selectedNodeId]);

  useEffect(() => {
    if (selectedEdgeId && !selectedEdge) {
      setSelectedEdgeId(null);
    }
  }, [selectedEdge, selectedEdgeId]);

  const selectedErdEntityPayload = useMemo(() => {
    if (!selectedNode || selectedNode.data.kind !== "entity") {
      return null;
    }

    return normalizeErdEntityPayloadFromNode(selectedNode);
  }, [selectedNode]);
  const selectedErdRelationPayload = useMemo(() => {
    if (!selectedEdge || (selectedEdge.data?.kind ?? "flows-to") !== "references") {
      return null;
    }

    return normalizeErdRelationPayloadFromEdge(selectedEdge);
  }, [selectedEdge]);
  const renderer = useMemo(
    () =>
      resolveDiagramRenderer({
        diagramType: layoutMetadata.diagramType,
        template: project.template,
        layoutOptions: layoutMetadata.layoutOptions,
      }),
    [layoutMetadata.diagramType, layoutMetadata.layoutOptions, project.template],
  );
  const semanticDiagramType = resolveSemanticDiagramType(
    layoutMetadata.diagramType,
    renderer.key,
  );
  const isErdDiagram = semanticDiagramType === "erd";
  const erdPolicy = useMemo(
    () => toErdPolicyConfig(semanticPolicy),
    [semanticPolicy],
  );
  const semanticEngineOptions = useMemo(
    () => toSemanticEngineOptionsFromPolicy(semanticPolicy),
    [semanticPolicy],
  );
  const hiddenDiagramNodeIdSet = useMemo(
    () => new Set(hiddenDiagramNodeIds),
    [hiddenDiagramNodeIds],
  );
  const semanticRootNodeId =
    renderer.key === "mindmap"
      ? computedMindmapRootNodeId ??
        getMindmapRootNodeId(
          nodes.filter((node) => !hiddenDiagramNodeIdSet.has(node.id)),
          layoutMetadata.rootNodeName,
        )
      : null;
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
  const selectedErdSourceEntityNode = useMemo(() => {
    if (!selectedEdge) {
      return null;
    }
    const node = nodes.find((candidate) => candidate.id === selectedEdge.source);
    return node && node.data.kind === "entity" ? node : null;
  }, [nodes, selectedEdge]);
  const selectedErdTargetEntityNode = useMemo(() => {
    if (!selectedEdge) {
      return null;
    }
    const node = nodes.find((candidate) => candidate.id === selectedEdge.target);
    return node && node.data.kind === "entity" ? node : null;
  }, [nodes, selectedEdge]);
  const selectedErdRelationIssues = useMemo(
    () =>
      selectedEdge
        ? displayedSemanticAudit.issues.filter(
            (issue) => issue.targetType === "edge" && issue.targetId === selectedEdge.id,
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
  const displayedSemanticSafeFixes = useMemo(() => {
    const seen = new Set<string>();
    const fixes: Array<{
      id: string;
      label: string;
      description?: string;
      commands: ErdEditorCommand[];
      issueId: string;
    }> = [];

    for (const issue of displayedSemanticAudit.issues) {
      const issueFixes = readIssueSuggestedFixes(issue);
      for (const fix of issueFixes) {
        if (fix.safety !== "safe" || seen.has(fix.id)) {
          continue;
        }

        seen.add(fix.id);
        fixes.push({
          id: fix.id,
          label: fix.label,
          ...(fix.description ? { description: fix.description } : {}),
          commands: fix.commands,
          issueId: issue.id,
        });
      }
    }

    return fixes;
  }, [displayedSemanticAudit.issues]);
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
  }, [selectedEdge, selectedNode, semanticIssuesByEdgeId, semanticIssuesByNodeId]);
  const selectedSemanticSeverity: "error" | "warning" | "suggestion" | "info" | null =
    selectedSemanticIssues.some((issue) => issue.severity === "error")
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
  }, [hiddenCanvasNodeIdSet, selectedNodeId]);

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
  }, [edges, hiddenCanvasNodeIdSet, selectedEdgeId]);

  const renderedNodes = useMemo(() => {
    const visibleNodes = nodes.filter(
      (node) => !hiddenCanvasNodeIdSet.has(node.id) && node.hidden !== true,
    );
    const diagramVisibleNodeIdSet = new Set(
      nodes
        .filter((node) => !hiddenDiagramNodeIdSet.has(node.id) && node.hidden !== true)
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
    const connectionTargetStateByNodeId = new Map<string, "allowed" | "blocked">();
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
      ? visibleNodes.find((node) => node.id === activeConnectionSourceNodeId) ?? null
      : null;

    if (activeSourceNode) {
      const sourceNodeRef = toRoleAwareSemanticNodeRef({
        diagramType: semanticDiagramType,
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
            targetNode: toRoleAwareSemanticNodeRef({
              diagramType: semanticDiagramType,
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
              const hasPk = entityPayload.fields.some((field) => field.flags.includes("PK"));

              if (!hasPk) {
                badges.push({ label: editorT("shell.erd.badges.noPk"), tone: "warning" });
              }

              const fkPending = entityPayload.fields.some(
                (field) =>
                  field.flags.includes("FK") &&
                  (!field.references?.entityId || !field.references?.relationEdgeId),
              );
              if (fkPending) {
                badges.push({ label: editorT("shell.erd.badges.fkPending"), tone: "info" });
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
        nodeIssues.length > 0 && (isValidationPanelOpen || selectedNodeId === node.id)
          ? nodeIssues.some((issue) => issue.severity === "error")
            ? "editor-node-has-issue editor-node-issue-error"
            : "editor-node-has-issue editor-node-issue-warning"
          : null;
      const graphNodeSemantic =
        renderer.key === "graph"
          ? resolveGraphNodeSemantic({
              diagramRole: node.data.diagramRole,
              kind: node.data.kind,
              label: node.data.label,
              payload: node.data.payload,
            }, editorT)
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
            renderer.key === "tree" && treeNodesWithContainsChildren.has(node.id)
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
              ? getOperationalDisplayLabel({
                  label: node.data.label,
                  payload: node.data.payload,
                }, editorT)
              : node.data.label,
        },
      };
    });
  }, [
    activeConnectionSourceNodeId,
    computedMindmapRootNodeId,
    edges,
    inspectorMode,
    isValidationPanelOpen,
    layoutMetadata.rootNodeName,
    nodes,
    hiddenCanvasNodeIdSet,
    hiddenDiagramNodeIdSet,
    collapsedTreeNodeIdSet,
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
    const baseEdges = visibleEdges.map((edge) => {
      const edgeKind = edge.data?.kind ?? "flows-to";
      const payload = edge.data?.payload ?? {};
      const erdCardinalityClassSuffix = resolveErdEdgeClassSuffix(payload);
      const renderedLabel = resolveErdEdgeLabel({
        baseLabel: edge.label ? String(edge.label) : undefined,
        edgeKind,
        payload,
        rendererKey: renderer.key,
      });
      const edgeIssues = semanticIssuesByEdgeId.get(edge.id) ?? [];
      const highlightedIssueClass =
        edgeIssues.length > 0 && (isValidationPanelOpen || selectedEdgeId === edge.id)
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
        label: renderedLabel,
        type: edge.type ?? renderer.defaultEdgeOptions.type,
        markerEnd:
          resolveEdgeMarker(edgeKind, {
            rendererKey: renderer.key,
          }) ??
          edge.markerEnd ??
          renderer.defaultEdgeOptions.markerEnd,
        labelStyle: resolveEdgeLabelStyle(edgeKind, {
          rendererKey: renderer.key,
        }),
        labelBgStyle: resolveEdgeLabelBgStyle(edgeKind, {
          rendererKey: renderer.key,
        }),
        labelShowBg:
          renderer.key === "graph" || renderer.key === "flow"
            ? true
            : edge.labelShowBg,
        labelBgPadding:
          resolveEdgeLabelBgPadding(edgeKind, {
            rendererKey: renderer.key,
          }) ?? edge.labelBgPadding,
        labelBgBorderRadius:
          resolveEdgeLabelBgBorderRadius(edgeKind, {
            rendererKey: renderer.key,
          }) ?? edge.labelBgBorderRadius,
        animated: edge.animated ?? renderer.defaultEdgeOptions.animated,
        style: {
          ...(edge.style ?? {}),
          strokeDasharray: resolveEdgeDashArray(edgeKind, {
            rendererKey: renderer.key,
            payload,
          }),
        },
        className: [
          edge.className,
          renderer.defaultEdgeOptions.className,
          `editor-edge-kind-${edgeKind}`,
          `editor-edge-tone-${getEdgeKindPresentation(edgeKind).tone}`,
          `editor-edge-renderer-${renderer.key}`,
          renderer.key === "erd" && erdCardinalityClassSuffix
            ? `editor-edge-erd-cardinality-${erdCardinalityClassSuffix}`
            : null,
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
    hiddenCanvasNodeIdSet,
    isValidationPanelOpen,
    renderer,
    selectedEdgeId,
    semanticIssuesByEdgeId,
  ]);
  const isReapplyLayoutBlockedByPolicy = layoutMetadata.allowReapplyLayout === false;
  const canReapplyLayout = useMemo(
    () =>
      isSupportedDiagramType(layoutMetadata.diagramType) &&
      !isReapplyLayoutBlockedByPolicy,
    [layoutMetadata.diagramType, isReapplyLayoutBlockedByPolicy],
  );

  const selectedNodeSyncKey = useMemo(
    () => getNodeSelectionSyncKey(selectedNode),
    [selectedNode],
  );
  const selectedEdgeSyncKey = useMemo(
    () => getEdgeSelectionSyncKey(selectedEdge),
    [selectedEdge],
  );
  useEffect(() => {
    selectedNodeRef.current = selectedNode;
  }, [selectedNode]);

  useEffect(() => {
    selectedEdgeRef.current = selectedEdge;
  }, [selectedEdge]);

  useEffect(() => {
    const selectedNodeForInspector = selectedNodeRef.current;

    if (!selectedNodeForInspector) {
      setNodeInspectorDraft(null);
      setOperationalNodeDraft(null);
      setNodeInspectorErrors({});
      setNodeInspectorMessage(null);
      return;
    }

    setNodeInspectorDraft(createNodeInspectorDraft(selectedNodeForInspector));
    setOperationalNodeDraft(
      createOperationalNodeDraft({
        label: selectedNodeForInspector.data.label,
        kind: selectedNodeForInspector.data.kind,
        payload: selectedNodeForInspector.data.payload,
      }, editorT),
    );
    setNodeInspectorErrors({});
    setNodeInspectorMessage(null);
  }, [selectedNodeSyncKey]);

  useEffect(() => {
    const selectedEdgeForInspector = selectedEdgeRef.current;

    if (!selectedEdgeForInspector) {
      setEdgeInspectorDraft(null);
      setOperationalEdgeDraft(null);
      setEdgeInspectorErrors({});
      setEdgeInspectorMessage(null);
      return;
    }

    setEdgeInspectorDraft(createEdgeInspectorDraft(selectedEdgeForInspector));
    setOperationalEdgeDraft({
      label: selectedEdgeForInspector.label ? String(selectedEdgeForInspector.label) : "",
      kind: selectedEdgeForInspector.data?.kind ?? "flows-to",
    });
    setEdgeInspectorErrors({});
    setEdgeInspectorMessage(null);
  }, [selectedEdgeSyncKey]);

  useEffect(() => {
    if (!selectedErdEntityPayload) {
      setErdFieldDrafts({});
      return;
    }

    const nextDrafts: Record<string, ErdFieldDraftState> = {};
    for (const field of selectedErdEntityPayload.fields) {
      nextDrafts[field.id] = {
        name: field.name,
        type: field.type,
      };
    }
    setErdFieldDrafts(nextDrafts);
  }, [selectedErdEntityPayload]);

  useEffect(() => {
    if (!selectedErdRelationPayload) {
      setErdMaterializeDependentSide("target");
      setErdMaterializeExistingFieldId("__new__");
      setErdMaterializeUnique(false);
      return;
    }

    const inferredSide = inferDependentSide({
      relation: {
        sourceEntityId: selectedEdge?.source ?? "",
        targetEntityId: selectedEdge?.target ?? "",
        payload: selectedErdRelationPayload,
      },
      sourceEntity: selectedErdSourceEntityNode
        ? {
            id: selectedErdSourceEntityNode.id,
            kind: "entity",
            label: selectedErdSourceEntityNode.data.label,
            payload: normalizeErdEntityPayloadFromNode(selectedErdSourceEntityNode),
          }
        : undefined,
      targetEntity: selectedErdTargetEntityNode
        ? {
            id: selectedErdTargetEntityNode.id,
            kind: "entity",
            label: selectedErdTargetEntityNode.data.label,
            payload: normalizeErdEntityPayloadFromNode(selectedErdTargetEntityNode),
          }
        : undefined,
    });

    const side =
      selectedErdRelationPayload.materialization?.mode === "fk"
        ? selectedErdRelationPayload.materialization.dependentSide
        : inferredSide;
    setErdMaterializeDependentSide(side);
    setErdMaterializeExistingFieldId("__new__");
    setErdMaterializeUnique(
      selectedErdRelationPayload.materialization?.mode === "fk"
        ? selectedErdRelationPayload.materialization.fk.unique === true
        : false,
    );
  }, [
    selectedEdge?.source,
    selectedEdge?.target,
    selectedErdRelationPayload,
    selectedErdSourceEntityNode,
    selectedErdTargetEntityNode,
  ]);

  useEffect(() => {
    if (!erdPendingFieldFocusId) {
      return;
    }

    const focusId = erdPendingFieldFocusId;
    window.requestAnimationFrame(() => {
      const input = document.querySelector<HTMLInputElement>(
        `[data-erd-field-input="${focusId}:name"]`,
      );
      input?.focus();
      input?.select();
    });
    setErdPendingFieldFocusId(null);
  }, [erdPendingFieldFocusId]);

  function syncFromSnapshot(snapshot: Parameters<typeof fromCanonicalSnapshotToFlowState>[0]) {
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
  }

  function getCurrentSnapshot() {
    return toCanonicalSnapshotFromFlowState(
      project.id,
      nodesRef.current,
      edgesRef.current,
      viewportRef.current,
      layoutMetadataRef.current,
    );
  }

  function setPendingCommandsState(
    updater:
      | PendingEditorCommand[]
      | ((current: PendingEditorCommand[]) => PendingEditorCommand[]),
  ) {
    setPendingCommands((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      pendingCommandsRef.current = next;
      return next;
    });
  }

  function markDirtyState(
    message = editorT("autosave.pendingChangesQueued"),
  ) {
    setSaveState((current) => markEditorDirty(current, message, editorT));
  }

  function beginSaveRequest() {
    const requestId = requestTrackerRef.current.issueRequestId();
    saveInFlightRequestIdRef.current = requestId;
    isSaveInFlightRef.current = true;
    return requestId;
  }

  function finishSaveRequest(requestId: number) {
    if (saveInFlightRequestIdRef.current !== requestId) {
      return;
    }

    saveInFlightRequestIdRef.current = null;
    isSaveInFlightRef.current = false;
  }

  function dequeueCommand(localVersion: number) {
    setPendingCommandsState((current) =>
      current.filter((entry) => entry.localVersion !== localVersion),
    );
  }

  function hasInspectorDraftPendingChanges() {
    const nodeDirty =
      inspectorMode === "operational"
        ? selectedNode !== null &&
          operationalNodeDraft !== null &&
          !areOperationalNodeDraftValuesEqual(selectedNode, operationalNodeDraft)
        : selectedNode !== null &&
          nodeInspectorDraft !== null &&
          !areNodeDraftValuesEqual(selectedNode, nodeInspectorDraft);
    const edgeDirty =
      inspectorMode === "operational"
        ? selectedEdge !== null &&
          operationalEdgeDraft !== null &&
          !areOperationalEdgeDraftValuesEqual(selectedEdge, operationalEdgeDraft)
        : selectedEdge !== null &&
          edgeInspectorDraft !== null &&
          !areEdgeDraftValuesEqual(selectedEdge, edgeInspectorDraft);

    return nodeDirty || edgeDirty;
  }

  function confirmInspectorDraftDiscardIfNeeded() {
    if (!hasInspectorDraftPendingChanges()) {
      return true;
    }

    return window.confirm(
      editorT("shell.inspector.confirmDiscardDraft"),
    );
  }

  function selectItem(next: { nodeId: string | null; edgeId: string | null }) {
    if (!confirmInspectorDraftDiscardIfNeeded()) {
      return;
    }

    setSelectedNodeId(next.nodeId);
    setSelectedEdgeId(next.edgeId);
  }

  function applyLocalCommandAndQueue(
    command: EditorCommand,
    successMessage?: string,
  ): boolean {
    try {
      const nextSnapshot = applyEditorCommandLocally(
        getCurrentSnapshot(),
        project.id,
        command,
      );

      syncFromSnapshot(nextSnapshot);
      setServerSemanticAudit(null);
      setLastErdExportPreview(null);
      setGlobalErrorMessage(null);

      const nextVersion = localMutationVersionRef.current + 1;
      localMutationVersionRef.current = nextVersion;
      setPendingCommandsState((current) => [
        ...current,
        { localVersion: nextVersion, command },
      ]);
      markDirtyState();
      autosaveDebouncerRef.current.trigger();

      if (successMessage && command.type === "updateNode") {
        setNodeInspectorMessage(successMessage);
      }

      if (successMessage && command.type === "updateEdge") {
        setEdgeInspectorMessage(successMessage);
      }

      return true;
    } catch (error) {
      const message = formatErrorMessage(error, editorT("shell.errors.applyChange"));
      setGlobalErrorMessage(message);

      if (command.type === "updateNode") {
        setNodeInspectorMessage(message);
      }

      if (command.type === "updateEdge") {
        setEdgeInspectorMessage(message);
      }

      return false;
    }
  }

  async function flushPendingCommands(reason: "autosave" | "manual") {
    if (isSaveInFlightRef.current) {
      return;
    }

    const queue = pendingCommandsRef.current.slice();

    if (queue.length === 0 && reason === "autosave") {
      return;
    }

    const requestId = beginSaveRequest();
    setSaveState((current) =>
      markEditorSaving(
        current,
        reason === "manual"
          ? editorT("autosave.savingManually")
          : editorT("autosave.savingChanges"),
      ),
    );

    try {
      let expectedRevision = currentRevisionRef.current;

      for (const entry of queue) {
        let attempt = 0;

        while (true) {
          try {
            const remoteResult = await applyEditorCommandRemotely(
              project.id,
              entry.command,
              {
                expectedRevision,
                semanticMode: inspectorMode,
              },
            );
            expectedRevision = remoteResult.newRevision;
            setCurrentRevision(remoteResult.newRevision);
            break;
          } catch (error) {
            const conflictRevision =
              error instanceof EditorRemoteError && error.code === "CONFLICT"
                ? error.payload?.currentRevision
                : null;

            if (typeof conflictRevision === "number" && attempt === 0) {
              expectedRevision = conflictRevision;
              setCurrentRevision(conflictRevision);
              attempt += 1;
              continue;
            }

            throw error;
          }
        }

        if (requestTrackerRef.current.isStaleResponse(requestId)) {
          return;
        }

        dequeueCommand(entry.localVersion);
      }

      if (requestTrackerRef.current.isStaleResponse(requestId)) {
        return;
      }

      setGlobalErrorMessage(null);
      if (pendingCommandsRef.current.length === 0) {
        setSaveState((current) => markEditorSaveSuccess(current, Date.now(), editorT));
      } else {
        markDirtyState();
        autosaveDebouncerRef.current.trigger();
      }
    } catch (error) {
      if (requestTrackerRef.current.isStaleResponse(requestId)) {
        return;
      }

      if (error instanceof EditorRemoteError) {
        if (error.code === "CONFLICT") {
          const current = error.payload?.currentRevision;
          if (typeof current === "number") {
            setCurrentRevision(current);
          }
        }
      }

      const message = formatErrorMessage(
        error,
        editorT("shell.errors.saveChanges"),
      );
      setSaveState((current) => markEditorSaveError(current, message));
      setGlobalErrorMessage(message);
    } finally {
      finishSaveRequest(requestId);
    }
  }

  autosaveFlushRef.current = async () => {
    await flushPendingCommands("autosave");
  };

  async function handleManualSave() {
    if (isSaveInFlightRef.current) {
      return false;
    }

    autosaveDebouncerRef.current.cancel();

    if (pendingCommandsRef.current.length > 0) {
      await flushPendingCommands("manual");

      if (pendingCommandsRef.current.length > 0 || isSaveInFlightRef.current) {
        return false;
      }
    }

    const snapshotLocalVersion = localMutationVersionRef.current;
    const snapshotToSave = getCurrentSnapshot();
    const requestId = beginSaveRequest();
    setSaveState((current) =>
      markEditorSaving(current, editorT("autosave.savingManually")),
    );
    setGlobalErrorMessage(null);

    try {
      const saveResult = await saveWorkingSnapshotForEditor({
        projectId: project.id,
        snapshot: snapshotToSave,
        label: DEFAULT_SNAPSHOT_LABEL,
        expectedRevision: currentRevisionRef.current,
        semanticMode: inspectorMode,
      });
      setCurrentRevision(saveResult.newRevision);

      if (requestTrackerRef.current.isStaleResponse(requestId)) {
        return false;
      }

      setPendingCommandsState((current) =>
        current.filter((entry) => entry.localVersion > snapshotLocalVersion),
      );
      setGlobalErrorMessage(null);

      if (pendingCommandsRef.current.length === 0) {
        setSaveState((current) => markEditorSaveSuccess(current, Date.now(), editorT));
      } else {
        markDirtyState();
        autosaveDebouncerRef.current.trigger();
      }

      return true;
    } catch (error) {
      if (requestTrackerRef.current.isStaleResponse(requestId)) {
        return false;
      }

      const message = formatErrorMessage(error, editorT("shell.errors.saveSnapshot"));
      setSaveState((current) => markEditorSaveError(current, message));
      setGlobalErrorMessage(message);
      return false;
    } finally {
      finishSaveRequest(requestId);
    }
  }

  async function handleCreateVersion() {
    if (isCreatingVersion || saveState.status === "saving") {
      return;
    }

    setIsCreatingVersion(true);
    setVersionCreateFeedback(null);
    const normalizedVersionName = newVersionName.trim();

    try {
      if (pendingCommandsRef.current.length > 0 || saveState.isDirty) {
        const saved = await handleManualSave();

        if (!saved) {
            throw new Error(
            editorT("shell.versions.errors.saveBeforeCreate"),
          );
        }
      }

      const result = await createSnapshotVersionForEditor({
        projectId: project.id,
        origin: "manual",
        label: normalizedVersionName || undefined,
      });

      if (normalizedVersionName) {
        setLocalVersionNames((current) => ({
          ...current,
          [result.snapshotVersion.id]: normalizedVersionName,
        }));
        setVersionNameDrafts((current) => ({
          ...current,
          [result.snapshotVersion.id]: normalizedVersionName,
        }));
      }

      setVersionCreateFeedback({
        kind: "success",
        message: result.message,
      });
      setNewVersionName("");
      setVersionActionFeedback(null);
      setVersionDiffFeedback(null);
      setVersionDiffSummary(null);
      void (async () => {
        try {
          const versions = await listSnapshotVersionsForEditor(project.id);
          setSnapshotVersions(versions);
        } catch {
          // Mantem feedback principal de criacao; o usuario pode atualizar manualmente.
        }
      })();
    } catch (error) {
      setVersionCreateFeedback({
        kind: "error",
        message: formatErrorMessage(error, editorT("shell.versions.errors.create")),
      });
    } finally {
      setIsCreatingVersion(false);
    }
  }

  async function handleRefreshVersionList() {
    if (isRefreshingVersionList || activeVersionRestoreId !== null) {
      return;
    }

    setIsRefreshingVersionList(true);
    setVersionActionFeedback(null);

    try {
      const versions = await listSnapshotVersionsForEditor(project.id);
      setSnapshotVersions(versions);
      setVersionActionFeedback({
        kind: "success",
        message: editorT("shell.versions.refreshSuccess", { count: versions.length }),
      });
    } catch (error) {
      setVersionActionFeedback({
        kind: "error",
        message: formatErrorMessage(error, editorT("shell.versions.errors.refresh")),
      });
    } finally {
      setIsRefreshingVersionList(false);
    }
  }

  function handleVersionNameDraftChange(versionId: string, value: string) {
    setVersionNameDrafts((current) => ({
      ...current,
      [versionId]: value,
    }));
  }

  function handleSaveVersionName(versionId: string) {
    const normalizedName = (versionNameDrafts[versionId] ?? "").trim();

    setLocalVersionNames((current) => {
      const next = { ...current };

      if (!normalizedName) {
        delete next[versionId];
        return next;
      }

      next[versionId] = normalizedName.slice(0, 120);
      return next;
    });

    setVersionActionFeedback({
      kind: "success",
      message: normalizedName
        ? editorT("shell.versions.localNameSaved")
        : editorT("shell.versions.localNameRemoved"),
    });
  }

  function getVersionDisplayName(version: EditorSnapshotVersionSummary) {
    return (
      localVersionNames[version.id] ||
      version.label?.trim() ||
      editorT("shell.versions.unnamed")
    );
  }

  async function handleCompareVersion(versionId: string) {
    if (
      saveState.status === "saving" ||
      activeVersionRestoreId !== null ||
      activeVersionCompareId !== null
    ) {
      return;
    }

    setActiveVersionCompareId(versionId);
    setVersionDiffFeedback(null);
    setVersionDiffSummary(null);

    try {
      const [diff, snapshotVersion] = await Promise.all([
        loadSnapshotVersionDiffForEditor(project.id, versionId),
        loadSnapshotVersionDetailForEditor(project.id, versionId),
      ]);
      const executiveSummary = buildVersionDiffSummary({
        baseSnapshot: snapshotVersion.snapshot,
        targetSnapshot: getCurrentSnapshot(),
        diff,
        t: editorT,
      });

      setVersionDiffSummary(executiveSummary);
      setVersionDiffFeedback({
        kind: "info",
        message: buildVersionDiffFeedbackMessage(diff, editorT),
      });
      setVersionActionFeedback(null);
    } catch (error) {
      setVersionDiffSummary(null);
      setVersionDiffFeedback({
        kind: "error",
        message: formatErrorMessage(error, editorT("shell.versions.errors.compare")),
      });
    } finally {
      setActiveVersionCompareId(null);
    }
  }

  async function handleRestoreVersion(version: EditorSnapshotVersionSummary) {
    if (
      saveState.status === "saving" ||
      isCreatingVersion ||
      activeVersionRestoreId !== null
    ) {
      return;
    }

    const hasLocalPendingChanges =
      pendingCommandsRef.current.length > 0 || saveState.isDirty;
    const confirmMessage = hasLocalPendingChanges
      ? editorT("shell.versions.confirmRestoreDiscard")
      : editorT("shell.versions.confirmRestore");

    if (!window.confirm(confirmMessage)) {
      return;
    }

    autosaveDebouncerRef.current.cancel();
    setActiveVersionRestoreId(version.id);
    setVersionActionFeedback(null);
    setVersionDiffFeedback(null);
    setVersionDiffSummary(null);

    try {
      const result = await restoreSnapshotVersionForEditor({
        projectId: project.id,
        versionId: version.id,
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
        message: editorT("shell.versions.restoreSaved"),
        lastSavedAt: Date.now(),
      });
      setGlobalErrorMessage(null);
      setQuerySyncMessage(editorT("shell.versions.restoreSynced"));
      setVersionActionFeedback({
        kind: "success",
        message: result.message,
      });
    } catch (error) {
      setVersionActionFeedback({
        kind: "error",
        message: formatErrorMessage(error, editorT("shell.versions.errors.restore")),
      });
    } finally {
      setActiveVersionRestoreId(null);
    }
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
        message: buildPrismaSchemaImportFeedbackMessage(result.importSummary, editorT),
      });
    } catch (error) {
      setPrismaSchemaImportFeedback({
        kind: "error",
        message: formatErrorMessage(error, editorT("shell.prisma.errors.import")),
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
            setQuerySyncMessage(
              editorT("shell.sync.initialIgnored"),
            );
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
          formatErrorMessage(
            error,
            editorT("shell.sync.errors.snapshot"),
          ),
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
  }, [project.id, setEdges, setNodes]);

  useEffect(() => {
    let active = true;

    async function loadVersionsOnMount() {
      setIsRefreshingVersionList(true);

      try {
        const versions = await listSnapshotVersionsForEditor(project.id);

        if (!active) {
          return;
        }

        setSnapshotVersions(versions);
      } catch (error) {
        if (!active) {
          return;
        }

        setVersionActionFeedback({
          kind: "error",
          message: formatErrorMessage(error, editorT("shell.versions.errors.load")),
        });
      } finally {
        if (active) {
          setIsRefreshingVersionList(false);
        }
      }
    }

    void loadVersionsOnMount();
    return () => {
      active = false;
    };
  }, [project.id]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const raw = window.localStorage.getItem(versionNamesStorageKey);
      const parsed = raw ? JSON.parse(raw) : {};
      const sanitized = sanitizeVersionNameMap(parsed);
      setLocalVersionNames(sanitized);
      setVersionNameDrafts(sanitized);
    } catch {
      setLocalVersionNames({});
      setVersionNameDrafts({});
    }
  }, [versionNamesStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(
        versionNamesStorageKey,
        JSON.stringify(localVersionNames),
      );
    } catch {
      // Ignora indisponibilidade de storage local.
    }
  }, [localVersionNames, versionNamesStorageKey]);

  useEffect(() => {
    setVersionNameDrafts((current) => {
      const next = { ...current };
      let changed = false;

      for (const version of snapshotVersions) {
        const fallbackLabel =
          localVersionNames[version.id] ?? version.label?.trim() ?? "";

        if (next[version.id] === undefined) {
          next[version.id] = fallbackLabel;
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [snapshotVersions, localVersionNames]);

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
  const nodeInspectorDirty =
    inspectorMode === "operational"
      ? selectedNode !== null && operationalNodeDraft !== null
        ? !areOperationalNodeDraftValuesEqual(selectedNode, operationalNodeDraft)
        : false
      : selectedNode !== null && nodeInspectorDraft !== null
        ? !areNodeDraftValuesEqual(selectedNode, nodeInspectorDraft)
        : false;
  const edgeInspectorDirty =
    inspectorMode === "operational"
      ? selectedEdge !== null && operationalEdgeDraft !== null
        ? !areOperationalEdgeDraftValuesEqual(selectedEdge, operationalEdgeDraft)
        : false
      : selectedEdge !== null && edgeInspectorDraft !== null
        ? !areEdgeDraftValuesEqual(selectedEdge, edgeInspectorDraft)
        : false;
  const nodeInspectorHasErrors = Object.keys(nodeInspectorErrors).length > 0;
  const edgeInspectorHasErrors = Object.keys(edgeInspectorErrors).length > 0;
  const operationalTagPreview = operationalNodeDraft
    ? normalizeTagsInput(operationalNodeDraft.tagsText)
    : [];
  const currentSupportedDiagramType =
    semanticDiagramType ??
    (isSupportedDiagramType(layoutMetadata.diagramType)
      ? layoutMetadata.diagramType
      : resolveDiagramTypeForQuickActions(renderer.key));
  const editorPersona = useMemo(
    () =>
      resolveEditorPersona(
        project.creationProfile,
        project.creationInitialView,
      ),
    [project.creationInitialView, project.creationProfile],
  );

  const nodeKindOptions = useMemo(() => {
    const scopedOptions = getAllowedKindsForDiagram(
      currentSupportedDiagramType,
      inspectorMode,
      semanticPolicy,
    );
    const options = [...scopedOptions];
    const selectedKind = selectedNode?.data.kind;

    if (selectedKind && !options.some((option) => option.kind === selectedKind)) {
      options.push({
        kind: selectedKind,
        outOfProfile: true,
        group: "fora-do-perfil",
      });
    }

    return options;
  }, [currentSupportedDiagramType, inspectorMode, selectedNode?.data.kind, semanticPolicy]);
  const quickAddKindOptions = useMemo(
    () =>
      getAllowedKindsForDiagram(
        currentSupportedDiagramType,
        "operational",
        semanticPolicy,
      ),
    [currentSupportedDiagramType, semanticPolicy],
  );
  const personaDefaultNodeKind = useMemo(() => {
    const preferredKind = editorPersona.quickAdd.defaultNodeKind;
    if (quickAddKindOptions.some((option) => option.kind === preferredKind)) {
      return preferredKind;
    }

    return getDefaultNodeKindForDiagram(currentSupportedDiagramType);
  }, [
    currentSupportedDiagramType,
    editorPersona.quickAdd.defaultNodeKind,
    quickAddKindOptions,
  ]);
  const quickAddRoleOptions = useMemo(
    () => resolveQuickAddRoleOptions(currentSupportedDiagramType, editorT),
    [currentSupportedDiagramType, editorT],
  );
  const edgeKindOptions = EdgeKindSchema.options;
  const nodeLabelById = useMemo(
    () =>
      new Map(
        nodes.map((node) => [
          node.id,
          inspectorMode === "operational"
            ? getOperationalDisplayLabel({
                label: node.data.label,
                payload: node.data.payload,
              }, editorT)
            : node.data.label,
        ]),
      ),
    [editorT, inspectorMode, nodes],
  );
  const nodeRoleById = useMemo(
    () =>
      new Map(
        nodes.map((node) => [
          node.id,
          resolveDiagramRole({
            diagramType: currentSupportedDiagramType,
            nodeKind: node.data.kind,
            nodePayload: node.data.payload,
            nodeLabel: node.data.label,
            layoutMetadata: { rootNodeName: layoutMetadata.rootNodeName ?? null },
          }),
        ]),
      ),
    [currentSupportedDiagramType, layoutMetadata.rootNodeName, nodes],
  );
  const processSelectedNodeRelations = useMemo(() => {
    if (!selectedNode || currentSupportedDiagramType !== "flow") {
      return null;
    }

    return buildProcessRelationsViewModel({
      selectedNodeId: selectedNode.id,
      selectedNodeRole: nodeRoleById.get(selectedNode.id),
      selectedNodeKind: selectedNode.data.kind,
      selectedNodeLabel:
        nodeLabelById.get(selectedNode.id) ?? selectedNode.data.label,
      edges: edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label ? String(edge.label) : undefined,
        edgeKind: edge.data?.kind ?? "relates-to",
        sourceRole: nodeRoleById.get(edge.source),
        targetRole: nodeRoleById.get(edge.target),
      })),
      nodeLabelById,
    });
  }, [currentSupportedDiagramType, edges, nodeLabelById, nodeRoleById, selectedNode]);
  const selectedNodeRelations = useMemo<InspectorNodeRelationsView>(() => {
    if (!selectedNode) {
      return {
        incomingCount: 0,
        outgoingCount: 0,
        summaryChips: [],
        preview: [],
      };
    }

    if (currentSupportedDiagramType === "flow" && processSelectedNodeRelations) {
      return {
        ...processSelectedNodeRelations,
        preview: processSelectedNodeRelations.preview.map((relation) => ({
          ...relation,
          directionLabel:
            relation.direction === "incoming"
              ? editorT("shell.relations.incoming")
              : editorT("shell.relations.outgoing"),
          relationTypeLabel: getEdgeKindLabelForDiagram(
            currentSupportedDiagramType,
            relation.edgeKind,
            inspectorMode === "technical" ? "technical" : "operational",
            editorT,
          ),
        })),
      };
    }

    const incoming = edges.filter((edge) => edge.target === selectedNode.id);
    const outgoing = edges.filter((edge) => edge.source === selectedNode.id);
    const preview: InspectorRelationPreview[] = [...incoming, ...outgoing]
      .slice(0, 6)
      .map((edge) => ({
      id: edge.id,
      direction: edge.target === selectedNode.id ? "incoming" : "outgoing",
      directionLabel:
        currentSupportedDiagramType === "graph"
          ? edge.target === selectedNode.id
            ? editorT("shell.relations.graphIncoming")
            : editorT("shell.relations.graphOutgoing")
          : edge.target === selectedNode.id
            ? editorT("shell.relations.incoming")
            : editorT("shell.relations.outgoing"),
      relationTypeLabel: getEdgeKindLabelForDiagram(
        currentSupportedDiagramType,
        edge.data?.kind ?? "relates-to",
        inspectorMode === "technical" ? "technical" : "operational",
        editorT,
      ),
      relationLabel: edge.label ? String(edge.label) : undefined,
      edgeKind: edge.data?.kind ?? "relates-to",
      otherNodeId: edge.target === selectedNode.id ? edge.source : edge.target,
      otherLabel:
        nodeLabelById.get(
          edge.target === selectedNode.id ? edge.source : edge.target,
        ) ?? editorT("presentation.fallbacks.untitledNode"),
      sourceLabel: nodeLabelById.get(edge.source) ?? edge.source,
      targetLabel: nodeLabelById.get(edge.target) ?? edge.target,
      }));

    return {
      incomingCount: incoming.length,
      outgoingCount: outgoing.length,
      summaryChips: [],
      preview,
    };
  }, [
    currentSupportedDiagramType,
    edges,
    editorT,
    inspectorMode,
    nodeLabelById,
    nodeRoleById,
    processSelectedNodeRelations,
    selectedNode,
  ]);
  const selectedNodeRoleLabel = selectedNode
    ? getDiagramRoleLabel(nodeRoleById.get(selectedNode.id), editorT)
    : null;
  const selectedNodeStructureTips = useMemo(() => {
    if (!selectedNode) {
      return [] as string[];
    }

    return buildNodeStructureTips({
      diagramType: currentSupportedDiagramType,
      diagramRole: nodeRoleById.get(selectedNode.id),
      nodeKind: selectedNode.data.kind,
      nodeLabel: nodeLabelById.get(selectedNode.id) ?? selectedNode.data.label,
      incomingCount: selectedNodeRelations.incomingCount,
      outgoingCount: selectedNodeRelations.outgoingCount,
    }, editorT);
  }, [
    currentSupportedDiagramType,
    editorT,
    selectedNode,
    selectedNodeRelations.incomingCount,
    selectedNodeRelations.outgoingCount,
  ]);
  const selectedEdgeSourceLabel = selectedEdge
    ? nodeLabelById.get(selectedEdge.source) ?? selectedEdge.source
    : null;
  const selectedEdgeTargetLabel = selectedEdge
    ? nodeLabelById.get(selectedEdge.target) ?? selectedEdge.target
    : null;
  const quickFindOptions = useMemo(
    () => filterNodeQuickFindOptions(nodes, quickFindQuery, inspectorMode, editorT),
    [editorT, inspectorMode, nodes, quickFindQuery],
  );
  const selectedItemLabel = selectedNode
    ? nodeLabelById.get(selectedNode.id) ?? selectedNode.data.label
    : selectedEdge
      ? selectedEdge.label
        ? String(selectedEdge.label)
        : `${selectedEdgeSourceLabel ?? selectedEdge.source} -> ${
            selectedEdgeTargetLabel ?? selectedEdge.target
          }`
      : editorT("shell.selection.none");
  const inspectorSelectionState = resolveInspectorSelectionState({
    hasSelectedNode: Boolean(selectedNode),
    hasSelectedEdge: Boolean(selectedEdge),
  });
  const isProcessDiagram = currentSupportedDiagramType === "flow";
  const isGraphDiagram = currentSupportedDiagramType === "graph";
  const processInspectorCopy = isProcessDiagram ? getProcessInspectorCopy(editorT) : null;
  const processNodeInspectorModel =
    isProcessDiagram && selectedNode && processSelectedNodeRelations
        ? resolveProcessNodeInspectorViewModel({
          diagramRole: nodeRoleById.get(selectedNode.id),
          kind: selectedNode.data.kind,
          label: nodeLabelById.get(selectedNode.id) ?? selectedNode.data.label,
          relations: processSelectedNodeRelations,
        }, editorT)
      : null;
  const flowSelectionKindLabel =
    processNodeInspectorModel?.selectionKindLabel ??
    (isProcessDiagram && selectedNode
      ? (() => {
          const role = resolveProcessNodeRole({
            diagramRole: nodeRoleById.get(selectedNode.id),
            kind: selectedNode.data.kind,
            label: nodeLabelById.get(selectedNode.id) ?? selectedNode.data.label,
          });
          const roleMeta = getProcessRoleMeta(role, editorT);

          return role === "flow-step" ? roleMeta.kindLabel : roleMeta.badgeLabel;
        })()
      : null);
  const flowSelectionChipLabel = isProcessDiagram
    ? selectedNode
      ? `${flowSelectionKindLabel ?? ""}${
          inspectorMode === "technical" ? ` (kind: ${selectedNode.data.kind})` : ""
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
    isProcessDiagram &&
    selectedEdge &&
    selectedEdgeSourceLabel &&
    selectedEdgeTargetLabel
        ? resolveProcessEdgeInspectorViewModel({
          kind: selectedEdge.data?.kind ?? "flows-to",
          label: selectedEdge.label ? String(selectedEdge.label) : undefined,
          sourceLabel: selectedEdgeSourceLabel,
          targetLabel: selectedEdgeTargetLabel,
        }, editorT)
      : null;
  const graphSelectedNodeSemantic =
    isGraphDiagram && selectedNode
      ? resolveGraphNodeSemantic({
          diagramRole: selectedNode.data.diagramRole,
          kind: selectedNode.data.kind,
          label: selectedNode.data.label,
          payload: selectedNode.data.payload,
          incomingCount: selectedNodeRelations.incomingCount,
          outgoingCount: selectedNodeRelations.outgoingCount,
        }, editorT)
      : null;
  const graphSelectedEdgeSemantic =
    isGraphDiagram && selectedEdge
      ? resolveGraphEdgeSemantic(selectedEdge.data?.kind ?? "flows-to", editorT)
    : null;
  const inspectorSelectionBadge =
    graphSelectedNodeSemantic
      ? graphSelectedNodeSemantic.selectionBadgeLabel
      : isProcessDiagram
        ? selectedEdge
          ? editorT("shell.selection.transitionInFocus")
          : processInspectorCopy?.selectionBadgeLabel ?? inspectorSelectionState.badgeLabel
        : inspectorSelectionState.badgeLabel;
  const operationalNodeTitleLabel = isGraphDiagram
    ? editorT("shell.nodeFields.graphTitle")
    : editorT("shell.nodeFields.title");
  const operationalNodeKindLabel = isGraphDiagram
    ? editorT("shell.nodeFields.graphKind")
    : editorT("shell.nodeFields.kind");
  const operationalNodeDescriptionLabel = isGraphDiagram
    ? editorT("shell.nodeFields.graphDescription")
    : editorT("shell.nodeFields.description");
  const operationalNodeDescriptionPlaceholder = isGraphDiagram
    ? editorT("shell.nodeFields.graphDescriptionPlaceholder")
    : editorT("shell.nodeFields.descriptionPlaceholder");
  const operationalNodeTagsLabel = isGraphDiagram
    ? editorT("shell.nodeFields.graphTags")
    : editorT("shell.nodeFields.tags");
  const operationalNodeTagsPlaceholder = isGraphDiagram
    ? editorT("shell.nodeFields.graphTagsPlaceholder")
    : editorT("shell.nodeFields.tagsPlaceholder");
  const operationalNodeTagsHelper = isGraphDiagram
    ? editorT("shell.nodeFields.graphTagsHelper")
    : editorT("shell.nodeFields.tagsHelper");
  const operationalNodeContextTitle = isGraphDiagram
    ? editorT("shell.nodeFields.graphContextTitle")
    : editorT("shell.nodeFields.contextTitle");
  const operationalGeneralSectionTitle = isGraphDiagram
    ? editorT("shell.sections.graphGeneral")
    : editorT("shell.sections.general");
  const operationalDetailsSectionTitle = isGraphDiagram
    ? editorT("shell.sections.graphDetails")
    : editorT("shell.sections.details");
  const operationalRelationsSectionTitle = isGraphDiagram
    ? editorT("shell.sections.graphRelations")
    : editorT("shell.sections.relations");
  const operationalEdgeLabelLabel = isGraphDiagram
    ? editorT("shell.edgeFields.graphLabel")
    : editorT("shell.edgeFields.label");
  const operationalEdgeGeneralSectionTitle = isGraphDiagram
    ? editorT("shell.sections.graphEdgeGeneral")
    : editorT("shell.sections.general");
  const operationalEdgeKindLabel = isGraphDiagram
    ? editorT("shell.edgeFields.graphKind")
    : editorT("shell.edgeFields.kind");
  const operationalEdgeSourceLabel = isGraphDiagram
    ? editorT("shell.edgeFields.graphSource")
    : editorT("shell.edgeFields.source");
  const operationalEdgeTargetLabel = isGraphDiagram
    ? editorT("shell.edgeFields.graphTarget")
    : editorT("shell.edgeFields.target");
  const graphSelectedNodeKindLabel =
    graphSelectedNodeSemantic
      ? graphSelectedNodeSemantic.kindLabel
      : null;
  const graphSelectedNodeKindDescription =
    graphSelectedNodeSemantic
      ? graphSelectedNodeSemantic.kindDescription
      : null;
  const hasInspectorDirtyDraft = nodeInspectorDirty || edgeInspectorDirty;
  const isInspectorVisible = !isFocusInspectorCollapsed;
  const shouldShowMetadataPanel = !isCanvasFocusMode;
  const shouldShowPrismaPanel = !isCanvasFocusMode;
  const shouldShowVersionsPanel = !isCanvasFocusMode;
  const contextualActionDefinitions = useMemo(
    () => getContextualActionsForDiagram(currentSupportedDiagramType, editorT),
    [currentSupportedDiagramType, editorT],
  );
  const contextualActions = useMemo(
    () => buildContextualActionsFromDiagramType(currentSupportedDiagramType, editorT),
    [currentSupportedDiagramType, editorT],
  );
  const quickAction = useMemo(() => {
    if (contextualActions[0]) {
      return contextualActions[0];
    }

    const fallbackAction = buildQuickActionFromDiagramType(
      currentSupportedDiagramType,
      editorT,
    );
    return {
      ...fallbackAction,
      label: editorPersona.labels.addPrimary,
      nodeKind: personaDefaultNodeKind,
      edgeKind: editorPersona.quickAdd.defaultEdgeKind,
    };
  }, [
    contextualActions,
    currentSupportedDiagramType,
    editorT,
    editorPersona.labels.addPrimary,
    editorPersona.quickAdd.defaultEdgeKind,
    personaDefaultNodeKind,
  ]);
  const quickAddDefaultRelationLabel = selectedNode
    ? getEdgeKindLabelForDiagram(
        currentSupportedDiagramType,
        quickAction.edgeKind,
        "operational",
        editorT,
      )
    : null;
  const inlineRenameNode = useMemo(
    () =>
      inlineRenameNodeId
        ? nodes.find((node) => node.id === inlineRenameNodeId) ?? null
        : null,
    [inlineRenameNodeId, nodes],
  );
  const secondarySelectionActions = useMemo(
    () => contextualActions.slice(1),
    [contextualActions],
  );
  const hasErdAddFieldAction = useMemo(
    () =>
      contextualActionDefinitions.some(
        (action) => action.id === "erd-add-field" && action.type === "add-field",
      ),
    [contextualActionDefinitions],
  );
  const selectionNodeKindPresentation = selectedNode
    ? getNodeKindPresentation(selectedNode.data.kind, editorT)
    : null;
  const flowSelectionDismissKey = `${selectedNodeId ?? ""}:${selectedEdgeId ?? ""}:${inspectorMode}:${isCanvasFocusMode}`;
  const isSelectedTreeSubtreeCollapsed = selectedNode
    ? collapsedTreeNodeIdSet.has(selectedNode.id)
    : false;
  const inspectorToggleLabel = isInspectorVisible
    ? editorT("shell.inspector.hide")
    : editorT("shell.inspector.show");
  const inspectorSubtitle = useMemo(() => {
    if (!selectedNode && !selectedEdge) {
      return editorT("shell.inspector.subtitle.noneSelected");
    }

    if (selectedEdge) {
      if (currentSupportedDiagramType === "graph") {
        return editorT("shell.inspector.subtitle.graphEdge");
      }

      if (currentSupportedDiagramType === "flow") {
        return processInspectorCopy?.edgeSubtitle ?? editorT("shell.inspector.subtitle.flowEdge");
      }

      return editorT("shell.inspector.subtitle.defaultEdge");
    }

    if (currentSupportedDiagramType === "graph") {
      return editorT("shell.inspector.subtitle.graphNode");
    }

    if (currentSupportedDiagramType === "flow") {
      return processInspectorCopy?.nodeSubtitle ?? editorT("shell.inspector.subtitle.flowNode");
    }

    if (currentSupportedDiagramType === "sitemap") {
      return editorT("shell.inspector.subtitle.sitemap");
    }

    if (currentSupportedDiagramType === "tree") {
      return editorT("shell.inspector.subtitle.tree");
    }

    if (currentSupportedDiagramType === "erd") {
      return editorT("shell.inspector.subtitle.erd");
    }

    if (currentSupportedDiagramType === "timeline") {
      return editorT("shell.inspector.subtitle.timeline");
    }

    if (currentSupportedDiagramType === "mindmap") {
      return editorT("shell.inspector.subtitle.mindmap");
    }

    return editorT("shell.inspector.subtitle.defaultNode");
  }, [currentSupportedDiagramType, editorT, processInspectorCopy, selectedEdge, selectedNode]);
  const diagramDefinitionLabel = layoutMetadata.diagramType
    ? editorT("shell.diagram.current", {
        label: getDiagramTypeLabel(layoutMetadata.diagramType),
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
    const top = inlineRenameNode.position.y * viewport.zoom + viewport.y + topBarOffset;

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
  }, [quickFindActiveIndex, quickFindOptions.length]);

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
      diagramRole: resolveDefaultRoleForKind({
        diagramType: currentSupportedDiagramType,
        kind: defaultKind,
      }),
    }));
  }, [currentSupportedDiagramType, isAddNodeDialogOpen, personaDefaultNodeKind]);

  function handleTogglePanel(panelKey: keyof EditorPanelState) {
    setPanelState((current) => ({
      ...current,
      [panelKey]: !current[panelKey],
    }));
  }

  function handleToggleInspectorSection(sectionKey: keyof InspectorSectionState) {
    setInspectorSections((current) => ({
      ...current,
      [sectionKey]: !current[sectionKey],
    }));
  }

  function handleZoomIn() {
    reactFlowInstanceRef.current?.zoomIn({ duration: 180 });
  }

  function handleZoomOut() {
    reactFlowInstanceRef.current?.zoomOut({ duration: 180 });
  }

  function handleFitView() {
    reactFlowInstanceRef.current?.fitView({ padding: 0.2, duration: 220 });
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
      const source = nodesRef.current.find((node) => node.id === selectedEdge.source);
      const target = nodesRef.current.find((node) => node.id === selectedEdge.target);
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

  function handleOpenQuickFind() {
    quickFindReturnFocusRef.current = document.activeElement as HTMLElement | null;
    setQuickFindQuery("");
    setQuickFindActiveIndex(0);
    setIsQuickFindOpen(true);
  }

  function handleCloseQuickFind() {
    setIsQuickFindOpen(false);
    setQuickFindQuery("");
    window.requestAnimationFrame(() => {
      quickFindReturnFocusRef.current?.focus();
    });
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
    reactFlowInstanceRef.current?.setCenter(targetNode.position.x, targetNode.position.y, {
      zoom: Math.max(viewportRef.current.zoom, 1.05),
      duration: 220,
    });
  }

  function handleOpenRelatedNodeFromRelation(_edgeId: string, relatedNodeId: string) {
    selectItem({ nodeId: relatedNodeId, edgeId: null });
    setIsFocusInspectorCollapsed(false);

    const relatedNode = nodesRef.current.find((node) => node.id === relatedNodeId);
    if (!relatedNode) {
      return;
    }

    reactFlowInstanceRef.current?.setCenter(relatedNode.position.x, relatedNode.position.y, {
      zoom: Math.max(viewportRef.current.zoom, 1.05),
      duration: 220,
    });
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
      const edge = edgesRef.current.find((candidate) => candidate.id === issue.targetId);
      if (!edge) {
        return;
      }

      selectItem({ nodeId: null, edgeId: edge.id });
      const sourceNode = nodesRef.current.find((node) => node.id === edge.source);
      const targetNode = nodesRef.current.find((node) => node.id === edge.target);

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

  async function ensureQueueFlushedBeforeDirectWrite() {
    if (pendingCommandsRef.current.length === 0 && !saveState.isDirty) {
      return true;
    }

    await flushPendingCommands("manual");
    return pendingCommandsRef.current.length === 0 && !isSaveInFlightRef.current;
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

  async function createEdgeOnServer(input: {
    sourceNodeId: string;
    targetNodeId: string;
    edgeKind: EdgeKind;
    openAssistantOnInvalid: boolean;
    allowSemanticOverride?: boolean;
    overrideReason?: string;
  }) {
    const sourceNode = nodesRef.current.find((node) => node.id === input.sourceNodeId);
    const targetNode = nodesRef.current.find((node) => node.id === input.targetNodeId);

    if (!sourceNode || !targetNode) {
      setGlobalErrorMessage(editorT("shell.errors.connectionNodesNotFound"));
      return false;
    }

    try {
      const result = await createEdgeForEditor({
        projectId: project.id,
        edge: {
          id: crypto.randomUUID(),
          sourceNodeId: input.sourceNodeId,
          targetNodeId: input.targetNodeId,
          kind: input.edgeKind,
          label: getEdgeKindLabel(input.edgeKind, "operational"),
          data: {},
        },
        expectedRevision: currentRevisionRef.current,
        semanticMode: inspectorMode,
        allowSemanticOverride: input.allowSemanticOverride,
        overrideReason: input.overrideReason,
      });

      syncFromSnapshot(result.workingSnapshot.snapshot);
      setCurrentRevision(result.newRevision);
      setPendingConnectionAssistant(null);
      setGlobalErrorMessage(null);
      return true;
    } catch (error) {
      if (error instanceof EditorQueryError) {
        if (error.code === "SEMANTIC_VIOLATION" && input.openAssistantOnInvalid) {
          const allowedKinds = Array.isArray(error.payload?.allowedEdgeKinds)
            ? error.payload.allowedEdgeKinds.filter((kind): kind is EdgeKind =>
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
              nodeLabelById.get(input.sourceNodeId) ?? sourceNode.data.label ?? sourceNode.id,
            targetLabel:
              nodeLabelById.get(input.targetNodeId) ?? targetNode.data.label ?? targetNode.id,
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
    const sourceNode = nodesRef.current.find((node) => node.id === input.sourceNodeId);
    const targetNode = nodesRef.current.find((node) => node.id === input.targetNodeId);

    if (!sourceNode || !targetNode) {
      setGlobalErrorMessage(editorT("shell.errors.connectionNodesNotFound"));
      return false;
    }

    const validation = validateEdgeCreation({
      diagramType: semanticDiagramType,
      sourceNode: toRoleAwareSemanticNodeRef({
        diagramType: semanticDiagramType,
        node: sourceNode,
        rootNodeName: layoutMetadata.rootNodeName,
      }),
      targetNode: toRoleAwareSemanticNodeRef({
        diagramType: semanticDiagramType,
        node: targetNode,
        rootNodeName: layoutMetadata.rootNodeName,
      }),
      edgeKind: input.edgeKind,
      mode: inspectorMode,
    }, semanticEngineOptions);

    let nextEdgeKind = input.edgeKind;

    if (!validation.ok) {
      if (input.openAssistantOnInvalid) {
        setPendingConnectionAssistant({
          sourceNodeId: sourceNode.id,
          targetNodeId: targetNode.id,
          sourceLabel:
            nodeLabelById.get(sourceNode.id) ?? sourceNode.data.label ?? sourceNode.id,
          targetLabel:
            nodeLabelById.get(targetNode.id) ?? targetNode.data.label ?? targetNode.id,
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

      nextEdgeKind = validation.recommendedEdgeKind ?? validation.allowedEdgeKinds[0];
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
        label: input.edgeLabel ?? getEdgeKindLabel(nextEdgeKind, "operational"),
        data: {},
      },
    });
  }

  function enterCanvasFocusMode() {
    if (isCanvasFocusMode) {
      return;
    }

    setIsQuickFindOpen(false);
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
  }

  function exitCanvasFocusMode() {
    if (!isCanvasFocusMode) {
      return;
    }

    setIsQuickFindOpen(false);
    setIsCanvasFocusMode(false);
    setPanelState(panelStateBeforeFocusRef.current);
    setIsFocusInspectorCollapsed(false);
  }

  function handleToggleCanvasFocusMode() {
    if (isCanvasFocusMode) {
      exitCanvasFocusMode();
      return;
    }

    enterCanvasFocusMode();
  }

  function handleToggleInspectorVisibility() {
    setIsFocusInspectorCollapsed((current) => !current);
  }

  async function runServerSemanticAudit() {
    try {
      const audit = await runSemanticAuditForEditor({
        projectId: project.id,
        mode: inspectorMode,
      });
      setServerSemanticAudit(audit);
      setQuerySyncMessage(
        editorT("shell.messages.auditCompleted", { count: audit.counters.total }),
      );
      setGlobalErrorMessage(null);
      return audit;
    } catch (error) {
      setServerSemanticAudit(null);
      const message = formatErrorMessage(
        error,
        editorT("shell.errors.serverSemanticAudit"),
      );
      setGlobalErrorMessage(message);
      return null;
    }
  }

  async function handleToggleValidationPanel() {
    const shouldOpen = !isValidationPanelOpen;
    setIsValidationPanelOpen(shouldOpen);

    if (!shouldOpen) {
      return;
    }

    setIsFocusInspectorCollapsed(false);
    await runServerSemanticAudit();
  }

  function clonePayload(payload: Record<string, unknown>) {
    return JSON.parse(JSON.stringify(payload ?? {})) as Record<string, unknown>;
  }

  function buildLayoutNodesFromFlowNodes(inputNodes: RFNode[] = nodesRef.current) {
    return inputNodes
      .filter((node) => !hiddenCanvasNodeIdSet.has(node.id) && node.hidden !== true)
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

  function buildLayoutEdgesFromFlowEdges(inputEdges: RFEdge[] = edgesRef.current) {
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
    const { referenceNode, insertMode, nodeKind, diagramRole } = input;
    const containerRect = canvasRegionRef.current?.getBoundingClientRect();
    const currentViewport = viewportRef.current;
    const contextualLayoutOptions =
      layoutMetadata.layoutOptions &&
      typeof layoutMetadata.layoutOptions === "object" &&
      !Array.isArray(layoutMetadata.layoutOptions)
        ? {
            ...layoutMetadata.layoutOptions,
            insertMode,
            insertNodeKind: nodeKind,
            insertDiagramRole: diagramRole,
          }
        : {
            insertMode,
            insertNodeKind: nodeKind,
            insertDiagramRole: diagramRole,
          };
    const basePosition = computeInsertPosition(
      currentSupportedDiagramType,
      referenceNode
        ? {
            id: referenceNode.id,
            kind: referenceNode.data.kind,
            diagramRole: referenceNode.data.diagramRole,
            position: {
              x: referenceNode.position.x,
              y: referenceNode.position.y,
            },
          }
        : null,
      buildLayoutNodesFromFlowNodes(),
      {
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
      contextualLayoutOptions,
    );

    if (!referenceNode) {
      return basePosition;
    }

    if (insertMode === "timeline-dependency") {
      return {
        x: basePosition.x,
        y: basePosition.y + 140,
      };
    }

    if (insertMode === "tree-sibling" || insertMode === "sitemap-sibling") {
      const siblingCount = edgesRef.current.filter(
        (edge) =>
          (edge.data?.kind ?? "flows-to") === "contains" &&
          edge.source === referenceNode.id,
      ).length;

      return {
        x: basePosition.x + siblingCount * 190,
        y: basePosition.y,
      };
    }

    if (insertMode === "mindmap-reference") {
      return {
        x: Number((referenceNode.position.x + (basePosition.x - referenceNode.position.x) * 0.8).toFixed(2)),
        y: Number((referenceNode.position.y + (basePosition.y - referenceNode.position.y) * 0.8).toFixed(2)),
      };
    }

    if (insertMode === "graph-dependency") {
      return {
        x: basePosition.x,
        y: basePosition.y + 110,
      };
    }

    if (insertMode === "graph-supporting") {
      return {
        x: basePosition.x - 84,
        y: basePosition.y + 88,
      };
    }

    return basePosition;
  }

  function resolveInsertModeFromActionId(
    actionId: SelectionHudQuickAction["id"] | undefined,
  ): ContextualInsertMode {
    if (actionId === "tree-add-child") {
      return "tree-child";
    }

    if (actionId === "tree-add-sibling") {
      return "tree-sibling";
    }

    if (actionId === "sitemap-add-page") {
      return "sitemap-child";
    }

    if (actionId === "sitemap-add-subpage") {
      return "sitemap-sibling";
    }

    if (actionId === "flow-add-next-step") {
      return "flow-next-step";
    }

    if (actionId === "flow-add-branch") {
      return "flow-branch";
    }

    if (actionId === "flow-add-note") {
      return "flow-note";
    }

    if (actionId === "mindmap-add-reference") {
      return "mindmap-reference";
    }

    if (actionId === "mindmap-add-branch") {
      return "mindmap-branch";
    }

    if (actionId === "graph-add-component") {
      return "graph-neighbor";
    }

    if (actionId === "graph-add-dependency") {
      return "graph-dependency";
    }

    if (actionId === "graph-add-supporting-service") {
      return "graph-supporting";
    }

    if (actionId === "timeline-add-milestone") {
      return "timeline-next";
    }

    if (actionId === "timeline-add-dependency") {
      return "timeline-dependency";
    }

    if (actionId === "erd-add-relation") {
      return "erd-relation";
    }

    return "default";
  }

  function resolveSourceNodeIdForContextAction(action: SelectionHudQuickAction) {
    if (!selectedNode) {
      return undefined;
    }

    if (action.id === "tree-add-sibling") {
      const parentEdge = edgesRef.current.find(
        (edge) =>
          (edge.data?.kind ?? "flows-to") === "contains" &&
          edge.target === selectedNode.id,
      );

      return parentEdge?.source ?? selectedNode.id;
    }

    if (action.id === "sitemap-add-subpage") {
      const parentEdge = edgesRef.current.find(
        (edge) =>
          (edge.data?.kind ?? "flows-to") === "contains" &&
          edge.target === selectedNode.id,
      );

      return parentEdge?.source ?? selectedNode.id;
    }

    return selectedNode.id;
  }

  function applyDiagramReflow(input: {
    diagramType: DiagramLayoutType;
    rootId?: string | null;
  }) {
    if (!isDiagramLayoutType(input.diagramType)) {
      return 0;
    }

    const reflowedPositions = computeReflow(
      input.diagramType,
      buildLayoutNodesFromFlowNodes(),
      buildLayoutEdgesFromFlowEdges(),
      input.rootId,
      layoutMetadata.layoutOptions,
    );

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
    if (
      currentSupportedDiagramType === "flow" &&
      (
        input.insertMode === "flow-next-step" ||
        input.insertMode === "flow-branch" ||
        input.insertMode === "flow-note"
      )
    ) {
      const nextPositions = computeFlowContextualNudgePositions({
        nodes: buildLayoutNodesFromFlowNodes(),
        edges: buildLayoutEdgesFromFlowEdges(),
        anchorNodeId: input.sourceNodeId,
        insertedNodeId: input.insertedNodeId,
        insertMode: input.insertMode,
        layoutOptions: layoutMetadata.layoutOptions,
      });

      for (const node of nodesRef.current) {
        const nextPosition = nextPositions[node.id];
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
      return;
    }

    if (
      currentSupportedDiagramType === "tree" &&
      (input.insertMode === "tree-child" || input.insertMode === "tree-sibling")
    ) {
      applyDiagramReflow({
        diagramType: "tree",
      });
      return;
    }

    if (
      currentSupportedDiagramType === "sitemap" &&
      (input.insertMode === "sitemap-child" || input.insertMode === "sitemap-sibling")
    ) {
      applyDiagramReflow({
        diagramType: "sitemap",
      });
      return;
    }

    if (
      currentSupportedDiagramType === "timeline" &&
      (input.insertMode === "timeline-next" || input.insertMode === "timeline-dependency")
    ) {
      applyDiagramReflow({
        diagramType: "timeline",
      });
      return;
    }

    if (
      currentSupportedDiagramType === "graph" &&
      (
        input.insertMode === "graph-neighbor" ||
        input.insertMode === "graph-dependency" ||
        input.insertMode === "graph-supporting"
      )
    ) {
      applyDiagramReflow({
        diagramType: "graph",
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
      ? nodesRef.current.find((node) => node.id === input.sourceNodeId) ?? null
      : null;
    const nextNodeId = crypto.randomUUID();
    const nextNodeIndex = nodesRef.current.length + 1;
    const title =
      input.draft.title.trim() ||
      buildDefaultNodeTitle(
        input.draft.kind,
        nextNodeIndex,
        currentSupportedDiagramType,
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
    const defaultRole =
      currentSupportedDiagramType === "flow" && selectedNodeId
        ? quickAction.id === "flow-add-branch"
          ? "flow-decision"
          : quickAction.id === "flow-add-note"
            ? "flow-note"
            : resolveDefaultRoleForKind({
                diagramType: currentSupportedDiagramType,
                kind: defaultKind,
              })
        : resolveDefaultRoleForKind({
            diagramType: currentSupportedDiagramType,
            kind: defaultKind,
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
    currentSupportedDiagramType,
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
      setInlineRenameErrorMessage("Titulo obrigatorio.");
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
      setInlineRenameErrorMessage("Nao foi possivel renomear o no.");
      return;
    }

      setQuerySyncMessage(editorT("shell.messages.titleUpdated"));
    handleCancelInlineRename();
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
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
        quickFindReturnFocusRef.current = document.activeElement as HTMLElement | null;
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
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [
    handleCancelSemanticOverride,
    handleCancelInlineRename,
    handleCopySelectionToClipboard,
    handleCutSelectionToClipboard,
    handleDuplicateSelection,
    handleOpenAddDialog,
    handlePasteFromClipboard,
    handleRemoveSelected,
    isAddNodeDialogOpen,
    isCanvasFocusMode,
    isQuickFindOpen,
    pendingConnectionAssistant,
    pendingErdQuickRelate,
    pendingNodeRepair,
    pendingSemanticOverride,
    inlineRenameNodeId,
    panelState,
    selectedEdgeId,
    selectedNodeId,
  ]);

  function handleCloseAddDialog() {
    setIsAddNodeDialogOpen(false);
    setAddNodeErrorMessage(null);
  }

  function handleSubmitAddDialog() {
    const normalizedTitle = addNodeDraft.title.trim();
    if (!normalizedTitle) {
      setAddNodeErrorMessage("Titulo obrigatorio.");
      return;
    }

    const appliedNodeId = insertNodeFromDraft({
      draft: {
        ...addNodeDraft,
        title: normalizedTitle,
      },
      sourceNodeId: selectedNode ? resolveSourceNodeIdForContextAction(quickAction) : undefined,
      relationKind: selectedNode ? quickAction.edgeKind : undefined,
      relationLabel: selectedNode ? quickAction.edgeLabel : undefined,
      insertMode: selectedNode
        ? resolveInsertModeFromActionId(quickAction.id)
        : "default",
    });

    if (!appliedNodeId) {
      setAddNodeErrorMessage("Nao foi possivel inserir o novo no.");
      return;
    }

    handleCloseAddDialog();
  }

  function handleAddNode() {
    handleOpenAddDialog();
  }

  function handleAddContextualNode(action: SelectionHudQuickAction = quickAction) {
    if (!selectedNode) {
      handleOpenAddDialog();
      return;
    }

    const nextNodeIndex = nodesRef.current.length + 1;
    const contextualRole =
      currentSupportedDiagramType === "flow"
        ? action.id === "flow-add-branch"
          ? "flow-decision"
          : action.id === "flow-add-note"
            ? "flow-note"
            : resolveDefaultRoleForKind({
                diagramType: currentSupportedDiagramType,
                kind: action.nodeKind,
              })
        : resolveDefaultRoleForKind({
            diagramType: currentSupportedDiagramType,
            kind: action.nodeKind,
          });
    insertNodeFromDraft({
      draft: {
        kind: action.nodeKind,
        diagramRole: contextualRole,
        title: buildDefaultNodeTitle(
          action.nodeKind,
          nextNodeIndex,
          currentSupportedDiagramType,
        ),
        description: "",
        tagsText: "",
      },
      sourceNodeId: resolveSourceNodeIdForContextAction(action),
      relationKind: action.edgeKind,
      relationLabel: action.edgeLabel,
      insertMode: resolveInsertModeFromActionId(action.id),
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
    const entityNode = nodesRef.current.find((node) => node.id === input.entityId);
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
    if (!selectedErdEntityPayload || !selectedNode || selectedNode.data.kind !== "entity") {
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
    if (!selectedNode || renderer.key !== "tree") {
      return;
    }

    const nodeId = selectedNode.id;
    setCollapsedTreeNodeIds((current) =>
      current.includes(nodeId)
        ? current.filter((item) => item !== nodeId)
        : [...current, nodeId],
    );
  }

  function handleCancelConnectionAssistant() {
    setPendingConnectionAssistant(null);
    setQuerySyncMessage(editorT("shell.messages.connectionCancelled"));
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
    if (!selectedEdge || (selectedEdge.data?.kind ?? "flows-to") !== "references") {
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
    if (!selectedEdge || (selectedEdge.data?.kind ?? "flows-to") !== "references") {
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

    const sourceNode = nodesRef.current.find((node) => node.id === selectedEdge.source);
    const targetNode = nodesRef.current.find((node) => node.id === selectedEdge.target);
    if (!sourceNode || !targetNode) {
      return null;
    }
    if (sourceNode.data.kind !== "entity" || targetNode.data.kind !== "entity") {
      return null;
    }

    const sourceEntity: ErdEntityPayload = normalizeErdEntityPayloadFromNode(sourceNode);
    const targetEntity: ErdEntityPayload = normalizeErdEntityPayloadFromNode(targetNode);

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
      setQuerySyncMessage(editorT("shell.messages.erdValidationLevelUpdated", { level }));
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
      if (error instanceof EditorQueryError && error.code === "REPAIR_REQUIRED") {
        const safeFixCount = Array.isArray((error.payload as { suggestedFixes?: unknown })?.suggestedFixes)
          ? ((error.payload as { suggestedFixes?: unknown[] }).suggestedFixes?.length ?? 0)
          : 0;
        setErdExportFeedback({
          kind: "info",
          message:
            safeFixCount > 0
              ? editorT("shell.erd.exportBlockedStrictWithSafeFixes", { count: safeFixCount })
              : editorT("shell.erd.exportBlockedStrict"),
        });
      } else {
        setErdExportFeedback({
          kind: "error",
          message: formatErrorMessage(error, editorT("shell.errors.erdExportPreview")),
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

    const nextPayload = flipErdRelationPayloadDirection(selectedErdRelationPayload);
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
        setQuerySyncMessage(editorT("shell.messages.relationMaterializedExistingField"));
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

    const sourceNode = nodesRef.current.find((node) => node.id === pending.sourceNodeId);
    const targetNode = nodesRef.current.find((node) => node.id === pending.targetNodeId);
    setPendingErdQuickRelate(null);

    if (!sourceNode || !targetNode) {
      setGlobalErrorMessage(editorT("shell.errors.quickRelationEntityNotFound"));
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
          data: normalizeErdRelationPayload(relationPayload as unknown as Record<string, unknown>, {
            sourceEntityId: sourceNode.id,
            targetEntityId: targetNode.id,
          }) as unknown as Record<string, unknown>,
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
          ? sourceEntityRef.label ?? sourceEntityRef.id
          : targetEntityRef.label ?? targetEntityRef.id;
      const referencedLabel =
        inferredDependentSide === "source"
          ? targetEntityRef.label ?? targetEntityRef.id
          : sourceEntityRef.label ?? sourceEntityRef.id;
      setQuerySyncMessage(
        editorT("shell.messages.quickRelationSuggestMaterialize", {
          dependentLabel,
          referencedLabel,
        }),
      );
    } else {
      setQuerySyncMessage(editorT("shell.messages.quickRelationMaterializedAutomatically"));
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
        setGlobalErrorMessage(editorT("shell.errors.finishPendingSaveBeforeRelation"));
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
    setPendingNodeRepair(null);
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
          ? editorT("shell.messages.kindAppliedWithRepair", { count: appliedActions })
          : editorT("shell.messages.kindAppliedWithRemoval", { count: appliedActions }),
      );
  }

  function handleCancelSemanticOverride() {
    setPendingSemanticOverride(null);
    setSemanticOverrideReason("");
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
        formatErrorMessage(error, editorT("shell.errors.applySemanticOverride")),
      );
    }
  }

  function buildClipboardFragmentFromSelection(): MapiaClipboardFragment | null {
    if (selectedNode) {
      return {
        version: 1,
        sourceProjectId: project.id,
        nodes: [
          {
            id: selectedNode.id,
            kind: selectedNode.data.kind,
            label: selectedNode.data.label,
            position: { x: selectedNode.position.x, y: selectedNode.position.y },
            data: clonePayload(selectedNode.data.payload),
          },
        ],
        edges: [],
      };
    }

    if (selectedEdge) {
      const sourceNode = nodesRef.current.find((node) => node.id === selectedEdge.source);
      const targetNode = nodesRef.current.find((node) => node.id === selectedEdge.target);

      if (!sourceNode || !targetNode) {
        return null;
      }

      return {
        version: 1,
        sourceProjectId: project.id,
        nodes: [
          {
            id: sourceNode.id,
            kind: sourceNode.data.kind,
            label: sourceNode.data.label,
            position: { x: sourceNode.position.x, y: sourceNode.position.y },
            data: clonePayload(sourceNode.data.payload),
          },
          {
            id: targetNode.id,
            kind: targetNode.data.kind,
            label: targetNode.data.label,
            position: { x: targetNode.position.x, y: targetNode.position.y },
            data: clonePayload(targetNode.data.payload),
          },
        ],
        edges: [
          {
            id: selectedEdge.id,
            sourceNodeId: selectedEdge.source,
            targetNodeId: selectedEdge.target,
            kind: selectedEdge.data?.kind ?? "flows-to",
            label: selectedEdge.label ? String(selectedEdge.label) : undefined,
            data: clonePayload(selectedEdge.data?.payload ?? {}),
          },
        ],
      };
    }

    return null;
  }

  async function writeMapiaClipboardFragment(fragment: MapiaClipboardFragment) {
    const serialized = JSON.stringify(fragment);
    if (!navigator.clipboard) {
      throw new Error(editorT("shell.errors.clipboardUnavailable"));
    }

    const supportsCustomMime =
      typeof ClipboardItem !== "undefined" && typeof navigator.clipboard.write === "function";

    if (supportsCustomMime) {
      const item = new ClipboardItem({
        [MAPIA_CLIPBOARD_MIME]: new Blob([serialized], {
          type: MAPIA_CLIPBOARD_MIME,
        }),
        "text/plain": new Blob([serialized], { type: "text/plain" }),
      });
      await navigator.clipboard.write([item]);
      return;
    }

    await navigator.clipboard.writeText(serialized);
  }

  async function readMapiaClipboardFragment(): Promise<MapiaClipboardFragment | null> {
    if (!navigator.clipboard) {
      return null;
    }

    if (typeof navigator.clipboard.read === "function") {
      try {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          if (!item.types.includes(MAPIA_CLIPBOARD_MIME)) {
            continue;
          }

          const blob = await item.getType(MAPIA_CLIPBOARD_MIME);
          const text = await blob.text();
          return JSON.parse(text) as MapiaClipboardFragment;
        }
      } catch {
        // Fallback para readText abaixo.
      }
    }

    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        return null;
      }
      const parsed = JSON.parse(text) as Partial<MapiaClipboardFragment>;
      if (parsed.version !== 1 || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
        return null;
      }
      return parsed as MapiaClipboardFragment;
    } catch {
      return null;
    }
  }

  async function handleCopySelectionToClipboard() {
    const fragment = buildClipboardFragmentFromSelection();
    if (!fragment) {
      return false;
    }

    await writeMapiaClipboardFragment(fragment);
    setQuerySyncMessage(editorT("shell.messages.selectionCopied"));
    return true;
  }

  function buildClipboardCommandsDraft(
    fragment: MapiaClipboardFragment,
    options?: {
      edgeFilter?: (edgeCommand: ClipboardAddEdgeCommand) => boolean;
    },
  ): ClipboardCommandsDraft {
    const idMap = new Map<string, string>();
    let skippedEdges = 0;
    const nodeCommands: ClipboardAddNodeCommand[] = [];
    const edgeCommands: ClipboardAddEdgeCommand[] = [];

    for (const node of fragment.nodes) {
      const nextId = crypto.randomUUID();
      idMap.set(node.id, nextId);
      nodeCommands.push({
        type: "addNode",
        node: {
          id: nextId,
          kind: node.kind,
          label: `${node.label} (copia)`,
          position: {
            x: node.position.x + DEFAULT_ADD_NODE_OFFSET.x / 2,
            y: node.position.y + DEFAULT_ADD_NODE_OFFSET.y / 2,
          },
          data: clonePayload(node.data),
        },
      });
    }

    for (const edge of fragment.edges) {
      const sourceNodeId = idMap.get(edge.sourceNodeId);
      const targetNodeId = idMap.get(edge.targetNodeId);
      if (!sourceNodeId || !targetNodeId) {
        skippedEdges += 1;
        continue;
      }

      const edgeCommand: ClipboardAddEdgeCommand = {
        type: "addEdge",
        edge: {
          id: crypto.randomUUID(),
          sourceNodeId,
          targetNodeId,
          kind: edge.kind,
          label: edge.label,
          data: clonePayload(edge.data),
        },
      };
      if (options?.edgeFilter && !options.edgeFilter(edgeCommand)) {
        skippedEdges += 1;
        continue;
      }

      edgeCommands.push(edgeCommand);
    }

    const firstNodeId = nodeCommands[0]?.node.id;

    return {
      nodeCommands,
      edgeCommands,
      skippedEdges,
      firstInsertedNodeId: firstNodeId,
    };
  }

  function applyClipboardCommandsLocally(draft: ClipboardCommandsDraft) {
    let appliedNodes = 0;
    let appliedEdges = 0;

    for (const command of draft.nodeCommands) {
      if (applyLocalCommandAndQueue(command)) {
        appliedNodes += 1;
      }
    }

    for (const command of draft.edgeCommands) {
      if (applyLocalCommandAndQueue(command)) {
        appliedEdges += 1;
      }
    }

    const firstNodeId = draft.firstInsertedNodeId;
    if (firstNodeId) {
      selectItem({ nodeId: firstNodeId, edgeId: null });
    }

    return {
      appliedNodes,
      appliedEdges,
      skippedEdges: draft.skippedEdges,
    };
  }

  async function validateClipboardDraftOnServer(draft: ClipboardCommandsDraft) {
    const commands = [...draft.nodeCommands, ...draft.edgeCommands];
    const projectedSnapshot = applyEditorCommandsLocally(
      getCurrentSnapshot(),
      project.id,
      commands,
    );

    const validation = await validateSemanticDraftForEditor({
      projectId: project.id,
      snapshot: projectedSnapshot,
      mode: inspectorMode,
    });
    setSemanticPolicy(validation.policy);

    const shouldBlock =
      validation.policy.enforceOnServer &&
      validation.policy.strictEnabled &&
      validation.bySeverity.error > 0;

    return {
      validation,
      shouldBlock,
    };
  }

  function filterClipboardEdgesBySemanticRules(
    draft: ClipboardCommandsDraft,
  ): ClipboardCommandsDraft {
    const nodeMap = new Map(
      draft.nodeCommands.map((command) => [
        command.node.id,
        {
          id: command.node.id,
          kind: command.node.kind,
          label: command.node.label,
          payload: command.node.data,
        },
      ] as const),
    );

    const filteredEdgeCommands = draft.edgeCommands.filter((command) => {
      const sourceNode = nodeMap.get(command.edge.sourceNodeId);
      const targetNode = nodeMap.get(command.edge.targetNodeId);
      const semanticCheck = validateEdgeCreation(
        {
          diagramType: semanticDiagramType,
          sourceNode,
          targetNode,
          edgeKind: command.edge.kind,
          mode: inspectorMode,
        },
        semanticEngineOptions,
      );

      return semanticCheck.ok;
    });

    return {
      ...draft,
      edgeCommands: filteredEdgeCommands,
      skippedEdges:
        draft.skippedEdges + (draft.edgeCommands.length - filteredEdgeCommands.length),
    };
  }

  async function applyClipboardFragment(fragment: MapiaClipboardFragment) {
    const fullDraft = buildClipboardCommandsDraft(fragment);
    const hasCommands = fullDraft.nodeCommands.length + fullDraft.edgeCommands.length > 0;
    if (!hasCommands) {
      return {
        appliedNodes: 0,
        appliedEdges: 0,
        skippedEdges: fullDraft.skippedEdges,
      };
    }

    try {
      const initialValidation = await validateClipboardDraftOnServer(fullDraft);
      let draftToApply = fullDraft;

      if (initialValidation.shouldBlock) {
        const allowPartialPaste = isClipboardPartialEdgePasteEnabled(
          initialValidation.validation.policy ?? semanticPolicy,
        );

        if (!allowPartialPaste) {
          const firstError =
            initialValidation.validation.issues.find(
              (issue) => issue.severity === "error",
            ) ?? initialValidation.validation.issues[0];
          setGlobalErrorMessage(
            firstError?.message ?? editorT("shell.errors.pasteBlockedByPolicy"),
          );
          return {
            appliedNodes: 0,
            appliedEdges: 0,
            skippedEdges: fullDraft.skippedEdges,
          };
        }

        const filteredDraft = filterClipboardEdgesBySemanticRules(fullDraft);
        const filteredValidation = await validateClipboardDraftOnServer(filteredDraft);

        if (filteredValidation.shouldBlock) {
          const firstError =
            filteredValidation.validation.issues.find(
              (issue) => issue.severity === "error",
            ) ?? filteredValidation.validation.issues[0];
          setGlobalErrorMessage(
            firstError?.message ?? editorT("shell.errors.pasteBlockedByPolicy"),
          );
          return {
            appliedNodes: 0,
            appliedEdges: 0,
            skippedEdges: filteredDraft.skippedEdges,
          };
        }

        draftToApply = filteredDraft;
      }

      const applied = applyClipboardCommandsLocally(draftToApply);
      setGlobalErrorMessage(null);
      return applied;
    } catch (error) {
      setGlobalErrorMessage(
        formatErrorMessage(
          error,
          editorT("shell.errors.validatePasteWithBackend"),
        ),
      );
      return {
        appliedNodes: 0,
        appliedEdges: 0,
        skippedEdges: fullDraft.skippedEdges,
      };
    }
  }

  async function handleCutSelectionToClipboard() {
    const copied = await handleCopySelectionToClipboard();
    if (!copied) {
      return false;
    }

    handleRemoveSelected();
    setQuerySyncMessage(editorT("shell.messages.selectionCut"));
    return true;
  }

  async function handleDuplicateSelection() {
    const fragment = buildClipboardFragmentFromSelection();
    if (!fragment) {
      return false;
    }

    const result = await applyClipboardFragment(fragment);
    if (result.appliedNodes === 0 && result.appliedEdges === 0) {
      setGlobalErrorMessage(editorT("shell.errors.duplicateCurrentSelection"));
      return false;
    }

    setQuerySyncMessage(
      editorT("shell.messages.duplicateCompleted", {
        nodes: result.appliedNodes,
        edges: result.appliedEdges,
        skippedEdges: result.skippedEdges,
      }),
    );
    return true;
  }

  async function handlePasteFromClipboard() {
    const fragment = await readMapiaClipboardFragment();
    if (!fragment || fragment.nodes.length === 0) {
      setGlobalErrorMessage(editorT("shell.errors.invalidClipboardFragment"));
      return false;
    }

    const result = await applyClipboardFragment(fragment);
    if (result.appliedNodes === 0 && result.appliedEdges === 0) {
      return false;
    }
    setQuerySyncMessage(
      editorT("shell.messages.pasteCompleted", {
        nodes: result.appliedNodes,
        edges: result.appliedEdges,
        skippedEdges: result.skippedEdges,
      }),
    );
    return true;
  }

  function handleOrganizeDiagram() {
    const currentSnapshot = getCurrentSnapshot();

    if (currentSnapshot.allowReapplyLayout === false) {
      setGlobalErrorMessage(
        editorT("shell.errors.layoutBlockedByAssistant"),
      );
      return;
    }

    const layoutDiagramType = resolveSemanticDiagramType(
      currentSnapshot.diagramType,
      renderer.key,
    );

    if (!isDiagramLayoutType(layoutDiagramType)) {
      setGlobalErrorMessage(
        editorT("shell.errors.organizeRequiresSupportedType"),
      );
      return;
    }

    const movedNodes = applyDiagramReflow({
      diagramType: layoutDiagramType,
      rootId: layoutDiagramType === "mindmap" ? semanticRootNodeId : undefined,
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
      setGlobalErrorMessage(
        editorT("shell.errors.layoutBlockedByAssistant"),
      );
      return;
    }

    const layoutDiagramType = resolveSemanticDiagramType(
      currentSnapshot.diagramType,
      renderer.key,
    );

    if (isDiagramLayoutType(layoutDiagramType)) {
      const movedNodes = applyDiagramReflow({
        diagramType: layoutDiagramType,
        rootId: layoutDiagramType === "mindmap" ? semanticRootNodeId : undefined,
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
      const sourceNode = nodesRef.current.find((node) => node.id === connection.source);
      const targetNode = nodesRef.current.find((node) => node.id === connection.target);
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
          targetNode.position.y * viewportState.zoom + viewportState.y + topBarOffset;
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
        setGlobalErrorMessage(editorT("shell.errors.finishPendingSaveBeforeRelation"));
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
          ? buildUpdateNodeCommandFromInspectorForm({
              nodeId: selectedNode.id,
              label: operationalNodeDraft.label,
              kind: operationalNodeDraft.kind,
              dataJson: formatInspectorJson(
                mergeOperationalNodePayload(selectedNode.data.payload, {
                  description: operationalNodeDraft.description,
                  tagsText: operationalNodeDraft.tagsText,
                }),
              ),
            })
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
        setNodeInspectorMessage(editorT("shell.errors.finishPendingSaveBeforeApply"));
        return;
      }

      try {
        const result = await updateNodeForEditor({
          projectId: project.id,
          nodeId: command.nodeId,
          patch: command.patch,
          expectedRevision: currentRevisionRef.current,
          semanticMode: inspectorMode,
        });

        syncFromSnapshot(result.workingSnapshot.snapshot);
        setCurrentRevision(result.newRevision);
        setNodeInspectorMessage(editorT("shell.messages.nodeUpdatedSynced"));
        setGlobalErrorMessage(null);
      } catch (error) {
        if (error instanceof EditorQueryError) {
          if (error.code === "REPAIR_REQUIRED") {
            const repairPlan = error.payload?.repairPlan as RepairPlan | undefined;
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
                const overrideResult = await updateNodeForEditor({
                  projectId: project.id,
                  nodeId: command.nodeId,
                  patch: command.patch,
                  expectedRevision: currentRevisionRef.current,
                  semanticMode: inspectorMode,
                  allowSemanticOverride: true,
                  overrideReason: reason,
                });
                syncFromSnapshot(overrideResult.workingSnapshot.snapshot);
                setCurrentRevision(overrideResult.newRevision);
                setNodeInspectorMessage(editorT("shell.messages.nodeUpdatedWithOverride"));
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
        setEdgeInspectorMessage(editorT("shell.errors.finishPendingSaveBeforeApply"));
        return;
      }

      try {
        const result = await updateEdgeForEditor({
          projectId: project.id,
          edgeId: command.edgeId,
          patch: command.patch,
          expectedRevision: currentRevisionRef.current,
          semanticMode: inspectorMode,
        });
        syncFromSnapshot(result.workingSnapshot.snapshot);
        setCurrentRevision(result.newRevision);
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
                const overrideResult = await updateEdgeForEditor({
                  projectId: project.id,
                  edgeId: command.edgeId,
                  patch: command.patch,
                  expectedRevision: currentRevisionRef.current,
                  semanticMode: inspectorMode,
                  allowSemanticOverride: true,
                  overrideReason: reason,
                });
                syncFromSnapshot(overrideResult.workingSnapshot.snapshot);
                setCurrentRevision(overrideResult.newRevision);
                setEdgeInspectorMessage(editorT("shell.messages.edgeUpdatedWithOverride"));
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
      } ${
        isInspectorVisible ? "" : "editor-grid-inspector-hidden"
      }`}
    >
      <div
        className={`editor-main-column ${isProcessDiagram ? "editor-main-column-process" : ""}`}
      >
        {shouldShowMetadataPanel ? (
          <section className="panel editor-secondary-panel editor-panel-metadata">
            <header className="panel-header">
              <div>
                <h3>{project.name}</h3>
                <p>{editorT("shell.metadata.description")}</p>
              </div>
              <div className="row-actions">
                <span
                  className={`badge ${isSupportedDiagramType(layoutMetadata.diagramType) ? "" : "badge-warning"}`}
                  data-testid="diagram-type-badge"
                >
                  {diagramDefinitionLabel}
                </span>
                <span className="badge" data-testid="visual-mode-badge">
                  {editorT("shell.metadata.visualMode", {
                    mode: editorT(`shell.rendererLabels.${renderer.key}`),
                  })}
                </span>
                <Link
                  className="btn btn-link"
                  href={`/create?fromProjectId=${project.id}`}
                  data-testid="layout-policy-open-wizard-link"
                >
                  {editorT("shell.metadata.changeInAssistant")}
                </Link>
                <span
                  className={`badge ${isReapplyLayoutBlockedByPolicy ? "badge-warning" : ""}`}
                  data-testid="layout-policy-badge"
                >
                  {editorT("shell.metadata.layoutPolicy", { policy: layoutPolicyLabel })}
                </span>
                <button
                  className="btn"
                  type="button"
                  onClick={() => handleTogglePanel("metadata")}
                  aria-expanded={panelState.metadata}
                  data-testid="editor-panel-metadata-toggle"
                >
                  {panelState.metadata
                    ? `▾ ${editorT("shell.metadata.toggleOpen")}`
                    : `▸ ${editorT("shell.metadata.toggleClosed", { count: nodes.length })}`}
                </button>
              </div>
            </header>
            {panelState.metadata ? (
              <div className="panel-body">
                <div className="row-actions editor-toolbar editor-toolbar-meta">
                  <span className="badge">
                    <span className="badge-dot" aria-hidden="true" />
                    {editorT("shell.metadata.workingSnapshot")}
                  </span>
                  <span className="muted">
                    {editorT("shell.metadata.counts", {
                      pendingCount: pendingCommands.length,
                      nodeCount: nodes.length,
                      edgeCount: edges.length,
                    })}
                  </span>
                  {lastSavedAtLabel ? (
                    <span className="muted">
                      {editorT("shell.metadata.lastSavedAt", { time: lastSavedAtLabel })}
                    </span>
                  ) : null}
                  <span className="helper">{saveState.message}</span>
                  {isRefreshingFromQuery ? (
                    <span className="helper">{editorT("shell.sync.syncing")}</span>
                  ) : null}
                  {querySyncMessage ? (
                    <span className="helper">{querySyncMessage}</span>
                  ) : null}
                </div>

                <div className="row-actions editor-toolbar editor-toolbar-actions">
                  <button
                    className="btn"
                    type="button"
                    onClick={handleRemoveSelected}
                    disabled={
                      saveState.status === "saving" || (!selectedNodeId && !selectedEdgeId)
                    }
                    data-testid="remove-selected-button"
                  >
                    {editorT("shell.buttons.removeSelected")}
                  </button>
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={handleManualSave}
                    disabled={saveState.status === "saving" || isCreatingVersion}
                    data-testid="save-button"
                  >
                    {saveState.status === "saving"
                      ? editorT("autosave.saving")
                      : editorT("shell.buttons.save")}
                  </button>
                  <div className="field">
                    <label className="sr-only" htmlFor="new-version-name-input">
                      {editorT("shell.versions.newVersionNameAria")}
                    </label>
                    <input
                      id="new-version-name-input"
                      value={newVersionName}
                      onChange={(event) => setNewVersionName(event.target.value)}
                      placeholder={editorT("shell.versions.newVersionNamePlaceholder")}
                      aria-label={editorT("shell.versions.newVersionNameAria")}
                    />
                  </div>
                  <button
                    className="btn"
                    type="button"
                    onClick={handleCreateVersion}
                    disabled={saveState.status === "saving" || isCreatingVersion}
                    data-testid="create-version-button"
                  >
                    {isCreatingVersion
                      ? editorT("shell.versions.creating")
                      : editorT("shell.versions.create")}
                  </button>
                  <button
                    className="btn"
                    type="button"
                    onClick={handleReapplyLayout}
                    disabled={saveState.status === "saving" || !canReapplyLayout}
                    title={
                      isReapplyLayoutBlockedByPolicy
                        ? editorT("shell.layoutPolicy.blockedTooltip")
                        : undefined
                    }
                    data-testid="reapply-layout-button"
                  >
                    {editorT("shell.buttons.reapplyLayout")}
                  </button>
                  {hasDiagramRendererMismatch ? (
                    <span
                      className="warning-text"
                      data-testid="diagram-renderer-mismatch-warning"
                    >
                      {editorT("shell.metadata.rendererMismatch")}
                    </span>
                  ) : null}
                  {isReapplyLayoutBlockedByPolicy ? (
                    <>
                      <span className="badge badge-warning">
                        {editorT("shell.layoutPolicy.blocked")}
                      </span>
                      <span className="helper">
                        {editorT("shell.layoutPolicy.blockedDescription")}
                      </span>
                    </>
                  ) : null}
                  {versionCreateFeedback ? (
                    <span
                      className="helper"
                      aria-live="polite"
                      role={versionCreateFeedback.kind === "error" ? "alert" : "status"}
                      data-testid="create-version-feedback"
                      data-feedback-kind={versionCreateFeedback.kind}
                    >
                      {versionCreateFeedback.message}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {shouldShowPrismaPanel ? (
          <section
            className="panel editor-secondary-panel editor-panel-prisma"
            aria-label={editorT("shell.prisma.ariaLabel")}
          >
            <header className="panel-header">
              <div>
                <h3>{editorT("shell.prisma.title")}</h3>
                <p>{editorT("shell.prisma.description")}</p>
              </div>
              <button
                className="btn"
                type="button"
                onClick={() => handleTogglePanel("prismaImport")}
                aria-expanded={panelState.prismaImport}
                data-testid="editor-panel-prisma-toggle"
              >
                {panelState.prismaImport
                  ? `▾ ${editorT("shell.prisma.toggleOpen")}`
                  : `▸ ${editorT("shell.prisma.toggleClosed")}`}
              </button>
            </header>
            {panelState.prismaImport ? (
              <div className="panel-body stack-sm" data-testid="prisma-schema-import-panel">
                <div className="row-actions">
                  <button
                    className="btn"
                    type="button"
                    onClick={() => {
                      void handleImportPrismaSchema();
                    }}
                    disabled={
                      saveState.status === "saving" ||
                      isImportingPrismaSchema ||
                      !canImportPrismaSchema
                    }
                    data-testid="prisma-schema-import-button"
                  >
                    {isImportingPrismaSchema
                      ? editorT("shell.prisma.importing")
                      : editorT("shell.prisma.import")}
                  </button>
                  <span className="helper">
                    {editorT("shell.prisma.overwriteWarning")}
                  </span>
                </div>

                <textarea
                  className="mono"
                  rows={8}
                  value={prismaSchemaImportText}
                  onChange={(event) => setPrismaSchemaImportText(event.target.value)}
                  placeholder={`model User {\n  id String @id\n  posts Post[]\n}\n\nmodel Post {\n  id String @id\n  author User?\n}`}
                  data-testid="prisma-schema-import-textarea"
                />

                {prismaSchemaImportFeedback ? (
                  <div
                    className="helper"
                    role={prismaSchemaImportFeedback.kind === "error" ? "alert" : "status"}
                    data-testid="prisma-schema-import-feedback"
                    data-feedback-kind={prismaSchemaImportFeedback.kind}
                  >
                    {prismaSchemaImportFeedback.message}
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}

        {shouldShowVersionsPanel ? (
          <section
            className="panel editor-secondary-panel editor-panel-versions"
            aria-label={editorT("shell.versions.ariaLabel")}
            id="versoes"
          >
            <header className="panel-header">
              <div>
                <h3>{editorT("shell.versions.title")}</h3>
                <p>{editorT("shell.versions.description")}</p>
              </div>
              <button
                className="btn"
                type="button"
                onClick={() => handleTogglePanel("versions")}
                aria-expanded={panelState.versions}
                data-testid="editor-panel-versions-toggle"
              >
                {panelState.versions
                  ? `▾ ${editorT("shell.versions.toggleOpen")}`
                  : `▸ ${editorT("shell.versions.toggleClosed", {
                      count: snapshotVersions.length,
                    })}`}
              </button>
            </header>
            {panelState.versions ? (
              <div className="panel-body stack-sm">
                <div className="row-actions">
                  <button
                    className="btn"
                    type="button"
                    onClick={handleRefreshVersionList}
                    disabled={
                      isRefreshingVersionList ||
                      saveState.status === "saving" ||
                      activeVersionRestoreId !== null
                    }
                    data-testid="version-list-refresh-button"
                  >
                    {isRefreshingVersionList
                      ? editorT("shell.versions.refreshing")
                      : editorT("shell.versions.refresh")}
                  </button>
                  <span className="helper">
                    {editorT("shell.versions.localNameHint")}
                  </span>
                </div>

                {versionActionFeedback ? (
                  <div
                    className="helper"
                    role={versionActionFeedback.kind === "error" ? "alert" : "status"}
                    data-testid="version-action-feedback"
                    data-feedback-kind={versionActionFeedback.kind}
                  >
                    {versionActionFeedback.message}
                  </div>
                ) : null}

                {versionDiffFeedback ? (
                  <div
                    className="helper"
                    role={versionDiffFeedback.kind === "error" ? "alert" : "status"}
                    data-testid="version-diff-feedback"
                    data-feedback-kind={versionDiffFeedback.kind}
                  >
                    {versionDiffFeedback.message}
                  </div>
                ) : null}

                {versionDiffSummary ? (
                  <section
                    className="version-diff-executive"
                    data-testid="version-diff-executive-summary"
                  >
                    <h4>{editorT("shell.versions.summaryTitle")}</h4>
                    <div className="version-diff-cards">
                      <article
                        className="version-diff-card"
                        data-testid="version-diff-card-nodes-added"
                      >
                        <span>{editorT("shell.versions.cards.nodesAdded")}</span>
                        <strong>{versionDiffSummary.cards.nodesAdded}</strong>
                      </article>
                      <article
                        className="version-diff-card"
                        data-testid="version-diff-card-nodes-removed"
                      >
                        <span>{editorT("shell.versions.cards.nodesRemoved")}</span>
                        <strong>{versionDiffSummary.cards.nodesRemoved}</strong>
                      </article>
                      <article
                        className="version-diff-card"
                        data-testid="version-diff-card-nodes-changed"
                      >
                        <span>{editorT("shell.versions.cards.nodesChanged")}</span>
                        <strong>{versionDiffSummary.cards.nodesChanged}</strong>
                      </article>
                      <article
                        className="version-diff-card"
                        data-testid="version-diff-card-edges-changed"
                      >
                        <span>{editorT("shell.versions.cards.edgesChanged")}</span>
                        <strong>{versionDiffSummary.cards.edgesChanged}</strong>
                      </article>
                    </div>
                    <p className="helper">
                      {editorT("shell.versions.changedBreakdown", {
                        renamed: versionDiffSummary.changedBreakdown.renamed,
                        kindChanged: versionDiffSummary.changedBreakdown.kindChanged,
                        payloadChanged: versionDiffSummary.changedBreakdown.payloadChanged,
                      })}
                    </p>
                    <h5>{editorT("shell.versions.topChangesTitle")}</h5>
                    <ul className="summary-list" data-testid="version-diff-top-changes">
                      {versionDiffSummary.topChanges.map((entry, index) => (
                        <li key={`${entry}-${index}`}>{entry}</li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                <div className="stack-sm" data-testid="version-list">
                  {snapshotVersions.length === 0 ? (
                    <div className="helper">
                      {editorT("shell.versions.empty")}
                    </div>
                  ) : (
                    snapshotVersions.map((version) => (
                      <div
                        key={version.id}
                        className="tile"
                        data-testid={`version-item-${version.id}`}
                      >
                        <div className="row-actions row-actions-between">
                          <span className="badge">{getVersionDisplayName(version)}</span>
                          <span className="badge">
                            {editorT("shell.versions.originLabel", {
                              origin: formatVersionOriginLabel(version.origin, editorT),
                            })}
                          </span>
                          <span className="muted">
                            {formatVersionCreatedAtLabel(version.createdAt, locale)}
                          </span>
                        </div>

                        <div className="field">
                          <label htmlFor={`version-name-input-${version.id}`}>
                            {editorT("shell.versions.localNameLabel")}
                          </label>
                          <div className="row-actions">
                            <input
                              id={`version-name-input-${version.id}`}
                              value={versionNameDrafts[version.id] ?? ""}
                              onChange={(event) =>
                                handleVersionNameDraftChange(version.id, event.target.value)
                              }
                              placeholder={editorT("shell.versions.localNamePlaceholder")}
                              data-testid={`version-name-input-${version.id}`}
                            />
                            <button
                              className="btn"
                              type="button"
                              onClick={() => handleSaveVersionName(version.id)}
                              disabled={saveState.status === "saving"}
                              data-testid={`version-save-name-button-${version.id}`}
                            >
                              {editorT("shell.versions.saveName")}
                            </button>
                          </div>
                          <span className="helper">
                            {editorT("shell.versions.localNameDescription")}
                          </span>
                        </div>

                        <div className="row-actions">
                          <button
                            className="btn"
                            type="button"
                            onClick={() => {
                              void handleCompareVersion(version.id);
                            }}
                            disabled={
                              saveState.status === "saving" ||
                              activeVersionRestoreId !== null ||
                              activeVersionCompareId !== null
                            }
                            data-testid={`version-compare-button-${version.id}`}
                          >
                            {activeVersionCompareId === version.id
                              ? editorT("shell.versions.comparing")
                              : editorT("shell.versions.compare")}
                          </button>
                          <button
                            className="btn"
                            type="button"
                            onClick={() => {
                              void handleRestoreVersion(version);
                            }}
                            disabled={
                              saveState.status === "saving" ||
                              isCreatingVersion ||
                              activeVersionRestoreId !== null
                            }
                            data-testid={`version-restore-button-${version.id}`}
                          >
                            {activeVersionRestoreId === version.id
                              ? editorT("shell.versions.restoring")
                              : editorT("shell.versions.restore")}
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : null}
          </section>
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
            renderer.canvasDataAttributes["data-diagram-renderer"] ?? renderer.key
          }
        >
          <div
            className={`canvas-top-bar ${isCanvasFocusMode ? "is-focus-mode" : ""}`}
            role="region"
            aria-label="Barra superior do canvas"
            data-testid="canvas-top-bar"
          >
            <div className="canvas-top-bar-main">
              <strong className="canvas-top-project-name" title={project.name}>
                {project.name}
              </strong>
              <span
                className={saveStatusClassName}
                aria-live="polite"
                data-testid="save-status-badge"
                data-save-status={saveState.status}
              >
                {saveStatusLabel}
              </span>
            </div>
            <div className="canvas-top-bar-actions">
              <button
                className="btn btn-primary"
                type="button"
                onClick={handleAddNode}
                disabled={saveState.status === "saving"}
                data-testid="add-node-button"
              >
                {editorPersona.labels.addPrimary}
              </button>
              {editorPersona.labels.quickActionHint ? (
                <span className="helper">{editorPersona.labels.quickActionHint}</span>
              ) : null}
              <button
                className="btn"
                type="button"
                onClick={handleOpenQuickFind}
                data-testid="canvas-toolbar-quick-find"
              >
                {editorT("shell.topBar.quickFind")}
              </button>
              <button
                className="btn"
                type="button"
                onClick={handleFitView}
                data-testid="center-diagram-button"
              >
                {editorT("shell.topBar.fitView")}
              </button>
              <button
                className="btn"
                type="button"
                onClick={handleOrganizeDiagram}
                data-testid="organize-diagram-button"
              >
                {editorT("shell.topBar.organize")}
              </button>
              <button
                className="btn"
                type="button"
                onClick={handleToggleValidationPanel}
                data-testid="semantic-audit-button"
              >
                {isValidationPanelOpen
                  ? editorT("shell.topBar.hideValidation")
                  : editorT("shell.topBar.showValidation")}
              </button>
              {isErdDiagram ? (
                <label className="erd-validation-level-control">
                  <span>{editorT("shell.topBar.erdValidationLevel")}</span>
                  <select
                    value={erdPolicy.validationLevel}
                    onChange={(event) => {
                      void handleUpdateErdValidationLevel(
                        event.target.value as ErdPolicyConfig["validationLevel"],
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
              <button
                className="btn"
                type="button"
                onClick={handleToggleInspectorVisibility}
                data-testid="canvas-top-inspector-toggle"
              >
                {inspectorToggleLabel}
              </button>
              <button
                className="btn"
                type="button"
                onClick={handleToggleCanvasFocusMode}
                data-testid="editor-focus-toggle"
              >
                {isCanvasFocusMode
                  ? editorT("shell.topBar.exitFocus")
                  : editorT("shell.topBar.enterFocus")}
              </button>
            </div>
          </div>
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
            isProcessDiagram ? (
              <FlowSelectionHud
                dismissKey={flowSelectionDismissKey}
                selectedItemLabel={selectedItemLabel}
                kindChipLabel={flowSelectionChipLabel ?? ""}
                kindChipTone={selectedNode ? selectionNodeKindPresentation?.tone ?? "slate" : null}
                semanticStatusLabel={selectedSemanticStatusLabel}
                semanticStatusSeverity={selectedSemanticSeverity}
                openInspectorLabel={
                  selectedEdge
                    ? editorT("shell.selection.openTransition")
                    : editorT("shell.selection.openInspector")
                }
                primaryAction={
                  selectedNode
                    ? {
                        id: quickAction.id,
                        label: quickAction.label,
                        onClick: () => handleAddContextualNode(),
                      }
                    : undefined
                }
                secondaryActions={
                  selectedNode
                    ? secondarySelectionActions.map((action) => ({
                        id: action.id,
                        label: action.label,
                        onClick: () => handleAddContextualNode(action),
                      }))
                    : []
                }
                onOpenInspector={handleOpenSelectedItemInInspector}
                onCenterView={handleCenterView}
                onDuplicate={selectedNode ? handleDuplicateSelection : undefined}
                onRemove={handleRemoveSelected}
              />
            ) : (
              <div className="canvas-selection-hud" data-testid="canvas-selection-hud">
                <div className="canvas-selection-hud-main">
                  <strong>{selectedItemLabel}</strong>
                  {selectedNode ? (
                    <span
                      className={`badge canvas-selection-kind-chip tone-${selectionNodeKindPresentation?.tone ?? "slate"}`}
                      data-testid="canvas-selection-kind-chip"
                    >
                      {getNodeKindLabelForDiagram(
                        currentSupportedDiagramType,
                        selectedNode.data.kind,
                        "operational",
                        editorT,
                      )}
                      {inspectorMode === "technical"
                        ? editorT("shell.selection.technicalKind", {
                            kind: selectedNode.data.kind,
                          })
                        : ""}
                    </span>
                  ) : selectedEdge ? (
                    <span className="badge canvas-selection-kind-chip" data-testid="canvas-selection-kind-chip">
                      {getEdgeKindLabelForDiagram(
                        currentSupportedDiagramType,
                        selectedEdge.data?.kind ?? "flows-to",
                        "operational",
                        editorT,
                      )}
                      {inspectorMode === "technical"
                        ? editorT("shell.selection.technicalKind", {
                            kind: selectedEdge.data?.kind ?? "flows-to",
                          })
                        : ""}
                    </span>
                  ) : null}
                  <span
                    className={`badge canvas-selection-semantic-status ${
                      selectedSemanticSeverity
                        ? `canvas-selection-semantic-status-${selectedSemanticSeverity}`
                        : ""
                    }`}
                    data-testid="canvas-selection-semantic-status"
                  >
                    {selectedSemanticStatusLabel}
                  </span>
                </div>
                <div className="row-actions canvas-selection-hud-actions">
                  <button
                    className="btn"
                    type="button"
                    onClick={() => setIsFocusInspectorCollapsed(false)}
                  >
                    {editorT("shell.selection.edit")}
                  </button>
                  <button className="btn" type="button" onClick={handleCenterView}>
                    {editorT("shell.selection.center")}
                  </button>
                  {selectedNode ? (
                    <button
                      className="btn"
                      type="button"
                      onClick={() => {
                        void handleDuplicateSelection();
                      }}
                      data-testid="selection-hud-duplicate-button"
                    >
                      {editorT("selectionHud.duplicate")}
                    </button>
                  ) : null}
                  {selectedNode ? (
                    <button
                      className="btn"
                      type="button"
                      onClick={() => handleAddContextualNode()}
                      data-testid="selection-hud-contextual-add-button"
                    >
                      {quickAction.label}
                    </button>
                  ) : null}
                  {selectedNode
                    ? secondarySelectionActions.map((action) => (
                        <button
                          key={action.id}
                          className="btn"
                          type="button"
                          onClick={() => handleAddContextualNode(action)}
                          data-testid={`selection-hud-contextual-secondary-${action.id}`}
                        >
                          {action.label}
                        </button>
                      ))
                    : null}
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
                  {selectedNode && renderer.key === "tree" ? (
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
                  <button className="btn" type="button" onClick={handleRemoveSelected}>
                    {editorT("selectionHud.remove")}
                  </button>
                </div>
              </div>
            )
          ) : null}

          <ReactFlow<RFNode, RFEdge>
            fitView
            nodes={renderedNodes}
            edges={renderedEdges}
            onInit={(instance) => {
              reactFlowInstanceRef.current = instance;
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
            <MiniMap
              pannable
              zoomable
              className={renderer.minimapClassName}
            />
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
                  {pendingErdQuickRelate.sourceLabel} - {pendingErdQuickRelate.targetLabel}
                </span>
              </div>
              <div className="row-actions">
                {(["1:1", "1:N", "N:1", "N:N"] as ErdCardinalityPreset[]).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className="btn"
                    onClick={() => handleSelectErdQuickRelatePreset(preset)}
                    data-testid={`erd-quick-relate-preset-${preset.replace(":", "-")}`}
                  >
                    {preset}
                  </button>
                ))}
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
              <label htmlFor="inline-rename-input">{editorT("shell.inlineRename.label")}</label>
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
                <button className="btn btn-primary" type="submit" data-testid="inline-rename-confirm">
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
              aria-label={editorPersona.labels.addDialogTitle}
              data-testid="add-node-dialog"
              data-quick-add="true"
              onClick={(event) => event.stopPropagation()}
              onSubmit={(event) => {
                event.preventDefault();
                handleSubmitAddDialog();
              }}
            >
              <header className="add-node-dialog-header">
                <h3>{editorPersona.labels.addDialogTitle}</h3>
                <p className="helper">{editorPersona.labels.addDialogHint}</p>
                {selectedNode && quickAddDefaultRelationLabel ? (
                  <p className="helper" data-testid="quick-add-default-connection">
                    {isProcessDiagram
                      ? `Ligacao inicial: ${selectedNode.data.label} ${quickAddDefaultRelationLabel.toLowerCase()} o novo ponto.`
                      : `Conexao padrao: ${selectedNode.data.label} -[${quickAddDefaultRelationLabel}]- novo no.`}
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
                          diagramRole: resolveDefaultRoleForKind({
                            diagramType: currentSupportedDiagramType,
                            kind: option.kind,
                          }),
                        }))
                      }
                      data-testid={`add-node-kind-${option.kind}`}
                    >
                      <span className={`badge add-node-kind-chip tone-${presentation.tone}`}>
                        <svg viewBox={presentation.icon.viewBox} aria-hidden="true" focusable="false">
                          <path d={presentation.icon.path} fill="currentColor" />
                        </svg>
                        {getNodeKindLabelForDiagram(
                          currentSupportedDiagramType,
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
                      const isSelected = addNodeDraft.diagramRole === roleOption.role;

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
                          <span className="helper">{roleOption.description}</span>
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
                <div className="error-box" role="alert" data-testid="add-node-error">
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
                <button className="btn btn-primary" type="submit" data-testid="add-node-confirm-button">
                  {editorPersona.labels.addConfirm}
                </button>
              </div>
            </form>
          </div>
        ) : null}

        <ConnectionAssistant
          open={pendingConnectionAssistant !== null}
          mode={inspectorMode}
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
                    (violation) => `${violation.severity.toUpperCase()}: ${violation.message}`,
                  ),
                  ...pendingNodeRepair.repairPlan.actions.map((action) => {
                    if (action.type === "updateEdgeKind") {
                      return editorT("shell.repair.updateRelation", {
                        edgeId: action.edgeId,
                        nextKind: getEdgeKindLabel(action.nextKind, "operational", editorT),
                      });
                    }
                    if (action.type === "removeEdge") {
                      return editorT("shell.repair.removeInvalidRelation", {
                        edgeId: action.edgeId,
                      });
                    }
                    return editorT("shell.repair.adjustNodeKind", {
                      nextKind: getNodeKindLabel(action.nextKind, "operational", editorT),
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
                  onChange={(event) => setSemanticOverrideReason(event.target.value)}
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
        <aside
          className={`inspector ${isProcessDiagram ? "inspector-process" : ""}`}
          aria-label={editorT("shell.inspector.ariaLabel")}
          data-testid="inspector-panel"
        >
          <div className="inspector-header">
            <div className="row-actions inspector-selection-row">
              <span className="badge">{inspectorSelectionBadge}</span>
              {hasInspectorDirtyDraft ? (
                <span className="badge editor-save-badge editor-save-badge-dirty editor-draft-badge">
                  {editorT("shell.inspector.draftBadge")}
                </span>
              ) : null}
            </div>
            <h3 className="inspector-selection-title" title={selectedItemLabel}>
              {selectedItemLabel}
            </h3>
            <p className="helper inspector-subtitle">
              {inspectorSubtitle}
            </p>
          </div>

          <div
            className="row-actions inspector-mode-toggle"
            role="group"
            aria-label={editorT("shell.inspector.modeAria")}
            data-testid="inspector-mode-toggle"
          >
            <button
              className={`btn ${inspectorMode === "operational" ? "btn-primary" : ""}`}
              type="button"
              aria-pressed={inspectorMode === "operational"}
              onClick={() => setInspectorMode("operational")}
              data-testid="inspector-operational"
            >
              {editorT("shell.inspector.modeOperational")}
            </button>
            <button
              className={`btn ${inspectorMode === "technical" ? "btn-primary" : ""}`}
              type="button"
              aria-pressed={inspectorMode === "technical"}
              onClick={() => setInspectorMode("technical")}
              data-testid="inspector-technical"
            >
              {editorT("shell.inspector.modeTechnical")}
            </button>
          </div>

          <section
            className={`semantic-audit-panel ${isValidationPanelOpen ? "is-open" : ""}`}
            aria-label={editorT("shell.audit.ariaLabel")}
            data-testid="semantic-audit-panel"
          >
            <div className="row-actions semantic-audit-header">
              <strong>{editorT("shell.audit.title")}</strong>
              <span className="badge">
                {editorT("shell.audit.summary", {
                  total: displayedSemanticAudit.counters.total,
                  errors: displayedSemanticAudit.bySeverity.error,
                })}
              </span>
              {isErdDiagram && localErdSafeBatchFix?.safeFixes.length ? (
                <button
                  className="btn"
                  type="button"
                  onClick={handleApplyAllSafeErdFixes}
                  data-testid="semantic-audit-apply-all-safe-fixes"
                >
                  {editorT("shell.audit.applyAllSafeFixes")}
                </button>
              ) : null}
            </div>

            {isValidationPanelOpen ? (
              displayedSemanticAudit.issues.length > 0 ? (
                <>
                  {isErdDiagram && localErdSafeBatchFix?.safeFixes.length ? (
                    <ul className="summary-list semantic-safe-fix-preview">
                      {localErdSafeBatchFix.safeFixes.slice(0, 6).map((fix) => (
                        <li key={fix.id}>
                          {fix.description ? `${fix.label}: ${fix.description}` : fix.label}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <ul className="summary-list semantic-audit-list" data-testid="semantic-audit-issues">
                    {displayedSemanticAudit.issues.slice(0, 40).map((issue, index) => {
                      const issueFixes = readIssueSuggestedFixes(issue);
                      return (
                        <li
                          key={issue.id}
                          className={`semantic-audit-item semantic-audit-item-${issue.severity}`}
                          data-testid={`semantic-issue-item-${index}`}
                        >
                          <div className="semantic-audit-item-main">
                            <strong>{getSemanticSeverityLabel(issue.severity, editorT)}</strong>
                            <span>{issue.message}</span>
                            {issue.explanation ? (
                              <span className="helper">{issue.explanation}</span>
                            ) : null}
                          </div>
                          <div className="row-actions">
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
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : (
                <p className="helper" data-testid="semantic-audit-empty">
                  {editorT("shell.audit.empty")}
                </p>
              )
            ) : (
              <p className="helper">{editorT("shell.audit.collapsedHint")}</p>
            )}
          </section>

          {selectedNode &&
          inspectorMode === "operational" &&
          isErdDiagram &&
          selectedNode.data.kind === "entity" &&
          selectedErdEntityPayload ? (
            <div className="stack-sm erd-entity-inspector">
              <div className="row-actions inspector-selection-row">
                <span className="badge">{editorT("shell.erd.entity.badge")}</span>
                {nodeInspectorDirty ? (
                  <span className="badge editor-save-badge editor-save-badge-dirty editor-draft-badge">
                    {editorT("shell.inspector.draftBadge")}
                  </span>
                ) : null}
              </div>

              <div className="field">
                <label htmlFor="erd-entity-label-input">{editorT("shell.erd.entity.nameLabel")}</label>
                <input
                  id="erd-entity-label-input"
                  value={operationalNodeDraft?.label ?? selectedNode.data.label}
                  onChange={(event) =>
                    setOperationalNodeDraft((current) =>
                      current ? { ...current, label: event.target.value } : current,
                    )
                  }
                  data-testid="erd-entity-label-input"
                />
              </div>

              <div className="field">
                <label htmlFor="erd-entity-table-name-input">
                  {editorT("shell.erd.entity.tableNameLabel")}
                </label>
                <input
                  id="erd-entity-table-name-input"
                  defaultValue={selectedErdEntityPayload.tableName ?? ""}
                  key={`erd-table-name-${selectedNode.id}-${selectedErdEntityPayload.tableName ?? ""}`}
                  onBlur={(event) => {
                    const tableName = event.target.value.trim();
                    updateSelectedErdEntityPayload((payload) => ({
                      ...payload,
                      ...(tableName ? { tableName } : { tableName: undefined }),
                    }));
                  }}
                  placeholder={editorT("shell.erd.entity.tableNamePlaceholder")}
                  data-testid="erd-entity-table-name-input"
                />
              </div>

              <div className="field">
                <label htmlFor="erd-entity-description-input">
                  {editorT("shell.erd.entity.descriptionLabel")}
                </label>
                <textarea
                  id="erd-entity-description-input"
                  rows={2}
                  defaultValue={selectedErdEntityPayload.description ?? ""}
                  key={`erd-description-${selectedNode.id}-${selectedErdEntityPayload.description ?? ""}`}
                  onBlur={(event) => {
                    const description = event.target.value.trim();
                    updateSelectedErdEntityPayload((payload) => ({
                      ...payload,
                      ...(description ? { description } : { description: undefined }),
                    }));
                  }}
                  data-testid="erd-entity-description-input"
                />
              </div>

              <div className="erd-fields-grid" data-testid="erd-entity-fields-grid">
                <div className="erd-fields-grid-header">
                  <span>{editorT("shell.erd.entity.grid.name")}</span>
                  <span>{editorT("shell.erd.entity.grid.type")}</span>
                  <span>{editorT("shell.erd.entity.grid.flags")}</span>
                  <span>{editorT("shell.erd.entity.grid.actions")}</span>
                </div>
                {selectedErdEntityPayload.fields.map((field, index) => {
                  const draft = erdFieldDrafts[field.id] ?? {
                    name: field.name,
                    type: field.type,
                  };
                  const nextField = selectedErdEntityPayload.fields[index + 1];

                  return (
                    <div
                      key={field.id}
                      className="erd-fields-grid-row"
                      data-testid={`erd-field-row-${field.id}`}
                    >
                      <input
                        value={draft.name}
                        onChange={(event) =>
                          handleUpdateErdFieldDraft(field.id, { name: event.target.value })
                        }
                        onBlur={() => commitErdFieldDraft(field.id)}
                        onKeyDown={(event) => {
                          handleErdFieldShortcut(event, field.id);
                          if (event.key !== "Enter") {
                            return;
                          }

                          event.preventDefault();
                          commitErdFieldDraft(field.id);
                          if (nextField) {
                            window.requestAnimationFrame(() => {
                              document
                                .querySelector<HTMLInputElement>(
                                  `[data-erd-field-input="${nextField.id}:name"]`,
                                )
                                ?.focus();
                            });
                            return;
                          }

                          handleAddErdField();
                        }}
                        data-erd-field-input={`${field.id}:name`}
                        data-testid={`erd-field-name-input-${index}`}
                      />
                      <input
                        value={draft.type}
                        onChange={(event) =>
                          handleUpdateErdFieldDraft(field.id, { type: event.target.value })
                        }
                        onBlur={() => commitErdFieldDraft(field.id)}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter") {
                            handleErdFieldShortcut(event, field.id);
                            return;
                          }

                          event.preventDefault();
                          commitErdFieldDraft(field.id);
                          if (nextField) {
                            window.requestAnimationFrame(() => {
                              document
                                .querySelector<HTMLInputElement>(
                                  `[data-erd-field-input="${nextField.id}:name"]`,
                                )
                                ?.focus();
                            });
                            return;
                          }
                          handleAddErdField();
                        }}
                        list="erd-logical-types"
                        data-erd-field-input={`${field.id}:type`}
                        data-testid={`erd-field-type-input-${index}`}
                      />
                      <div className="row-actions erd-field-flags">
                        {(["PK", "FK", "UQ", "NOT_NULL"] as ErdFieldFlag[]).map((flag) => (
                          <button
                            key={flag}
                            className={`btn btn-link erd-field-flag-chip ${
                              field.flags.includes(flag) ? "is-active" : ""
                            }`}
                            type="button"
                            onClick={() => handleToggleErdFieldFlag(field.id, flag)}
                            data-testid={`erd-field-flag-${flag.toLowerCase()}-${index}`}
                          >
                            {flag === "NOT_NULL" ? "N" : flag}
                          </button>
                        ))}
                      </div>
                      <div className="row-actions">
                        <button
                          className="btn"
                          type="button"
                          onClick={() => handleMoveErdField(field.id, "up")}
                          disabled={index === 0}
                          data-testid={`erd-field-move-up-${index}`}
                        >
                          ↑
                        </button>
                        <button
                          className="btn"
                          type="button"
                          onClick={() => handleMoveErdField(field.id, "down")}
                          disabled={index === selectedErdEntityPayload.fields.length - 1}
                          data-testid={`erd-field-move-down-${index}`}
                        >
                          ↓
                        </button>
                        <button
                          className="btn"
                          type="button"
                          onClick={() => handleRemoveErdField(field.id)}
                          data-testid={`erd-field-remove-${index}`}
                        >
                          {editorT("selectionHud.remove")}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <datalist id="erd-logical-types">
                <option value="string" />
                <option value="text" />
                <option value="integer" />
                <option value="uuid" />
                <option value="datetime" />
                <option value="boolean" />
                <option value="json" />
                <option value="decimal" />
              </datalist>

              <div className="row-actions">
                <button
                  className="btn"
                  type="button"
                  onClick={handleAddErdField}
                  data-testid="erd-fields-add-button"
                >
                  {editorT("shell.erd.entity.addField")}
                </button>
                <span className="helper">
                  {editorT("shell.erd.entity.keyboardHint")}
                </span>
              </div>

              {nodeInspectorMessage ? (
                <div
                  className={`inspector-feedback ${nodeInspectorHasErrors ? "is-error" : ""}`}
                  aria-live="polite"
                  data-testid="inspector-node-feedback"
                >
                  {nodeInspectorMessage}
                </div>
              ) : null}

              <div className="row-actions inspector-actions">
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={handleApplyNodeInspector}
                  disabled={saveState.status === "saving"}
                  data-testid="inspector-apply-node"
                >
                  {editorT("shell.applyChanges")}
                </button>
                <button
                  className="btn"
                  type="button"
                  onClick={handleNodeInspectorReset}
                  data-testid="inspector-reset-node"
                >
                  {editorT("shell.revert")}
                </button>
              </div>
            </div>
          ) : null}

          {selectedNode &&
          inspectorMode === "operational" &&
          operationalNodeDraft &&
          (!isErdDiagram || selectedNode.data.kind !== "entity") &&
          isProcessDiagram &&
          processNodeInspectorModel &&
          processSelectedNodeRelations ? (
              <ProcessOperationalNodeInspector
                copy={processNodeInspectorModel.copy}
                overview={processNodeInspectorModel.overview}
                relations={processSelectedNodeRelations}
                draft={operationalNodeDraft}
                nodeKindOptions={nodeKindOptions}
                sections={{
                  general: inspectorSections.general,
                  details: inspectorSections.details,
                  relations: inspectorSections.relations,
                }}
                tagPreview={operationalTagPreview}
                nodeInspectorErrors={nodeInspectorErrors}
                nodeInspectorMessage={nodeInspectorMessage}
                nodeInspectorHasErrors={nodeInspectorHasErrors}
                isSaving={saveState.status === "saving"}
                primaryAction={{
                  id: quickAction.id,
                  label: quickAction.label,
                  onClick: () => handleAddContextualNode(quickAction),
                }}
                secondaryActions={secondarySelectionActions.slice(0, 2).map((action) => ({
                  id: action.id,
                  label: action.label,
                  onClick: () => handleAddContextualNode(action),
                }))}
                onToggleSection={handleToggleInspectorSection}
                onLabelChange={(value) =>
                  setOperationalNodeDraft((current) =>
                    current ? { ...current, label: value } : current,
                  )
                }
                onKindChange={(kind) =>
                  setOperationalNodeDraft((current) =>
                    current ? { ...current, kind } : current,
                  )
                }
                onDescriptionChange={(value) =>
                  setOperationalNodeDraft((current) =>
                    current ? { ...current, description: value } : current,
                  )
                }
                onTagsChange={(value) =>
                  setOperationalNodeDraft((current) =>
                    current ? { ...current, tagsText: value } : current,
                  )
                }
                onOpenRelatedNode={handleOpenRelatedNodeFromRelation}
                onOpenTransition={handleOpenTransitionFromRelation}
                onRemoveRelation={handleRemoveRelation}
                onApply={handleApplyNodeInspector}
                onReset={handleNodeInspectorReset}
              />
          ) : null}

          {selectedNode &&
          inspectorMode === "operational" &&
          operationalNodeDraft &&
          (!isErdDiagram || selectedNode.data.kind !== "entity") &&
          !isProcessDiagram ? (
              <div className="stack-sm">
                <div className="row-actions inspector-selection-row">
                  <span className="badge">{inspectorSelectionBadge}</span>
                  {nodeInspectorDirty ? (
                    <span className="badge editor-save-badge editor-save-badge-dirty editor-draft-badge">
                      {editorT("shell.inspector.draftBadge")}
                    </span>
                  ) : null}
                </div>

              {graphSelectedNodeSemantic ? (
                <div
                  className="tile inspector-context-tile inspector-context-tile--graph"
                  data-testid="graph-inspector-overview"
                >
                  <div className="row-actions">
                    <span className="badge">{graphSelectedNodeSemantic.roleBadgeLabel}</span>
                    <span className="badge">{graphSelectedNodeSemantic.kindLabel}</span>
                  </div>
                  <h4>{editorT("shell.graph.readingTitle")}</h4>
                  <p className="helper">{graphSelectedNodeSemantic.summary}</p>
                  <dl className="inspector-meta-list">
                    <div>
                      <dt>{editorT("shell.graph.networkPosition")}</dt>
                      <dd>{graphSelectedNodeSemantic.footprintLabel}</dd>
                    </div>
                    <div>
                      <dt>{editorT("shell.inspector.neighborhood")}</dt>
                      <dd>{graphSelectedNodeSemantic.connectivityLabel}</dd>
                    </div>
                  </dl>
                  <div
                    className="row-actions"
                    data-testid="graph-inspector-context-actions"
                  >
                    <button
                      className="btn"
                      type="button"
                      onClick={() => handleAddContextualNode(quickAction)}
                    >
                      {quickAction.label}
                    </button>
                    {secondarySelectionActions.slice(0, 2).map((action) => (
                      <button
                        key={action.id}
                        className="btn"
                        type="button"
                        onClick={() => handleAddContextualNode(action)}
                        data-testid={`graph-inspector-action-${action.id}`}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="row-actions inspector-section-tabs">
                <button
                  className="btn inspector-section-toggle"
                  type="button"
                  onClick={() => handleToggleInspectorSection("general")}
                  aria-expanded={inspectorSections.general}
                  data-testid="inspector-section-general-toggle"
                >
                  {operationalGeneralSectionTitle} {inspectorSections.general ? "▾" : "▸"}
                </button>
                <button
                  className="btn inspector-section-toggle"
                  type="button"
                  onClick={() => handleToggleInspectorSection("details")}
                  aria-expanded={inspectorSections.details}
                  data-testid="inspector-section-details-toggle"
                >
                  {operationalDetailsSectionTitle} {inspectorSections.details ? "▾" : "▸"}
                </button>
                <button
                  className="btn inspector-section-toggle"
                  type="button"
                  onClick={() => handleToggleInspectorSection("relations")}
                  aria-expanded={inspectorSections.relations}
                  data-testid="inspector-section-relations-toggle"
                >
                  {operationalRelationsSectionTitle} {inspectorSections.relations ? "▾" : "▸"}
                </button>
              </div>

              {inspectorSections.general ? (
                <>
                  <div className="field">
                    <label htmlFor="node-title-input">{operationalNodeTitleLabel}</label>
                    <input
                      id="node-title-input"
                      data-testid="inspector-node-label"
                      value={operationalNodeDraft.label}
                      onChange={(event) =>
                        setOperationalNodeDraft((current) =>
                          current ? { ...current, label: event.target.value } : current,
                        )
                      }
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="node-kind-operational-input">
                      {operationalNodeKindLabel}
                    </label>
                    <select
                      id="node-kind-operational-input"
                      data-testid="inspector-node-kind"
                      value={operationalNodeDraft.kind}
                      onChange={(event) =>
                        setOperationalNodeDraft((current) =>
                          current
                            ? {
                                ...current,
                                kind: event.target.value as OperationalNodeDraft["kind"],
                              }
                            : current,
                        )
                      }
                    >
                      {nodeKindOptions.map((option) => (
                        <option key={option.kind} value={option.kind}>
                          {getNodeKindLabelForDiagram(
                            currentSupportedDiagramType,
                            option.kind,
                            "operational",
                            editorT,
                          )}
                          {option.outOfProfile
                            ? editorT("shell.inspector.outOfProfileSuffix")
                            : ""}
                        </option>
                      ))}
                    </select>
                    <span className="helper">
                      {getNodeKindDescriptionForDiagram(
                        currentSupportedDiagramType,
                        operationalNodeDraft.kind,
                        editorT,
                      )}
                    </span>
                  </div>
                </>
              ) : null}

              {inspectorSections.details ? (
                <>
                  <div className="field">
                    <label htmlFor="node-description-operational-input">
                      {operationalNodeDescriptionLabel}
                    </label>
                    <textarea
                      id="node-description-operational-input"
                      rows={3}
                      value={operationalNodeDraft.description}
                      onChange={(event) =>
                        setOperationalNodeDraft((current) =>
                          current
                            ? { ...current, description: event.target.value }
                            : current,
                        )
                      }
                      placeholder={operationalNodeDescriptionPlaceholder}
                      data-testid="inspector-node-description"
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="node-tags-operational-input">
                      {operationalNodeTagsLabel}
                    </label>
                    <input
                      id="node-tags-operational-input"
                      value={operationalNodeDraft.tagsText}
                      onChange={(event) =>
                        setOperationalNodeDraft((current) =>
                          current ? { ...current, tagsText: event.target.value } : current,
                        )
                      }
                      placeholder={operationalNodeTagsPlaceholder}
                      data-testid="inspector-node-tags"
                    />
                    <span className="helper">{operationalNodeTagsHelper}</span>
                  </div>

                  {operationalTagPreview.length > 0 ? (
                    <div className="row-actions">
                      {operationalTagPreview.map((tag) => (
                        <span key={tag} className="badge">
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <div
                    className={`tile inspector-context-tile ${
                      isGraphDiagram ? "inspector-context-tile--graph" : ""
                    }`}
                    data-testid={isGraphDiagram ? "graph-inspector-context" : undefined}
                  >
                    <h4>{operationalNodeContextTitle}</h4>
                    <p className="helper">
                      {editorT("shell.inspector.currentRole")}{" "}
                      <strong>{selectedNodeRoleLabel ?? editorT("shell.roles.undefined")}</strong>
                    </p>
                    {isGraphDiagram ? (
                      <dl className="inspector-meta-list">
                        <div>
                          <dt>{editorT("shell.inspector.dominantReading")}</dt>
                          <dd>{graphSelectedNodeKindLabel ?? editorT("graph.nodeKinds.entity.labelOperational")}</dd>
                        </div>
                        <div>
                          <dt>{editorT("shell.inspector.neighborhood")}</dt>
                          <dd>
                            {editorT("shell.inspector.neighborhoodSummary", {
                              incomingCount: selectedNodeRelations.incomingCount,
                              outgoingCount: selectedNodeRelations.outgoingCount,
                            })}
                          </dd>
                        </div>
                      </dl>
                    ) : null}
                    {isGraphDiagram && graphSelectedNodeKindDescription ? (
                      <p className="helper">{graphSelectedNodeKindDescription}</p>
                    ) : null}
                    <ul className="summary-list">
                      {selectedNodeStructureTips.map((tip) => (
                        <li key={tip}>{tip}</li>
                      ))}
                    </ul>
                  </div>
                </>
              ) : null}

              {nodeInspectorErrors.label ? (
                <span className="helper field-error" role="alert">
                  {nodeInspectorErrors.label}
                </span>
              ) : null}
              {nodeInspectorErrors.kind ? (
                <span className="helper field-error" role="alert">
                  {nodeInspectorErrors.kind}
                </span>
              ) : null}

              {inspectorSections.relations ? (
                <div className="tile">
                  <h4>{operationalRelationsSectionTitle}</h4>
                  <p className="helper">
                    {isGraphDiagram
                      ? editorT("shell.relations.graphSummary", {
                          incomingCount: selectedNodeRelations.incomingCount,
                          outgoingCount: selectedNodeRelations.outgoingCount,
                        })
                      : editorT("shell.relations.flowSummary", {
                          incomingCount: selectedNodeRelations.incomingCount,
                          outgoingCount: selectedNodeRelations.outgoingCount,
                        })}
                  </p>
                  {selectedNodeRelations.preview.length > 0 ? (
                    <ul className="summary-list inspector-relation-list">
                      {selectedNodeRelations.preview.map((relation) => (
                        <li
                          key={relation.id}
                          className={`inspector-relation-item ${
                            relation.lane ? `inspector-relation-item--${relation.lane}` : ""
                          }`}
                        >
                          <div className="inspector-relation-item__head">
                            <span className="badge">{relation.directionLabel}</span>
                          </div>
                          <p className="inspector-relation-item__peer">{relation.otherLabel}</p>
                          <p className="helper inspector-relation-item__path">
                            {`${relation.sourceLabel} -> ${relation.targetLabel}`}
                          </p>
                          <div className="row-actions inspector-relation-item__actions">
                            <button
                              className="btn btn-link"
                              type="button"
                              onClick={() =>
                                handleOpenRelatedNodeFromRelation(
                                  relation.id,
                                  relation.otherNodeId,
                                )
                              }
                            >
                              {isGraphDiagram
                                ? editorT("shell.relations.openComponent")
                                : editorT("shell.relations.openRelatedNode")}
                            </button>
                            <button
                              className="btn btn-link"
                              type="button"
                              onClick={() => handleOpenTransitionFromRelation(relation.id)}
                            >
                              {editorT("shell.relations.editConnection")}
                            </button>
                            <button
                              className="btn btn-link btn-danger"
                              type="button"
                              onClick={() => handleRemoveRelation(relation.id)}
                            >
                              {editorT("selectionHud.remove")}
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="helper">
                      {isGraphDiagram
                        ? editorT("shell.relations.emptyGraph")
                        : editorT("shell.relations.empty")}
                    </p>
                  )}
                </div>
              ) : null}

              {nodeInspectorMessage ? (
                <div
                  className={`inspector-feedback ${nodeInspectorHasErrors ? "is-error" : ""}`}
                  aria-live="polite"
                  data-testid="inspector-node-feedback"
                >
                  {nodeInspectorMessage}
                </div>
              ) : null}

              <div className="row-actions inspector-actions">
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={handleApplyNodeInspector}
                  disabled={saveState.status === "saving"}
                  data-testid="inspector-apply-node"
                >
                  {editorT("shell.applyChanges")}
                </button>
                <button
                  className="btn"
                  type="button"
                  onClick={handleNodeInspectorReset}
                  data-testid="inspector-reset-node"
                >
                  {editorT("shell.revert")}
                </button>
              </div>
              </div>
          ) : null}

          {selectedNode && inspectorMode === "technical" && nodeInspectorDraft ? (
          <div className="stack-sm">
            <div className="row-actions inspector-selection-row">
              <span className="badge">{inspectorSelectionBadge}</span>
              {nodeInspectorDirty ? (
                <span className="badge editor-save-badge editor-save-badge-dirty editor-draft-badge">
                  {editorT("shell.inspector.draftBadge")}
                </span>
                ) : null}
            </div>
            <span className="sr-only" data-testid="inspector-node-id">
              {selectedNode.id}
            </span>

            <div className="row-actions inspector-section-tabs">
              <button
                className="btn inspector-section-toggle"
                type="button"
                onClick={() => handleToggleInspectorSection("general")}
                aria-expanded={inspectorSections.general}
                data-testid="inspector-section-general-toggle"
              >
                {editorT("shell.technical.generalSection")} {inspectorSections.general ? "▾" : "▸"}
              </button>
              <button
                className="btn inspector-section-toggle"
                type="button"
                onClick={() => handleToggleInspectorSection("details")}
                aria-expanded={inspectorSections.details}
                data-testid="inspector-section-details-toggle"
              >
                {editorT("shell.technical.detailsSection")} {inspectorSections.details ? "▾" : "▸"}
              </button>
              <button
                className="btn inspector-section-toggle"
                type="button"
                onClick={() => handleToggleInspectorSection("advanced")}
                aria-expanded={inspectorSections.advanced}
                data-testid="inspector-section-advanced-toggle"
              >
                {editorT("shell.technical.advancedSection")} {inspectorSections.advanced ? "▾" : "▸"}
              </button>
            </div>

            {inspectorSections.general ? (
              <>
                <div className="field">
                  <label htmlFor="node-label-input">{editorT("shell.technical.node.label")}</label>
                  <input
                    id="node-label-input"
                    data-testid="inspector-node-label"
                    value={nodeInspectorDraft.label}
                    onChange={(event) =>
                      setNodeInspectorDraft((current) =>
                        current ? { ...current, label: event.target.value } : current,
                      )
                    }
                  />
                  {nodeInspectorErrors.label ? (
                    <span className="helper field-error" role="alert">
                      {nodeInspectorErrors.label}
                    </span>
                  ) : null}
                </div>

                <div className="field">
                  <label htmlFor="node-kind-input">{editorT("shell.technical.node.rawKind")}</label>
                  <select
                    id="node-kind-input"
                    data-testid="inspector-node-kind"
                    value={nodeInspectorDraft.kind}
                    onChange={(event) =>
                      setNodeInspectorDraft((current) =>
                        current
                          ? {
                              ...current,
                              kind: event.target.value as NodeInspectorDraft["kind"],
                            }
                          : current,
                      )
                    }
                  >
                    {nodeKindOptions.map((option) => (
                      <option key={option.kind} value={option.kind}>
                        {option.kind}
                        {option.outOfProfile ? editorT("shell.inspector.outOfProfileSuffix") : ""}
                      </option>
                    ))}
                  </select>
                  <span
                    className="helper"
                    title={getFriendlyNodeKindDescription(nodeInspectorDraft.kind, editorT)}
                  >
                    {editorT("shell.technical.friendlyLabel", {
                      label: getFriendlyNodeKindLabel(nodeInspectorDraft.kind, editorT),
                    })}
                  </span>
                  {nodeInspectorErrors.kind ? (
                    <span className="helper field-error" role="alert">
                      {nodeInspectorErrors.kind}
                    </span>
                  ) : null}
                </div>
              </>
            ) : null}

            {inspectorSections.details ? (
              <div className="field">
                <label htmlFor="node-data-json-input">{editorT("shell.technical.node.dataJson")}</label>
                <div className="row-actions">
                  <button className="btn" type="button" onClick={handleFormatNodeJson}>
                    {editorT("shell.technical.formatJson")}
                  </button>
                  <button className="btn" type="button" onClick={handleCopyNodeJson}>
                    {editorT("shell.technical.copyJson")}
                  </button>
                </div>
                <textarea
                  id="node-data-json-input"
                  rows={8}
                  className="mono"
                  data-testid="inspector-node-data-json"
                  value={nodeInspectorDraft.dataJson}
                  onChange={(event) =>
                    setNodeInspectorDraft((current) =>
                      current ? { ...current, dataJson: event.target.value } : current,
                    )
                  }
                />
                {nodeInspectorErrors.dataJson ? (
                  <span className="helper field-error" role="alert">
                    {nodeInspectorErrors.dataJson}
                  </span>
                ) : null}
              </div>
            ) : null}

            {nodeInspectorMessage ? (
              <div
                className={`inspector-feedback ${nodeInspectorHasErrors ? "is-error" : ""}`}
                aria-live="polite"
                data-testid="inspector-node-feedback"
              >
                {nodeInspectorMessage}
              </div>
            ) : null}

            <div className="row-actions inspector-actions">
              <button
                className="btn btn-primary"
                type="button"
                onClick={handleApplyNodeInspector}
                disabled={saveState.status === "saving"}
                data-testid="inspector-apply-node"
              >
                {editorT("shell.applyChanges")}
              </button>
              <button
                className="btn"
                type="button"
                onClick={handleNodeInspectorReset}
                data-testid="inspector-reset-node"
              >
                {editorT("shell.revert")}
              </button>
            </div>

            {inspectorSections.advanced ? (
              <>
                <div className="row-actions">
                  <span className="badge mono" data-testid="inspector-node-id">
                    {selectedNode.id}
                  </span>
                  <button className="btn" type="button" onClick={handleCopyNodeId}>
                    {editorT("shell.technical.copyId")}
                  </button>
                </div>
                <dl className="inspector-meta-list">
                  <div>
                    <dt>{editorT("shell.technical.position")}</dt>
                    <dd data-testid="inspector-node-position">
                      {Math.round(selectedNode.position.x)},{" "}
                      {Math.round(selectedNode.position.y)}
                    </dd>
                  </div>
                </dl>
              </>
            ) : null}
          </div>
        ) : null}

          {selectedEdge &&
          inspectorMode === "operational" &&
          isErdDiagram &&
          (selectedEdge.data?.kind ?? "flows-to") === "references" &&
          selectedErdRelationPayload ? (
            <div className="stack-sm erd-relation-inspector">
              <div className="row-actions inspector-selection-row">
                <span className="badge">{editorT("shell.erd.relation.badge")}</span>
                {edgeInspectorDirty ? (
                  <span className="badge editor-save-badge editor-save-badge-dirty editor-draft-badge">
                    {editorT("shell.inspector.draftBadge")}
                  </span>
                ) : null}
              </div>

              <section className="inspector-section-body">
                <h4>{editorT("shell.erd.relation.sections.general")}</h4>
                <div className="field">
                  <label htmlFor="erd-relation-name-input">
                    {editorT("shell.erd.relation.nameLabel")}
                  </label>
                  <input
                    id="erd-relation-name-input"
                    defaultValue={selectedErdRelationPayload.name ?? ""}
                    key={`erd-relation-name-${selectedEdge.id}-${selectedErdRelationPayload.name ?? ""}`}
                    onBlur={(event) => {
                      updateSelectedErdRelationName(event.target.value);
                    }}
                    placeholder={editorT("shell.erd.relation.optionalPlaceholder")}
                    data-testid="erd-relation-name-input"
                  />
                </div>
                <div className="field">
                  <label htmlFor="erd-relation-description-input">
                    {editorT("shell.erd.relation.descriptionLabel")}
                  </label>
                  <textarea
                    id="erd-relation-description-input"
                    rows={2}
                    defaultValue={selectedErdRelationPayload.description ?? ""}
                    key={`erd-relation-description-${selectedEdge.id}-${selectedErdRelationPayload.description ?? ""}`}
                    onBlur={(event) => {
                      const description = event.target.value.trim();
                      updateSelectedErdRelationPayload((payload) => ({
                        ...payload,
                        ...(description ? { description } : { description: undefined }),
                      }));
                    }}
                    data-testid="erd-relation-description-input"
                  />
                </div>
                <dl className="inspector-meta-list">
                  <div>
                    <dt>{editorT("shell.erd.relation.source")}</dt>
                    <dd>{selectedEdgeSourceLabel}</dd>
                  </div>
                  <div>
                    <dt>{editorT("shell.erd.relation.target")}</dt>
                    <dd>{selectedEdgeTargetLabel}</dd>
                  </div>
                </dl>
                <div className="row-actions">
                  <button
                    className="btn"
                    type="button"
                    onClick={handleSwapSelectedErdRelationDirection}
                    data-testid="erd-relation-swap-direction"
                  >
                    {editorT("shell.erd.relation.swapDirection")}
                  </button>
                </div>
              </section>

              <section className="inspector-section-body">
                <h4>{editorT("shell.erd.relation.sections.cardinality")}</h4>
                <div className="row-actions">
                  {(["1:1", "1:N", "N:1", "N:N"] as ErdCardinalityPreset[]).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className={`btn ${
                        erdCardinalityToPreset(selectedErdRelationPayload.cardinality) === preset
                          ? "btn-primary"
                          : ""
                      }`}
                      onClick={() =>
                        updateSelectedErdRelationPayload((payload) => ({
                          ...payload,
                          cardinality: erdCardinalityFromPreset(preset),
                        }))
                      }
                      data-testid={`erd-relation-cardinality-preset-${preset.replace(":", "-")}`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                <div className="erd-cardinality-advanced">
                  {(() => {
                    const cardinality =
                      selectedErdRelationPayload.cardinality ??
                      erdCardinalityFromPreset("1:N");

                    return (
                      <>
                        <label>
                          {editorT("shell.erd.relation.minSource")}
                          <select
                            value={String(cardinality.minSource)}
                            onChange={(event) =>
                              updateSelectedErdRelationPayload((payload) => ({
                                ...payload,
                                cardinality: {
                                  ...(payload.cardinality ?? cardinality),
                                  minSource: event.target.value === "1" ? 1 : 0,
                                },
                              }))
                            }
                            data-testid="erd-cardinality-min-source"
                          >
                            <option value="0">0</option>
                            <option value="1">1</option>
                          </select>
                        </label>
                        <label>
                          {editorT("shell.erd.relation.maxSource")}
                          <select
                            value={String(cardinality.maxSource)}
                            onChange={(event) =>
                              updateSelectedErdRelationPayload((payload) => ({
                                ...payload,
                                cardinality: {
                                  ...(payload.cardinality ?? cardinality),
                                  maxSource: event.target.value === "N" ? "N" : 1,
                                },
                              }))
                            }
                            data-testid="erd-cardinality-max-source"
                          >
                            <option value="1">1</option>
                            <option value="N">N</option>
                          </select>
                        </label>
                        <label>
                          {editorT("shell.erd.relation.minTarget")}
                          <select
                            value={String(cardinality.minTarget)}
                            onChange={(event) =>
                              updateSelectedErdRelationPayload((payload) => ({
                                ...payload,
                                cardinality: {
                                  ...(payload.cardinality ?? cardinality),
                                  minTarget: event.target.value === "1" ? 1 : 0,
                                },
                              }))
                            }
                            data-testid="erd-cardinality-min-target"
                          >
                            <option value="0">0</option>
                            <option value="1">1</option>
                          </select>
                        </label>
                        <label>
                          {editorT("shell.erd.relation.maxTarget")}
                          <select
                            value={String(cardinality.maxTarget)}
                            onChange={(event) =>
                              updateSelectedErdRelationPayload((payload) => ({
                                ...payload,
                                cardinality: {
                                  ...(payload.cardinality ?? cardinality),
                                  maxTarget: event.target.value === "N" ? "N" : 1,
                                },
                              }))
                            }
                            data-testid="erd-cardinality-max-target"
                          >
                            <option value="1">1</option>
                            <option value="N">N</option>
                          </select>
                        </label>
                        <label className="erd-cardinality-checkbox">
                          <input
                            type="checkbox"
                            checked={cardinality.minSource === 0}
                            onChange={(event) =>
                              updateSelectedErdRelationPayload((payload) => ({
                                ...payload,
                                cardinality: {
                                  ...(payload.cardinality ?? cardinality),
                                  minSource: event.target.checked ? 0 : 1,
                                },
                              }))
                            }
                            data-testid="erd-cardinality-optional-source"
                          />
                          {editorT("shell.erd.relation.optionalSource")}
                        </label>
                        <label className="erd-cardinality-checkbox">
                          <input
                            type="checkbox"
                            checked={cardinality.minTarget === 0}
                            onChange={(event) =>
                              updateSelectedErdRelationPayload((payload) => ({
                                ...payload,
                                cardinality: {
                                  ...(payload.cardinality ?? cardinality),
                                  minTarget: event.target.checked ? 0 : 1,
                                },
                              }))
                            }
                            data-testid="erd-cardinality-optional-target"
                          />
                          {editorT("shell.erd.relation.optionalTarget")}
                        </label>
                      </>
                    );
                  })()}
                </div>
              </section>

              <section className="inspector-section-body">
                <h4>{editorT("shell.erd.relation.sections.roles")}</h4>
                <div className="field">
                  <label htmlFor="erd-role-source-input">sourceRole</label>
                  <input
                    id="erd-role-source-input"
                    defaultValue={selectedErdRelationPayload.roles?.sourceRole ?? ""}
                    key={`erd-role-source-${selectedEdge.id}-${selectedErdRelationPayload.roles?.sourceRole ?? ""}`}
                    onBlur={(event) => {
                      const sourceRole = event.target.value.trim();
                      updateSelectedErdRelationPayload((payload) => ({
                        ...payload,
                        roles: {
                          ...(payload.roles ?? {}),
                          ...(sourceRole ? { sourceRole } : { sourceRole: undefined }),
                        },
                      }));
                    }}
                    data-testid="erd-role-source-input"
                  />
                </div>
                <div className="field">
                  <label htmlFor="erd-role-target-input">targetRole</label>
                  <input
                    id="erd-role-target-input"
                    defaultValue={selectedErdRelationPayload.roles?.targetRole ?? ""}
                    key={`erd-role-target-${selectedEdge.id}-${selectedErdRelationPayload.roles?.targetRole ?? ""}`}
                    onBlur={(event) => {
                      const targetRole = event.target.value.trim();
                      updateSelectedErdRelationPayload((payload) => ({
                        ...payload,
                        roles: {
                          ...(payload.roles ?? {}),
                          ...(targetRole ? { targetRole } : { targetRole: undefined }),
                        },
                      }));
                    }}
                    data-testid="erd-role-target-input"
                  />
                </div>
                <p className="helper" data-testid="erd-role-preview">
                  {selectedEdgeSourceLabel}{" "}
                  {selectedErdRelationPayload.roles?.sourceRole ?? editorT("shell.erd.relation.roleFallback")}
                  {" / "}
                  {selectedEdgeTargetLabel}{" "}
                  {selectedErdRelationPayload.roles?.targetRole ?? editorT("shell.erd.relation.roleFallback")}
                </p>
              </section>

              <section className="inspector-section-body">
                <h4>{editorT("shell.erd.relation.sections.materialization")}</h4>
                <p className="helper">
                  {editorT("shell.erd.relation.currentState")}{" "}
                  {selectedErdRelationPayload.materialization?.mode === "fk"
                    ? editorT("shell.erd.relation.materialization.fk")
                    : selectedErdRelationPayload.materialization?.mode === "associative"
                      ? editorT("shell.erd.relation.materialization.associative")
                      : editorT("shell.erd.relation.materialization.conceptual")}
                </p>
                <div className="erd-materialization-controls">
                  <label>
                    {editorT("shell.erd.relation.dependentSide")}
                    <select
                      value={erdMaterializeDependentSide}
                      onChange={(event) =>
                        setErdMaterializeDependentSide(
                          event.target.value as "source" | "target",
                        )
                      }
                      data-testid="erd-materialize-dependent-side"
                    >
                      <option value="source">{editorT("shell.erd.relation.source")}</option>
                      <option value="target">{editorT("shell.erd.relation.target")}</option>
                    </select>
                  </label>
                  {(() => {
                    const dependentEntityNode =
                      erdMaterializeDependentSide === "source"
                        ? selectedErdSourceEntityNode
                        : selectedErdTargetEntityNode;
                    const dependentFields = dependentEntityNode
                      ? normalizeErdEntityPayloadFromNode(dependentEntityNode).fields
                      : [];

                    return (
                      <label>
                        {editorT("shell.erd.relation.fkField")}
                        <select
                          value={erdMaterializeExistingFieldId}
                          onChange={(event) => setErdMaterializeExistingFieldId(event.target.value)}
                          data-testid="erd-materialize-field-select"
                        >
                          <option value="__new__">{editorT("shell.erd.relation.createNewField")}</option>
                          {dependentFields.map((field) => (
                            <option key={field.id} value={field.id}>
                              {field.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    );
                  })()}
                  <label className="erd-cardinality-checkbox">
                    <input
                      type="checkbox"
                      checked={erdMaterializeUnique}
                      onChange={(event) => setErdMaterializeUnique(event.target.checked)}
                      data-testid="erd-materialize-unique-toggle"
                    />
                    {editorT("shell.erd.relation.uniqueOnFk")}
                  </label>
                </div>
                <div className="row-actions">
                  <button
                    className="btn"
                    type="button"
                    onClick={handleMaterializeSelectedErdRelationAsFk}
                    data-testid="erd-materialize-fk-button"
                  >
                    {editorT("shell.erd.relation.materializeFk")}
                  </button>
                  <button
                    className="btn"
                    type="button"
                    onClick={handleApplySelectedErdOneToOneUniqueFix}
                    data-testid="erd-materialize-apply-unique-button"
                  >
                    {editorT("shell.erd.relation.applyUnique")}
                  </button>
                  <button
                    className="btn"
                    type="button"
                    onClick={handleConvertSelectedErdRelationToAssociative}
                    disabled={erdCardinalityToPreset(selectedErdRelationPayload.cardinality) !== "N:N"}
                    data-testid="erd-convert-associative-button"
                  >
                    {editorT("shell.erd.relation.convertAssociative")}
                  </button>
                  <button
                    className="btn"
                    type="button"
                    onClick={handleMarkSelectedErdRelationConceptual}
                    disabled={!erdPolicy.allowConceptualRelations}
                    data-testid="erd-mark-conceptual-button"
                  >
                    {editorT("shell.erd.relation.markConceptual")}
                  </button>
                </div>
              </section>

              <section className="inspector-section-body">
                <h4>{editorT("shell.erd.relation.sections.referentialIntegrity")}</h4>
                <div className="erd-cardinality-advanced">
                  <label>
                    onDelete
                    <select
                      value={selectedErdRelationPayload.referentialActions?.onDelete ?? ""}
                      onChange={(event) =>
                        updateSelectedErdRelationPayload((payload) => ({
                          ...payload,
                          referentialActions: {
                            ...(payload.referentialActions ?? {}),
                            ...(event.target.value
                              ? { onDelete: event.target.value as "restrict" | "cascade" | "setNull" | "noAction" }
                              : { onDelete: undefined }),
                          },
                        }))
                      }
                      data-testid="erd-referential-on-delete"
                    >
                      <option value="">{editorT("shell.erd.relation.defaultOption")}</option>
                      <option value="restrict">restrict</option>
                      <option value="cascade">cascade</option>
                      <option value="setNull">setNull</option>
                      <option value="noAction">noAction</option>
                    </select>
                  </label>
                  <label>
                    onUpdate
                    <select
                      value={selectedErdRelationPayload.referentialActions?.onUpdate ?? ""}
                      onChange={(event) =>
                        updateSelectedErdRelationPayload((payload) => ({
                          ...payload,
                          referentialActions: {
                            ...(payload.referentialActions ?? {}),
                            ...(event.target.value
                              ? { onUpdate: event.target.value as "restrict" | "cascade" | "setNull" | "noAction" }
                              : { onUpdate: undefined }),
                          },
                        }))
                      }
                      data-testid="erd-referential-on-update"
                    >
                      <option value="">{editorT("shell.erd.relation.defaultOption")}</option>
                      <option value="restrict">restrict</option>
                      <option value="cascade">cascade</option>
                      <option value="setNull">setNull</option>
                      <option value="noAction">noAction</option>
                    </select>
                  </label>
                </div>
              </section>

              <section className="inspector-section-body">
                <h4>{editorT("shell.erd.relation.sections.diagnostics")}</h4>
                {selectedErdRelationIssues.length > 0 ? (
                  <ul className="summary-list">
                    {selectedErdRelationIssues.map((issue) => (
                      <li key={issue.id}>
                        <span>
                          {getSemanticSeverityLabel(issue.severity, editorT)}: {issue.message}
                        </span>
                        <div className="row-actions">
                          <button
                            className="btn btn-link"
                            type="button"
                            onClick={() => handleFocusSemanticIssue(issue)}
                            data-testid={`erd-relation-issue-goto-${issue.id}`}
                          >
                            {editorT("shell.audit.goToIssue")}
                          </button>
                          {readIssueSuggestedFixes(issue).map((fix) => (
                            <button
                              key={fix.id}
                              className="btn"
                              type="button"
                              onClick={() => handleApplyErdSuggestedFix(fix.commands)}
                              data-testid={`erd-relation-issue-fix-${fix.id}`}
                            >
                              {fix.label}
                            </button>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="helper">{editorT("shell.erd.relation.diagnosticsEmpty")}</p>
                )}
              </section>

              {edgeInspectorMessage ? (
                <div
                  className={`inspector-feedback ${edgeInspectorHasErrors ? "is-error" : ""}`}
                  aria-live="polite"
                  data-testid="inspector-edge-feedback"
                >
                  {edgeInspectorMessage}
                </div>
              ) : null}

              <div className="row-actions inspector-actions">
                <button
                  className="btn"
                  type="button"
                  onClick={handleRemoveSelected}
                  disabled={saveState.status === "saving"}
                  data-testid="erd-relation-remove-button"
                >
                  {editorT("shell.erd.relation.remove")}
                </button>
              </div>
            </div>
          ) : null}

          {selectedEdge &&
          inspectorMode === "operational" &&
          operationalEdgeDraft &&
          (!isErdDiagram || (selectedEdge.data?.kind ?? "flows-to") !== "references") &&
          isProcessDiagram &&
          processEdgeInspectorModel &&
          selectedEdgeSourceLabel &&
          selectedEdgeTargetLabel ? (
              <ProcessOperationalEdgeInspector
                copy={processEdgeInspectorModel.copy}
                overview={processEdgeInspectorModel.overview}
                draft={operationalEdgeDraft}
                edgeKindOptions={edgeKindOptions}
                sections={{
                  general: inspectorSections.general,
                  relations: inspectorSections.relations,
                }}
                sourceLabel={selectedEdgeSourceLabel}
                targetLabel={selectedEdgeTargetLabel}
                edgeReadingKind={selectedEdge.data?.kind ?? "flows-to"}
                edgeInspectorErrors={edgeInspectorErrors}
                edgeInspectorMessage={edgeInspectorMessage}
                edgeInspectorHasErrors={edgeInspectorHasErrors}
                isSaving={saveState.status === "saving"}
                onToggleSection={handleToggleInspectorSection}
                onLabelChange={(value) =>
                  setOperationalEdgeDraft((current) =>
                    current ? { ...current, label: value } : current,
                  )
                }
                onKindChange={(kind) =>
                  setOperationalEdgeDraft((current) =>
                    current ? { ...current, kind } : current,
                  )
                }
                onApply={handleApplyEdgeInspector}
                onReset={handleEdgeInspectorReset}
                onRemove={handleRemoveSelected}
              />
          ) : null}

          {selectedEdge &&
          inspectorMode === "operational" &&
          operationalEdgeDraft &&
          (!isErdDiagram || (selectedEdge.data?.kind ?? "flows-to") !== "references") &&
          !isProcessDiagram ? (
              <div className="stack-sm">
                <div className="row-actions inspector-selection-row">
                  <span className="badge">
                    {inspectorSelectionState.edgeSelected
                      ? inspectorSelectionState.badgeLabel
                      : editorT("shell.selection.edgeFocused")}
                  </span>
                  {edgeInspectorDirty ? (
                    <span className="badge editor-save-badge editor-save-badge-dirty editor-draft-badge">
                      {editorT("shell.inspector.draftBadge")}
                    </span>
                  ) : null}
                </div>

              <div className="row-actions inspector-section-tabs">
                <button
                  className="btn inspector-section-toggle"
                  type="button"
                  onClick={() => handleToggleInspectorSection("general")}
                  aria-expanded={inspectorSections.general}
                  data-testid="inspector-section-general-toggle"
                >
                  {operationalEdgeGeneralSectionTitle} {inspectorSections.general ? "▾" : "▸"}
                </button>
                <button
                  className="btn inspector-section-toggle"
                  type="button"
                  onClick={() => handleToggleInspectorSection("relations")}
                  aria-expanded={inspectorSections.relations}
                  data-testid="inspector-section-relations-toggle"
                >
                  {operationalRelationsSectionTitle} {inspectorSections.relations ? "▾" : "▸"}
                </button>
              </div>

              {graphSelectedEdgeSemantic ? (
                <div
                  className="tile inspector-context-tile inspector-context-tile--graph"
                  data-testid="graph-edge-overview"
                >
                  <div className="row-actions">
                    <span className="badge">{graphSelectedEdgeSemantic.labelOperational}</span>
                    <span className="badge">{graphSelectedEdgeSemantic.defaultVerbLabel}</span>
                  </div>
                  <h4>{editorT("shell.graph.edgeReadingTitle")}</h4>
                  <p className="helper">
                    {selectedEdgeSourceLabel} {" -> "} {selectedEdgeTargetLabel}
                  </p>
                  <p className="helper">{graphSelectedEdgeSemantic.description}</p>
                </div>
              ) : null}

              {inspectorSections.general ? (
                <>
                  <div className="field">
                    <label htmlFor="edge-label-operational-input">
                      {operationalEdgeLabelLabel}
                    </label>
                    <input
                      id="edge-label-operational-input"
                      value={operationalEdgeDraft.label}
                      onChange={(event) =>
                        setOperationalEdgeDraft((current) =>
                          current ? { ...current, label: event.target.value } : current,
                        )
                      }
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="edge-kind-operational-input">
                      {operationalEdgeKindLabel}
                    </label>
                    <select
                      id="edge-kind-operational-input"
                      value={operationalEdgeDraft.kind}
                      onChange={(event) =>
                        setOperationalEdgeDraft((current) =>
                          current
                            ? {
                                ...current,
                                kind: event.target.value as OperationalEdgeDraft["kind"],
                              }
                            : current,
                        )
                      }
                    >
                      {edgeKindOptions.map((kind) => (
                        <option key={kind} value={kind}>
                          {getEdgeKindLabelForDiagram(
                            currentSupportedDiagramType,
                            kind,
                            "operational",
                            editorT,
                          )}
                        </option>
                      ))}
                    </select>
                    <span className="helper">
                      {getEdgeKindDescriptionForDiagram(
                        currentSupportedDiagramType,
                        operationalEdgeDraft.kind,
                        editorT,
                      )}
                    </span>
                  </div>
                </>
              ) : null}

              {inspectorSections.relations ? (
                <dl className="inspector-meta-list">
                  <div>
                    <dt>{operationalEdgeSourceLabel}</dt>
                    <dd>{selectedEdgeSourceLabel}</dd>
                  </div>
                  <div>
                    <dt>{operationalEdgeTargetLabel}</dt>
                    <dd>{selectedEdgeTargetLabel}</dd>
                  </div>
                </dl>
              ) : null}

              {edgeInspectorErrors.label ? (
                <span className="helper field-error" role="alert">
                  {edgeInspectorErrors.label}
                </span>
              ) : null}
              {edgeInspectorErrors.kind ? (
                <span className="helper field-error" role="alert">
                  {edgeInspectorErrors.kind}
                </span>
              ) : null}

              {edgeInspectorMessage ? (
                <div
                  className={`inspector-feedback ${edgeInspectorHasErrors ? "is-error" : ""}`}
                  aria-live="polite"
                  data-testid="inspector-edge-feedback"
                >
                  {edgeInspectorMessage}
                </div>
              ) : null}

              <div className="row-actions inspector-actions">
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={handleApplyEdgeInspector}
                  disabled={saveState.status === "saving"}
                >
                  {editorT("shell.applyChanges")}
                </button>
                <button className="btn" type="button" onClick={handleEdgeInspectorReset}>
                  {editorT("shell.revert")}
                </button>
                <button
                  className="btn"
                  type="button"
                  onClick={handleRemoveSelected}
                  disabled={saveState.status === "saving"}
                >
                  {editorT("shell.edgeActions.remove")}
                </button>
              </div>
              </div>
          ) : null}

          {selectedEdge && inspectorMode === "technical" && edgeInspectorDraft ? (
          <div className="stack-sm">
            <div className="row-actions inspector-selection-row">
              <span className="badge">
                {inspectorSelectionState.edgeSelected
                  ? inspectorSelectionState.badgeLabel
                  : editorT("shell.selection.edgeFocused")}
              </span>
              {edgeInspectorDirty ? (
                <span className="badge editor-save-badge editor-save-badge-dirty editor-draft-badge">
                  {editorT("shell.inspector.draftBadge")}
                  </span>
                ) : null}
            </div>

            <div className="row-actions inspector-section-tabs">
              <button
                className="btn inspector-section-toggle"
                type="button"
                onClick={() => handleToggleInspectorSection("general")}
                aria-expanded={inspectorSections.general}
                data-testid="inspector-section-general-toggle"
              >
                {editorT("shell.technical.generalSection")} {inspectorSections.general ? "▾" : "▸"}
              </button>
              <button
                className="btn inspector-section-toggle"
                type="button"
                onClick={() => handleToggleInspectorSection("details")}
                aria-expanded={inspectorSections.details}
                data-testid="inspector-section-details-toggle"
              >
                {editorT("shell.technical.detailsSection")} {inspectorSections.details ? "▾" : "▸"}
              </button>
              <button
                className="btn inspector-section-toggle"
                type="button"
                onClick={() => handleToggleInspectorSection("advanced")}
                aria-expanded={inspectorSections.advanced}
                data-testid="inspector-section-advanced-toggle"
              >
                {editorT("shell.technical.advancedSection")} {inspectorSections.advanced ? "▾" : "▸"}
              </button>
            </div>

            {inspectorSections.general ? (
              <>
                <div className="field">
                  <label htmlFor="edge-label-input">{editorT("shell.technical.edge.label")}</label>
                  <input
                    id="edge-label-input"
                    value={edgeInspectorDraft.label}
                    onChange={(event) =>
                      setEdgeInspectorDraft((current) =>
                        current ? { ...current, label: event.target.value } : current,
                      )
                    }
                  />
                  {edgeInspectorErrors.label ? (
                    <span className="helper field-error" role="alert">
                      {edgeInspectorErrors.label}
                    </span>
                  ) : null}
                </div>

                <div className="field">
                  <label htmlFor="edge-kind-input">{editorT("shell.technical.edge.rawKind")}</label>
                  <select
                    id="edge-kind-input"
                    value={edgeInspectorDraft.kind}
                    onChange={(event) =>
                      setEdgeInspectorDraft((current) =>
                        current
                          ? {
                              ...current,
                              kind: event.target.value as EdgeInspectorDraft["kind"],
                            }
                          : current,
                      )
                    }
                  >
                    {edgeKindOptions.map((kind) => (
                      <option key={kind} value={kind}>
                        {kind}
                      </option>
                    ))}
                  </select>
                  <span
                    className="helper"
                    title={getFriendlyEdgeKindDescription(edgeInspectorDraft.kind, editorT)}
                  >
                    {editorT("shell.technical.friendlyLabel", {
                      label: getFriendlyEdgeKindLabel(edgeInspectorDraft.kind, editorT),
                    })}
                  </span>
                  {edgeInspectorErrors.kind ? (
                    <span className="helper field-error" role="alert">
                      {edgeInspectorErrors.kind}
                    </span>
                  ) : null}
                </div>
              </>
            ) : null}

            {inspectorSections.details ? (
              <div className="field">
                <label htmlFor="edge-data-json-input">{editorT("shell.technical.edge.dataJson")}</label>
                <div className="row-actions">
                  <button className="btn" type="button" onClick={handleFormatEdgeJson}>
                    {editorT("shell.technical.formatJson")}
                  </button>
                  <button className="btn" type="button" onClick={handleCopyEdgeJson}>
                    {editorT("shell.technical.copyJson")}
                  </button>
                </div>
                <textarea
                  id="edge-data-json-input"
                  rows={8}
                  className="mono"
                  value={edgeInspectorDraft.dataJson}
                  onChange={(event) =>
                    setEdgeInspectorDraft((current) =>
                      current ? { ...current, dataJson: event.target.value } : current,
                    )
                  }
                />
                {edgeInspectorErrors.dataJson ? (
                  <span className="helper field-error" role="alert">
                    {edgeInspectorErrors.dataJson}
                  </span>
                ) : null}
              </div>
            ) : null}

            {edgeInspectorMessage ? (
              <div
                className={`inspector-feedback ${edgeInspectorHasErrors ? "is-error" : ""}`}
                aria-live="polite"
                data-testid="inspector-edge-feedback"
              >
                {edgeInspectorMessage}
              </div>
            ) : null}

            <div className="row-actions inspector-actions">
              <button
                className="btn btn-primary"
                type="button"
                onClick={handleApplyEdgeInspector}
                disabled={saveState.status === "saving"}
              >
                {editorT("shell.applyChanges")}
              </button>
              <button className="btn" type="button" onClick={handleEdgeInspectorReset}>
                {editorT("shell.revert")}
              </button>
              <button
                className="btn"
                type="button"
                onClick={handleRemoveSelected}
                disabled={saveState.status === "saving"}
              >
                {editorT("shell.edgeActions.remove")}
              </button>
            </div>

            {inspectorSections.advanced ? (
              <>
                <div className="row-actions">
                  <span className="badge mono">{selectedEdge.id}</span>
                  <button className="btn" type="button" onClick={handleCopyEdgeId}>
                    {editorT("shell.technical.copyId")}
                  </button>
                </div>
                <dl className="inspector-meta-list">
                  <div>
                    <dt>{editorT("shell.technical.link")}</dt>
                    <dd>
                      {selectedEdge.source} -&gt; {selectedEdge.target}
                    </dd>
                  </div>
                </dl>
              </>
            ) : null}
          </div>
        ) : null}

        {!selectedNode && !selectedEdge ? (
          <div className="inspector-empty-state" data-testid="inspector-empty-state">
            <p className="helper">
              {isProcessDiagram
                ? processInspectorCopy?.emptyTitle
                : editorT("shell.emptyState.title")}
            </p>
            <p className="helper">
              {isProcessDiagram
                ? processInspectorCopy?.emptySummary
                : editorT("shell.emptyState.summary")}
            </p>
            <p className="helper">
              {isProcessDiagram
                ? processInspectorCopy?.emptyGuidance
                : editorT("shell.emptyState.guidance")}
            </p>
            <dl className="inspector-meta-list">
              <div>
                <dt>{editorT("shell.emptyState.nodes")}</dt>
                <dd>{nodes.length}</dd>
              </div>
              <div>
                <dt>{editorT("shell.emptyState.edges")}</dt>
                <dd>{edges.length}</dd>
              </div>
              <div>
                <dt>{editorT("shell.emptyState.viewport")}</dt>
                <dd>
                  {Math.round(viewport.x)}, {Math.round(viewport.y)} @{" "}
                  {viewport.zoom.toFixed(2)}
                </dd>
              </div>
            </dl>
          </div>
        ) : null}
        </aside>
      ) : null}
    </div>
  );
}
