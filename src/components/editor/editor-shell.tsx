"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import type { Connection, ReactFlowInstance } from "@xyflow/react";
import { EdgeKindSchema, NodeKindSchema } from "@/src/domain";
import {
  getDiagramTypeLabel,
  isSupportedDiagramType,
  reapplyLayoutForSnapshot,
} from "@/src/modules/graph/domain";
import type { EditorCommand } from "@/src/modules/editor/application";
import {
  applyEditorCommandLocally,
  applyEditorCommandRemotely,
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
  fromCanonicalSnapshotToFlowState,
  toCanonicalSnapshotFromFlowState,
  type EditorSnapshotLayoutMetadata,
  type RFEdge,
  type RFNode,
} from "./editor-graph-mappers";
import {
  createSnapshotVersionForEditor,
  importPrismaSchemaForEditor,
  listSnapshotVersionsForEditor,
  loadSnapshotVersionDiffForEditor,
  loadWorkingSnapshotForEditor,
  restoreSnapshotVersionForEditor,
  saveWorkingSnapshotForEditor,
  type EditorPrismaSchemaImportSummary,
  type EditorSnapshotVersionDiff,
  type EditorSnapshotVersionSummary,
} from "./editor-query-service";
import { usePendingChangesGuard } from "./use-pending-changes-guard";

const AUTOSAVE_DELAY_MS = 1000;
const DEFAULT_SNAPSHOT_LABEL = "fase1-working-v1";
const VERSION_NAMES_STORAGE_KEY_PREFIX = "mapia.editor.version-names";

