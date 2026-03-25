import { useEffect, useMemo, useRef, useState } from "react";
import type { RFEdge, RFNode } from "../editor-graph-mappers";
import type { EditorTranslationFn } from "../editor-i18n";
import type { InspectorMode } from "../editor-inspector-personas";
import type { InspectorFieldErrors } from "../editor-inspector-feedback";
import type { EdgeInspectorDraft, NodeInspectorDraft } from "../editor-inspector-schemas";
import type { OperationalNodeDraft } from "../editor-inspector-personas";
import { createOperationalNodeDraft } from "../editor-inspector-personas";
import {
  DEFAULT_INSPECTOR_SECTION_STATE,
  type InspectorSectionState,
  type OperationalEdgeDraft,
} from "./editor-shell-types";
import {
  areEdgeDraftValuesEqual,
  areNodeDraftValuesEqual,
  areOperationalEdgeDraftValuesEqual,
  areOperationalNodeDraftValuesEqual,
  createEdgeInspectorDraft,
  createNodeInspectorDraft,
  getEdgeSelectionSyncKey,
  getNodeSelectionSyncKey,
  sanitizeInspectorSectionState,
} from "./editor-shell-utils";

const INSPECTOR_MODE_STORAGE_KEY = "mapia-inspector-mode";
const INSPECTOR_SECTIONS_STORAGE_KEY_PREFIX = "mapia-inspector-sections";

type UseEditorInspectorControllerInput = {
  projectId: string;
  selectedNode: RFNode | null;
  selectedEdge: RFEdge | null;
  editorT: EditorTranslationFn;
};

export function useEditorInspectorController({
  projectId,
  selectedNode,
  selectedEdge,
  editorT,
}: UseEditorInspectorControllerInput) {
  const inspectorSectionsStorageKey = `${INSPECTOR_SECTIONS_STORAGE_KEY_PREFIX}:${projectId}`;
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
  const [inspectorMode, setInspectorMode] = useState<InspectorMode>("operational");
  const [hasHydratedInspectorMode, setHasHydratedInspectorMode] = useState(false);
  const [inspectorSections, setInspectorSections] = useState<InspectorSectionState>(
    DEFAULT_INSPECTOR_SECTION_STATE,
  );
  const [hasHydratedInspectorSections, setHasHydratedInspectorSections] =
    useState(false);
  const selectedNodeRef = useRef<RFNode | null>(null);
  const selectedEdgeRef = useRef<RFEdge | null>(null);

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
      createOperationalNodeDraft(
        {
          label: selectedNodeForInspector.data.label,
          kind: selectedNodeForInspector.data.kind,
          payload: selectedNodeForInspector.data.payload,
        },
        editorT,
      ),
    );
    setNodeInspectorErrors({});
    setNodeInspectorMessage(null);
  }, [editorT, selectedNodeSyncKey]);

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
      label: selectedEdgeForInspector.label
        ? String(selectedEdgeForInspector.label)
        : "",
      kind: selectedEdgeForInspector.data?.kind ?? "flows-to",
    });
    setEdgeInspectorErrors({});
    setEdgeInspectorMessage(null);
  }, [selectedEdgeSyncKey]);

  const nodeInspectorDirty =
    inspectorMode === "operational"
      ? selectedNode !== null &&
        operationalNodeDraft !== null &&
        !areOperationalNodeDraftValuesEqual(selectedNode, operationalNodeDraft)
      : selectedNode !== null &&
        nodeInspectorDraft !== null &&
        !areNodeDraftValuesEqual(selectedNode, nodeInspectorDraft);

  const edgeInspectorDirty =
    inspectorMode === "operational"
      ? selectedEdge !== null &&
        operationalEdgeDraft !== null &&
        !areOperationalEdgeDraftValuesEqual(selectedEdge, operationalEdgeDraft)
      : selectedEdge !== null &&
        edgeInspectorDraft !== null &&
        !areEdgeDraftValuesEqual(selectedEdge, edgeInspectorDraft);

  const nodeInspectorHasErrors = Object.keys(nodeInspectorErrors).length > 0;
  const edgeInspectorHasErrors = Object.keys(edgeInspectorErrors).length > 0;
  const hasInspectorDirtyDraft = nodeInspectorDirty || edgeInspectorDirty;

  function handleToggleInspectorSection(sectionKey: keyof InspectorSectionState) {
    setInspectorSections((current) => ({
      ...current,
      [sectionKey]: !current[sectionKey],
    }));
  }

  function confirmInspectorDraftDiscardIfNeeded() {
    if (!hasInspectorDirtyDraft) {
      return true;
    }

    return window.confirm(
      editorT("shell.inspector.confirmDiscardDraft"),
    );
  }

  return {
    inspectorMode,
    setInspectorMode,
    inspectorSections,
    setInspectorSections,
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
  };
}
