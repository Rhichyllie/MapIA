import { useCallback } from "react";
import type { RefObject } from "react";
import { applyEditorCommandsLocally } from "../editor-command-service";
import type { EditorTranslationFn } from "../editor-i18n";
import type { RFEdge, RFNode } from "../editor-graph-mappers";
import { validateSemanticDraftForEditor, type SemanticPolicyPayload } from "../editor-query-service";
import type { InspectorMode } from "../editor-inspector-personas";
import { validateEdgeCreation, type SemanticEngineOptions } from "../semantics/semantics";
import {
  DEFAULT_ADD_NODE_OFFSET,
  type ClipboardAddEdgeCommand,
  type ClipboardAddNodeCommand,
  type ClipboardCommandsDraft,
  type MapiaClipboardFragment,
} from "./editor-shell-types";
import { clonePayload, formatErrorMessage, isClipboardPartialEdgePasteEnabled } from "./editor-shell-utils";

const MAPIA_CLIPBOARD_MIME = "application/x-mapia-fragment+json";

type ClipboardMutationResult = {
  appliedNodes: number;
  appliedEdges: number;
  skippedEdges: number;
};

type UseEditorClipboardControllerInput = {
  projectId: string;
  editorT: EditorTranslationFn;
  selectedNode: RFNode | null;
  selectedEdge: RFEdge | null;
  nodesRef: RefObject<RFNode[]>;
  getCurrentSnapshot: () => Parameters<typeof applyEditorCommandsLocally>[0];
  applyLocalCommandAndQueue: (command: ClipboardAddNodeCommand | ClipboardAddEdgeCommand) => boolean;
  selectItem: (next: { nodeId: string | null; edgeId: string | null }) => void;
  handleRemoveSelected: () => void;
  inspectorMode: InspectorMode;
  semanticDiagramType: Parameters<typeof validateEdgeCreation>[0]["diagramType"];
  semanticEngineOptions?: SemanticEngineOptions;
  semanticPolicy: SemanticPolicyPayload | null;
  setSemanticPolicy: (policy: SemanticPolicyPayload | null) => void;
  setQuerySyncMessage: (message: string | null) => void;
  setGlobalErrorMessage: (message: string | null) => void;
};

export function buildClipboardFragmentFromSelection(input: {
  projectId: string;
  selectedNode: RFNode | null;
  selectedEdge: RFEdge | null;
  nodes: RFNode[];
}): MapiaClipboardFragment | null {
  if (input.selectedNode) {
    return {
      version: 1,
      sourceProjectId: input.projectId,
      nodes: [
        {
          id: input.selectedNode.id,
          kind: input.selectedNode.data.kind,
          label: input.selectedNode.data.label,
          position: {
            x: input.selectedNode.position.x,
            y: input.selectedNode.position.y,
          },
          data: clonePayload(input.selectedNode.data.payload),
        },
      ],
      edges: [],
    };
  }

  if (input.selectedEdge) {
    const sourceNode = input.nodes.find((node) => node.id === input.selectedEdge?.source);
    const targetNode = input.nodes.find((node) => node.id === input.selectedEdge?.target);

    if (!sourceNode || !targetNode) {
      return null;
    }

    return {
      version: 1,
      sourceProjectId: input.projectId,
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
          id: input.selectedEdge.id,
          sourceNodeId: input.selectedEdge.source,
          targetNodeId: input.selectedEdge.target,
          kind: input.selectedEdge.data?.kind ?? "flows-to",
          label: input.selectedEdge.label ? String(input.selectedEdge.label) : undefined,
          data: clonePayload(input.selectedEdge.data?.payload ?? {}),
        },
      ],
    };
  }

  return null;
}

export function buildClipboardCommandsDraft(
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

  return {
    nodeCommands,
    edgeCommands,
    skippedEdges,
    firstInsertedNodeId: nodeCommands[0]?.node.id,
  };
}

export function applyClipboardCommandsLocally(input: {
  draft: ClipboardCommandsDraft;
  applyLocalCommandAndQueue: (command: ClipboardAddNodeCommand | ClipboardAddEdgeCommand) => boolean;
  selectItem: (next: { nodeId: string | null; edgeId: string | null }) => void;
}): ClipboardMutationResult {
  let appliedNodes = 0;
  let appliedEdges = 0;

  for (const command of input.draft.nodeCommands) {
    if (input.applyLocalCommandAndQueue(command)) {
      appliedNodes += 1;
    }
  }

  for (const command of input.draft.edgeCommands) {
    if (input.applyLocalCommandAndQueue(command)) {
      appliedEdges += 1;
    }
  }

  if (input.draft.firstInsertedNodeId) {
    input.selectItem({
      nodeId: input.draft.firstInsertedNodeId,
      edgeId: null,
    });
  }

  return {
    appliedNodes,
    appliedEdges,
    skippedEdges: input.draft.skippedEdges,
  };
}

export function filterClipboardEdgesBySemanticRules(input: {
  draft: ClipboardCommandsDraft;
  diagramType: Parameters<typeof validateEdgeCreation>[0]["diagramType"];
  inspectorMode: InspectorMode;
  semanticEngineOptions?: SemanticEngineOptions;
}): ClipboardCommandsDraft {
  const nodeMap = new Map(
    input.draft.nodeCommands.map((command) => [
      command.node.id,
      {
        id: command.node.id,
        kind: command.node.kind,
        label: command.node.label,
        payload: command.node.data,
      },
    ] as const),
  );

  const filteredEdgeCommands = input.draft.edgeCommands.filter((command) => {
    const sourceNode = nodeMap.get(command.edge.sourceNodeId);
    const targetNode = nodeMap.get(command.edge.targetNodeId);
    const semanticCheck = validateEdgeCreation(
      {
        diagramType: input.diagramType,
        sourceNode,
        targetNode,
        edgeKind: command.edge.kind,
        mode: input.inspectorMode,
      },
      input.semanticEngineOptions,
    );

    return semanticCheck.ok;
  });

  return {
    ...input.draft,
    edgeCommands: filteredEdgeCommands,
    skippedEdges:
      input.draft.skippedEdges +
      (input.draft.edgeCommands.length - filteredEdgeCommands.length),
  };
}