type EditorProjectViewModel = {
  id: string;
  name: string;
  slug: string;
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

function buildVersionDiffFeedbackMessage(diff: EditorSnapshotVersionDiff) {
  if (!diff.hasChanges) {
    return "Sem alteracoes entre a versao selecionada e o snapshot de trabalho.";
  }

  const parts: string[] = [];

  if (diff.nodesAdded.length > 0) {
    parts.push(`${diff.nodesAdded.length} node(s) adicionados`);
  }
  if (diff.nodesRemoved.length > 0) {
    parts.push(`${diff.nodesRemoved.length} node(s) removidos`);
  }
  if (diff.nodesChanged.length > 0) {
    parts.push(`${diff.nodesChanged.length} node(s) alterados`);
  }
  if (diff.edgesAdded.length > 0) {
    parts.push(`${diff.edgesAdded.length} edge(s) adicionadas`);
  }
  if (diff.edgesRemoved.length > 0) {
    parts.push(`${diff.edgesRemoved.length} edge(s) removidas`);
  }
  if (diff.edgesChanged.length > 0) {
    parts.push(`${diff.edgesChanged.length} edge(s) alteradas`);
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

  return `Schema Prisma importado com sucesso (${summary.modelsCount} model(s), ${summary.relationsCount} relacao(oes), ${summary.scalarFieldsCount} campo(s) escalar(es)).`;
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
  const canImportPrismaSchema = prismaSchemaImportText.trim().length > 0;
  const hasPendingChangesGuard =
    pendingCommands.length > 0 || saveState.isDirty || saveState.status === "saving";

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
  const reactFlowInstanceRef = useRef<ReactFlowInstance<RFNode, RFEdge> | null>(
    null,
  );

  usePendingChangesGuard(hasPendingChangesGuard);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

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
    const debouncer = autosaveDebouncerRef.current;
    return () => {
      debouncer.cancel();
    };
  }, []);

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );
  const selectedEdge = useMemo(
    () => edges.find((edge) => edge.id === selectedEdgeId) ?? null,
    [edges, selectedEdgeId],
  );
  const currentDiagramTypeLabel = useMemo(
    () => getDiagramTypeLabel(layoutMetadata.diagramType),
    [layoutMetadata.diagramType],
  );
  const canReapplyLayout = useMemo(
    () => isSupportedDiagramType(layoutMetadata.diagramType),
    [layoutMetadata.diagramType],
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
      setNodeInspectorErrors({});
      setNodeInspectorMessage(null);
      return;
    }

    setNodeInspectorDraft(createNodeInspectorDraft(selectedNodeForInspector));
    setNodeInspectorErrors({});
    setNodeInspectorMessage(null);
  }, [selectedNodeSyncKey]);

  useEffect(() => {
    const selectedEdgeForInspector = selectedEdgeRef.current;

    if (!selectedEdgeForInspector) {
      setEdgeInspectorDraft(null);
      setEdgeInspectorErrors({});
      setEdgeInspectorMessage(null);
      return;
    }

    setEdgeInspectorDraft(createEdgeInspectorDraft(selectedEdgeForInspector));
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
      selectedNode !== null &&
      nodeInspectorDraft !== null &&
      !areNodeDraftValuesEqual(selectedNode, nodeInspectorDraft);
    const edgeDirty =
      selectedEdge !== null &&
      edgeInspectorDraft !== null &&
      !areEdgeDraftValuesEqual(selectedEdge, edgeInspectorDraft);

    return nodeDirty || edgeDirty;
  }

  function confirmInspectorDraftDiscardIfNeeded() {
    if (!hasInspectorDraftPendingChanges()) {
      return true;
    }

    return window.confirm(
      "Existem alteracoes no inspector ainda nao aplicadas. Deseja descartar?",
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
        await applyEditorCommandRemotely(project.id, entry.command);

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
      await saveWorkingSnapshotForEditor({
        projectId: project.id,
        snapshot: snapshotToSave,
        label: DEFAULT_SNAPSHOT_LABEL,
      });

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

    try {
      const diff = await loadSnapshotVersionDiffForEditor(project.id, versionId);
      setVersionDiffFeedback({
        kind: "info",
        message: buildVersionDiffFeedbackMessage(diff),
      });
      setVersionActionFeedback(null);
    } catch (error) {
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

    try {
      const result = await restoreSnapshotVersionForEditor({
        projectId: project.id,
        versionId: version.id,
      });

      syncFromSnapshot(result.workingSnapshot.snapshot);
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
      });

      syncFromSnapshot(result.workingSnapshot.snapshot);
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
        const result = await loadWorkingSnapshotForEditor(project.id);
        if (!active) return;

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

          const next = fromCanonicalSnapshotToFlowState(result.snapshot);
          nodesRef.current = next.nodes;
          edgesRef.current = next.edges;
          viewportRef.current = next.viewport;
          layoutMetadataRef.current = next.layoutMetadata;
          setNodes(next.nodes);
          setEdges(next.edges);
          setViewport(next.viewport);
          setLayoutMetadata(next.layoutMetadata);
          setPendingCommandsState([]);
          localMutationVersionRef.current = 0;
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
  const nodeInspectorDirty =
    selectedNode !== null && nodeInspectorDraft !== null
      ? !areNodeDraftValuesEqual(selectedNode, nodeInspectorDraft)
      : false;
  const edgeInspectorDirty =
    selectedEdge !== null && edgeInspectorDraft !== null
      ? !areEdgeDraftValuesEqual(selectedEdge, edgeInspectorDraft)
      : false;
  const nodeInspectorHasErrors = Object.keys(nodeInspectorErrors).length > 0;
  const edgeInspectorHasErrors = Object.keys(edgeInspectorErrors).length > 0;

  const nodeKindOptions = NodeKindSchema.options;
  const edgeKindOptions = EdgeKindSchema.options;

  function handleAddNode() {
    const nextNodeId = crypto.randomUUID();
    const offset = nodes.length * 32;
    const applied = applyLocalCommandAndQueue({
      type: "addNode",
      node: {
        id: nextNodeId,
        kind: "note",
        label: `Novo no ${nodes.length + 1}`,
        position: { x: 120 + offset, y: 120 + offset / 2 },
        data: {},
      },
    });

    if (applied) {
      selectItem({ nodeId: nextNodeId, edgeId: null });
    }
  }

  function handleCenterDiagram() {
    reactFlowInstanceRef.current?.fitView({
      padding: 0.2,
    });
  }

  function handleReapplyLayout() {
    const currentSnapshot = getCurrentSnapshot();

    if (!isSupportedDiagramType(currentSnapshot.diagramType)) {
      setGlobalErrorMessage(
        "Reaplicar layout automatico exige tipo suportado (tree, flow ou mindmap).",
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

    applyLocalCommandAndQueue({
      type: "addEdge",
      edge: {
        id: crypto.randomUUID(),
        sourceNodeId: connection.source,
        targetNodeId: connection.target,
        kind: "flows-to",
        label: "relacao",
        data: {},
      },
    });
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
    setNodeInspectorErrors({});
    setNodeInspectorMessage(null);
  }

  function handleEdgeInspectorReset() {
    if (!selectedEdge) return;
    setEdgeInspectorDraft(createEdgeInspectorDraft(selectedEdge));
    setEdgeInspectorErrors({});
    setEdgeInspectorMessage(null);
  }

  function handleApplyNodeInspector() {
    if (!selectedNode || !nodeInspectorDraft) return;

    setNodeInspectorErrors({});
    setNodeInspectorMessage(null);

    try {
      const command = buildUpdateNodeCommandFromInspectorForm({
        nodeId: selectedNode.id,
        label: nodeInspectorDraft.label,
        kind: nodeInspectorDraft.kind,
        dataJson: nodeInspectorDraft.dataJson,
      });

      applyLocalCommandAndQueue(command, "Node atualizado. Autosave agendado.");
    } catch (error) {
      const feedback = getFriendlyInspectorFeedback(error);
      setNodeInspectorErrors(feedback.fieldErrors);
      setNodeInspectorMessage(feedback.message);
    }
  }

  function handleApplyEdgeInspector() {
    if (!selectedEdge || !edgeInspectorDraft) return;

    setEdgeInspectorErrors({});
    setEdgeInspectorMessage(null);

    try {
      const command = buildUpdateEdgeCommandFromInspectorForm({
        edgeId: selectedEdge.id,
        label: edgeInspectorDraft.label,
        kind: edgeInspectorDraft.kind,
        dataJson: edgeInspectorDraft.dataJson,
      });

      applyLocalCommandAndQueue(command, "Edge atualizada. Autosave agendado.");
    } catch (error) {
      const feedback = getFriendlyInspectorFeedback(error);
      setEdgeInspectorErrors(feedback.fieldErrors);
      setEdgeInspectorMessage(feedback.message);
    }
  }

  return (
    <div className="editor-grid">
      <div>
        <section className="panel">
          <header className="panel-header">
            <div>
              <h3>{project.name}</h3>
              <p>
                Editor visual do snapshot de trabalho com versoes e inspector.
              </p>
            </div>
            <div className="row-actions">
              <span className="badge" data-testid="diagram-type-badge">
                Tipo: {currentDiagramTypeLabel}
              </span>
              <span
                className={saveStatusClassName}
                aria-live="polite"
                data-testid="save-status-badge"
                data-save-status={saveState.status}
              >
                {saveStatusLabel}
              </span>
            </div>
          </header>
          <div className="panel-body">
            <div className="row-actions editor-toolbar editor-toolbar-meta">
              <span className="badge">
                <span className="badge-dot" aria-hidden="true" />
                Snapshot de trabalho
              </span>
              <span className="muted">
                {pendingCommands.length} pendente(s) | {nodes.length} nos | {edges.length}{" "}
                arestas
              </span>
              {lastSavedAtLabel ? (
                <span className="muted">Ultimo salvamento: {lastSavedAtLabel}</span>
              ) : null}
              <span className="helper">{saveState.message}</span>
              {isRefreshingFromQuery ? (
                <span className="helper">Sincronizando query...</span>
              ) : null}
              {querySyncMessage ? <span className="helper">{querySyncMessage}</span> : null}
            </div>

            <div className="row-actions editor-toolbar editor-toolbar-actions">
              <button
                className="btn"
                type="button"
                onClick={handleAddNode}
                disabled={saveState.status === "saving"}
                data-testid="add-node-button"
              >
                Adicionar no
              </button>
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
                  Nome da nova versao
                </label>
                <input
                  id="new-version-name-input"
                  value={newVersionName}
                  onChange={(event) => setNewVersionName(event.target.value)}
                  placeholder="Nome da nova versao (opcional)"
                  aria-label="Nome da nova versao"
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
                onClick={handleCenterDiagram}
                data-testid="center-diagram-button"
              >
                Centralizar diagrama
              </button>
              <button
                className="btn"
                type="button"
                onClick={handleReapplyLayout}
                disabled={saveState.status === "saving" || !canReapplyLayout}
                data-testid="reapply-layout-button"
              >
                Reaplicar layout
              </button>
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
        </section>

        <section
          className="panel stack-sm"
          aria-label="Importar schema Prisma"
          data-testid="prisma-schema-import-panel"
        >
          <div className="row-actions">
            <strong>Importar schema Prisma</strong>
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
              Cole seu `.prisma`. A importacao sobrescreve o snapshot de trabalho.
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
        </section>

        <section
          className="panel stack-sm"
          aria-label="Versoes do snapshot"
        >
          <div className="row-actions">
            <strong>Versoes</strong>
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
              Compare, restaure e nomeie localmente as versoes para consulta rapida.
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
                  <div className="row-actions" style={{ justifyContent: "space-between" }}>
                    <span className="badge">
                      {getVersionDisplayName(version)} | {version.origin}
                    </span>
                    <span className="muted">
                      {formatVersionCreatedAtLabel(version.createdAt)}
                    </span>
                  </div>

                  <div className="field">
                    <label htmlFor={`version-name-input-${version.id}`}>
                      Nome da versao
                    </label>
                    <div className="row-actions">
                      <input
                        id={`version-name-input-${version.id}`}
                        value={versionNameDrafts[version.id] ?? ""}
                        onChange={(event) =>
                          handleVersionNameDraftChange(version.id, event.target.value)
                        }
                        placeholder="Ex.: baseline onboarding"
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
        </section>

        {globalErrorMessage ? (
          <div
            className="error-box editor-global-error"
            data-testid="global-error"
          >
            {globalErrorMessage}
          </div>
        ) : null}

        <div
          className="canvas-frame"
          role="region"
          aria-label="Canvas do editor"
          data-testid="editor-canvas"
        >
          <ReactFlow<RFNode, RFEdge>
            fitView
            nodes={nodes}
            edges={edges}
            onInit={(instance) => {
              reactFlowInstanceRef.current = instance;
            }}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={handleConnect}
            onMoveEnd={(_, nextViewport) => setViewport(nextViewport)}
            onNodeDragStop={(_, node) => handleNodeDragStop(node)}
            onNodeClick={(_, node) => {
              selectItem({ nodeId: node.id, edgeId: null });
            }}
            onEdgeClick={(_, edge) => {
              selectItem({ nodeId: null, edgeId: edge.id });
            }}
            onPaneClick={() => {
              selectItem({ nodeId: null, edgeId: null });
            }}
            colorMode="light"
            defaultViewport={initialFlowState.viewport}
            deleteKeyCode={null}
          >
            <Background gap={18} color="rgba(17, 94, 89, 0.12)" />
            <MiniMap
              pannable
              zoomable
              style={{ background: "rgba(255,255,255,0.9)", borderRadius: 10 }}
            />
            <Controls />
          </ReactFlow>
        </div>
      </div>

      <aside
        className="inspector"
        aria-label="Inspector"
        data-testid="inspector-panel"
      >
        <div className="inspector-header">
          <h3>Inspector</h3>
          <p className="helper inspector-subtitle">
            Edite o item selecionado e aplique as alteracoes quando estiver pronto.
          </p>
        </div>

        {selectedNode && nodeInspectorDraft ? (
          <div className="stack-sm">
            <div className="row-actions inspector-selection-row">
              <span className="badge">No selecionado</span>
              {nodeInspectorDirty ? (
                <span className="badge editor-save-badge editor-save-badge-dirty editor-draft-badge">
                  Rascunho nao aplicado
                </span>
              ) : null}
            </div>

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
              <label htmlFor="node-kind-input">Tipo</label>
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
              {nodeInspectorErrors.kind ? (
                <span className="helper field-error" role="alert">
                  {nodeInspectorErrors.kind}
                </span>
              ) : null}
            </div>

            <div className="field">
              <label htmlFor="node-data-json-input">Dados (JSON)</label>
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

            <dl className="inspector-meta-list">
              <div>
                <dt>ID</dt>
                <dd data-testid="inspector-node-id">{selectedNode.id}</dd>
              </div>
              <div>
                <dt>Posicao</dt>
                <dd data-testid="inspector-node-position">
                  {Math.round(selectedNode.position.x)},{" "}
                  {Math.round(selectedNode.position.y)}
                </dd>
              </div>
            </dl>
          </div>
        ) : null}

        {selectedEdge && edgeInspectorDraft ? (
          <div className="stack-sm">
            <div className="row-actions inspector-selection-row">
              <span className="badge">Aresta selecionada</span>
              {edgeInspectorDirty ? (
                <span className="badge editor-save-badge editor-save-badge-dirty editor-draft-badge">
                  Rascunho nao aplicado
                </span>
              ) : null}
            </div>

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
              <label htmlFor="edge-kind-input">Tipo</label>
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
              {edgeInspectorErrors.kind ? (
                <span className="helper field-error" role="alert">
                  {edgeInspectorErrors.kind}
                </span>
              ) : null}
            </div>

            <div className="field">
              <label htmlFor="edge-data-json-input">Dados (JSON)</label>
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
                Remover edge
              </button>
            </div>

            <dl className="inspector-meta-list">
              <div>
                <dt>ID</dt>
                <dd>{selectedEdge.id}</dd>
              </div>
              <div>
                <dt>Ligacao</dt>
                <dd>
                  {selectedEdge.source} -&gt; {selectedEdge.target}
                </dd>
              </div>
            </dl>
          </div>
        ) : null}

        {!selectedNode && !selectedEdge ? (
          <div className="inspector-empty-state" data-testid="inspector-empty-state">
            <p className="helper">Nenhum item selecionado no canvas.</p>
            <p className="helper">
              Selecione um no ou aresta para editar rotulo, tipo e dados em JSON.
            </p>
            <dl className="inspector-meta-list">
              <div>
                <dt>Nos</dt>
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
    </div>
  );
}
