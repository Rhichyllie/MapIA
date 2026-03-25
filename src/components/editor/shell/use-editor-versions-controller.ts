import { useEffect, useMemo, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { fromCanonicalSnapshotToFlowState } from "../editor-graph-mappers";
import type { EditorTranslationFn } from "../editor-i18n";
import type { EditorAutosaveState } from "../editor-autosave-state";
import {
  createSnapshotVersionForEditor,
  listSnapshotVersionsForEditor,
  loadSnapshotVersionDetailForEditor,
  loadSnapshotVersionDiffForEditor,
  restoreSnapshotVersionForEditor,
  type EditorSnapshotVersionSummary,
} from "../editor-query-service";
import { buildVersionDiffSummary, type VersionDiffSummaryResult } from "../versions/diff-summary";
import type { PendingEditorCommand, VersionActionFeedback, VersionCreateFeedback, VersionDiffFeedback } from "./editor-shell-types";
import {
  buildVersionDiffFeedbackMessage,
  formatErrorMessage,
  getVersionDisplayName,
  sanitizeVersionNameMap,
  syncVersionNameDrafts,
} from "./editor-shell-utils";

const VERSION_NAMES_STORAGE_KEY_PREFIX = "mapia.editor.version-names";

type UseEditorVersionsControllerInput = {
  projectId: string;
  editorT: EditorTranslationFn;
  saveState: EditorAutosaveState;
  pendingCommandsRef: RefObject<PendingEditorCommand[]>;
  handleManualSave: () => Promise<boolean>;
  getCurrentSnapshot: () => Parameters<typeof fromCanonicalSnapshotToFlowState>[0];
  syncFromSnapshot: (
    snapshot: Parameters<typeof fromCanonicalSnapshotToFlowState>[0],
  ) => void;
  setCurrentRevision: (revision: number) => void;
  clearSelection: () => void;
  resetPendingCommands: () => void;
  resetLocalMutationVersion: () => void;
  setSaveState: Dispatch<SetStateAction<EditorAutosaveState>>;
  setGlobalErrorMessage: (message: string | null) => void;
  setQuerySyncMessage: (message: string | null) => void;
  cancelAutosave: () => void;
};

export function useEditorVersionsController({
  projectId,
  editorT,
  saveState,
  pendingCommandsRef,
  handleManualSave,
  getCurrentSnapshot,
  syncFromSnapshot,
  setCurrentRevision,
  clearSelection,
  resetPendingCommands,
  resetLocalMutationVersion,
  setSaveState,
  setGlobalErrorMessage,
  setQuerySyncMessage,
  cancelAutosave,
}: UseEditorVersionsControllerInput) {
  const versionNamesStorageKey = `${VERSION_NAMES_STORAGE_KEY_PREFIX}:${projectId}`;
  const [isCreatingVersion, setIsCreatingVersion] = useState(false);
  const [versionCreateFeedback, setVersionCreateFeedback] =
    useState<VersionCreateFeedback>(null);
  const [newVersionName, setNewVersionName] = useState("");
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

  useEffect(() => {
    let active = true;

    async function loadVersionsOnMount() {
      setIsRefreshingVersionList(true);

      try {
        const versions = await listSnapshotVersionsForEditor(projectId);

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
  }, [editorT, projectId]);

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
    setVersionNameDrafts((current) =>
      syncVersionNameDrafts({
        currentDrafts: current,
        localVersionNames,
        snapshotVersions,
      }),
    );
  }, [localVersionNames, snapshotVersions]);

  const hasLocalPendingChanges = useMemo(
    () => pendingCommandsRef.current.length > 0 || saveState.isDirty,
    [pendingCommandsRef, saveState.isDirty],
  );

  async function handleCreateVersion() {
    if (isCreatingVersion || saveState.status === "saving") {
      return;
    }

    setIsCreatingVersion(true);
    setVersionCreateFeedback(null);
    const normalizedVersionName = newVersionName.trim();

    try {
      if (hasLocalPendingChanges) {
        const saved = await handleManualSave();

        if (!saved) {
          throw new Error(
            editorT("shell.versions.errors.saveBeforeCreate"),
          );
        }
      }

      const result = await createSnapshotVersionForEditor({
        projectId,
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
          const versions = await listSnapshotVersionsForEditor(projectId);
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
      const versions = await listSnapshotVersionsForEditor(projectId);
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
        loadSnapshotVersionDiffForEditor(projectId, versionId),
        loadSnapshotVersionDetailForEditor(projectId, versionId),
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

    const confirmMessage = hasLocalPendingChanges
      ? editorT("shell.versions.confirmRestoreDiscard")
      : editorT("shell.versions.confirmRestore");

    if (!window.confirm(confirmMessage)) {
      return;
    }

    cancelAutosave();
    setActiveVersionRestoreId(version.id);
    setVersionActionFeedback(null);
    setVersionDiffFeedback(null);
    setVersionDiffSummary(null);

    try {
      const result = await restoreSnapshotVersionForEditor({
        projectId,
        versionId: version.id,
      });

      syncFromSnapshot(result.workingSnapshot.snapshot);
      setCurrentRevision(result.newRevision);
      clearSelection();
      resetPendingCommands();
      resetLocalMutationVersion();
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

  return {
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
    getVersionDisplayName: (version: EditorSnapshotVersionSummary) =>
      getVersionDisplayName({ version, localVersionNames, t: editorT }),
  };
}
