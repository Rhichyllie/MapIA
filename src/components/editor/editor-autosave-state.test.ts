import { describe, expect, it } from "vitest";
import {
  createInitialEditorAutosaveState,
  markEditorDirty,
  markEditorSaveError,
  markEditorSaveSuccess,
  markEditorSaving,
} from "./editor-autosave-state";

describe("editor autosave state", () => {
  it("transitions from saved -> dirty -> saving -> saved", () => {
    const initial = createInitialEditorAutosaveState();
    const dirty = markEditorDirty(initial);
    const saving = markEditorSaving(dirty);
    const saved = markEditorSaveSuccess(saving, 123);

    expect(initial.status).toBe("saved");
    expect(dirty.status).toBe("dirty");
    expect(dirty.isDirty).toBe(true);
    expect(saving.status).toBe("saving");
    expect(saved.status).toBe("saved");
    expect(saved.isDirty).toBe(false);
    expect(saved.lastSavedAt).toBe(123);
  });

  it("keeps dirty=true when save fails", () => {
    const dirty = markEditorDirty(createInitialEditorAutosaveState());
    const saving = markEditorSaving(dirty);
    const failed = markEditorSaveError(saving, "Falha ao salvar");

    expect(failed.status).toBe("error");
    expect(failed.isDirty).toBe(true);
    expect(failed.message).toMatch(/Falha/);
  });
});
