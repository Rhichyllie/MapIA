import { useCallback } from "react";
import type { RefObject } from "react";
import type { EditorAutosaveState } from "../editor-autosave-state";
import {
  createEdgeForEditor,
  updateEdgeForEditor,
  updateNodeForEditor,
  type EditorWorkingSnapshotPayload,
} from "../editor-query-service";
import type { InspectorMode } from "../editor-inspector-personas";
import type { PendingEditorCommand } from "./editor-shell-types";

type MutationResultLike = {
  workingSnapshot: EditorWorkingSnapshotPayload;
  newRevision: number;
};

type UseEditorCommandControllerInput = {
  projectId: string;
  saveState: EditorAutosaveState;
  pendingCommandsRef: RefObject<PendingEditorCommand[]>;
  isSaveInFlightRef: RefObject<boolean>;
  currentRevisionRef: RefObject<number>;
  flushPendingCommands: (reason: "manual" | "autosave") => Promise<void>;
  syncFromSnapshot: (snapshot: EditorWorkingSnapshotPayload["snapshot"]) => void;
  setCurrentRevision: (revision: number) => void;
};

export function canBypassQueueFlush(input: {
  pendingCommandsLength: number;
  isDirty: boolean;
}) {
  return input.pendingCommandsLength === 0 && !input.isDirty;
}

export function useEditorCommandController({
  projectId,
  saveState,
  pendingCommandsRef,
  isSaveInFlightRef,
  currentRevisionRef,
  flushPendingCommands,
  syncFromSnapshot,
  setCurrentRevision,
}: UseEditorCommandControllerInput) {
  const ensureQueueFlushedBeforeDirectWrite = useCallback(async () => {
    if (
      canBypassQueueFlush({
        pendingCommandsLength: pendingCommandsRef.current.length,
        isDirty: saveState.isDirty,
      })
    ) {
      return true;
    }

    await flushPendingCommands("manual");
    return pendingCommandsRef.current.length === 0 && !isSaveInFlightRef.current;
  }, [flushPendingCommands, isSaveInFlightRef, pendingCommandsRef, saveState.isDirty]);

  const applyDirectMutationResult = useCallback(
    <T extends MutationResultLike>(result: T) => {
      syncFromSnapshot(result.workingSnapshot.snapshot);
      setCurrentRevision(result.newRevision);
      return result;
    },
    [setCurrentRevision, syncFromSnapshot],
  );

  const runDirectWrite = useCallback(
    async <T extends MutationResultLike>(
      execute: (expectedRevision: number) => Promise<T>,
    ) => {
      const ready = await ensureQueueFlushedBeforeDirectWrite();
      if (!ready) {
        return {
          ok: false as const,
          reason: "blocked" as const,
        };
      }

      const result = await execute(currentRevisionRef.current);
      applyDirectMutationResult(result);

      return {
        ok: true as const,
        result,
      };
    },
    [applyDirectMutationResult, currentRevisionRef, ensureQueueFlushedBeforeDirectWrite],
  );

  const createEdgeDirect = useCallback(
    async (input: {
      edge: {
        id?: string;
        sourceNodeId: string;
        targetNodeId: string;
        kind: string;
        label?: string;
        data?: Record<string, unknown>;
      };
      semanticMode?: InspectorMode;
      allowSemanticOverride?: boolean;
      overrideReason?: string;
    }) =>
      runDirectWrite((expectedRevision) =>
        createEdgeForEditor({
          projectId,
          edge: input.edge,
          expectedRevision,
          semanticMode: input.semanticMode,
          allowSemanticOverride: input.allowSemanticOverride,
          overrideReason: input.overrideReason,
        }),
      ),
    [projectId, runDirectWrite],
  );

  const updateNodeDirect = useCallback(
    async (input: {
      nodeId: string;
      patch: {
        label?: string;
        kind?: string;
        data?: Record<string, unknown>;
      };
      semanticMode?: InspectorMode;
      allowSemanticOverride?: boolean;
      overrideReason?: string;
    }) =>
      runDirectWrite((expectedRevision) =>
        updateNodeForEditor({
          projectId,
          nodeId: input.nodeId,
          patch: input.patch,
          expectedRevision,
          semanticMode: input.semanticMode,
          allowSemanticOverride: input.allowSemanticOverride,
          overrideReason: input.overrideReason,
        }),
      ),
    [projectId, runDirectWrite],
  );

  const updateEdgeDirect = useCallback(
    async (input: {
      edgeId: string;
      patch: {
        label?: string;
        kind?: string;
        data?: Record<string, unknown>;
      };
      semanticMode?: InspectorMode;
      allowSemanticOverride?: boolean;
      overrideReason?: string;
    }) =>
      runDirectWrite((expectedRevision) =>
        updateEdgeForEditor({
          projectId,
          edgeId: input.edgeId,
          patch: input.patch,
          expectedRevision,
          semanticMode: input.semanticMode,
          allowSemanticOverride: input.allowSemanticOverride,
          overrideReason: input.overrideReason,
        }),
      ),
    [projectId, runDirectWrite],
  );

  return {
    ensureQueueFlushedBeforeDirectWrite,
    applyDirectMutationResult,
    runDirectWrite,
    createEdgeDirect,
    updateNodeDirect,
    updateEdgeDirect,
  };
}
