import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  getEditorBaseMessage,
  type EditorTranslationValues,
} from "../editor-i18n";
import type { EditorNodeData } from "../editor-graph-mappers";
import { FlowNodeRenderer, GraphNodeRenderer } from "./diagram-node-renderers";

vi.mock("@xyflow/react", () => ({
  Handle: (props: { className?: string; type: string; position: string }) =>
    createElement("div", {
      className: props.className,
      "data-handle-type": props.type,
      "data-handle-position": props.position,
    }),
  Position: {
    Left: "left",
    Right: "right",
    Top: "top",
    Bottom: "bottom",
  },
  BackgroundVariant: {
    Lines: "lines",
  },
  ConnectionLineType: {
    SmoothStep: "smoothstep",
  },
  MarkerType: {
    Arrow: "arrow",
    ArrowClosed: "arrowclosed",
  },
}));

vi.mock("../use-editor-translations", () => ({
  useEditorTranslations:
    () => (key: string, values?: EditorTranslationValues) =>
      getEditorBaseMessage(key, values),
}));

function buildGraphNodeData(
  overrides: Partial<EditorNodeData> = {},
): EditorNodeData {
  return {
    label: "API Gateway",
    kind: "entity",
    payload: {},
    externalRefs: [],
    diagramRole: "graph-topic",
    ...overrides,
  };
}

function renderGraphNodeMarkup(data: Partial<EditorNodeData> = {}) {
  return renderToStaticMarkup(
    createElement(GraphNodeRenderer, {
      data: buildGraphNodeData(data),
    } as unknown as Parameters<typeof GraphNodeRenderer>[0]),
  );
}

function renderFlowNodeMarkup(data: Partial<EditorNodeData> = {}) {
  return renderToStaticMarkup(
    createElement(FlowNodeRenderer, {
      data: buildGraphNodeData({
        kind: "flow-step",
        diagramRole: "flow-step",
        ...data,
      }),
    } as unknown as Parameters<typeof FlowNodeRenderer>[0]),
  );
}

describe("GraphNodeRenderer", () => {
  it("renders dedicated semantic DOM for graph core nodes", () => {
    const markup = renderGraphNodeMarkup({
      label: "Nucleo de identidade",
      kind: "entity",
      diagramRole: "graph-core",
    });

    expect(markup).toContain('data-testid="graph-node-renderer"');
    expect(markup).toContain('data-graph-variant="core"');
    expect(markup).toContain('data-diagram-role="graph-core"');
    expect(markup).toContain('data-testid="graph-node-click-surface"');
    expect(markup).toContain("Nucleo da rede");
    expect(markup).toContain("Componente");
    expect(markup).toContain("Coordena a malha principal");
    expect(markup).not.toContain(">Nota<");
  });

  it("renders supporting graph nodes with dedicated support styling and copy", () => {
    const markup = renderGraphNodeMarkup({
      label: "Servico de observabilidade",
      kind: "page",
      diagramRole: "graph-supporting",
    });

    expect(markup).toContain('data-graph-variant="supporting"');
    expect(markup).toContain("Apoio arquitetural");
    expect(markup).toContain("Servico auxiliar");
    expect(markup).toContain("Sustenta e contextualiza a rede");
  });
});

