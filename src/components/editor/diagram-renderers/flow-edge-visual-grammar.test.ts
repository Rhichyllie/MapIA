import { describe, expect, it } from "vitest";
import { resolveFlowEdgeVisualSemantics } from "./flow-edge-visual-grammar";

describe("flow edge visual grammar", () => {
  it("keeps main trunk transitions centered and terminal-aware", () => {
    const semantics = resolveFlowEdgeVisualSemantics({
      edgeKind: "flows-to",
      sourceRole: "flow-step",
      targetRole: "flow-end",
      sourcePosition: { x: 360, y: 0 },
      targetPosition: { x: 760, y: 0 },
      direction: "left-right",
    });

    expect(semantics.role).toBe("main");
    expect(semantics.labelPlacement).toBe("target");
    expect(semantics.classNameTokens).toContain("editor-edge-flow-role-main");
    expect(semantics.classNameTokens).toContain(
      "editor-edge-flow-outcome-terminal",
    );
  });

  it("classifies gateway exits as decision paths with source-anchored labels", () => {
    const semantics = resolveFlowEdgeVisualSemantics({
      edgeKind: "depends-on",
      label: "Sim",
      sourceRole: "flow-decision",
      targetRole: "flow-step",
      sourcePosition: { x: 720, y: 0 },
      targetPosition: { x: 1100, y: 260 },
      direction: "left-right",
    });

    expect(semantics.role).toBe("decision");
    expect(semantics.labelPlacement).toBe("source");
    expect(semantics.strokeDasharray).toBe("12 8");
    expect(semantics.classNameTokens).toContain(
      "editor-edge-flow-outcome-branch",
    );
  });

  it("classifies cross-lane returns as alternate transitions", () => {
    const semantics = resolveFlowEdgeVisualSemantics({
      edgeKind: "flows-to",
      label: "Aprovado",
      sourceRole: "flow-step",
      targetRole: "flow-step",
      sourcePosition: { x: 1120, y: 280 },
      targetPosition: { x: 1490, y: 0 },
      direction: "left-right",
    });

    expect(semantics.role).toBe("alternate");
    expect(semantics.labelPlacement).toBe("target");
    expect(semantics.classNameTokens).toContain(
      "editor-edge-flow-outcome-return",
    );
  });

  it("anchors references near the note side of the connection", () => {
    const semantics = resolveFlowEdgeVisualSemantics({
      edgeKind: "references",
      label: "Regra",
      sourceRole: "flow-note",
      targetRole: "flow-decision",
      sourcePosition: { x: 730, y: -240 },
      targetPosition: { x: 720, y: 0 },
      direction: "left-right",
    });

    expect(semantics.role).toBe("reference");
    expect(semantics.labelPlacement).toBe("source");
    expect(semantics.classNameTokens).toContain(
      "editor-edge-flow-role-reference",
    );
  });
});