export function useEditorClipboardController({
  projectId,
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
}: UseEditorClipboardControllerInput) {
  const copyTextToClipboard = useCallback(async (text: string) => {
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
  }, []);

  const writeMapiaClipboardFragment = useCallback(
    async (fragment: MapiaClipboardFragment) => {
      const serialized = JSON.stringify(fragment);
      if (!navigator.clipboard) {
        throw new Error(editorT("shell.errors.clipboardUnavailable"));
      }

      const supportsCustomMime =
        typeof ClipboardItem !== "undefined" &&
        typeof navigator.clipboard.write === "function";

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
    },
    [editorT],
  );

  const readMapiaClipboardFragment = useCallback(async () => {
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
        // Fallback to readText below.
      }
    }

    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        return null;
      }
      const parsed = JSON.parse(text) as Partial<MapiaClipboardFragment>;
      if (
        parsed.version !== 1 ||
        !Array.isArray(parsed.nodes) ||
        !Array.isArray(parsed.edges)
      ) {
        return null;
      }

      return parsed as MapiaClipboardFragment;
    } catch {
      return null;
    }
  }, []);

  const validateClipboardDraftOnServer = useCallback(
    async (draft: ClipboardCommandsDraft) => {
      const commands = [...draft.nodeCommands, ...draft.edgeCommands];
      const projectedSnapshot = applyEditorCommandsLocally(
        getCurrentSnapshot(),
        projectId,
        commands,
      );

      const validation = await validateSemanticDraftForEditor({
        projectId,
        snapshot: projectedSnapshot,
        mode: inspectorMode,
      });
      setSemanticPolicy(validation.policy);

      return {
        validation,
        shouldBlock:
          validation.policy.enforceOnServer &&
          validation.policy.strictEnabled &&
          validation.bySeverity.error > 0,
      };
    },
    [getCurrentSnapshot, inspectorMode, projectId, setSemanticPolicy],
  );

  const applyClipboardFragment = useCallback(
    async (fragment: MapiaClipboardFragment): Promise<ClipboardMutationResult> => {
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

          const filteredDraft = filterClipboardEdgesBySemanticRules({
            draft: fullDraft,
            diagramType: semanticDiagramType,
            inspectorMode,
            semanticEngineOptions,
          });
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

        const applied = applyClipboardCommandsLocally({
          draft: draftToApply,
          applyLocalCommandAndQueue,
          selectItem,
        });
        setGlobalErrorMessage(null);
        return applied;
      } catch (error) {
        setGlobalErrorMessage(
          formatErrorMessage(error, editorT("shell.errors.validatePasteWithBackend")),
        );
        return {
          appliedNodes: 0,
          appliedEdges: 0,
          skippedEdges: fullDraft.skippedEdges,
        };
      }
    },
    [
      applyLocalCommandAndQueue,
      editorT,
      inspectorMode,
      semanticDiagramType,
      semanticEngineOptions,
      semanticPolicy,
      selectItem,
      setGlobalErrorMessage,
      validateClipboardDraftOnServer,
    ],
  );

  const handleCopySelectionToClipboard = useCallback(async () => {
    const fragment = buildClipboardFragmentFromSelection({
      projectId,
      selectedNode,
      selectedEdge,
      nodes: nodesRef.current,
    });
    if (!fragment) {
      return false;
    }

    await writeMapiaClipboardFragment(fragment);
    setQuerySyncMessage(editorT("shell.messages.selectionCopied"));
    return true;
  }, [
    editorT,
    nodesRef,
    projectId,
    selectedEdge,
    selectedNode,
    setQuerySyncMessage,
    writeMapiaClipboardFragment,
  ]);

  const handleCutSelectionToClipboard = useCallback(async () => {
    const copied = await handleCopySelectionToClipboard();
    if (!copied) {
      return false;
    }

    handleRemoveSelected();
    setQuerySyncMessage(editorT("shell.messages.selectionCut"));
    return true;
  }, [editorT, handleCopySelectionToClipboard, handleRemoveSelected, setQuerySyncMessage]);

  const handleDuplicateSelection = useCallback(async () => {
    const fragment = buildClipboardFragmentFromSelection({
      projectId,
      selectedNode,
      selectedEdge,
      nodes: nodesRef.current,
    });
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
  }, [
    applyClipboardFragment,
    editorT,
    nodesRef,
    projectId,
    selectedEdge,
    selectedNode,
    setGlobalErrorMessage,
    setQuerySyncMessage,
  ]);

  const handlePasteFromClipboard = useCallback(async () => {
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
  }, [
    applyClipboardFragment,
    editorT,
    readMapiaClipboardFragment,
    setGlobalErrorMessage,
    setQuerySyncMessage,
  ]);

  return {
    clipboardMimeType: MAPIA_CLIPBOARD_MIME,
    copyTextToClipboard,
    writeMapiaClipboardFragment,
    readMapiaClipboardFragment,
    handleCopySelectionToClipboard,
    handleCutSelectionToClipboard,
    handleDuplicateSelection,
    handlePasteFromClipboard,
  };
}