describe("FlowNodeRenderer", () => {
  it("renders steps with a single operational label on the canvas", () => {
    const markup = renderFlowNodeMarkup({
      label: "Conferir documentos",
      kind: "flow-step",
      diagramRole: "flow-step",
    });

    expect(markup).toContain('data-testid="flow-node-renderer"');
    expect(markup).toContain('data-flow-variant="flow-step"');
    expect(markup).toContain('data-flow-weight="primary"');
    expect(markup).toContain('data-flow-notation="activity"');
    expect(markup).toContain('data-flow-content-policy="flow-step"');
    expect(markup).toContain("diagram-node-flow__frame");
    expect(markup).toContain("diagram-node-flow__state-layer");
    expect(markup).toContain("diagram-node-flow__semantic--activity");
    expect(markup).toContain("diagram-node-flow__activity-shell");
    expect(markup).toContain("diagram-node-flow__activity-rail--entry");
    expect(markup).toContain("diagram-node-flow__activity-rail--exit");
    expect(markup).toContain("diagram-node-flow__activity-surface");
    expect(markup).toContain(">Etapa<");
    expect(markup).toContain(
      "Executa um trabalho observavel dentro da operacao.",
    );
    expect(markup).toContain("Etapa do processo");
    expect(markup).not.toContain(">Recebe<");
    expect(markup).not.toContain(">Segue<");
  });

  it("expands step envelopes for dense real content without leaking raw payload structure", () => {
    const markup = renderFlowNodeMarkup({
      label: "Consolidar documentacao obrigatoria para homologacao final",
      kind: "flow-step",
      diagramRole: "flow-step",
      payload: {
        description:
          "Valida anexos, normaliza dados sensiveis e prepara um pacote unico para a aprovacao operacional.",
        __mapia: {
          process: {
            owner: "Operacoes",
            area: "Backoffice",
            channel: "Portal B2B",
            sla: "4h",
          },
        },
      },
    });

    expect(markup).toContain('data-flow-density="rich"');
    expect(markup).toContain('data-flow-summary-source="payload-description"');
    expect(markup).toContain('data-flow-meta-source="operational"');
    expect(markup).toContain("--flow-node-frame-width:368px");
    expect(markup).toContain("--flow-node-frame-height:236px");
    expect(markup).toContain("Operacoes");
    expect(markup).toContain("Backoffice");
    expect(markup).toContain("Portal B2B");
    expect(markup).not.toContain(">flow-step<");
  });

  it("renders decision nodes with dedicated process semantics", () => {
    const markup = renderFlowNodeMarkup({
      label: "Pedido aprovado?",
      kind: "flow-step",
      diagramRole: "flow-decision",
    });

    expect(markup).toContain('data-testid="flow-node-renderer"');
    expect(markup).toContain('data-flow-variant="flow-decision"');
    expect(markup).toContain('data-flow-weight="primary"');
    expect(markup).toContain('data-flow-notation="gateway"');
    expect(markup).toContain('data-flow-content-policy="flow-decision"');
    expect(markup).toContain('data-diagram-role="flow-decision"');
    expect(markup).toContain("diagram-node-flow__semantic--gateway");
    expect(markup).toContain("diagram-node-flow__gateway-axis--horizontal");
    expect(markup).toContain("diagram-node-flow__gateway-axis--vertical");
    expect(markup).toContain("diagram-node-flow__gateway-outline");
    expect(markup).toContain("diagram-node-flow__gateway-surface");
    expect(markup).toContain("diagram-node-flow__gateway-content");
    expect(markup).toContain("diagram-node-flow__gateway-copy-surface");
    expect(markup).toContain("diagram-node-flow__badge--gateway-core");
    expect(markup).toContain("diagram-node-flow__gateway-emblem");
    expect(markup).toContain("diagram-node-flow__gateway-copy");
    expect(markup).toContain("diagram-node-flow__gateway-caption-shell");
    expect(markup).toContain("diagram-node-flow__gateway-caption-line");
    expect(markup).toContain("diagram-node-flow__gateway-caption");
    expect(markup).toContain("diagram-node-flow__summary--gateway-caption");
    expect(markup).toContain("diagram-node-flow__title--gateway");
    expect(markup).toContain("Decisao");
    expect(markup).toContain("Avalia uma regra e abre caminhos alternativos.");
    expect(markup).toContain("Ponto de decisao");
    expect(markup).not.toContain("diagram-node-flow__gateway-halo");
    expect(markup).not.toContain("diagram-node-flow__meta--gateway");
  });

  it("keeps gateway internals minimal while externalizing long decision context", () => {
    const markup = renderFlowNodeMarkup({
      label: "Validacao complementar de elegibilidade aprovada?",
      kind: "flow-step",
      diagramRole: "flow-decision",
      payload: {
        __mapia: {
          process: {
            rule: "Confere documentos obrigatorios e decide quando o caso precisa seguir para uma revisao manual adicional.",
            owner: "Credito",
            area: "Mesa operacional",
          },
        },
      },
    });

    expect(markup).toContain('data-flow-density="rich"');
    expect(markup).toContain('data-flow-summary-source="process-rule"');
    expect(markup).toContain('data-flow-meta-source="operational"');
    expect(markup).toContain("--flow-node-caption-width:248px");
    expect(markup).toContain("diagram-node-flow__meta-copy--gateway");
    expect(markup).toContain("Credito");
    expect(markup).not.toContain(">flow-decision<");
  });

  it("renders notes as observations instead of generic steps", () => {
    const markup = renderFlowNodeMarkup({
      label: "Prazo maximo de 24h",
      kind: "note",
      diagramRole: "flow-note",
    });

    expect(markup).toContain('data-flow-variant="flow-note"');
    expect(markup).toContain('data-flow-weight="supporting"');
    expect(markup).toContain('data-flow-notation="artifact"');
    expect(markup).toContain("diagram-node-flow__semantic--artifact");
    expect(markup).toContain("diagram-node-flow__artifact-shell");
    expect(markup).toContain("diagram-node-flow__artifact-accent");
    expect(markup).toContain("diagram-node-flow__artifact-surface");
    expect(markup).toContain("diagram-node-flow__artifact-fold");
    expect(markup).toContain("Observacao");
    expect(markup).toContain(
      "Registra risco, excecao ou contexto sem mover o fluxo.",
    );
    expect(markup).toContain("Observacao de apoio");
    expect(markup).not.toContain(">Etapa do processo<");
  });

  it("renders start and end variants with terminal handles only where expected", () => {
    const startMarkup = renderFlowNodeMarkup({
      label: "Receber pedido",
      kind: "flow-step",
      diagramRole: "flow-start",
    });
    const endMarkup = renderFlowNodeMarkup({
      label: "Pedido concluido",
      kind: "flow-step",
      diagramRole: "flow-end",
    });

    expect(startMarkup).toContain('data-flow-variant="flow-start"');
    expect(startMarkup).toContain('data-flow-weight="terminal"');
    expect(startMarkup).toContain('data-flow-notation="start-event"');
    expect(startMarkup).toContain("diagram-node-flow__semantic--start-event");
    expect(startMarkup).toContain("diagram-node-flow__terminal-shell");
    expect(startMarkup).toContain("diagram-node-flow__terminal-core");
    expect(startMarkup).toContain("diagram-node-flow__event-marker--start");
    expect(startMarkup).toContain(">Inicio<");
    expect(startMarkup).toContain('data-handle-type="source"');
    expect(startMarkup).not.toContain('data-handle-type="target"');

    expect(endMarkup).toContain('data-flow-variant="flow-end"');
    expect(endMarkup).toContain('data-flow-weight="terminal"');
    expect(endMarkup).toContain('data-flow-notation="end-event"');
    expect(endMarkup).toContain("diagram-node-flow__semantic--end-event");
    expect(endMarkup).toContain("diagram-node-flow__terminal-shell");
    expect(endMarkup).toContain("diagram-node-flow__terminal-core");
    expect(endMarkup).toContain("diagram-node-flow__event-marker--end");
    expect(endMarkup).toContain(">Encerramento<");
    expect(endMarkup).toContain('data-handle-type="target"');
    expect(endMarkup).not.toContain('data-handle-type="source"');
  });

  it("hardens end nodes for slightly longer completion content", () => {
    const markup = renderFlowNodeMarkup({
      label: "Encerrar solicitacao com retorno auditavel ao solicitante",
      kind: "flow-step",
      diagramRole: "flow-end",
      payload: {
        description:
          "Confirma o fechamento, registra o protocolo final e devolve o status consolidado para consulta posterior.",
        __mapia: {
          process: {
            owner: "Atendimento",
            sla: "24h",
          },
        },
      },
    });

    expect(markup).toContain('data-flow-density="rich"');
    expect(markup).toContain('data-flow-summary-source="payload-description"');
    expect(markup).toContain('data-flow-meta-source="operational"');
    expect(markup).toContain("--flow-node-frame-height:196px");
    expect(markup).toContain("Atendimento");
    expect(markup).toContain("24h");
    expect(markup).not.toContain(">flow-end<");
  });
});
