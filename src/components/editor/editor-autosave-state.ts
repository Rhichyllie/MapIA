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
    message: translateEditor(
      t,
      "autosave.noPendingChanges",
      "Sem alteracoes pendentes.",
    ),
  };
}

export function markEditorDirty(
  state: EditorAutosaveState,
  message = "Alteracoes pendentes.",
  t?: EditorTranslationFn,
): EditorAutosaveState {
  return {
    ...state,
    status: "dirty",
    isDirty: true,
    message: translateEditor(t, "autosave.pendingChanges", message),
  };
}

export function markEditorSaving(
  state: EditorAutosaveState,
  message = "Salvando...",
  t?: EditorTranslationFn,
): EditorAutosaveState {
  return {
    ...state,
    status: "saving",
    isDirty: state.isDirty,
    message: translateEditor(t, "autosave.saving", message),
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
    message: translateEditor(t, "autosave.saved", "Salvo."),
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
