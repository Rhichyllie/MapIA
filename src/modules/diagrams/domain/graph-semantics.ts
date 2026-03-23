import type { EdgeKind, NodeKind } from "@/src/domain";
import {
  translateEditor,
  type EditorTranslationFn,
} from "@/src/components/editor/editor-i18n";

export type GraphDiagramRole = "graph-core" | "graph-topic" | "graph-supporting";
export type GraphNodeVariant = "core" | "component" | "supporting";

export type GraphQuickAddRoleOption = {
  role: GraphDiagramRole;
  label: string;
  description: string;
  baseKind: NodeKind;
};

type GraphNodeKindCopy = {
  labelOperational: string;
  description: string;
};

type GraphRoleCopy = {
  variant: GraphNodeVariant;
  roleBadgeLabel: string;
  selectionBadgeLabel: string;
  footprintLabel: string;
  summaryFallback: string;
};

export type GraphNodeSemanticRuntime = {
  role: GraphDiagramRole;
  variant: GraphNodeVariant;
  roleBadgeLabel: string;
  selectionBadgeLabel: string;
  kindLabel: string;
  kindDescription: string;
  summary: string;
  footprintLabel: string;
  structureTips: string[];
  connectivityLabel: string;
};

export type GraphEdgeSemanticRuntime = {
  labelOperational: string;
  description: string;
  markerStyle: "closed" | "open" | "none";
  strokeStyle: "solid" | "dashed" | "dotted";
  emphasis: "primary" | "secondary" | "supporting";
  defaultVerbLabel: string;
};

const GRAPH_NODE_KIND_COPY: Partial<Record<NodeKind, GraphNodeKindCopy>> = {
  entity: {
    labelOperational: "Componente",
    description: "Servico, modulo ou capacidade principal dentro da rede.",
  },
  page: {
    labelOperational: "Servico auxiliar",
    description: "Apoio transversal, adaptador, fronteira ou infraestrutura lateral.",
  },
  note: {
    labelOperational: "Contexto",
    description: "Anotacao auxiliar de apoio para contexto, restricao ou observacao de arquitetura.",
  },
  "flow-step": {
    labelOperational: "Servico",
    description: "Elemento operacional usado como capacidade ativa na rede.",
  },
};

const GRAPH_ROLE_COPY: Record<GraphDiagramRole, GraphRoleCopy> = {
  "graph-core": {
    variant: "core",
    roleBadgeLabel: "Nucleo da rede",
    selectionBadgeLabel: "Nucleo em foco",
    footprintLabel: "Coordena a malha principal",
    summaryFallback:
      "Ponto central da arquitetura. Use para organizar dependencias, integracoes e fronteiras da rede.",
  },
  "graph-topic": {
    variant: "component",
    roleBadgeLabel: "Componente conectado",
    selectionBadgeLabel: "Componente em foco",
    footprintLabel: "Participa da rede ativa",
    summaryFallback:
      "Componente que participa das integracoes e dependencias da estrutura.",
  },
  "graph-supporting": {
    variant: "supporting",
    roleBadgeLabel: "Apoio arquitetural",
    selectionBadgeLabel: "Apoio em foco",
    footprintLabel: "Sustenta e contextualiza a rede",
    summaryFallback:
      "Capacidade transversal, servico auxiliar ou contexto de apoio para a rede.",
  },
};

const GRAPH_EDGE_COPY: Partial<Record<EdgeKind, GraphEdgeSemanticRuntime>> = {
  "depends-on": {
    labelOperational: "Dependencia",
    description: "Ligacao estrutural forte entre componentes com impacto tecnico direto.",
    markerStyle: "closed",
    strokeStyle: "dashed",
    emphasis: "primary",
    defaultVerbLabel: "Depende de",
  },
  "relates-to": {
    labelOperational: "Integracao",
    description: "Ligacao lateral entre componentes ativos da rede.",
    markerStyle: "open",
    strokeStyle: "solid",
    emphasis: "secondary",
    defaultVerbLabel: "Integra com",
  },
  references: {
    labelOperational: "Apoio",
    description: "Ligacao secundaria de contexto, referencia ou servico auxiliar.",
    markerStyle: "none",
    strokeStyle: "dotted",
    emphasis: "supporting",
    defaultVerbLabel: "Apoia",
  },
};

const GRAPH_QUICK_ADD_ROLE_OPTIONS: readonly GraphQuickAddRoleOption[] = [
  {
    role: "graph-core",
    label: "Nucleo",
    description: "Componente central da rede.",
    baseKind: "entity",
  },
  {
    role: "graph-topic",
    label: "Componente",
    description: "Peca arquitetural conectada ao nucleo ou a outros componentes.",
    baseKind: "entity",
  },
  {
    role: "graph-supporting",
    label: "Servico auxiliar",
    description: "Apoio, adaptador, borda ou contexto transversal da estrutura.",
    baseKind: "page",
  },
] as const;

function normalizeGraphLabel(label: string | null | undefined) {
  return label?.trim().toLowerCase() ?? "";
}

