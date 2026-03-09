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

  it("usa template legado quando diagramType nao existe", () => {
    const renderer = resolveDiagramRenderer({
      template: "erd",
    });

    expect(renderer.key).toBe("erd");
    expect(renderer.label).toContain("ERD");
  });

  it("respeita snapshot legado quando diagramType legado e suportado", () => {
    const renderer = resolveDiagramRenderer({
      diagramType: "sitemap",
      template: "graph",
    });

    expect(renderer.key).toBe("sitemap");
  });
});
