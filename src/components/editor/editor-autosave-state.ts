export type EditorSaveStatus = "saved" | "dirty" | "saving" | "error";

export type EditorAutosaveState = {
  status: EditorSaveStatus;
  isDirty: boolean;
  message?: string;
  lastSavedAt?: number;
};

export function createInitialEditorAutosaveState(): EditorAutosaveState {
  return {
    status: "saved",
    isDirty: false,
    message: "Sem alteracoes pendentes.",
  };
}

export function markEditorDirty(
  state: EditorAutosaveState,
  message = "Alteracoes pendentes.",
): EditorAutosaveState {
  return {
    ...state,
    status: "dirty",
    isDirty: true,
    message,
  };
}

export function markEditorSaving(
  state: EditorAutosaveState,
  message = "Salvando...",
): EditorAutosaveState {
  return {
    ...state,
    status: "saving",
    isDirty: state.isDirty,
    message,
  };
}

export function markEditorSaveSuccess(
  _state: EditorAutosaveState,
  timestamp = Date.now(),
): EditorAutosaveState {
  return {
    status: "saved",
    isDirty: false,
    message: "Salvo.",
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
