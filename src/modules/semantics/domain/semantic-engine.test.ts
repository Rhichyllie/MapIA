import { describe, expect, it } from "vitest";
import {
  buildRepairPlanForNodeKindChange,
  getSemanticProfile,
  runGraphAudit,
  validateEdgeCreation,
} from "./semantic-engine";

describe("semantics rules engine", () => {
  it("validateEdgeCreation aplica regras de flow para flows-to", () => {
    const result = validateEdgeCreation({
      diagramType: "flow",
      mode: "operational",
      sourceNode: { id: "n1", kind: "flow-step", label: "Inicio" },
      targetNode: { id: "n2", kind: "flow-step", label: "Fim" },
      edgeKind: "flows-to",
    });

    expect(result.ok).toBe(true);
    expect(result.allowedEdgeKinds).toEqual(["flows-to", "depends-on"]);
    expect(result.recommendedEdgeKind).toBe("flows-to");
  });

  it("validateEdgeCreation bloqueia conexao erd invalida entre entity e flow-step", () => {
    const result = validateEdgeCreation({
      diagramType: "erd",
      mode: "operational",
      sourceNode: { id: "n1", kind: "entity", label: "Cliente" },
      targetNode: { id: "n2", kind: "flow-step", label: "Aprovar" },
      edgeKind: "references",
    });

    expect(result.ok).toBe(false);
    expect(result.allowedEdgeKinds).toEqual([]);
    expect(result.violation?.code).toBe("EDGE_CONNECTION_NOT_ALLOWED");
  });

  it("getSemanticProfile retorna perfil flexivel quando diagrama esta indefinido", () => {
    const profile = getSemanticProfile(undefined);

    expect(profile.strictRulesEnabled).toBe(false);
    expect(profile.allowedEdgeKinds).toContain("flows-to");
    expect(profile.allowedEdgeKinds).toContain("references");
  });

  it("permite notes no ERD quando policy custom habilita comentario", () => {
    const profile = getSemanticProfile("erd", {
      customRulesJson: {
        erd: {
          allowNoteNodes: true,
        },
      },
    });

    expect(profile.allowedNodeKinds).toContain("entity");
    expect(profile.allowedNodeKinds).toContain("note");
  });

  it("valida conexao note->entity no ERD com custom rule e recomenda depends-on", () => {
    const result = validateEdgeCreation(
      {
        diagramType: "erd",
        mode: "operational",
        sourceNode: { id: "n1", kind: "note", label: "Anotacao" },
        targetNode: { id: "n2", kind: "entity", label: "Cliente" },
        edgeKind: "depends-on",
      },
      {
        customRulesJson: {
          erd: {
            allowNoteNodes: true,
          },
        },
      },
    );

    expect(result.ok).toBe(true);
    expect(result.allowedEdgeKinds).toEqual(["depends-on"]);
    expect(result.recommendedEdgeKind).toBe("depends-on");
  });

  it("buildRepairPlanForNodeKindChange cria acoes de ajuste de aresta e no", () => {
    const plan = buildRepairPlanForNodeKindChange({
      diagramType: "flow",
      mode: "operational",
      nodeId: "node-a",
      nextKind: "entity",
      nodes: [
        { id: "node-a", kind: "flow-step", label: "A" },
        { id: "node-b", kind: "flow-step", label: "B" },
      ],
      edges: [
        {
          id: "edge-a",
          sourceNodeId: "node-a",
          targetNodeId: "node-b",
          kind: "flows-to",
        },
      ],
    });

    expect(plan.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "updateNodeKind",
          nodeId: "node-a",
          nextKind: "flow-step",
        }),
        expect.objectContaining({
          type: "removeEdge",
          edgeId: "edge-a",
        }),
      ]),
    );
    expect(plan.summary).toContain("Plano de reparo");
  });

  it("runGraphAudit contabiliza issues por severidade e alvo", () => {
    const audit = runGraphAudit(
      {
        nodes: [
          { id: "n1", kind: "entity", label: "Cliente" },
          { id: "n2", kind: "flow-step", label: "Aprovar" },
        ],
        edges: [
          {
            id: "e1",
            sourceNodeId: "n1",
            targetNodeId: "n2",
            kind: "references",
          },
        ],
      },
      "erd",
      "operational",
    );

    expect(audit.counters.total).toBeGreaterThan(0);
    expect(audit.counters.nodes).toBeGreaterThan(0);
    expect(audit.counters.edges).toBeGreaterThan(0);
    expect(audit.bySeverity.error).toBeGreaterThan(0);
  });
});
