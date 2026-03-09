"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import type { ProjectTemplate } from "@/src/modules/projects/domain";
import {
  getDiagramTypeLabel,
  isSupportedDiagramType,
  reapplyLayoutForSnapshot,
  type DiagramType,
} from "@/src/modules/graph/domain";
import type { EditorCommand } from "@/src/modules/editor/application";
import {
  computeParallelEdgeMeta,
  resolveDiagramRenderer,
  type DiagramRendererKey,
} from "./diagram-renderers";
import {
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
import { CanvasToolbar } from "./canvas-toolbar";
import { CommandPalette } from "./command-palette";
import { filterNodeQuickFindOptions } from "./editor-quick-find";
import {
  getContextualAddActionForDiagram,
  getContextualActionsForDiagram,
  type DiagramContextualAction,
  getDefaultNodeKindForDiagram,
  getEdgeKindLabel,
  getEdgeKindPresentation,
  getNodeKindDescription,
  getNodeKindLabel,
  getNodeKindOptions,
  getNodeKindPresentation,
  getOperationalDisplayLabel,
} from "./presentation/kinds";
import {
  fromCanonicalSnapshotToFlowState,
  toCanonicalSnapshotFromFlowState,
  type EditorSnapshotLayoutMetadata,
  type RFEdge,
  type RFNode,
} from "./editor-graph-mappers";
import {
  createEdgeForEditor,
  createSnapshotVersionForEditor,
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
};

type EditorShellProps = {
  project: EditorProjectViewModel;
  initialSnapshot: Parameters<typeof fromCanonicalSnapshotToFlowState>[0];
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

type OperationalEdgeDraft = {
  label: string;
  kind: EdgeInspectorDraft["kind"];
};

type AddNodeDraft = {
  kind: NodeKind;
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

type ContextualInsertMode =
  | "default"
  | "tree-child"
  | "tree-sibling"
  | "flow-next-step"
  | "flow-branch"
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

function formatVersionCreatedAtLabel(createdAt: string) {
  const parsed = new Date(createdAt);

  if (Number.isNaN(parsed.getTime())) {
    return createdAt;
  }

  return parsed.toLocaleString("pt-BR");
}

function formatVersionOriginLabel(origin: EditorSnapshotVersionSummary["origin"]) {
  if (origin === "manual") {
    return "Manual";
  }

  return origin;
}

function buildVersionDiffFeedbackMessage(diff: EditorSnapshotVersionDiff) {
  if (!diff.hasChanges) {
    return "Sem alteracoes entre a versao selecionada e o snapshot de trabalho.";
  }

  const parts: string[] = [];

  if (diff.nodesAdded.length > 0) {
    parts.push(`${diff.nodesAdded.length} no(s) adicionados`);
  }
  if (diff.nodesRemoved.length > 0) {
    parts.push(`${diff.nodesRemoved.length} no(s) removidos`);
  }
  if (diff.nodesChanged.length > 0) {
    parts.push(`${diff.nodesChanged.length} no(s) alterados`);
  }
  if (diff.edgesAdded.length > 0) {
    parts.push(`${diff.edgesAdded.length} aresta(s) adicionadas`);
  }
  if (diff.edgesRemoved.length > 0) {
    parts.push(`${diff.edgesRemoved.length} aresta(s) removidas`);
  }
  if (diff.edgesChanged.length > 0) {
    parts.push(`${diff.edgesChanged.length} aresta(s) alteradas`);
  }
  if (diff.viewportChanged) {
    parts.push("viewport alterado");
  }

  return `Resumo: ${parts.join("; ")}.`;
}

function buildPrismaSchemaImportFeedbackMessage(
  summary: EditorPrismaSchemaImportSummary | undefined,
) {
  if (!summary) {
    return "Schema Prisma importado com sucesso para o snapshot de trabalho.";
  }

  return `Schema Prisma importado com sucesso (${summary.modelsCount} modelo(s), ${summary.relationsCount} relacao(oes), ${summary.scalarFieldsCount} campo(s) escalar(es)).`;
}

function resolveDiagramTypeForQuickActions(rendererKey: DiagramRendererKey): DiagramType | undefined {
  if (rendererKey === "tree") {
    return "tree";
  }

  if (rendererKey === "flow") {
    return "flow";
  }

  if (rendererKey === "mindmap") {
    return "mindmap";
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
    diagramType === "erd"
  ) {
    return diagramType;
  }

  if (rendererKey === "erd") {
    return "erd";
  }

  return undefined;
}

function isDiagramLayoutType(diagramType: DiagramLayoutType) {
  return (
    diagramType === "tree" ||
    diagramType === "flow" ||
    diagramType === "mindmap" ||
    diagramType === "erd"
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

function buildDefaultNodeTitle(kind: NodeKind, nextIndex: number) {
  const nodeKindLabel = getNodeKindLabel(kind, "operational");
  return `${nodeKindLabel} ${nextIndex}`;
}

function buildContextualActionsFromDiagramType(
  diagramType: DiagramType | "erd" | undefined,
): SelectionHudQuickAction[] {
  return getContextualActionsForDiagram(diagramType)
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
  diagramType: DiagramType | "erd" | undefined,
): SelectionHudQuickAction {
  const action = getContextualAddActionForDiagram(diagramType);
  return {
    id: getContextualActionsForDiagram(diagramType)[0]?.id ?? "mindmap-add-branch",
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
): "1:1" | "1:N" | "N:N" | undefined {
  if (!payload) {
    return undefined;
  }

  const cardinality = payload.cardinality;
  if (cardinality === "1:1" || cardinality === "1:N" || cardinality === "N:N") {
    return cardinality;
  }

  return undefined;
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

  const cardinality = resolveErdCardinalityFromPayload(input.payload);
  if (!cardinality) {
    return input.baseLabel;
  }

  const normalizedBaseLabel = input.baseLabel?.trim();
  if (normalizedBaseLabel) {
    return `${normalizedBaseLabel} (${cardinality})`;
  }

  return cardinality;
}

function resolveErdEdgeClassSuffix(
  payload: Record<string, unknown> | undefined,
) {
  const cardinality = resolveErdCardinalityFromPayload(payload);
  if (!cardinality) {
    return undefined;
  }

  return cardinality.replace(":", "-").toLowerCase();
}

function resolveEdgeMarker(edgeKind: EdgeKind) {
  const presentation = getEdgeKindPresentation(edgeKind);

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
  if (input?.rendererKey === "erd" && edgeKind === "references") {
    const cardinality = resolveErdCardinalityFromPayload(input.payload);
    if (cardinality === "1:1") {
      return undefined;
    }

    if (cardinality === "1:N") {
      return "7 4";
    }

    if (cardinality === "N:N") {
      return "2 5";
    }
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

export function EditorShell({ project, initialSnapshot }: EditorShellProps) {
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
    createInitialEditorAutosaveState(),
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
    title: "",
    description: "",
    tagsText: "",
  });
  const [collapsedTreeNodeIds, setCollapsedTreeNodeIds] = useState<string[]>([]);
  const [pendingConnectionAssistant, setPendingConnectionAssistant] =
    useState<PendingConnectionAssistantState | null>(null);
  const [pendingNodeRepair, setPendingNodeRepair] =
    useState<PendingNodeRepairState | null>(null);
  const [pendingSemanticOverride, setPendingSemanticOverride] =
    useState<PendingSemanticOverrideState | null>(null);
  const [semanticOverrideReason, setSemanticOverrideReason] = useState("");
  const [isValidationPanelOpen, setIsValidationPanelOpen] = useState(false);
  const [serverSemanticAudit, setServerSemanticAudit] =
    useState<SemanticAuditPayload | null>(null);
  const [semanticPolicy, setSemanticPolicy] = useState<SemanticPolicyPayload | null>(null);
  const [currentRevision, setCurrentRevision] = useState<number>(1);

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
  const semanticIssuesByNodeId = useMemo(() => {
    const map = new Map<string, SemanticIssue[]>();
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
    const map = new Map<string, SemanticIssue[]>();
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
  const selectedSemanticSeverity: "error" | "warning" | null =
    selectedSemanticIssues.some((issue) => issue.severity === "error")
      ? "error"
      : selectedSemanticIssues.some((issue) => issue.severity === "warning")
        ? "warning"
        : null;
  const selectedSemanticStatusLabel = selectedSemanticSeverity
    ? selectedSemanticSeverity === "error"
      ? "Semantica: atencao"
      : "Semantica: aviso"
    : "Semantica: OK";
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
    const mindmapRootNodeId =
      renderer.key === "mindmap"
        ? computedMindmapRootNodeId &&
          visibleNodes.some((node) => node.id === computedMindmapRootNodeId)
          ? computedMindmapRootNodeId
          : getMindmapRootNodeId(visibleNodes, layoutMetadata.rootNodeName)
        : null;
    const connectionTargetStateByNodeId = new Map<string, "allowed" | "blocked">();
    const activeSourceNode = activeConnectionSourceNodeId
      ? visibleNodes.find((node) => node.id === activeConnectionSourceNodeId) ?? null
      : null;

    if (activeSourceNode) {
      const sourceNodeRef = {
        id: activeSourceNode.id,
        kind: activeSourceNode.data.kind,
        label: activeSourceNode.data.label,
        payload: activeSourceNode.data.payload,
      };

      for (const candidate of visibleNodes) {
        if (candidate.id === activeSourceNode.id) {
          continue;
        }

        const validation = validateEdgeCreation(
          {
            diagramType: semanticDiagramType,
            sourceNode: sourceNodeRef,
            targetNode: {
              id: candidate.id,
              kind: candidate.data.kind,
              label: candidate.data.label,
              payload: candidate.data.payload,
            },
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
      const highlightedIssueClass =
        nodeIssues.length > 0 && (isValidationPanelOpen || selectedNodeId === node.id)
          ? nodeIssues.some((issue) => issue.severity === "error")
            ? "editor-node-has-issue editor-node-issue-error"
            : "editor-node-has-issue editor-node-issue-warning"
          : null;

      return {
        ...node,
        type: renderer.nodeType,
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
          onToggleTreeCollapse:
            renderer.key === "tree"
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
                })
              : node.data.label,
        },
      };
    });
  }, [
    activeConnectionSourceNodeId,
    computedMindmapRootNodeId,
    inspectorMode,
    isValidationPanelOpen,
    layoutMetadata.rootNodeName,
    nodes,
    hiddenCanvasNodeIdSet,
    collapsedTreeNodeIdSet,
    renderer,
    selectedNodeId,
    semanticDiagramType,
    semanticEngineOptions,
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
          resolveEdgeMarker(edgeKind) ??
          edge.markerEnd ??
          renderer.defaultEdgeOptions.markerEnd,
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
      }),
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

  function markDirtyState(message = "Alteracoes pendentes (autosave em fila).") {
    setSaveState((current) => markEditorDirty(current, message));
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
      "Existem alteracoes no inspetor ainda nao aplicadas. Deseja descartar?",
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
      const message = formatErrorMessage(error, "Nao foi possivel aplicar a alteracao.");
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
        reason === "manual" ? "Salvando manualmente..." : "Salvando alteracoes...",
      ),
    );

    try {
      for (const entry of queue) {
        const remoteResult = await applyEditorCommandRemotely(
          project.id,
          entry.command,
          {
            expectedRevision: currentRevisionRef.current,
            semanticMode: inspectorMode,
          },
        );
        setCurrentRevision(remoteResult.newRevision);

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
        setSaveState((current) => markEditorSaveSuccess(current));
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
        "Erro ao salvar alteracoes do editor.",
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
    setSaveState((current) => markEditorSaving(current, "Salvando manualmente..."));
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
        setSaveState((current) => markEditorSaveSuccess(current));
      } else {
        markDirtyState();
        autosaveDebouncerRef.current.trigger();
      }

      return true;
    } catch (error) {
      if (requestTrackerRef.current.isStaleResponse(requestId)) {
        return false;
      }

      const message = formatErrorMessage(error, "Falha ao salvar o snapshot.");
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
            "Nao foi possivel salvar o snapshot de trabalho antes de criar a versao.",
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
        message: formatErrorMessage(error, "Falha ao criar versao."),
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
        message: `Versoes atualizadas (${versions.length}).`,
      });
    } catch (error) {
      setVersionActionFeedback({
        kind: "error",
        message: formatErrorMessage(error, "Falha ao atualizar versoes."),
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
        ? "Nome da versao salvo localmente neste navegador."
        : "Nome local da versao removido.",
    });
  }

  function getVersionDisplayName(version: EditorSnapshotVersionSummary) {
    return (
      localVersionNames[version.id] ||
      version.label?.trim() ||
      "Versao sem nome"
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
      });

      setVersionDiffSummary(executiveSummary);
      setVersionDiffFeedback({
        kind: "info",
        message: buildVersionDiffFeedbackMessage(diff),
      });
      setVersionActionFeedback(null);
    } catch (error) {
      setVersionDiffSummary(null);
      setVersionDiffFeedback({
        kind: "error",
        message: formatErrorMessage(error, "Falha ao comparar versao."),
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
      ? "Restaurar esta versao vai descartar alteracoes locais pendentes no editor. Deseja continuar?"
      : "Deseja restaurar esta versao para o snapshot de trabalho atual?";

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
        message: "Versao restaurada no snapshot de trabalho.",
        lastSavedAt: Date.now(),
      });
      setGlobalErrorMessage(null);
      setQuerySyncMessage("Snapshot sincronizado apos restore.");
      setVersionActionFeedback({
        kind: "success",
        message: result.message,
      });
    } catch (error) {
      setVersionActionFeedback({
        kind: "error",
        message: formatErrorMessage(error, "Falha ao restaurar versao."),
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
        message: "Cole um schema Prisma (.prisma) antes de importar.",
      });
      return;
    }

    const hasLocalPendingChanges =
      pendingCommandsRef.current.length > 0 || saveState.isDirty;
    const confirmMessage = hasLocalPendingChanges
      ? "Importar um schema Prisma vai sobrescrever o snapshot de trabalho atual e descartar alteracoes locais pendentes. Deseja continuar?"
      : "Deseja importar este schema Prisma para o snapshot de trabalho atual?";

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
        message: "Schema Prisma importado e salvo no snapshot de trabalho.",
        lastSavedAt: Date.now(),
      });
      setVersionDiffFeedback(null);
      setVersionDiffSummary(null);
      setGlobalErrorMessage(null);
      setQuerySyncMessage("Snapshot importado de schema Prisma.");
      setPrismaSchemaImportFeedback({
        kind: "success",
        message: buildPrismaSchemaImportFeedbackMessage(result.importSummary),
      });
    } catch (error) {
      setPrismaSchemaImportFeedback({
        kind: "error",
        message: formatErrorMessage(error, "Falha ao importar schema Prisma."),
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
            setQuerySyncMessage(
              "Sincronizacao inicial ignorada porque ja existem alteracoes locais.",
            );
            return;
          }

          syncFromSnapshot(result.snapshot);
          setPendingCommandsState([]);
          localMutationVersionRef.current = 0;
          setCurrentRevision(result.revision);
          setSaveState(createInitialEditorAutosaveState());
          setQuerySyncMessage("Snapshot sincronizado com o backend.");
          setGlobalErrorMessage(null);
        }
      } catch (error) {
        if (!active) return;

        setQuerySyncMessage(
          formatErrorMessage(
            error,
            "Nao foi possivel sincronizar o snapshot pelo endpoint do editor.",
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
          message: formatErrorMessage(error, "Falha ao carregar versoes."),
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
        return "Alteracoes pendentes";
      case "saving":
        return "Salvando...";
      case "saved":
        return "Salvo";
      case "error":
        return "Erro ao salvar";
    }
  }, [saveState.status]);

  const saveStatusClassName = `badge editor-save-badge editor-save-badge-${saveState.status}`;
  const lastSavedAtLabel = saveState.lastSavedAt
    ? new Date(saveState.lastSavedAt).toLocaleTimeString("pt-BR")
    : null;
  const layoutPolicyLabel = isReapplyLayoutBlockedByPolicy
    ? "Layout bloqueado"
    : "Reaplicacao permitida";
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

  const nodeKindOptions = useMemo(() => {
    const options = [...getNodeKindOptions(inspectorMode)];
    const selectedKind = selectedNode?.data.kind;

    if (selectedKind && !options.includes(selectedKind)) {
      options.push(selectedKind);
    }

    return options;
  }, [inspectorMode, selectedNode?.data.kind]);
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
              })
            : node.data.label,
        ]),
      ),
    [inspectorMode, nodes],
  );
  const selectedNodeRelations = useMemo(() => {
    if (!selectedNode) {
      return {
        incomingCount: 0,
        outgoingCount: 0,
        preview: [] as Array<{
          id: string;
          direction: "incoming" | "outgoing";
          relation: string;
          otherLabel: string;
          otherNodeId: string;
        }>,
      };
    }

    const incoming = edges.filter((edge) => edge.target === selectedNode.id);
    const outgoing = edges.filter((edge) => edge.source === selectedNode.id);
    const preview = [...incoming, ...outgoing].slice(0, 6).map((edge) => ({
      id: edge.id,
      direction: edge.target === selectedNode.id ? "incoming" : "outgoing",
      relation: getEdgeKindLabel(
        edge.data?.kind ?? "flows-to",
        inspectorMode === "technical" ? "technical" : "operational",
      ),
      otherNodeId: edge.target === selectedNode.id ? edge.source : edge.target,
      otherLabel:
        nodeLabelById.get(
          edge.target === selectedNode.id ? edge.source : edge.target,
        ) ?? "No sem titulo",
    }));

    return {
      incomingCount: incoming.length,
      outgoingCount: outgoing.length,
      preview,
    };
  }, [edges, inspectorMode, nodeLabelById, selectedNode]);
  const selectedEdgeSourceLabel = selectedEdge
    ? nodeLabelById.get(selectedEdge.source) ?? selectedEdge.source
    : null;
  const selectedEdgeTargetLabel = selectedEdge
    ? nodeLabelById.get(selectedEdge.target) ?? selectedEdge.target
    : null;
  const quickFindOptions = useMemo(
    () => filterNodeQuickFindOptions(nodes, quickFindQuery, inspectorMode),
    [inspectorMode, nodes, quickFindQuery],
  );
  const selectedItemLabel = selectedNode
    ? nodeLabelById.get(selectedNode.id) ?? selectedNode.data.label
    : selectedEdge
      ? selectedEdge.label
        ? String(selectedEdge.label)
        : `${selectedEdgeSourceLabel ?? selectedEdge.source} -> ${
            selectedEdgeTargetLabel ?? selectedEdge.target
          }`
      : "Nenhum item selecionado";
  const inspectorSelectionBadge = selectedNode
    ? "No selecionado"
    : selectedEdge
      ? "Aresta selecionada"
      : "Sem selecao";
  const hasInspectorDirtyDraft = nodeInspectorDirty || edgeInspectorDirty;
  const isInspectorVisible = !isFocusInspectorCollapsed;
  const shouldShowMetadataPanel = !isCanvasFocusMode;
  const shouldShowPrismaPanel = !isCanvasFocusMode;
  const shouldShowVersionsPanel = !isCanvasFocusMode;
  const currentSupportedDiagramType =
    semanticDiagramType ??
    (isSupportedDiagramType(layoutMetadata.diagramType)
      ? layoutMetadata.diagramType
      : resolveDiagramTypeForQuickActions(renderer.key));
  const contextualActionDefinitions = useMemo(
    () => getContextualActionsForDiagram(currentSupportedDiagramType),
    [currentSupportedDiagramType],
  );
  const contextualActions = useMemo(
    () => buildContextualActionsFromDiagramType(currentSupportedDiagramType),
    [currentSupportedDiagramType],
  );
  const quickAction = useMemo(() => {
    if (contextualActions[0]) {
      return contextualActions[0];
    }

    return buildQuickActionFromDiagramType(currentSupportedDiagramType);
  }, [contextualActions, currentSupportedDiagramType]);
  const quickAddDefaultRelationLabel = selectedNode
    ? getEdgeKindLabel(quickAction.edgeKind, "operational")
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
    ? getNodeKindPresentation(selectedNode.data.kind)
    : null;
  const isSelectedTreeSubtreeCollapsed = selectedNode
    ? collapsedTreeNodeIdSet.has(selectedNode.id)
    : false;
  const inspectorToggleLabel = isInspectorVisible
    ? "Ocultar inspetor"
    : "Mostrar inspetor";
  const diagramDefinitionLabel = isSupportedDiagramType(layoutMetadata.diagramType)
    ? `Diagrama atual: ${getDiagramTypeLabel(layoutMetadata.diagramType)}`
    : "Diagrama: A definir no Wizard";
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

    setAddNodeDraft((current) => ({
      ...current,
      kind: getDefaultNodeKindForDiagram(currentSupportedDiagramType),
    }));
  }, [currentSupportedDiagramType, isAddNodeDialogOpen]);

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

  function handleFocusRelation(edgeId: string, relatedNodeId: string) {
    selectItem({ nodeId: null, edgeId });

    const relatedNode = nodesRef.current.find((node) => node.id === relatedNodeId);
    if (!relatedNode) {
      return;
    }

    reactFlowInstanceRef.current?.setCenter(relatedNode.position.x, relatedNode.position.y, {
      zoom: Math.max(viewportRef.current.zoom, 1.05),
      duration: 220,
    });
  }

  function handleFocusSemanticIssue(issue: SemanticIssue) {
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
      setGlobalErrorMessage("Nao foi possivel conectar: no de origem/destino nao encontrado.");
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
            title: "Override tecnico",
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

      setGlobalErrorMessage(formatErrorMessage(error, "Falha ao criar relacao no servidor."));
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
      setGlobalErrorMessage("Nao foi possivel conectar: no de origem/destino nao encontrado.");
      return false;
    }

    const validation = validateEdgeCreation({
      diagramType: semanticDiagramType,
      sourceNode: {
        id: sourceNode.id,
        kind: sourceNode.data.kind,
        label: sourceNode.data.label,
        payload: sourceNode.data.payload,
      },
      targetNode: {
        id: targetNode.id,
        kind: targetNode.data.kind,
        label: targetNode.data.label,
        payload: targetNode.data.payload,
      },
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
            "Esta conexao nao respeita as regras semanticas do diagrama.",
          details: validation.violation?.details,
        });
        return false;
      }

      if (validation.allowedEdgeKinds.length === 0) {
        setGlobalErrorMessage(
          validation.violation?.message ??
            "Conexao invalida para o tipo atual de diagrama.",
        );
        return false;
      }

      nextEdgeKind = validation.recommendedEdgeKind ?? validation.allowedEdgeKinds[0];
      setQuerySyncMessage(
        `Relacao ajustada automaticamente para '${getEdgeKindLabel(nextEdgeKind, "operational")}'.`,
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
        `Verificacao concluida: ${audit.counters.total} issue(s).`,
      );
      setGlobalErrorMessage(null);
      return audit;
    } catch (error) {
      setServerSemanticAudit(null);
      const message = formatErrorMessage(
        error,
        "Falha ao executar verificacao semantica no servidor.",
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
  }) {
    const { referenceNode, insertMode } = input;
    const containerRect = canvasRegionRef.current?.getBoundingClientRect();
    const currentViewport = viewportRef.current;
    const basePosition = computeInsertPosition(
      currentSupportedDiagramType,
      referenceNode
        ? {
            id: referenceNode.id,
            kind: referenceNode.data.kind,
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
    );

    if (!referenceNode) {
      return basePosition;
    }

    if (insertMode === "flow-branch") {
      return {
        x: basePosition.x,
        y: basePosition.y + 170,
      };
    }

    if (insertMode === "tree-sibling") {
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

    if (actionId === "flow-add-next-step") {
      return "flow-next-step";
    }

    if (actionId === "flow-add-branch") {
      return "flow-branch";
    }

    if (actionId === "mindmap-add-reference") {
      return "mindmap-reference";
    }

    if (actionId === "mindmap-add-branch") {
      return "mindmap-branch";
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

  function queueTreeReflowIfNeeded(insertMode: ContextualInsertMode) {
    if (currentSupportedDiagramType !== "tree") {
      return;
    }

    if (insertMode !== "tree-child" && insertMode !== "tree-sibling") {
      return;
    }

    applyDiagramReflow({
      diagramType: "tree",
    });
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

    return nextPayload;
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
    const title = input.draft.title.trim() || buildDefaultNodeTitle(input.draft.kind, nextNodeIndex);
    const payload =
      inspectorMode === "operational"
        ? buildAddNodePayloadFromDraft(input.draft)
        : {};

    const nodeApplied = applyLocalCommandAndQueue({
      type: "addNode",
      node: {
        id: nextNodeId,
        kind: input.draft.kind,
        label: title,
        position: resolveNodeInsertPosition({
          referenceNode,
          insertMode: input.insertMode ?? "default",
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
      queueTreeReflowIfNeeded(input.insertMode);
    }

    selectItem({ nodeId: nextNodeId, edgeId: null });
    return nextNodeId;
  }

  const handleOpenAddDialog = useCallback(() => {
    const defaultKind = selectedNodeId
      ? quickAction.nodeKind
      : getDefaultNodeKindForDiagram(currentSupportedDiagramType);

    setAddNodeErrorMessage(null);
    setAddNodeDraft({
      kind: defaultKind,
      title: "",
      description: "",
      tagsText: "",
    });
    setIsAddNodeDialogOpen(true);
  }, [currentSupportedDiagramType, quickAction.nodeKind, selectedNodeId]);

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

    setQuerySyncMessage("Titulo atualizado.");
    handleCancelInlineRename();
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && pendingConnectionAssistant) {
        event.preventDefault();
        setPendingConnectionAssistant(null);
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
          setGlobalErrorMessage("Falha ao copiar selecao.");
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
          setGlobalErrorMessage("Falha ao colar selecao.");
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
          setGlobalErrorMessage("Falha ao recortar selecao.");
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
          setGlobalErrorMessage("Falha ao duplicar selecao.");
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
    insertNodeFromDraft({
      draft: {
        kind: action.nodeKind,
        title: buildDefaultNodeTitle(action.nodeKind, nextNodeIndex),
        description: "",
        tagsText: "",
      },
      sourceNodeId: resolveSourceNodeIdForContextAction(action),
      relationKind: action.edgeKind,
      relationLabel: action.edgeLabel,
      insertMode: resolveInsertModeFromActionId(action.id),
    });
  }

  function handleAddErdField() {
    if (!selectedNode || selectedNode.data.kind !== "entity") {
      setGlobalErrorMessage("Selecione uma entidade ERD para adicionar campo.");
      return;
    }

    const payload = clonePayload(selectedNode.data.payload);
    const currentFields = Array.isArray(payload.fields)
      ? payload.fields
          .filter(
            (field): field is Record<string, unknown> =>
              Boolean(field && typeof field === "object" && !Array.isArray(field)),
          )
          .map((field) => ({ ...field }))
      : [];

    const nextFieldIndex = currentFields.length + 1;
    const nextField = {
      name: `campo_${nextFieldIndex}`,
      type: "String",
      isId: false,
      isUnique: false,
      isOptional: true,
    };

    const applied = applyLocalCommandAndQueue({
      type: "updateNode",
      nodeId: selectedNode.id,
      patch: {
        data: {
          ...payload,
          fields: [...currentFields, nextField],
        },
      },
    });

    if (applied) {
      setQuerySyncMessage(
        `Campo '${nextField.name}' adicionado em ${selectedNode.data.label}.`,
      );
      setGlobalErrorMessage(null);
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
    setQuerySyncMessage("Conexao cancelada pelo usuario.");
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
        setGlobalErrorMessage("Conclua o salvamento pendente antes de criar a relacao.");
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
    setNodeInspectorMessage("Alteracao de tipo cancelada.");
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
      "No atualizado. Salvamento automatico agendado.",
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
        ? `Tipo aplicado com reparo automatico (${appliedActions}).`
        : `Tipo aplicado com remocao de relacoes invalidas (${appliedActions}).`,
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
        `Justificativa obrigatoria com no minimo ${MIN_SEMANTIC_OVERRIDE_REASON_LENGTH} caracteres.`,
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
        formatErrorMessage(error, "Falha ao aplicar override tecnico."),
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
      throw new Error("Clipboard indisponivel.");
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
    setQuerySyncMessage("Selecao copiada para a area de transferencia.");
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
            firstError?.message ??
              "Colagem bloqueada pela politica semantica do projeto.",
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
            firstError?.message ??
              "Colagem bloqueada pela politica semantica do projeto.",
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
          "Nao foi possivel validar a colagem com o backend.",
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
    setQuerySyncMessage("Selecao recortada para a area de transferencia.");
    return true;
  }

  async function handleDuplicateSelection() {
    const fragment = buildClipboardFragmentFromSelection();
    if (!fragment) {
      return false;
    }

    const result = await applyClipboardFragment(fragment);
    if (result.appliedNodes === 0 && result.appliedEdges === 0) {
      setGlobalErrorMessage("Nao foi possivel duplicar a selecao atual.");
      return false;
    }

    setQuerySyncMessage(
      `Duplicacao concluida: ${result.appliedNodes} no(s), ${result.appliedEdges} relacao(oes), ${result.skippedEdges} relacao(oes) ignorada(s).`,
    );
    return true;
  }

  async function handlePasteFromClipboard() {
    const fragment = await readMapiaClipboardFragment();
    if (!fragment || fragment.nodes.length === 0) {
      setGlobalErrorMessage("Area de transferencia sem fragmento MapIA valido.");
      return false;
    }

    const result = await applyClipboardFragment(fragment);
    if (result.appliedNodes === 0 && result.appliedEdges === 0) {
      return false;
    }
    setQuerySyncMessage(
      `Colagem concluida: ${result.appliedNodes} no(s), ${result.appliedEdges} relacao(oes), ${result.skippedEdges} relacao(oes) ignorada(s).`,
    );
    return true;
  }

  function handleOrganizeDiagram() {
    const currentSnapshot = getCurrentSnapshot();

    if (currentSnapshot.allowReapplyLayout === false) {
      setGlobalErrorMessage(
        "Layout bloqueado por politica definida no Wizard. Ajuste antes de tentar novamente.",
      );
      return;
    }

    const layoutDiagramType = resolveSemanticDiagramType(
      currentSnapshot.diagramType,
      renderer.key,
    );

    if (!isDiagramLayoutType(layoutDiagramType)) {
      setGlobalErrorMessage(
        "Organizacao automatica exige tipo de diagrama suportado (hierarquia, processo, mapa mental ou ERD).",
      );
      return;
    }

    const movedNodes = applyDiagramReflow({
      diagramType: layoutDiagramType,
      rootId: layoutDiagramType === "mindmap" ? semanticRootNodeId : undefined,
    });

    setGlobalErrorMessage(null);
    if (movedNodes === 0) {
      setQuerySyncMessage("Diagrama ja esta organizado.");
      return;
    }

    markDirtyState(
      `Organizacao aplicada: ${movedNodes} no(s) reposicionado(s). Salve para persistir no snapshot.`,
    );
  }

  function handleReapplyLayout() {
    const currentSnapshot = getCurrentSnapshot();

    if (currentSnapshot.allowReapplyLayout === false) {
      setGlobalErrorMessage(
        "Layout bloqueado por politica definida no Wizard. Ajuste antes de tentar novamente.",
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
        setQuerySyncMessage("Layout ja estava consistente.");
        return;
      }

      markDirtyState(
        `Layout reaplicado: ${movedNodes} no(s) reposicionado(s). Salve para persistir no snapshot.`,
      );
      return;
    }

    if (!isSupportedDiagramType(currentSnapshot.diagramType)) {
      setGlobalErrorMessage(
        "Reaplicar layout automatico exige um tipo suportado (hierarquia, processo ou mapa mental).",
      );
      return;
    }

    const nextSnapshot = reapplyLayoutForSnapshot(currentSnapshot);
    syncFromSnapshot(nextSnapshot);
    setGlobalErrorMessage(null);
    markDirtyState("Layout reaplicado. Salve para persistir no snapshot.");
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

    void (async () => {
      setActiveConnectionSourceNodeId(null);
      setPendingConnectionAssistant(null);
      const ready = await ensureQueueFlushedBeforeDirectWrite();
      if (!ready) {
        setGlobalErrorMessage("Conclua o salvamento pendente antes de criar a relacao.");
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
      setNodeInspectorMessage("JSON formatado.");
      setNodeInspectorErrors((current) => {
        const next = { ...current };
        delete next.dataJson;
        return next;
      });
    } catch {
      setNodeInspectorMessage("Nao foi possivel formatar: JSON invalido.");
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
      setEdgeInspectorMessage("JSON formatado.");
      setEdgeInspectorErrors((current) => {
        const next = { ...current };
        delete next.dataJson;
        return next;
      });
    } catch {
      setEdgeInspectorMessage("Nao foi possivel formatar: JSON invalido.");
    }
  }

  async function handleCopyNodeId() {
    if (!selectedNode) {
      return;
    }

    try {
      await copyTextToClipboard(selectedNode.id);
      setNodeInspectorMessage("ID copiado para a area de transferencia.");
    } catch {
      setNodeInspectorMessage("Falha ao copiar ID do no.");
    }
  }

  async function handleCopyEdgeId() {
    if (!selectedEdge) {
      return;
    }

    try {
      await copyTextToClipboard(selectedEdge.id);
      setEdgeInspectorMessage("ID copiado para a area de transferencia.");
    } catch {
      setEdgeInspectorMessage("Falha ao copiar ID da aresta.");
    }
  }

  async function handleCopyNodeJson() {
    if (!nodeInspectorDraft) {
      return;
    }

    try {
      await copyTextToClipboard(nodeInspectorDraft.dataJson);
      setNodeInspectorMessage("JSON copiado para a area de transferencia.");
    } catch {
      setNodeInspectorMessage("Falha ao copiar JSON.");
    }
  }

  async function handleCopyEdgeJson() {
    if (!edgeInspectorDraft) {
      return;
    }

    try {
      await copyTextToClipboard(edgeInspectorDraft.dataJson);
      setEdgeInspectorMessage("JSON copiado para a area de transferencia.");
    } catch {
      setEdgeInspectorMessage("Falha ao copiar JSON.");
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
        setNodeInspectorMessage("Conclua o salvamento pendente antes de aplicar.");
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
        setNodeInspectorMessage("No atualizado. Snapshot sincronizado com o servidor.");
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
              title: "Override tecnico",
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
                setNodeInspectorMessage(
                  "No atualizado com override tecnico registrado.",
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
      const feedback = getFriendlyInspectorFeedback(error);
      setNodeInspectorErrors(feedback.fieldErrors);
      setNodeInspectorMessage(feedback.message);
    }
  }

  async function handleApplyEdgeInspector() {
    if (!selectedEdge) return;

    setEdgeInspectorErrors({});
    setEdgeInspectorMessage(null);

    try {
      let command =
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
        setEdgeInspectorMessage("Conclua o salvamento pendente antes de aplicar.");
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
        setEdgeInspectorMessage("Aresta atualizada. Snapshot sincronizado com o servidor.");
        setGlobalErrorMessage(null);
      } catch (error) {
        if (error instanceof EditorQueryError) {
          if (
            error.code === "SEMANTIC_VIOLATION" &&
            inspectorMode === "technical" &&
            error.payload?.overrideAllowed
          ) {
            openTechnicalOverrideDialog({
              title: "Override tecnico",
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
                setEdgeInspectorMessage(
                  "Aresta atualizada com override tecnico registrado.",
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
      const feedback = getFriendlyInspectorFeedback(error);
      setEdgeInspectorErrors(feedback.fieldErrors);
      setEdgeInspectorMessage(feedback.message);
    }
  }

  return (
    <div
      className={`editor-grid ${isCanvasFocusMode ? "editor-grid-focus" : ""} ${
        isInspectorVisible ? "" : "editor-grid-inspector-hidden"
      }`}
    >
      <div className="editor-main-column">
        {shouldShowMetadataPanel ? (
          <section className="panel">
            <header className="panel-header">
              <div>
                <h3>{project.name}</h3>
                <p>
                  Snapshot de trabalho com salvamento continuo, versoes e inspetor.
                </p>
              </div>
              <div className="row-actions">
                <span
                  className={`badge ${isSupportedDiagramType(layoutMetadata.diagramType) ? "" : "badge-warning"}`}
                  data-testid="diagram-type-badge"
                >
                  {diagramDefinitionLabel}
                </span>
                <span className="badge" data-testid="visual-mode-badge">
                  Modo visual: {renderer.label}
                </span>
                <Link
                  className="btn btn-link"
                  href={`/wizard?projectId=${project.id}`}
                  data-testid="layout-policy-open-wizard-link"
                >
                  Alterar no Wizard
                </Link>
                <span
                  className={`badge ${isReapplyLayoutBlockedByPolicy ? "badge-warning" : ""}`}
                  data-testid="layout-policy-badge"
                >
                  Politica de layout: {layoutPolicyLabel}
                </span>
                <button
                  className="btn"
                  type="button"
                  onClick={() => handleTogglePanel("metadata")}
                  aria-expanded={panelState.metadata}
                  data-testid="editor-panel-metadata-toggle"
                >
                  {panelState.metadata
                    ? "▾ Metadados"
                    : `▸ Metadados (${nodes.length} nos)`}
                </button>
              </div>
            </header>
            {panelState.metadata ? (
              <div className="panel-body">
                <div className="row-actions editor-toolbar editor-toolbar-meta">
                  <span className="badge">
                    <span className="badge-dot" aria-hidden="true" />
                    Snapshot de trabalho
                  </span>
                  <span className="muted">
                    {pendingCommands.length} pendente(s) | {nodes.length} no(s) | {edges.length}{" "}
                    arestas
                  </span>
                  {lastSavedAtLabel ? (
                    <span className="muted">Ultimo salvamento: {lastSavedAtLabel}</span>
                  ) : null}
                  <span className="helper">{saveState.message}</span>
                  {isRefreshingFromQuery ? (
                    <span className="helper">Sincronizando com o backend...</span>
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
                    Remover selecionado
                  </button>
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={handleManualSave}
                    disabled={saveState.status === "saving" || isCreatingVersion}
                    data-testid="save-button"
                  >
                    {saveState.status === "saving" ? "Salvando..." : "Salvar"}
                  </button>
                  <div className="field">
                    <label className="sr-only" htmlFor="new-version-name-input">
                      Nome da nova versao (local)
                    </label>
                    <input
                      id="new-version-name-input"
                      value={newVersionName}
                      onChange={(event) => setNewVersionName(event.target.value)}
                      placeholder="Ex.: checkpoint antes da revisao (nome local opcional)"
                      aria-label="Nome da nova versao (local)"
                    />
                  </div>
                  <button
                    className="btn"
                    type="button"
                    onClick={handleCreateVersion}
                    disabled={saveState.status === "saving" || isCreatingVersion}
                    data-testid="create-version-button"
                  >
                    {isCreatingVersion ? "Criando versao..." : "Criar versao"}
                  </button>
                  <button
                    className="btn"
                    type="button"
                    onClick={handleReapplyLayout}
                    disabled={saveState.status === "saving" || !canReapplyLayout}
                    title={
                      isReapplyLayoutBlockedByPolicy
                        ? "Layout bloqueado no Wizard. Ajuste a politica para permitir reaplicacao."
                        : undefined
                    }
                    data-testid="reapply-layout-button"
                  >
                    Reaplicar layout
                  </button>
                  {hasDiagramRendererMismatch ? (
                    <span
                      className="warning-text"
                      data-testid="diagram-renderer-mismatch-warning"
                    >
                      O renderer atual nao corresponde ao tipo de diagrama salvo.
                      Use Reaplicar layout ou ajuste no Wizard.
                    </span>
                  ) : null}
                  {isReapplyLayoutBlockedByPolicy ? (
                    <>
                      <span className="badge badge-warning">Layout bloqueado</span>
                      <span className="helper">
                        A reaplicacao foi bloqueada para preservar o desenho definido no Wizard.
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
          <section className="panel" aria-label="Importar schema Prisma">
            <header className="panel-header">
              <div>
                <h3>Importar schema Prisma</h3>
                <p>Cole o `.prisma` para atualizar o snapshot de trabalho.</p>
              </div>
              <button
                className="btn"
                type="button"
                onClick={() => handleTogglePanel("prismaImport")}
                aria-expanded={panelState.prismaImport}
                data-testid="editor-panel-prisma-toggle"
              >
                {panelState.prismaImport ? "▾ Import Prisma" : "▸ Import Prisma"}
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
                    {isImportingPrismaSchema ? "Importando..." : "Importar"}
                  </button>
                  <span className="helper">
                    A importacao sobrescreve o snapshot de trabalho.
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
          <section className="panel" aria-label="Versoes do snapshot" id="versoes">
            <header className="panel-header">
              <div>
                <h3>Versoes</h3>
                <p>Compare e restaure checkpoints.</p>
              </div>
              <button
                className="btn"
                type="button"
                onClick={() => handleTogglePanel("versions")}
                aria-expanded={panelState.versions}
                data-testid="editor-panel-versions-toggle"
              >
                {panelState.versions
                  ? "▾ Versoes"
                  : `▸ Versoes (${snapshotVersions.length})`}
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
                    {isRefreshingVersionList ? "Atualizando..." : "Atualizar versoes"}
                  </button>
                  <span className="helper">
                    O nome da versao nesta tela e local (salvo apenas neste navegador).
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
                    <h4>Resumo de mudancas</h4>
                    <div className="version-diff-cards">
                      <article
                        className="version-diff-card"
                        data-testid="version-diff-card-nodes-added"
                      >
                        <span>Nos adicionados</span>
                        <strong>{versionDiffSummary.cards.nodesAdded}</strong>
                      </article>
                      <article
                        className="version-diff-card"
                        data-testid="version-diff-card-nodes-removed"
                      >
                        <span>Nos removidos</span>
                        <strong>{versionDiffSummary.cards.nodesRemoved}</strong>
                      </article>
                      <article
                        className="version-diff-card"
                        data-testid="version-diff-card-nodes-changed"
                      >
                        <span>Nos alterados</span>
                        <strong>{versionDiffSummary.cards.nodesChanged}</strong>
                      </article>
                      <article
                        className="version-diff-card"
                        data-testid="version-diff-card-edges-changed"
                      >
                        <span>Arestas alteradas</span>
                        <strong>{versionDiffSummary.cards.edgesChanged}</strong>
                      </article>
                    </div>
                    <p className="helper">
                      Alterados: {versionDiffSummary.changedBreakdown.renamed} renomeados,{" "}
                      {versionDiffSummary.changedBreakdown.kindChanged} com tipo alterado e{" "}
                      {versionDiffSummary.changedBreakdown.payloadChanged} com payload alterado.
                    </p>
                    <h5>Top mudancas</h5>
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
                      Nenhuma versao encontrada para este projeto.
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
                            Origem: {formatVersionOriginLabel(version.origin)}
                          </span>
                          <span className="muted">
                            {formatVersionCreatedAtLabel(version.createdAt)}
                          </span>
                        </div>

                        <div className="field">
                          <label htmlFor={`version-name-input-${version.id}`}>
                            Nome local da versao
                          </label>
                          <div className="row-actions">
                            <input
                              id={`version-name-input-${version.id}`}
                              value={versionNameDrafts[version.id] ?? ""}
                              onChange={(event) =>
                                handleVersionNameDraftChange(version.id, event.target.value)
                              }
                              placeholder="Ex.: baseline onboarding (somente local)"
                              data-testid={`version-name-input-${version.id}`}
                            />
                            <button
                              className="btn"
                              type="button"
                              onClick={() => handleSaveVersionName(version.id)}
                              disabled={saveState.status === "saving"}
                              data-testid={`version-save-name-button-${version.id}`}
                            >
                              Salvar nome
                            </button>
                          </div>
                          <span className="helper">
                            Este nome e usado apenas para facilitar consulta neste navegador.
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
                              ? "Comparando..."
                              : "Comparar"}
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
                              ? "Restaurando..."
                              : "Restaurar"}
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
          className={`${renderer.canvasClassName} ${
            isCanvasFocusMode ? "canvas-frame-focus" : ""
          }`}
          role="region"
          aria-label="Canvas do editor"
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
                Adicionar
              </button>
              <button
                className="btn"
                type="button"
                onClick={handleOpenQuickFind}
                data-testid="canvas-toolbar-quick-find"
              >
                Buscar (Ctrl+K)
              </button>
              <button
                className="btn"
                type="button"
                onClick={handleFitView}
                data-testid="center-diagram-button"
              >
                Ajustar
              </button>
              <button
                className="btn"
                type="button"
                onClick={handleOrganizeDiagram}
                data-testid="organize-diagram-button"
              >
                Organizar
              </button>
              <button
                className="btn"
                type="button"
                onClick={handleToggleValidationPanel}
                data-testid="semantic-audit-button"
              >
                {isValidationPanelOpen ? "Ocultar verificacao" : "Verificar"}
              </button>
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
                {isCanvasFocusMode ? "Sair do foco" : "Entrar em foco"}
              </button>
            </div>
          </div>

          <CanvasToolbar
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onCenterView={handleCenterView}
            isInFocusMode={isCanvasFocusMode}
          />

          {selectedNode || selectedEdge ? (
            <div className="canvas-selection-hud" data-testid="canvas-selection-hud">
              <div className="canvas-selection-hud-main">
                <strong>{selectedItemLabel}</strong>
                {selectedNode ? (
                  <span
                    className={`badge canvas-selection-kind-chip tone-${selectionNodeKindPresentation?.tone ?? "slate"}`}
                    data-testid="canvas-selection-kind-chip"
                  >
                    {getNodeKindLabel(selectedNode.data.kind, "operational")}
                    {inspectorMode === "technical"
                      ? ` (kind: ${selectedNode.data.kind})`
                      : ""}
                  </span>
                ) : selectedEdge ? (
                  <span className="badge canvas-selection-kind-chip" data-testid="canvas-selection-kind-chip">
                    {getEdgeKindLabel(selectedEdge.data?.kind ?? "flows-to", "operational")}
                    {inspectorMode === "technical"
                      ? ` (kind: ${selectedEdge.data?.kind ?? "flows-to"})`
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
                  Editar
                </button>
                <button className="btn" type="button" onClick={handleCenterView}>
                  Centralizar
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
                    Duplicar
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
                    Adicionar campo
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
                      ? "Expandir subarvore"
                      : "Colapsar subarvore"}
                  </button>
                ) : null}
                <button className="btn" type="button" onClick={handleRemoveSelected}>
                  Remover
                </button>
              </div>
            </div>
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
              <label htmlFor="inline-rename-input">Renomear no</label>
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
                  Cancelar
                </button>
                <button className="btn btn-primary" type="submit" data-testid="inline-rename-confirm">
                  Salvar
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
              aria-label="QuickAdd"
              data-testid="add-node-dialog"
              data-quick-add="true"
              onClick={(event) => event.stopPropagation()}
              onSubmit={(event) => {
                event.preventDefault();
                handleSubmitAddDialog();
              }}
            >
              <header className="add-node-dialog-header">
                <h3>QuickAdd</h3>
                <p className="helper">
                  Tipo + titulo rapido. Enter cria, Esc cancela.
                </p>
                {selectedNode && quickAddDefaultRelationLabel ? (
                  <p className="helper" data-testid="quick-add-default-connection">
                    Conexao padrao: {selectedNode.data.label} -[{quickAddDefaultRelationLabel}]- novo no.
                  </p>
                ) : null}
              </header>

              <div className="add-node-kind-grid">
                {getNodeKindOptions("operational").map((kind) => {
                  const presentation = getNodeKindPresentation(kind);
                  const isSelected = addNodeDraft.kind === kind;

                  return (
                    <button
                      key={kind}
                      type="button"
                      className={`add-node-kind-card ${isSelected ? "is-selected" : ""}`}
                      onClick={() =>
                        setAddNodeDraft((current) => ({
                          ...current,
                          kind,
                        }))
                      }
                      data-testid={`add-node-kind-${kind}`}
                    >
                      <span className={`badge add-node-kind-chip tone-${presentation.tone}`}>
                        <svg viewBox={presentation.icon.viewBox} aria-hidden="true" focusable="false">
                          <path d={presentation.icon.path} fill="currentColor" />
                        </svg>
                        {getNodeKindLabel(kind, "operational")}
                      </span>
                      <span className="helper">{getNodeKindDescription(kind)}</span>
                    </button>
                  );
                })}
              </div>

              <div className="field">
                <label htmlFor="add-node-title-input">Titulo</label>
                <input
                  id="add-node-title-input"
                  value={addNodeDraft.title}
                  onChange={(event) =>
                    setAddNodeDraft((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  placeholder={`Ex.: ${buildDefaultNodeTitle(addNodeDraft.kind, nodes.length + 1)}`}
                  required
                  autoFocus
                  data-testid="add-node-title-input"
                />
              </div>

              {inspectorMode === "operational" ? (
                <>
                  <div className="field">
                    <label htmlFor="add-node-description-input">Descricao (opcional)</label>
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
                    <label htmlFor="add-node-tags-input">Tags (opcional)</label>
                    <input
                      id="add-node-tags-input"
                      value={addNodeDraft.tagsText}
                      onChange={(event) =>
                        setAddNodeDraft((current) => ({
                          ...current,
                          tagsText: event.target.value,
                        }))
                      }
                      placeholder="Ex.: onboarding, aprovacao"
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
                  Cancelar
                </button>
                <button className="btn btn-primary" type="submit" data-testid="add-node-confirm-button">
                  Adicionar
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
            "Conexao invalida para as regras do diagrama."
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
            "A troca de tipo exige reparo para manter consistencia."
          }
          bullets={
            pendingNodeRepair
              ? [
                  ...pendingNodeRepair.violations.map(
                    (violation) => `${violation.severity.toUpperCase()}: ${violation.message}`,
                  ),
                  ...pendingNodeRepair.repairPlan.actions.map((action) => {
                    if (action.type === "updateEdgeKind") {
                      return `Atualizar relacao ${action.edgeId} para '${getEdgeKindLabel(action.nextKind, "operational")}'.`;
                    }
                    if (action.type === "removeEdge") {
                      return `Remover relacao invalida ${action.edgeId}.`;
                    }
                    return `Ajustar tipo do no para '${getNodeKindLabel(action.nextKind, "operational")}'.`;
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
              aria-label="Override tecnico"
              data-testid="semantic-override-dialog"
              onClick={(event) => event.stopPropagation()}
            >
              <header className="semantic-dialog-header">
                <h3>{pendingSemanticOverride.title}</h3>
                <p className="helper">{pendingSemanticOverride.message}</p>
                <p className="helper">
                  O override tecnico registra justificativa para auditoria e compliance.
                </p>
              </header>

              <div className="field">
                <label htmlFor="semantic-override-reason-input">
                  Justificativa
                  {pendingSemanticOverride.requireReason
                    ? ` obrigatoria (minimo ${MIN_SEMANTIC_OVERRIDE_REASON_LENGTH} caracteres)`
                    : " (opcional)"}
                </label>
                <textarea
                  id="semantic-override-reason-input"
                  rows={3}
                  value={semanticOverrideReason}
                  onChange={(event) => setSemanticOverrideReason(event.target.value)}
                  placeholder="Descreva o motivo tecnico do override."
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
                  Cancelar
                </button>
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => {
                    void handleConfirmSemanticOverride();
                  }}
                  data-testid="semantic-override-confirm"
                >
                  Aplicar override
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
          className="inspector"
          aria-label="Inspetor"
          data-testid="inspector-panel"
        >
          <div className="inspector-header">
            <div className="row-actions inspector-selection-row">
              <span className="badge">{inspectorSelectionBadge}</span>
              {hasInspectorDirtyDraft ? (
                <span className="badge editor-save-badge editor-save-badge-dirty editor-draft-badge">
                  Rascunho nao aplicado
                </span>
              ) : null}
            </div>
            <h3 className="inspector-selection-title" title={selectedItemLabel}>
              {selectedItemLabel}
            </h3>
            <p className="helper inspector-subtitle">
              Ajuste o item selecionado e aplique as alteracoes quando concluir.
            </p>
          </div>

          <div
            className="row-actions inspector-mode-toggle"
            role="group"
            aria-label="Modo do inspetor"
            data-testid="inspector-mode-toggle"
          >
            <button
              className={`btn ${inspectorMode === "operational" ? "btn-primary" : ""}`}
              type="button"
              aria-pressed={inspectorMode === "operational"}
              onClick={() => setInspectorMode("operational")}
              data-testid="inspector-operational"
            >
              Operacional
            </button>
            <button
              className={`btn ${inspectorMode === "technical" ? "btn-primary" : ""}`}
              type="button"
              aria-pressed={inspectorMode === "technical"}
              onClick={() => setInspectorMode("technical")}
              data-testid="inspector-technical"
            >
              Tecnico
            </button>
          </div>

          <section
            className={`semantic-audit-panel ${isValidationPanelOpen ? "is-open" : ""}`}
            aria-label="Verificacao semantica"
            data-testid="semantic-audit-panel"
          >
            <div className="row-actions semantic-audit-header">
              <strong>Verificacao semantica</strong>
              <span className="badge">
                {displayedSemanticAudit.counters.total} issue(s) | {displayedSemanticAudit.bySeverity.error} erro(s)
              </span>
            </div>

            {isValidationPanelOpen ? (
              displayedSemanticAudit.issues.length > 0 ? (
                <ul className="summary-list semantic-audit-list" data-testid="semantic-audit-issues">
                  {displayedSemanticAudit.issues.slice(0, 40).map((issue, index) => (
                    <li
                      key={issue.id}
                      className={`semantic-audit-item semantic-audit-item-${issue.severity}`}
                      data-testid={`semantic-issue-item-${index}`}
                    >
                      <div className="semantic-audit-item-main">
                        <strong>{issue.severity === "error" ? "Erro" : "Aviso"}</strong>
                        <span>{issue.message}</span>
                      </div>
                      <div className="row-actions">
                        <button
                          className="btn btn-link"
                          type="button"
                          onClick={() => handleFocusSemanticIssue(issue)}
                          data-testid={`semantic-issue-goto-${index}`}
                        >
                          Ir para
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="helper" data-testid="semantic-audit-empty">
                  Nenhuma inconsistencia semantica detectada.
                </p>
              )
            ) : (
              <p className="helper">Abra para navegar pelas validacoes e focar os itens.</p>
            )}
          </section>

          {selectedNode && inspectorMode === "operational" && operationalNodeDraft ? (
            <div className="stack-sm">
              <div className="row-actions inspector-selection-row">
                <span className="badge">No selecionado</span>
                {nodeInspectorDirty ? (
                  <span className="badge editor-save-badge editor-save-badge-dirty editor-draft-badge">
                    Rascunho nao aplicado
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
                  Geral {inspectorSections.general ? "▾" : "▸"}
                </button>
                <button
                  className="btn inspector-section-toggle"
                  type="button"
                  onClick={() => handleToggleInspectorSection("details")}
                  aria-expanded={inspectorSections.details}
                  data-testid="inspector-section-details-toggle"
                >
                  Detalhes {inspectorSections.details ? "▾" : "▸"}
                </button>
                <button
                  className="btn inspector-section-toggle"
                  type="button"
                  onClick={() => handleToggleInspectorSection("relations")}
                  aria-expanded={inspectorSections.relations}
                  data-testid="inspector-section-relations-toggle"
                >
                  Relacoes {inspectorSections.relations ? "▾" : "▸"}
                </button>
              </div>

              {inspectorSections.general ? (
                <>
                  <div className="field">
                    <label htmlFor="node-title-input">Titulo</label>
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
                    <label htmlFor="node-kind-operational-input">Tipo</label>
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
                      {nodeKindOptions.map((kind) => (
                        <option key={kind} value={kind}>
                          {getFriendlyNodeKindLabel(kind)}
                        </option>
                      ))}
                    </select>
                    <span className="helper">
                      {getFriendlyNodeKindDescription(operationalNodeDraft.kind)}
                    </span>
                  </div>
                </>
              ) : null}

              {inspectorSections.details ? (
                <>
                  <div className="field">
                    <label htmlFor="node-description-operational-input">Descricao</label>
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
                      placeholder="Opcional. Salvo em payload.description."
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="node-tags-operational-input">Tags</label>
                    <input
                      id="node-tags-operational-input"
                      value={operationalNodeDraft.tagsText}
                      onChange={(event) =>
                        setOperationalNodeDraft((current) =>
                          current ? { ...current, tagsText: event.target.value } : current,
                        )
                      }
                      placeholder="Ex.: onboarding, urgencia, aprovacao"
                    />
                    <span className="helper">
                      Separadas por virgula. Salvas em payload.tags como lista.
                    </span>
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
                  <h4>Relacoes</h4>
                  <p className="helper">
                    Entrada: {selectedNodeRelations.incomingCount} | Saida:{" "}
                    {selectedNodeRelations.outgoingCount}
                  </p>
                  {selectedNodeRelations.preview.length > 0 ? (
                    <ul className="summary-list">
                      {selectedNodeRelations.preview.map((relation) => (
                        <li key={relation.id}>
                          <button
                            className="btn btn-link"
                            type="button"
                            onClick={() =>
                              handleFocusRelation(relation.id, relation.otherNodeId)
                            }
                          >
                            {relation.direction === "incoming" ? "Entrada" : "Saida"}:{" "}
                            {relation.relation} - {relation.otherLabel}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="helper">Sem relacoes conectadas.</p>
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
                  Aplicar alteracoes
                </button>
                <button
                  className="btn"
                  type="button"
                  onClick={handleNodeInspectorReset}
                  data-testid="inspector-reset-node"
                >
                  Reverter
                </button>
              </div>
            </div>
          ) : null}

          {selectedNode && inspectorMode === "technical" && nodeInspectorDraft ? (
          <div className="stack-sm">
            <div className="row-actions inspector-selection-row">
              <span className="badge">Nó selecionado</span>
              {nodeInspectorDirty ? (
                <span className="badge editor-save-badge editor-save-badge-dirty editor-draft-badge">
                  Rascunho nao aplicado
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
                Geral {inspectorSections.general ? "▾" : "▸"}
              </button>
              <button
                className="btn inspector-section-toggle"
                type="button"
                onClick={() => handleToggleInspectorSection("details")}
                aria-expanded={inspectorSections.details}
                data-testid="inspector-section-details-toggle"
              >
                Detalhes {inspectorSections.details ? "▾" : "▸"}
              </button>
              <button
                className="btn inspector-section-toggle"
                type="button"
                onClick={() => handleToggleInspectorSection("advanced")}
                aria-expanded={inspectorSections.advanced}
                data-testid="inspector-section-advanced-toggle"
              >
                Avancado {inspectorSections.advanced ? "▾" : "▸"}
              </button>
            </div>

            {inspectorSections.general ? (
              <>
                <div className="field">
                  <label htmlFor="node-label-input">Rotulo</label>
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
                  <label htmlFor="node-kind-input">Kind (raw)</label>
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
                    {nodeKindOptions.map((kind) => (
                      <option key={kind} value={kind}>
                        {kind}
                      </option>
                    ))}
                  </select>
                  <span
                    className="helper"
                    title={getFriendlyNodeKindDescription(nodeInspectorDraft.kind)}
                  >
                    Label amigavel: {getFriendlyNodeKindLabel(nodeInspectorDraft.kind)}
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
                <label htmlFor="node-data-json-input">Dados (JSON)</label>
                <div className="row-actions">
                  <button className="btn" type="button" onClick={handleFormatNodeJson}>
                    Formatar JSON
                  </button>
                  <button className="btn" type="button" onClick={handleCopyNodeJson}>
                    Copiar JSON
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
                Aplicar alteracoes
              </button>
              <button
                className="btn"
                type="button"
                onClick={handleNodeInspectorReset}
                data-testid="inspector-reset-node"
              >
                Reverter
              </button>
            </div>

            {inspectorSections.advanced ? (
              <>
                <div className="row-actions">
                  <span className="badge mono" data-testid="inspector-node-id">
                    {selectedNode.id}
                  </span>
                  <button className="btn" type="button" onClick={handleCopyNodeId}>
                    Copiar ID
                  </button>
                </div>
                <dl className="inspector-meta-list">
                  <div>
                    <dt>Posicao</dt>
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

          {selectedEdge && inspectorMode === "operational" && operationalEdgeDraft ? (
            <div className="stack-sm">
              <div className="row-actions inspector-selection-row">
                <span className="badge">Aresta selecionada</span>
                {edgeInspectorDirty ? (
                  <span className="badge editor-save-badge editor-save-badge-dirty editor-draft-badge">
                    Rascunho nao aplicado
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
                  Geral {inspectorSections.general ? "▾" : "▸"}
                </button>
                <button
                  className="btn inspector-section-toggle"
                  type="button"
                  onClick={() => handleToggleInspectorSection("relations")}
                  aria-expanded={inspectorSections.relations}
                  data-testid="inspector-section-relations-toggle"
                >
                  Relacoes {inspectorSections.relations ? "▾" : "▸"}
                </button>
              </div>

              {inspectorSections.general ? (
                <>
                  <div className="field">
                    <label htmlFor="edge-label-operational-input">Rotulo</label>
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
                    <label htmlFor="edge-kind-operational-input">Relacao</label>
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
                          {getFriendlyEdgeKindLabel(kind)}
                        </option>
                      ))}
                    </select>
                    <span className="helper">
                      {getFriendlyEdgeKindDescription(operationalEdgeDraft.kind)}
                    </span>
                  </div>
                </>
              ) : null}

              {inspectorSections.relations ? (
                <dl className="inspector-meta-list">
                  <div>
                    <dt>Origem</dt>
                    <dd>{selectedEdgeSourceLabel}</dd>
                  </div>
                  <div>
                    <dt>Destino</dt>
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
                  Aplicar alteracoes
                </button>
                <button className="btn" type="button" onClick={handleEdgeInspectorReset}>
                  Reverter
                </button>
                <button
                  className="btn"
                  type="button"
                  onClick={handleRemoveSelected}
                  disabled={saveState.status === "saving"}
                >
                  Remover aresta
                </button>
              </div>
            </div>
          ) : null}

          {selectedEdge && inspectorMode === "technical" && edgeInspectorDraft ? (
          <div className="stack-sm">
            <div className="row-actions inspector-selection-row">
              <span className="badge">Aresta selecionada</span>
              {edgeInspectorDirty ? (
                <span className="badge editor-save-badge editor-save-badge-dirty editor-draft-badge">
                  Rascunho nao aplicado
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
                Geral {inspectorSections.general ? "▾" : "▸"}
              </button>
              <button
                className="btn inspector-section-toggle"
                type="button"
                onClick={() => handleToggleInspectorSection("details")}
                aria-expanded={inspectorSections.details}
                data-testid="inspector-section-details-toggle"
              >
                Detalhes {inspectorSections.details ? "▾" : "▸"}
              </button>
              <button
                className="btn inspector-section-toggle"
                type="button"
                onClick={() => handleToggleInspectorSection("advanced")}
                aria-expanded={inspectorSections.advanced}
                data-testid="inspector-section-advanced-toggle"
              >
                Avancado {inspectorSections.advanced ? "▾" : "▸"}
              </button>
            </div>

            {inspectorSections.general ? (
              <>
                <div className="field">
                  <label htmlFor="edge-label-input">Rotulo</label>
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
                  <label htmlFor="edge-kind-input">Kind (raw)</label>
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
                    title={getFriendlyEdgeKindDescription(edgeInspectorDraft.kind)}
                  >
                    Label amigavel: {getFriendlyEdgeKindLabel(edgeInspectorDraft.kind)}
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
                <label htmlFor="edge-data-json-input">Dados (JSON)</label>
                <div className="row-actions">
                  <button className="btn" type="button" onClick={handleFormatEdgeJson}>
                    Formatar JSON
                  </button>
                  <button className="btn" type="button" onClick={handleCopyEdgeJson}>
                    Copiar JSON
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
                Aplicar alteracoes
              </button>
              <button className="btn" type="button" onClick={handleEdgeInspectorReset}>
                Reverter
              </button>
              <button
                className="btn"
                type="button"
                onClick={handleRemoveSelected}
                disabled={saveState.status === "saving"}
              >
                Remover aresta
              </button>
            </div>

            {inspectorSections.advanced ? (
              <>
                <div className="row-actions">
                  <span className="badge mono">{selectedEdge.id}</span>
                  <button className="btn" type="button" onClick={handleCopyEdgeId}>
                    Copiar ID
                  </button>
                </div>
                <dl className="inspector-meta-list">
                  <div>
                    <dt>Ligacao</dt>
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
            <p className="helper">Nenhum item selecionado no canvas.</p>
            <p className="helper">
              Selecione um no ou aresta para revisar titulos, relacoes e detalhes.
            </p>
            <p className="helper">
              Para iniciar ajustes: selecione um elemento no diagrama ou adicione
              um novo nó na barra superior.
            </p>
            <dl className="inspector-meta-list">
              <div>
                <dt>Nós</dt>
                <dd>{nodes.length}</dd>
              </div>
              <div>
                <dt>Arestas</dt>
                <dd>{edges.length}</dd>
              </div>
              <div>
                <dt>Viewport</dt>
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
