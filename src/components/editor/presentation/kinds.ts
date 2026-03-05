import type { EdgeKind, NodeKind } from "@/src/domain";
import type { DiagramType } from "@/src/modules/graph/domain";

export type PresentationMode = "operational" | "technical";

export type KindIconDefinition = {
  viewBox: string;
  path: string;
};

export type NodeKindPresentation = {
  labelOperational: string;
  labelTechnical: string;
  icon: KindIconDefinition;
  tone: "slate" | "teal" | "blue" | "amber" | "green" | "violet";
  description: string;
};

export type EdgeKindPresentation = {
  labelOperational: string;
  labelTechnical: string;
  lineStyle: "solid" | "dashed" | "dotted";
  arrowStyle: "arrow" | "open" | "none";
  tone: "slate" | "teal" | "blue" | "amber" | "green" | "violet";
  description: string;
};

export type DiagramContextualAddAction = {
  label: string;
  nodeKind: NodeKind;
  edgeKind: EdgeKind;
};

const NODE_KIND_PRESENTATION: Record<NodeKind, NodeKindPresentation> = {
  workspace: {
    labelOperational: "Area de trabalho",
    labelTechnical: "workspace",
    icon: {
      viewBox: "0 0 24 24",
      path: "M3 4h18v6H3V4Zm0 10h8v6H3v-6Zm10 0h8v6h-8v-6Z",
    },
    tone: "slate",
    description: "Contexto raiz de organizacao do projeto.",
  },
  project: {
    labelOperational: "Projeto",
    labelTechnical: "project",
    icon: {
      viewBox: "0 0 24 24",
      path: "M3 6h8l2 2h8v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z",
    },
    tone: "teal",
    description: "Escopo principal em edicao.",
  },
  entity: {
    labelOperational: "Entidade",
    labelTechnical: "entity",
    icon: {
      viewBox: "0 0 24 24",
      path: "M4 4h16v6H4V4Zm0 10h7v6H4v-6Zm9 0h7v6h-7v-6Z",
    },
    tone: "blue",
    description: "Objeto de negocio, dado ou recurso modelado.",
  },
  page: {
    labelOperational: "Secao",
    labelTechnical: "page",
    icon: {
      viewBox: "0 0 24 24",
      path: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm3 4h8v2H8V7Zm0 4h8v2H8v-2Zm0 4h5v2H8v-2Z",
    },
    tone: "amber",
    description: "Secao de conteudo, capitulo ou agrupador hierarquico.",
  },
  "flow-step": {
    labelOperational: "Etapa",
    labelTechnical: "flow-step",
    icon: {
      viewBox: "0 0 24 24",
      path: "M3 7h10v3h4V7l5 5-5 5v-3h-4v3H3V7Z",
    },
    tone: "green",
    description: "Passo de processo orientado a fluxo.",
  },
  note: {
    labelOperational: "Nota",
    labelTechnical: "note",
    icon: {
      viewBox: "0 0 24 24",
      path: "M5 3h14a2 2 0 0 1 2 2v11l-5 5H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm3 5h8v2H8V8Zm0 4h8v2H8v-2Z",
    },
    tone: "violet",
    description: "Anotacao contextual para observacoes e decisoes.",
  },
};

const EDGE_KIND_PRESENTATION: Record<EdgeKind, EdgeKindPresentation> = {
  contains: {
    labelOperational: "Contem",
    labelTechnical: "contains",
    lineStyle: "solid",
    arrowStyle: "arrow",
    tone: "slate",
    description: "Relacao de composicao entre pai e filho.",
  },
  references: {
    labelOperational: "Referencia",
    labelTechnical: "references",
    lineStyle: "dotted",
    arrowStyle: "open",
    tone: "violet",
    description: "Ligacao de referencia sem dependencia estrutural.",
  },
  "depends-on": {
    labelOperational: "Depende de",
    labelTechnical: "depends-on",
    lineStyle: "dashed",
    arrowStyle: "arrow",
    tone: "amber",
    description: "Dependencia entre itens para execucao ou decisao.",
  },
  "flows-to": {
    labelOperational: "Fluxo",
    labelTechnical: "flows-to",
    lineStyle: "solid",
    arrowStyle: "arrow",
    tone: "green",
    description: "Sequencia de processo entre etapas.",
  },
  "relates-to": {
    labelOperational: "Relaciona",
    labelTechnical: "relates-to",
    lineStyle: "dashed",
    arrowStyle: "none",
    tone: "blue",
    description: "Associacao semantica generica.",
  },
};

const OPERATIONAL_NODE_KIND_OPTIONS: NodeKind[] = [
  "page",
  "flow-step",
  "entity",
  "note",
];

export function getNodeKindPresentation(kind: NodeKind) {
  return NODE_KIND_PRESENTATION[kind];
}

export function getEdgeKindPresentation(kind: EdgeKind) {
  return EDGE_KIND_PRESENTATION[kind];
}

export function getNodeKindLabel(kind: NodeKind, mode: PresentationMode) {
  const presentation = getNodeKindPresentation(kind);
  return mode === "technical"
    ? presentation.labelTechnical
    : presentation.labelOperational;
}

export function getEdgeKindLabel(kind: EdgeKind, mode: PresentationMode) {
  const presentation = getEdgeKindPresentation(kind);
  return mode === "technical"
    ? presentation.labelTechnical
    : presentation.labelOperational;
}

export function getNodeKindDescription(kind: NodeKind) {
  return getNodeKindPresentation(kind).description;
}

export function getEdgeKindDescription(kind: EdgeKind) {
  return getEdgeKindPresentation(kind).description;
}

export function getNodeKindOptions(mode: PresentationMode) {
  if (mode === "technical") {
    return Object.keys(NODE_KIND_PRESENTATION) as NodeKind[];
  }

  return OPERATIONAL_NODE_KIND_OPTIONS;
}

export function getDefaultNodeKindForDiagram(
  diagramType: DiagramType | undefined,
): NodeKind {
  if (diagramType === "tree") {
    return "page";
  }

  if (diagramType === "flow") {
    return "flow-step";
  }

  if (diagramType === "mindmap") {
    return "note";
  }

  return "note";
}

export function getContextualAddActionForDiagram(
  diagramType: DiagramType | undefined,
): DiagramContextualAddAction {
  if (diagramType === "tree") {
    return {
      label: "Adicionar filho",
      nodeKind: "page",
      edgeKind: "contains",
    };
  }

  if (diagramType === "flow") {
    return {
      label: "Adicionar proxima etapa",
      nodeKind: "flow-step",
      edgeKind: "flows-to",
    };
  }

  if (diagramType === "mindmap") {
    return {
      label: "Adicionar ramificacao",
      nodeKind: "note",
      edgeKind: "relates-to",
    };
  }

  return {
    label: "Adicionar relacionado",
    nodeKind: "note",
    edgeKind: "relates-to",
  };
}

export function getOperationalDisplayLabel(input: {
  label: string;
  payload: Record<string, unknown>;
}) {
  const rawLabel = input.label.trim();

  if (!rawLabel) {
    return "Sem titulo";
  }

  if (
    rawLabel.toLowerCase() === "manual source" &&
    input.payload.sourceMode === "manual"
  ) {
    return "Fonte manual";
  }

  return input.label;
}

