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
});
