import { useEffect, useRef, useState } from "react";
import type { EditorCommand } from "@/src/modules/editor/application";
import {
  createDebouncedTask,
  createEditorSaveRequestTracker,
} from "../editor-autosave-helpers";
import {
  createInitialEditorAutosaveState,
  markEditorDirty,
  markEditorSaveError,
  markEditorSaveSuccess,
  markEditorSaving,
  type EditorAutosaveState,
} from "../editor-autosave-state";
import {
  applyEditorCommandLocally,
  applyEditorCommandRemotely,
  EditorRemoteError,
} from "../editor-command-service";
import {
  saveWorkingSnapshotForEditor,
} from "../editor-query-service";
import type { EditorTranslationFn } from "../editor-i18n";
import { formatErrorMessage } from "./editor-shell-utils";
import type { PendingEditorCommand } from "./editor-shell-types";
import { fromCanonicalSnapshotToFlowState } from "../editor-graph-mappers";

const AUTOSAVE_DELAY_MS = 1000;
const DEFAULT_SNAPSHOT_LABEL = "fase1-working-v1";

type UseEditorPersistenceControllerInput = {
  projectId: string;
  initialRevision: number;
  editorT: EditorTranslationFn;
  inspectorMode: "operational" | "technical";
  getCurrentSnapshot: () => Parameters<typeof fromCanonicalSnapshotToFlowState>[0];
  syncFromSnapshot: (
    snapshot: Parameters<typeof fromCanonicalSnapshotToFlowState>[0],
  ) => void;
  setNodeInspectorMessage: (message: string | null) => void;
  setEdgeInspectorMessage: (message: string | null) => void;
  clearDerivedRemoteState: () => void;
  setGlobalErrorMessage: (message: string | null) => void;
};

export function useEditorPersistenceController({
  projectId,
  initialRevision,
  editorT,
  inspectorMode,
  getCurrentSnapshot,
  syncFromSnapshot,
  setNodeInspectorMessage,
  setEdgeInspectorMessage,
  clearDerivedRemoteState,
  setGlobalErrorMessage,
}: UseEditorPersistenceControllerInput) {
  const [saveState, setSaveState] = useState<EditorAutosaveState>(
    createInitialEditorAutosaveState(editorT),
  );
  const [pendingCommands, setPendingCommands] = useState<PendingEditorCommand[]>(
    [],
  );
  const [currentRevision, setCurrentRevision] = useState<number>(initialRevision);

  const pendingCommandsRef = useRef(pendingCommands);
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
  const currentRevisionRef = useRef(currentRevision);

  useEffect(() => {
    pendingCommandsRef.current = pendingCommands;
  }, [pendingCommands]);

  useEffect(() => {
    currentRevisionRef.current = currentRevision;
  }, [currentRevision]);

  useEffect(() => {
    const debouncer = autosaveDebouncerRef.current;
    return () => {
      debouncer.cancel();
    };
  }, []);

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

  function applyLocalCommandAndQueue(
    command: EditorCommand,
    successMessage?: string,
  ): boolean {
    try {
      const nextSnapshot = applyEditorCommandLocally(
        getCurrentSnapshot(),
        projectId,
        command,
      );

      syncFromSnapshot(nextSnapshot);
      clearDerivedRemoteState();
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
              projectId,
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

      if (error instanceof EditorRemoteError && error.code === "CONFLICT") {
        const current = error.payload?.currentRevision;
        if (typeof current === "number") {
          setCurrentRevision(current);
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
        projectId,
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

  function resetPendingCommands() {
    setPendingCommandsState([]);
  }

  function resetLocalMutationVersion() {
    localMutationVersionRef.current = 0;
  }

  return {
    saveState,
    setSaveState,
    pendingCommands,
    pendingCommandsRef,
    setPendingCommandsState,
    currentRevision,
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
  };
}
