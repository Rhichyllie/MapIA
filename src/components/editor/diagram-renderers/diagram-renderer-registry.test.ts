import { describe, expect, it } from "vitest";
import { resolveDiagramRenderer } from "./diagram-renderer-registry";

describe("resolveDiagramRenderer", () => {
  it("prioriza diagramType sobre template legado", () => {
    const renderer = resolveDiagramRenderer({
      diagramType: "tree",
      template: "erd",
      layoutOptions: {
        type: "tree",
        direction: "left-right",
      },
    });

    expect(renderer.key).toBe("tree");
    expect(renderer.label).toBe("Hierarquia");
    expect(renderer.treeDirection).toBe("left-right");
  });

  it("usa template legado como boundary de view quando snapshot ainda nao define diagramView", () => {
    const renderer = resolveDiagramRenderer({
      template: "erd",
    });

    expect(renderer.key).toBe("erd");
    expect(renderer.label).toContain("ERD");
  });

  it("respeita snapshot legado quando diagramType legado e suportado", () => {
    const renderer = resolveDiagramRenderer({
      diagramType: "tree",
      diagramView: "sitemap",
      template: "graph",
    });

    expect(renderer.key).toBe("sitemap");
  });

  it("resolve timeline renderer when canonical graph uses timeline view", () => {
    const renderer = resolveDiagramRenderer({
      diagramType: "graph",
      diagramView: "timeline",
      template: "graph",
      layoutOptions: {
        direction: "top-down",
      },
    });

    expect(renderer.key).toBe("timeline");
    expect(renderer.label).toBe("Timeline");
    expect(renderer.treeDirection).toBe("top-down");
  });

  it("maps flowchart template fallback to flow renderer instead of generic graph", () => {
    const renderer = resolveDiagramRenderer({
      template: "flowchart",
    });

    expect(renderer.key).toBe("flow");
  });

  it("centraliza a apresentacao base do flow no registry", () => {
    const renderer = resolveDiagramRenderer({
      diagramType: "flow",
      layoutOptions: {
        direction: "left-right",
      },
    });

    expect(renderer.key).toBe("flow");
    expect(renderer.defaultEdgeOptions.className).toBe("editor-edge editor-edge-flow");
    expect(renderer.defaultEdgeOptions.markerEnd).toMatchObject({
      color: "var(--flow-edge-main)",
    });
    expect(renderer.backgroundConfig).toMatchObject({
      className: "editor-canvas-background-flow",
      gap: 40,
    });
    expect(renderer.canvasClassName).toBe("canvas-frame canvas-frame-flow");
  });
});
