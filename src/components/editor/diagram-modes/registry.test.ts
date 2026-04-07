import { describe, expect, it } from "vitest";
import type { RFEdge, RFNode } from "../editor-graph-mappers";
import {
  getEditorDiagramMode,
  getEditorDiagramModes,
  hasEditorDiagramCapability,
  resolveEditorDiagramMode,
} from "./registry";

function createNode(
  id: string,
  input: {
    x: number;
    y: number;
    kind?: RFNode["data"]["kind"];
    label?: string;
    diagramRole?: RFNode["data"]["diagramRole"];
    payload?: Record<string, unknown>;
  },
): RFNode {
  return {
    id,
    position: { x: input.x, y: input.y },
    data: {
      label: input.label ?? id,
      kind: input.kind ?? "note",
      payload: input.payload ?? {},
      externalRefs: [],
      ...(input.diagramRole ? { diagramRole: input.diagramRole } : {}),
    },
  } as RFNode;
}

function createEdge(
  id: string,
  input: {
    source: string;
    target: string;
    kind: NonNullable<RFEdge["data"]>["kind"];
    label?: string;
    payload?: Record<string, unknown>;
  },
): RFEdge {
  return {
    id,
    source: input.source,
    target: input.target,
    data: {
      kind: input.kind,
      payload: input.payload ?? {},
      externalRefs: [],
    },
    ...(input.label ? { label: input.label } : {}),
  } as RFEdge;
}

describe("editor diagram mode registry", () => {
  it("registers current and prepared modes with explicit maturity", () => {
    const modes = getEditorDiagramModes();

    expect(modes.map((mode) => `${mode.id}:${mode.maturity}`)).toEqual([
      "flow:active",
      "graph:active",
      "erd:active",
      "tree:prepared",
      "sitemap:prepared",
      "mindmap:prepared",
      "timeline:prepared",
    ]);
  });

  it("resolves flow mode with process inspector, specialized HUD and layout strategy", () => {
    const resolved = resolveEditorDiagramMode({
      diagramType: "flow",
      layoutOptions: { direction: "top-down" },
    });

    expect(resolved.source).toBe("diagram-type");
    expect(resolved.mode.id).toBe("flow");
    expect(resolved.renderer.key).toBe("flow");
    expect(
      hasEditorDiagramCapability(resolved.mode, "specialized-selection-hud"),
    ).toBe(true);
    expect(resolved.mode.inspector.kind).toBe("process");
    expect(resolved.mode.layout.reapplyStrategy).toBe("local-reflow");
    expect(
      resolved.mode.contextualActions.getPrimarySelectionAction().insertMode,
    ).toBe("flow-next-step");
    expect(
      resolved.mode.layout.computeReflow({
        nodes: [
          { id: "a", kind: "flow-step", position: { x: 0, y: 0 } },
          { id: "b", kind: "flow-step", position: { x: 0, y: 0 } },
        ],
        edges: [
          {
            id: "e1",
            sourceNodeId: "a",
            targetNodeId: "b",
            kind: "flows-to",
          },
        ],
        layoutOptions: { direction: "top-down" },
      }),
    ).toMatchObject({
      a: { y: 0 },
      b: { y: 358 },
    });
  });

  it("maps flowchart compatibility into canonical flow mode", () => {
    const resolved = resolveEditorDiagramMode({
      diagramType: "flowchart",
      template: "graph",
    });

    expect(resolved.source).toBe("legacy-alias");
    expect(resolved.mode.id).toBe("flow");
    expect(resolved.renderer.key).toBe("flow");
  });

  it("resolves graph mode from explicit diagramView and exposes graph semantics", () => {
    const resolved = resolveEditorDiagramMode({
      diagramType: "graph",
      diagramView: "graph",
      template: "graph",
    });

    expect(resolved.source).toBe("diagram-view");
    expect(resolved.mode.id).toBe("graph");
    expect(resolved.renderer.key).toBe("graph");
    expect(
      hasEditorDiagramCapability(resolved.mode, "graph-semantic-copy"),
    ).toBe(true);

    const semantic = resolved.mode.semantic.graph?.resolveNodeSemantic({
      diagramRole: "graph-core",
      kind: "entity",
      incomingCount: 0,
      outgoingCount: 3,
    });

    expect(semantic?.kindLabel).toBeTruthy();
    expect(
      resolved.mode.contextualActions.getPrimarySelectionAction().insertMode,
    ).toBe("graph-neighbor");
  });

  it("resolves ERD mode from template fallback with field and export capabilities", () => {
    const resolved = resolveEditorDiagramMode({
      template: "erd",
    });

    expect(resolved.source).toBe("template");
    expect(resolved.mode.id).toBe("erd");
    expect(resolved.renderer.key).toBe("erd");
    expect(
      hasEditorDiagramCapability(resolved.mode, "contextual-add-field"),
    ).toBe(true);
    expect(
      hasEditorDiagramCapability(resolved.mode, "erd-export-preview"),
    ).toBe(true);
    expect(
      hasEditorDiagramCapability(resolved.mode, "erd-validation-controls"),
    ).toBe(true);

    const edgePresentation = resolved.mode.render.resolveEdgePresentation({
      edgeKind: "references",
      baseLabel: "usuarios_posts",
      payload: {
        cardinality: {
          maxSource: 1,
          maxTarget: "N",
        },
      },
    });

    expect(edgePresentation.label).toContain("1:N");
    expect(edgePresentation.classNameTokens).toContain(
      "editor-edge-erd-cardinality-1-n",
    );
  });

  it("builds node relations through the resolved inspector contract for flow", () => {
    const mode = getEditorDiagramMode("flow");
    const nodes = [
      createNode("start", {
        x: 0,
        y: 0,
        kind: "flow-step",
        diagramRole: "flow-start",
      }),
      createNode("step", {
        x: 280,
        y: 0,
        kind: "flow-step",
        diagramRole: "flow-step",
      }),
    ];
    const edges = [
      createEdge("e1", {
        source: "start",
        target: "step",
        kind: "flows-to",
      }),
    ];
    const relations = mode.inspector.buildNodeRelations({
      selectedNode: nodes[1],
      edges,
      nodeLabelById: new Map(
        nodes.map((node) => [node.id, node.data.label] as const),
      ),
      nodeRoleById: new Map(
        nodes.map((node) => [node.id, node.data.diagramRole] as const),
      ),
      inspectorMode: "operational",
    });

    expect(relations.incomingCount).toBe(1);
    expect(relations.preview[0]?.relationTypeLabel).toBe("Continua para");
  });

  it("keeps prepared modes wired with valid fallbacks and strategies", () => {
    for (const modeId of ["tree", "sitemap", "mindmap", "timeline"] as const) {
      const mode = getEditorDiagramMode(modeId);

      expect(mode.maturity).toBe("prepared");
      expect(mode.resolveRenderer({}).key).toBe(modeId);
      expect(mode.quickAdd.getCopy().addPrimary.length).toBeGreaterThan(0);
      expect(mode.inspector.getCopy().nodeTitleLabel.length).toBeGreaterThan(0);
      expect(
        mode.contextualActions.getPrimarySelectionAction().insertMode,
      ).toBeTruthy();
      expect(
        mode.layout.computeInsertPosition({
          referenceNode: null,
          nodes: [],
          edges: [],
          viewport: { x: 0, y: 0, zoom: 1, width: 1000, height: 700 },
          insertMode: "default",
        }),
      ).toMatchObject({
        x: expect.any(Number),
        y: expect.any(Number),
      });
    }
  });
});
