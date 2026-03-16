import { describe, expect, it } from "vitest";
import {
  listGraphQuickAddRoleOptions,
  mapGraphRoleToNodeKind,
  resolveGraphDefaultRoleForKind,
  resolveGraphDiagramRole,
  resolveGraphEdgeSemantic,
  resolveGraphNodeSemantic,
} from "./graph-semantics";

describe("graph semantics runtime", () => {
  it("classifies graph roles centrally", () => {
    expect(
      resolveGraphDiagramRole({
        diagramRole: "graph-core",
        nodeKind: "entity",
        nodeLabel: "Gateway",
      }),
    ).toBe("graph-core");
    expect(
      resolveGraphDiagramRole({
        nodeKind: "page",
        nodeLabel: "Observabilidade",
      }),
    ).toBe("graph-supporting");
    expect(
      resolveGraphDiagramRole({
        nodeKind: "entity",
        nodeLabel: "API",
      }),
    ).toBe("graph-topic");
  });

  it("resolves graph node runtime with role-first copy", () => {
    const semantic = resolveGraphNodeSemantic({
      diagramRole: "graph-core",
      kind: "entity",
      label: "Nucleo",
      incomingCount: 2,
      outgoingCount: 4,
    });

    expect(semantic.variant).toBe("core");
    expect(semantic.selectionBadgeLabel).toBe("Nucleo em foco");
    expect(semantic.kindLabel).toBe("Componente");
    expect(semantic.connectivityLabel).toContain("4");
    expect(semantic.structureTips[0]).toContain("Leitura da rede");
  });

  it("maps graph edge semantics by type", () => {
    expect(resolveGraphEdgeSemantic("depends-on")).toMatchObject({
      labelOperational: "Dependencia",
      markerStyle: "closed",
      emphasis: "primary",
    });
    expect(resolveGraphEdgeSemantic("relates-to")).toMatchObject({
      labelOperational: "Integracao",
      markerStyle: "open",
      defaultVerbLabel: "Integra com",
    });
    expect(resolveGraphEdgeSemantic("references")).toMatchObject({
      labelOperational: "Apoio",
      markerStyle: "none",
      emphasis: "supporting",
    });
  });

  it("keeps graph quick add and base-kind mapping coherent", () => {
    expect(resolveGraphDefaultRoleForKind("entity")).toBe("graph-topic");
    expect(resolveGraphDefaultRoleForKind("page")).toBe("graph-supporting");
    expect(mapGraphRoleToNodeKind("graph-topic", "page")).toBe("entity");
    expect(mapGraphRoleToNodeKind("graph-supporting", "entity")).toBe("page");
    expect(listGraphQuickAddRoleOptions()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "graph-core",
          baseKind: "entity",
        }),
        expect.objectContaining({
          role: "graph-supporting",
          baseKind: "page",
        }),
      ]),
    );
  });
});
