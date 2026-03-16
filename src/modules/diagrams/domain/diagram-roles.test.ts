import { describe, expect, it } from "vitest";
import { resolveDiagramRole } from "./diagram-roles";

describe("diagram roles", () => {
  it("resolve project + flow as flow-start", () => {
    const role = resolveDiagramRole({
      diagramType: "flow",
      nodeKind: "project",
      nodePayload: {},
    });

    expect(role).toBe("flow-start");
  });

  it("resolve flow-step + flow as flow-step", () => {
    const role = resolveDiagramRole({
      diagramType: "flow",
      nodeKind: "flow-step",
      nodePayload: {},
    });

    expect(role).toBe("flow-step");
  });

  it("infers flow start, end and decision from node labels when role is absent", () => {
    expect(
      resolveDiagramRole({
        diagramType: "flow",
        nodeKind: "flow-step",
        nodePayload: {},
        nodeLabel: "Inicio",
      }),
    ).toBe("flow-start");

    expect(
      resolveDiagramRole({
        diagramType: "flow",
        nodeKind: "flow-step",
        nodePayload: {},
        nodeLabel: "Fim",
      }),
    ).toBe("flow-end");

    expect(
      resolveDiagramRole({
        diagramType: "flow",
        nodeKind: "flow-step",
        nodePayload: {},
        nodeLabel: "Decisao",
      }),
    ).toBe("flow-decision");
  });

  it("resolve mindmap root by payload role and rootNodeName fallback", () => {
    const byPayload = resolveDiagramRole({
      diagramType: "mindmap",
      nodeKind: "note",
      nodePayload: {
        __mapia: {
          role: "mindmap-root",
        },
      },
    });

    const byRootName = resolveDiagramRole({
      diagramType: "mindmap",
      nodeKind: "note",
      nodePayload: {},
      nodeLabel: "Tema Central",
      layoutMetadata: {
        rootNodeName: "Tema central",
      },
    });

    expect(byPayload).toBe("mindmap-root");
    expect(byRootName).toBe("mindmap-root");
  });

  it("resolves sitemap and graph/timeline explicit roles", () => {
    const sitemapHome = resolveDiagramRole({
      diagramType: "sitemap",
      nodeKind: "page",
      nodePayload: {},
      nodeLabel: "Home",
    });

    const graphCore = resolveDiagramRole({
      diagramType: "graph",
      nodeKind: "note",
      nodePayload: {
        __mapia: {
          role: "graph-core",
        },
      },
      nodeLabel: "Nucleo",
    });

    const graphSupporting = resolveDiagramRole({
      diagramType: "graph",
      nodeKind: "page",
      nodePayload: {},
      nodeLabel: "Servico auxiliar",
    });

    const timelineMilestone = resolveDiagramRole({
      diagramType: "timeline",
      nodeKind: "note",
      nodePayload: {},
      nodeLabel: "Marco 1",
    });

    expect(sitemapHome).toBe("sitemap-home");
    expect(graphCore).toBe("graph-core");
    expect(graphSupporting).toBe("graph-supporting");
    expect(timelineMilestone).toBe("timeline-milestone");
  });
});
