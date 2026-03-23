import { describe, expect, it } from "vitest";
import { getEditorFallbackMessage } from "./use-editor-translations";

describe("editor translation fallbacks", () => {
  it("returns catalog fallback for known pt-BR editor keys", () => {
    expect(
      getEditorFallbackMessage("pt-BR", "shell.topBar.quickFind"),
    ).toBe("Buscar (Ctrl+K)");
  });

  it("returns catalog fallback for known en-US editor keys", () => {
    expect(
      getEditorFallbackMessage("en-US", "commandPalette.label"),
    ).toBe("Search node");
  });

  it("humanizes unknown editor keys safely", () => {
    expect(
      getEditorFallbackMessage("pt-BR", "shell.versions.nonexistentLabel"),
    ).toBe("Nonexistent Label");
  });
});
