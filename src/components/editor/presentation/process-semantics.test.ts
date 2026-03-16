import { describe, expect, it } from "vitest";
import {
  buildProcessEdgeOverview,
  buildProcessNodeOverview,
  buildProcessRelationsViewModel,
  getProcessEdgeCopy,
  getProcessInspectorCopy,
  getProcessQuickActions,
  getProcessQuickAddRoleOptions,
  getProcessRoleMeta,
  resolveProcessNodeRole,
} from "./process-semantics";

describe("process-semantics", () => {
  it("centralizes process roles and inspector copy", () => {
    expect(resolveProcessNodeRole({ diagramRole: "flow-start", kind: "flow-step" })).toBe(
      "flow-start",
    );
    expect(resolveProcessNodeRole({ diagramRole: "flow-decision", kind: "flow-step" })).toBe(
      "flow-decision",
    );
    expect(resolveProcessNodeRole({ diagramRole: "flow-note", kind: "note" })).toBe(
      "flow-note",
    );
    expect(resolveProcessNodeRole({ kind: "flow-step", label: "Inicio" })).toBe(
      "flow-start",
    );
    expect(resolveProcessNodeRole({ kind: "flow-step", label: "Fim" })).toBe("flow-end");
    expect(resolveProcessNodeRole({ kind: "flow-step", label: "Decisao" })).toBe(
      "flow-decision",
    );

    expect(getProcessRoleMeta("flow-end")).toMatchObject({
      badgeLabel: "Fim",
      kindLabel: "Encerramento",
    });
    expect(getProcessInspectorCopy()).toMatchObject({
      generalSectionTitle: "Identificacao",
      relationsSectionTitle: "Antes e depois",
      edgeKindLabel: "Tipo de passagem",
    });
  });

  it("refines quick actions and quick-add roles for process modeling", () => {
    expect(getProcessQuickActions()).toEqual([
      expect.objectContaining({
        id: "flow-add-next-step",
        label: "Continuar fluxo",
        edgeKind: "flows-to",
      }),
      expect.objectContaining({
        id: "flow-add-branch",
        label: "Criar bifurcacao",
        edgeKind: "depends-on",
      }),
      expect.objectContaining({
        id: "flow-add-note",
        label: "Registrar observacao",
        nodeKind: "note",
        edgeKind: "references",
      }),
    ]);

    expect(getProcessQuickAddRoleOptions()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "flow-decision",
          label: "Decisao",
        }),
        expect.objectContaining({
          role: "flow-note",
          label: "Observacao",
        }),
      ]),
    );
  });

  it("builds contextual node overview by role and connectivity", () => {
    const relations = buildProcessRelationsViewModel({
      selectedNodeId: "decision",
      selectedNodeRole: "flow-decision",
      edges: [
        {
          id: "e1",
          source: "decision",
          target: "approved",
          edgeKind: "depends-on",
          label: "Aprovado",
          sourceRole: "flow-decision",
          targetRole: "flow-step",
        },
      ],
      nodeLabelById: new Map([
        ["decision", "Pedido aprovado?"],
        ["approved", "Emitir contrato"],
      ]),
    });

    const overview = buildProcessNodeOverview({
      role: "flow-decision",
      incomingCount: 0,
      outgoingCount: 1,
      relations,
    });

    expect(overview.badgeLabel).toBe("Decisao");
    expect(overview.kindLabel).toBe("Ponto de decisao");
    expect(overview.connectivityLabel).toBe("0 entrada(s) e 1 saida(s) no fluxo.");
    expect(overview.guidance).toEqual(
      expect.arrayContaining([
        "Use rotulos curtos para diferenciar cada desvio da decisao.",
        "Uma decisao fica mais didatica quando explicita pelo menos dois caminhos.",
      ]),
    );
  });

  it("organizes process relations with coherent lane semantics", () => {
    const result = buildProcessRelationsViewModel({
      selectedNodeId: "step",
      selectedNodeRole: "flow-step",
      edges: [
        {
          id: "before",
          source: "start",
          target: "step",
          edgeKind: "flows-to",
          sourceRole: "flow-start",
          targetRole: "flow-step",
        },
        {
          id: "branch",
          source: "step",
          target: "decision",
          edgeKind: "depends-on",
          label: "Sem saldo",
          sourceRole: "flow-step",
          targetRole: "flow-decision",
        },
        {
          id: "note",
          source: "note",
          target: "step",
          edgeKind: "references",
          sourceRole: "flow-note",
          targetRole: "flow-step",
        },
      ],
      nodeLabelById: new Map([
        ["start", "Inicio"],
        ["step", "Validar cadastro"],
        ["decision", "Saldo suficiente?"],
        ["note", "Regra da operacao"],
      ]),
    });

    expect(result.incomingCount).toBe(2);
    expect(result.outgoingCount).toBe(1);
    expect(result.summaryChips).toEqual([
      { id: "before", label: "Antes", count: 1 },
      { id: "branch", label: "Desvios", count: 1 },
      { id: "note", label: "Observacoes", count: 1 },
    ]);
    expect(result.preview).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "before",
          lane: "before",
          laneLabel: "Vem antes",
          transitionLabel: "Vem de",
        }),
        expect.objectContaining({
          id: "branch",
          lane: "branch",
          relationLabel: "Sem saldo",
          supportingLabel: "transicao condicional",
        }),
        expect.objectContaining({
          id: "note",
          lane: "note",
          transitionLabel: "Recebe anotacao de",
        }),
      ]),
    );
  });

  it("describes process edges with stronger operational language", () => {
    expect(getProcessEdgeCopy("flows-to")).toMatchObject({
      labelOperational: "Continua para",
      edgeBadgeLabel: "Transicao",
    });

    const overview = buildProcessEdgeOverview({
      kind: "depends-on",
      label: "Sem aprovacao",
      sourceLabel: "Analise",
      targetLabel: "Escalar gerente",
    });

    expect(overview).toMatchObject({
      badgeLabel: "Desvio",
      transitionTypeLabel: "Bifurca para",
      summary: "Analise desvia ou condiciona a passagem para Escalar gerente.",
    });
    expect(overview.guidance).toEqual(
      expect.arrayContaining([
        "Rotulo atual: Sem aprovacao.",
        "Use para decisoes, excecoes e desvios de caminho.",
      ]),
    );
  });
});
