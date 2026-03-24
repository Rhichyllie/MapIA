import { describe, expect, it } from "vitest";
import { resolveInspectorSelectionState } from "./inspector-selection-state";

describe("resolveInspectorSelectionState", () => {
  it("prioritizes node selection when both node and edge are marked", () => {
    const state = resolveInspectorSelectionState({
      hasSelectedNode: true,
      hasSelectedEdge: true,
    });

    expect(state).toEqual({
      nodeSelected: true,
      edgeSelected: false,
      badgeLabel: "Item em foco",
    });
  });

  it("returns edge selection when only edge is selected", () => {
    const state = resolveInspectorSelectionState({
      hasSelectedNode: false,
      hasSelectedEdge: true,
    });

    expect(state.badgeLabel).toBe("Conexao em foco");
    expect(state.edgeSelected).toBe(true);
  });

  it("returns empty selection state when nothing is selected", () => {
    const state = resolveInspectorSelectionState({
      hasSelectedNode: false,
      hasSelectedEdge: false,
    });

    expect(state.badgeLabel).toBe("Nenhum item selecionado");
    expect(state.nodeSelected).toBe(false);
    expect(state.edgeSelected).toBe(false);
  });
});
