import { translateEditor, type EditorTranslationFn } from "./editor-i18n";

export type EditorSaveStatus = "saved" | "dirty" | "saving" | "error";

export type EditorAutosaveState = {
  status: EditorSaveStatus;
  isDirty: boolean;
  message?: string;
  lastSavedAt?: number;
};

export function createInitialEditorAutosaveState(
  t?: EditorTranslationFn,
): EditorAutosaveState {
  return {
    status: "saved",
    isDirty: false,
    message: translateEditor(t, "autosave.noPendingChanges"),
  };
}

export function markEditorDirty(
  state: EditorAutosaveState,
  message?: string,
  t?: EditorTranslationFn,
): EditorAutosaveState {
  return {
    ...state,
    status: "dirty",
    isDirty: true,
    message: message ?? translateEditor(t, "autosave.pendingChanges"),
  };
}

export function markEditorSaving(
  state: EditorAutosaveState,
  message?: string,
  t?: EditorTranslationFn,
): EditorAutosaveState {
  return {
    ...state,
    status: "saving",
    isDirty: state.isDirty,
    message: message ?? translateEditor(t, "autosave.saving"),
  };
}

export function markEditorSaveSuccess(
  _state: EditorAutosaveState,
  timestamp = Date.now(),
  t?: EditorTranslationFn,
): EditorAutosaveState {
  return {
    status: "saved",
    isDirty: false,
    message: translateEditor(t, "autosave.saved"),
    lastSavedAt: timestamp,
  };
}

export function markEditorSaveError(
  state: EditorAutosaveState,
  message: string,
): EditorAutosaveState {
  return {
    ...state,
    status: "error",
    isDirty: true,
    message,
  };
}
