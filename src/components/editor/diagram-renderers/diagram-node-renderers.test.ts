import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { EditorNodeData } from "../editor-graph-mappers";
import { FlowNodeRenderer, GraphNodeRenderer } from "./diagram-node-renderers";

vi.mock("@xyflow/react", () => ({
  Handle: (props: {
    className?: string;
    type: string;
    position: string;
  }) =>
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
    GraphNodeRenderer({
      data: buildGraphNodeData(data),
    } as unknown as Parameters<typeof GraphNodeRenderer>[0]),
  );
}

function renderFlowNodeMarkup(data: Partial<EditorNodeData> = {}) {
  return renderToStaticMarkup(
    FlowNodeRenderer({
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
    expect(markup).toContain(">Atividade<");
    expect(markup).toContain("Executa um trabalho observavel dentro da operacao.");
    expect(markup).not.toContain(">Etapa<");
    expect(markup).not.toContain(">Recebe<");
    expect(markup).not.toContain(">Segue<");
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
    expect(markup).toContain('data-diagram-role="flow-decision"');
    expect(markup).toContain("Decisao");
    expect(markup).toContain("Avalia uma regra e abre caminhos alternativos.");
    expect(markup).not.toContain("Ponto de decisao");
  });

  it("renders notes as observations instead of generic steps", () => {
    const markup = renderFlowNodeMarkup({
      label: "Prazo maximo de 24h",
      kind: "note",
      diagramRole: "flow-note",
    });

    expect(markup).toContain('data-flow-variant="flow-note"');
    expect(markup).toContain('data-flow-weight="supporting"');
    expect(markup).toContain("Observacao");
    expect(markup).toContain("Registra risco, excecao ou contexto sem mover o fluxo.");
    expect(markup).not.toContain("Anotacao operacional");
    expect(markup).not.toContain(">Etapa<");
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
    expect(startMarkup).toContain(">Inicio<");
    expect(startMarkup).toContain('data-handle-type="source"');
    expect(startMarkup).not.toContain('data-handle-type="target"');

    expect(endMarkup).toContain('data-flow-variant="flow-end"');
    expect(endMarkup).toContain('data-flow-weight="terminal"');
    expect(endMarkup).toContain(">Fim<");
    expect(endMarkup).toContain('data-handle-type="target"');
    expect(endMarkup).not.toContain('data-handle-type="source"');
  });
});
