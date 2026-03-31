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
    expect(result.allowedEdgeKinds).toEqual(["flows-to"]);
    expect(result.recommendedEdgeKind).toBe("flows-to");
  });

  it("permite observacoes em processo apenas como apoio contextual", () => {
    const result = validateEdgeCreation({
      diagramType: "flow",
      mode: "operational",
      sourceNode: { id: "note", kind: "note", label: "SLA" },
      targetNode: { id: "step", kind: "flow-step", label: "Analisar solicitacao" },
      edgeKind: "references",
    });

    expect(result.ok).toBe(true);
    expect(result.allowedEdgeKinds).toEqual(["references"]);
    expect(result.recommendedEdgeKind).toBe("references");
  });

  it("bloqueia saidas de encerramento no processo", () => {
    const result = validateEdgeCreation({
      diagramType: "flow",
      mode: "operational",
      sourceNode: {
        id: "end",
        kind: "flow-step",
        label: "Encerrar processo",
        payload: { role: "flow-end" },
      },
      targetNode: { id: "next", kind: "flow-step", label: "Proxima etapa" },
      edgeKind: "flows-to",
    });

    expect(result.ok).toBe(false);
    expect(result.allowedEdgeKinds).toEqual([]);
    expect(result.violation?.details).toContain("encerramento");
  });

  it("aceita saidas de decisao e recomenda bifurcacao nomeada", () => {
    const result = validateEdgeCreation({
      diagramType: "flow",
      mode: "operational",
      sourceNode: {
        id: "decision",
        kind: "flow-step",
        label: "Pedido aprovado?",
        payload: { role: "flow-decision" },
      },
      targetNode: {
        id: "approved",
        kind: "flow-step",
        label: "Emitir contrato",
      },
      edgeKind: "depends-on",
    });

    expect(result.ok).toBe(true);
    expect(result.allowedEdgeKinds).toEqual(["depends-on", "flows-to"]);
    expect(result.recommendedEdgeKind).toBe("depends-on");
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
            kind: "flows-to",
          },
        ],
      },
      "flow",
      "operational",
    );

    expect(audit.counters.total).toBeGreaterThan(0);
    expect(audit.counters.nodes).toBeGreaterThan(0);
    expect(audit.bySeverity.error).toBeGreaterThan(0);
  });

  it("sinaliza decisao sem bifurcacao real e etapa sem fechamento", () => {
    const audit = runGraphAudit(
      {
        nodes: [
          {
            id: "start",
            kind: "flow-step",
            label: "Inicio",
            payload: { role: "flow-start" },
          },
          {
            id: "decision",
            kind: "flow-step",
            label: "Aprovado?",
            payload: { role: "flow-decision" },
          },
          {
            id: "step",
            kind: "flow-step",
            label: "Emitir contrato",
          },
        ],
        edges: [
          {
            id: "e1",
            sourceNodeId: "start",
            targetNodeId: "decision",
            kind: "flows-to",
          },
          {
            id: "e2",
            sourceNodeId: "decision",
            targetNodeId: "step",
            kind: "depends-on",
          },
        ],
      },
      "flow",
      "operational",
    );

    const issueCodes = audit.issues.map((issue) => issue.code);
    expect(issueCodes).toContain("FLOW_DECISION_NEEDS_BRANCHES");
    expect(issueCodes).toContain("FLOW_NODE_DEAD_END");
  });
});