function readPayloadText(
  payload: Record<string, unknown> | undefined,
  field: string,
) {
  const value = payload?.[field];
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

export function resolveGraphDiagramRole(input: {
  diagramRole?: string | null;
  nodeKind: NodeKind;
  nodeLabel?: string | null;
}): GraphDiagramRole {
  const normalizedLabel = normalizeGraphLabel(input.nodeLabel);
  if (
    input.diagramRole === "graph-core" ||
    normalizedLabel === "nucleo" ||
    normalizedLabel === "core" ||
    normalizedLabel === "centro"
  ) {
    return "graph-core";
  }

  if (
    input.diagramRole === "graph-supporting" ||
    input.nodeKind === "page" ||
    input.nodeKind === "note"
  ) {
    return "graph-supporting";
  }

  return "graph-topic";
}

export function resolveGraphDefaultRoleForKind(kind: NodeKind): GraphDiagramRole {
  if (kind === "page" || kind === "note") {
    return "graph-supporting";
  }

  return "graph-topic";
}

export function mapGraphRoleToNodeKind(
  role: GraphDiagramRole,
  fallbackKind: NodeKind,
): NodeKind {
  if (role === "graph-core" || role === "graph-topic") {
    return fallbackKind === "entity" || fallbackKind === "page" ? "entity" : "note";
  }

  return fallbackKind === "note" ? "note" : "page";
}

export function listGraphQuickAddRoleOptions(t?: EditorTranslationFn) {
  return GRAPH_QUICK_ADD_ROLE_OPTIONS.map((option) => ({
    ...option,
    label: translateEditor(
      t,
      `graph.quickAddRoles.${option.role}.label`,
      option.label,
    ),
    description: translateEditor(
      t,
      `graph.quickAddRoles.${option.role}.description`,
      option.description,
    ),
  }));
}

export function resolveGraphNodeKindCopy(
  kind: NodeKind,
  t?: EditorTranslationFn,
): GraphNodeKindCopy {
  const fallback = GRAPH_NODE_KIND_COPY[kind] ?? {
    labelOperational: "Componente",
    description: "Elemento utilizado na leitura arquitetural da rede.",
  };

  return {
    labelOperational: translateEditor(
      t,
      `graph.nodeKinds.${kind}.labelOperational`,
      fallback.labelOperational,
    ),
    description: translateEditor(
      t,
      `graph.nodeKinds.${kind}.description`,
      fallback.description,
    ),
  };
}

export function resolveGraphEdgeSemantic(
  kind: EdgeKind,
  t?: EditorTranslationFn,
): GraphEdgeSemanticRuntime {
  const fallback = GRAPH_EDGE_COPY[kind] ?? {
    labelOperational: "Conexao",
    description: "Ligacao contextual entre itens do grafo.",
    markerStyle: "open",
    strokeStyle: "solid",
    emphasis: "secondary",
    defaultVerbLabel: "Integra com",
  };

  return {
    ...fallback,
    labelOperational: translateEditor(
      t,
      `graph.edgeKinds.${kind}.labelOperational`,
      fallback.labelOperational,
    ),
    description: translateEditor(
      t,
      `graph.edgeKinds.${kind}.description`,
      fallback.description,
    ),
    defaultVerbLabel: translateEditor(
      t,
      `graph.edgeKinds.${kind}.defaultVerbLabel`,
      fallback.defaultVerbLabel,
    ),
  };
}

export function resolveGraphNodeSemantic(input: {
  diagramRole?: string | null;
  kind: NodeKind;
  label?: string | null;
  payload?: Record<string, unknown>;
  incomingCount?: number;
  outgoingCount?: number;
}, t?: EditorTranslationFn): GraphNodeSemanticRuntime {
  const role = resolveGraphDiagramRole({
    diagramRole: input.diagramRole,
    nodeKind: input.kind,
    nodeLabel: input.label,
  });
  const roleCopy = GRAPH_ROLE_COPY[role];
  const kindCopy = resolveGraphNodeKindCopy(input.kind, t);
  const incomingCount = input.incomingCount ?? 0;
  const outgoingCount = input.outgoingCount ?? 0;
  const summary =
    readPayloadText(input.payload, "description") ??
    translateEditor(
      t,
      `graph.roles.${role}.summaryFallback`,
      roleCopy.summaryFallback,
    );
  const structureTips = [
    translateEditor(
      t,
      "graph.structureTips.connectivity",
      `Leitura da rede: ${incomingCount} entrada(s) e ${outgoingCount} saida(s).`,
      { incomingCount, outgoingCount },
    ),
    role === "graph-core"
      ? translateEditor(
          t,
          "graph.structureTips.core",
          "Use este item para orientar a rede principal e evitar dependencias difusas.",
        )
      : role === "graph-topic"
        ? translateEditor(
            t,
            "graph.structureTips.topic",
            "Revise integracoes laterais e dependencias diretas deste componente.",
          )
        : translateEditor(
            t,
            "graph.structureTips.supporting",
            "Use este item para apoio, contexto, adaptacao ou fronteira do sistema.",
          ),
  ];

  return {
    role,
    variant: roleCopy.variant,
    roleBadgeLabel: translateEditor(
      t,
      `graph.roles.${role}.roleBadgeLabel`,
      roleCopy.roleBadgeLabel,
    ),
    selectionBadgeLabel: translateEditor(
      t,
      `graph.roles.${role}.selectionBadgeLabel`,
      roleCopy.selectionBadgeLabel,
    ),
    kindLabel: kindCopy.labelOperational,
    kindDescription: kindCopy.description,
    summary,
    footprintLabel: translateEditor(
      t,
      `graph.roles.${role}.footprintLabel`,
      roleCopy.footprintLabel,
    ),
    structureTips,
    connectivityLabel: translateEditor(
      t,
      "graph.connectivityLabel",
      `Recebe ${incomingCount} conexao(oes) e envia ${outgoingCount}.`,
      { incomingCount, outgoingCount },
    ),
  };
}

export function resolveGraphActionEdgeVerb(
  actionId: string,
  t?: EditorTranslationFn,
) {
  if (actionId === "graph-add-dependency") {
    return resolveGraphEdgeSemantic("depends-on", t).defaultVerbLabel;
  }

  if (actionId === "graph-add-supporting-service") {
    return resolveGraphEdgeSemantic("references", t).defaultVerbLabel;
  }

  return resolveGraphEdgeSemantic("relates-to", t).defaultVerbLabel;
}
