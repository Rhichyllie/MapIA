import { describe, expect, it } from "vitest";
import { getEditorBaseMessage, translateEditor } from "./editor-i18n";

describe("editor translation fallbacks", () => {
  it("returns base-catalog fallback for known editor keys", () => {
    expect(getEditorBaseMessage("shell.topBar.quickFind")).toBe(
      "Buscar (Ctrl+K)",
    );
  });

  it("resolves runtime fallbacks from the official base catalog", () => {
    expect(translateEditor(undefined, "commandPalette.label")).toBe("Buscar no");
  });

  it("surfaces truly missing editor keys explicitly in test/dev environments", () => {
    expect(getEditorBaseMessage("shell.versions.nonexistentLabel")).toBe(
      "[missing] Editor.shell.versions.nonexistentLabel",
    );
  });
});
