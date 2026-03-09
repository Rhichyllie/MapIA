import { describe, expect, it } from "vitest";
import {
  getContextualAddActionForDiagram,
  getContextualActionsForDiagram,
  getDefaultEdgeKindForDiagram,
  getDefaultNodeKindForDiagram,
  getEdgeKindPresentation,
  getNodeKindLabel,
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
        id: "flow-add-branch",
        type: "add-connected-node",
        edgeKind: "depends-on",
        edgeLabel: "Decisao",
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
