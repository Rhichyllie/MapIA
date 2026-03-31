import { describe, expect, it } from "vitest";
import {
  getContextualAddActionForDiagram,
  getContextualActionsForDiagram,
  getDefaultEdgeKindForDiagram,
  getDefaultNodeKindForDiagram,
  getEdgeKindDescriptionForDiagram,
  getEdgeKindLabelForDiagram,
  getEdgeKindPresentation,
  getNodeKindDescriptionForDiagram,
  getNodeKindLabel,
  getNodeKindLabelForDiagram,
  getNodeKindOptions,
  getOperationalDisplayLabel,
} from "./kinds";

describe("editor kinds presentation", () => {
  it("resolves operational and technical labels", () => {
    expect(getNodeKindLabel("page", "operational")).toBe("Secao");
    expect(getNodeKindLabel("flow-step", "technical")).toBe("flow-step");
  });

  it("returns focused operational node options", () => {
    expect(getNodeKindOptions("operational")).toEqual([
      "page",
      "flow-step",
      "entity",
      "note",
    ]);
    expect(getNodeKindOptions("technical")).toContain("workspace");
  });

  it("maps edge styles semantically", () => {
    expect(getEdgeKindPresentation("flows-to")).toMatchObject({
      lineStyle: "solid",
      arrowStyle: "arrow",
      labelOperational: "Fluxo",
    });
    expect(getEdgeKindPresentation("depends-on")).toMatchObject({
      lineStyle: "dashed",
      arrowStyle: "arrow",
    });
    expect(getEdgeKindPresentation("references")).toMatchObject({
      lineStyle: "dotted",
      arrowStyle: "open",
      labelOperational: "Referencia",
    });
  });

  it("normalizes defaults for tree", () => {
    expect(getDefaultNodeKindForDiagram("tree")).toBe("page");
    expect(getDefaultEdgeKindForDiagram("tree")).toBe("contains");
    expect(getContextualAddActionForDiagram("tree")).toEqual({
      label: "Adicionar filho",
      nodeKind: "page",
      edgeKind: "contains",
    });
  });

  it("normalizes defaults for flow", () => {
    expect(getDefaultNodeKindForDiagram("flow")).toBe("flow-step");
    expect(getDefaultEdgeKindForDiagram("flow")).toBe("flows-to");
    expect(getContextualAddActionForDiagram("flow")).toEqual({
      label: "Adicionar proxima etapa",
      nodeKind: "flow-step",
      edgeKind: "flows-to",
    });
    expect(getContextualActionsForDiagram("flow")).toContainEqual(
      expect.objectContaining({
        id: "flow-add-decision",
        type: "add-connected-node",
        edgeKind: "flows-to",
      }),
    );
    expect(getContextualActionsForDiagram("flow")).toContainEqual(
      expect.objectContaining({
        id: "flow-add-note",
        type: "add-connected-node",
        edgeKind: "references",
      }),
    );
  });

  it("normalizes defaults for mindmap", () => {
    expect(getDefaultNodeKindForDiagram("mindmap")).toBe("note");
    expect(getDefaultEdgeKindForDiagram("mindmap")).toBe("relates-to");
    expect(getContextualAddActionForDiagram("mindmap")).toEqual({
      label: "Adicionar ramificacao",
      nodeKind: "note",
      edgeKind: "relates-to",
    });
    expect(getContextualActionsForDiagram("mindmap")).toContainEqual(
      expect.objectContaining({
        id: "mindmap-add-reference",
        type: "add-connected-node",
        edgeKind: "references",
      }),
    );
  });

  it("normalizes defaults for erd", () => {
    expect(getDefaultNodeKindForDiagram("erd")).toBe("entity");
    expect(getDefaultEdgeKindForDiagram("erd")).toBe("references");
    expect(getContextualAddActionForDiagram("erd")).toEqual({
      label: "Adicionar relacao",
      nodeKind: "entity",
      edgeKind: "references",
    });
    expect(getContextualActionsForDiagram("erd")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "erd-add-relation",
          type: "add-connected-node",
        }),
        expect.objectContaining({
          id: "erd-add-field",
          type: "add-field",
        }),
      ]),
    );
  });

  it("normalizes defaults for sitemap", () => {
    expect(getDefaultNodeKindForDiagram("sitemap")).toBe("page");
    expect(getDefaultEdgeKindForDiagram("sitemap")).toBe("contains");
    expect(getContextualAddActionForDiagram("sitemap")).toEqual({
      label: "Adicionar pagina",
      nodeKind: "page",
      edgeKind: "contains",
    });
  });

  it("normalizes defaults for graph", () => {
    expect(getDefaultNodeKindForDiagram("graph")).toBe("entity");
    expect(getDefaultEdgeKindForDiagram("graph")).toBe("depends-on");
    expect(getContextualAddActionForDiagram("graph")).toEqual({
      label: "Adicionar componente",
      nodeKind: "entity",
      edgeKind: "relates-to",
      edgeLabel: "Integra com",
    });
    expect(getContextualActionsForDiagram("graph")).toContainEqual(
      expect.objectContaining({
        id: "graph-add-dependency",
        type: "add-connected-node",
        edgeKind: "depends-on",
      }),
    );
    expect(getContextualActionsForDiagram("graph")).toContainEqual(
      expect.objectContaining({
        id: "graph-add-supporting-service",
        type: "add-connected-node",
        edgeKind: "references",
      }),
    );
  });

  it("uses graph-specific contextual labels for node and edge semantics", () => {
    expect(getNodeKindLabelForDiagram("graph", "entity", "operational")).toBe(
      "Componente",
    );
    expect(getNodeKindLabelForDiagram("graph", "page", "operational")).toBe(
      "Servico auxiliar",
    );
    expect(getNodeKindDescriptionForDiagram("graph", "note")).toContain(
      "apoio",
    );
    expect(getEdgeKindLabelForDiagram("graph", "relates-to", "operational")).toBe(
      "Integracao",
    );
    expect(
      getEdgeKindDescriptionForDiagram("graph", "depends-on"),
    ).toContain("impacto tecnico");
  });

  it("uses process-specific contextual labels for flow semantics", () => {
    expect(getNodeKindLabelForDiagram("flow", "flow-step", "operational")).toBe(
      "Etapa",
    );
    expect(getNodeKindDescriptionForDiagram("flow", "note")).toContain("risco");
    expect(getEdgeKindLabelForDiagram("flow", "flows-to", "operational")).toBe(
      "Continua para",
    );
    expect(getEdgeKindDescriptionForDiagram("flow", "depends-on")).toContain(
      "condicional",
    );
  });

  it("normalizes defaults for timeline", () => {
    expect(getDefaultNodeKindForDiagram("timeline")).toBe("note");
    expect(getDefaultEdgeKindForDiagram("timeline")).toBe("flows-to");
    expect(getContextualAddActionForDiagram("timeline")).toEqual({
      label: "Adicionar marco",
      nodeKind: "note",
      edgeKind: "flows-to",
      edgeLabel: "Proximo",
    });
  });

  it("normalizes legacy manual source label for operational mode", () => {
    expect(
      getOperationalDisplayLabel({
        label: "Manual source",
        payload: { sourceMode: "manual" },
      }),
    ).toBe("Fonte manual");

    expect(
      getOperationalDisplayLabel({
        label: "Import Postgres",
        payload: { sourceMode: "import" },
      }),
    ).toBe("Import Postgres");
  });
});
