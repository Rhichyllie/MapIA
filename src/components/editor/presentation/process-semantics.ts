import type { EdgeKind, NodeKind } from "@/src/domain";
import {
  resolveFlowDiagramRole,
  type DiagramRole,
  type FlowDiagramRole,
} from "@/src/modules/diagrams/domain";
import { translateEditor, type EditorTranslationFn } from "../editor-i18n";

export type ProcessNodeRole = FlowDiagramRole;

export type ProcessQuickActionId =
  | "flow-add-next-step"
  | "flow-add-branch"
  | "flow-add-note";

export type ProcessQuickActionDefinition = {
  id: ProcessQuickActionId;
  label: string;
  nodeKind: NodeKind;
  edgeKind: EdgeKind;
  edgeLabel?: string;
};

export type ProcessQuickAddRoleOption = {
  role: ProcessNodeRole;
  label: string;
  description: string;
  baseKind: NodeKind;
};

export type ProcessRelationPreview = {
  id: string;
  edgeKind: EdgeKind;
  otherNodeId: string;
  otherLabel: string;
  sourceLabel: string;
  targetLabel: string;
  direction: "incoming" | "outgoing";
  lane: "before" | "after" | "branch" | "note";
  laneLabel: string;
  transitionLabel: string;
  supportingLabel: string;
  relationLabel?: string;
};

export type ProcessRelationsViewModel = {
  incomingCount: number;
  outgoingCount: number;
  summaryChips: Array<{
    id: "before" | "after" | "branch" | "note";
    label: string;
    count: number;
  }>;
  preview: ProcessRelationPreview[];
};

export type ProcessNodeOverview = {
  badgeLabel: string;
  kindLabel: string;
  summary: string;
  positionLabel: string;
  connectivityLabel: string;
  guidance: string[];
};

export type ProcessEdgeOverview = {
  badgeLabel: string;
  transitionTypeLabel: string;
  summary: string;
  guidance: string[];
};

export type ProcessInspectorCopy = {
  selectionBadgeLabel: string;
  emptyTitle: string;
  emptySummary: string;
  emptyGuidance: string;
  titleLabel: string;
  kindLabel: string;
  descriptionLabel: string;
  descriptionPlaceholder: string;
  tagsLabel: string;
  tagsPlaceholder: string;
  tagsHelper: string;
  contextTitle: string;
  generalSectionTitle: string;
  detailsSectionTitle: string;
  relationsSectionTitle: string;
  edgeGeneralSectionTitle: string;
  edgeLabelLabel: string;
  edgeKindLabel: string;
  edgeSourceLabel: string;
  edgeTargetLabel: string;
  nodeSubtitle: string;
  edgeSubtitle: string;
  relationsEmptyState: string;
};

type ProcessRoleMeta = {
  badgeLabel: string;
  kindLabel: string;
  canvasHint: string;
  summary: string;
  positionEmptyLabel: string;
  positionConnectedLabel: string;
  guidanceWhenSparse: string;
  guidanceWhenConnected: string;
};

type ProcessEdgeMeta = {
  labelOperational: string;
  description: string;
  outgoingLaneLabel: string;
  incomingLaneLabel: string;
  supportingLabel: string;
  edgeBadgeLabel: string;
  edgeSummaryTemplate: (sourceLabel: string, targetLabel: string) => string;
  guidance: string[];
};

const PROCESS_ROLE_META: Record<ProcessNodeRole, ProcessRoleMeta> = {
  "flow-start": {
    badgeLabel: "Inicio",
    kindLabel: "Ponto de partida",
    canvasHint: "Dispara o processo e orienta a primeira passagem.",
    summary: "Marca onde a operacao comeca e qual ritmo ela imprime ao restante do fluxo.",
    positionEmptyLabel: "Sem entradas anteriores, como esperado para a abertura do fluxo.",
    positionConnectedLabel:
      "Ja recebe entradas. Vale revisar se este ponto ainda e o inicio correto.",
    guidanceWhenSparse: "Conecte a primeira atividade para deixar a trilha legivel.",
    guidanceWhenConnected: "Confirme se as entradas nao deveriam apontar para uma etapa anterior.",
  },
  "flow-step": {
    badgeLabel: "Etapa",
    kindLabel: "Atividade",
    canvasHint: "Executa um trabalho observavel dentro da operacao.",
    summary: "Representa uma atividade executavel, com responsabilidade clara antes de seguir adiante.",
    positionEmptyLabel: "Ainda isolada. Falta indicar de onde esta atividade vem e para onde segue.",
    positionConnectedLabel: "Ja ocupa um trecho operacional definido dentro do fluxo.",
    guidanceWhenSparse: "Conecte o antes e o depois para evitar ilhas operacionais.",
    guidanceWhenConnected: "Revise se a proxima passagem esta nomeada pela acao correta.",
  },
  "flow-decision": {
    badgeLabel: "Decisao",
    kindLabel: "Ponto de decisao",
    canvasHint: "Avalia uma regra e abre caminhos alternativos.",
    summary: "Concentra a pergunta, criterio ou regra que faz o processo bifurcar.",
    positionEmptyLabel: "Sem caminhos suficientes. Uma decisao precisa pelo menos uma saida clara.",
    positionConnectedLabel: "Ja influencia o caminho do fluxo com transicoes condicionais.",
    guidanceWhenSparse: "Crie saídas nomeadas para deixar as alternativas explicitas.",
    guidanceWhenConnected: "Use rotulos curtos para diferenciar cada desvio da decisao.",
  },
  "flow-end": {
    badgeLabel: "Fim",
    kindLabel: "Encerramento",
    canvasHint: "Consolida o desfecho operacional deste fluxo.",
    summary: "Fecha o percurso e comunica o resultado ou estado final da operacao.",
    positionEmptyLabel: "Ainda sem etapa anterior conectada. Falta mostrar como o fluxo chega aqui.",
    positionConnectedLabel: "Recebe o resultado das etapas anteriores sem continuar adiante.",
    guidanceWhenSparse: "Conecte a etapa que entrega este encerramento.",
    guidanceWhenConnected: "Evite novas saidas para manter o encerramento terminal e claro.",
  },
  "flow-note": {
    badgeLabel: "Observacao",
    kindLabel: "Anotacao operacional",
    canvasHint: "Registra risco, excecao ou contexto sem mover o fluxo.",
    summary: "Documenta combinados, alertas ou contexto de apoio sem virar mais uma etapa.",
    positionEmptyLabel: "Ainda solta no canvas. Anexe a observacao ao trecho que ela explica.",
    positionConnectedLabel: "Apoia a leitura do fluxo sem competir com a sequencia principal.",
    guidanceWhenSparse: "Conecte a observacao ao ponto do fluxo que ela esclarece.",
    guidanceWhenConnected: "Use observacoes para excecoes, SLA, risco ou regras complementares.",
  },
};

const PROCESS_EDGE_META: Record<EdgeKind, ProcessEdgeMeta> = {
  contains: {
    labelOperational: "Contem",
    description: "Agrupamento estrutural, raro no fluxo operacional.",
    outgoingLaneLabel: "Agrupa em",
    incomingLaneLabel: "Agrupado por",
    supportingLabel: "vinculo estrutural",
    edgeBadgeLabel: "Estrutura",
    edgeSummaryTemplate: (sourceLabel, targetLabel) =>
      `${sourceLabel} organiza ${targetLabel} no mesmo agrupamento.`,
    guidance: ["Use apenas quando o fluxo precisar de um agrupamento explicito."],
  },
  references: {
    labelOperational: "Observa",
    description: "Conecta anotacoes e contexto sem alterar a sequencia principal.",
    outgoingLaneLabel: "Anota",
    incomingLaneLabel: "Recebe anotacao de",
    supportingLabel: "apoio contextual",
    edgeBadgeLabel: "Observacao",
    edgeSummaryTemplate: (sourceLabel, targetLabel) =>
      `${sourceLabel} adiciona contexto operacional a ${targetLabel}.`,
    guidance: [
      "Use para observacoes, riscos, excecoes ou combinados paralelos ao fluxo.",
      "Evite usar esta ligacao para mover o trabalho entre etapas.",
    ],
  },
  "depends-on": {
    labelOperational: "Bifurca para",
    description: "Abre um caminho condicional ou uma dependencia que altera a continuidade.",
    outgoingLaneLabel: "Bifurca para",
    incomingLaneLabel: "Depende de",
    supportingLabel: "transicao condicional",
    edgeBadgeLabel: "Desvio",
    edgeSummaryTemplate: (sourceLabel, targetLabel) =>
      `${sourceLabel} desvia ou condiciona a passagem para ${targetLabel}.`,
    guidance: [
      "Use para decisoes, excecoes e desvios de caminho.",
      "Prefira rotulos curtos que explicitem a condicao da bifurcacao.",
    ],
  },
  "flows-to": {
    labelOperational: "Continua para",
    description: "Passagem principal entre um ponto do fluxo e o proximo.",
    outgoingLaneLabel: "Segue para",
    incomingLaneLabel: "Vem de",
    supportingLabel: "continuidade principal",
    edgeBadgeLabel: "Transicao",
    edgeSummaryTemplate: (sourceLabel, targetLabel) =>
      `${sourceLabel} continua para ${targetLabel}.`,
    guidance: [
      "Use para a sequencia principal da operacao.",
      "Mantenha o rotulo apenas quando ele realmente acrescentar contexto.",
    ],
  },
  "relates-to": {
    labelOperational: "Relaciona com",
    description: "Faz uma ligacao complementar fora da sequencia principal.",
    outgoingLaneLabel: "Relaciona com",
    incomingLaneLabel: "Relacionado a",
    supportingLabel: "vinculo complementar",
    edgeBadgeLabel: "Ligacao",
    edgeSummaryTemplate: (sourceLabel, targetLabel) =>
      `${sourceLabel} se relaciona com ${targetLabel}.`,
    guidance: ["Prefira transicao, bifurcacao ou observacao quando houver semantica mais forte."],
  },
};

const PROCESS_QUICK_ACTIONS: ProcessQuickActionDefinition[] = [
  {
    id: "flow-add-next-step",
    label: "Continuar fluxo",
    nodeKind: "flow-step",
    edgeKind: "flows-to",
  },
  {
    id: "flow-add-branch",
    label: "Criar bifurcacao",
    nodeKind: "flow-step",
    edgeKind: "depends-on",
    edgeLabel: "Condicao",
  },
  {
    id: "flow-add-note",
    label: "Registrar observacao",
    nodeKind: "note",
    edgeKind: "references",
    edgeLabel: "Observacao",
  },
];

const PROCESS_QUICK_ADD_ROLE_OPTIONS: ProcessQuickAddRoleOption[] = [
  {
    role: "flow-start",
    label: "Inicio",
    description: "Marca onde a operacao comeca.",
    baseKind: "flow-step",
  },
  {
    role: "flow-step",
    label: "Atividade",
    description: "Executa uma acao clara dentro do processo.",
    baseKind: "flow-step",
  },
  {
    role: "flow-decision",
    label: "Decisao",
    description: "Abre caminhos conforme regra, condicao ou resposta.",
    baseKind: "flow-step",
  },
  {
    role: "flow-note",
    label: "Observacao",
    description: "Registra contexto, risco ou excecao sem virar mais uma etapa.",
    baseKind: "note",
  },
  {
    role: "flow-end",
    label: "Fim",
    description: "Indica onde este percurso se encerra.",
    baseKind: "flow-step",
  },
];

const PROCESS_INSPECTOR_COPY: ProcessInspectorCopy = {
  selectionBadgeLabel: "Trecho em foco",
  emptyTitle: "Leitura do fluxo",
  emptySummary: "Selecione um ponto do processo para ver papel, continuidade e contexto.",
  emptyGuidance:
    "Prefira abrir inicio, atividade, decisao ou fim para revisar o encadeamento operacional.",
  titleLabel: "Nome no fluxo",
  kindLabel: "Formato no fluxo",
  descriptionLabel: "Leitura operacional",
  descriptionPlaceholder:
    "Descreva o que acontece neste ponto, qual criterio decide a passagem e o que sai daqui.",
  tagsLabel: "Marcadores operacionais",
  tagsPlaceholder: "Ex.: SLA, excecao, aprovacao, canal, fila",
  tagsHelper: "Use marcadores curtos para risco, canal, turno, regra ou criticidade.",
  contextTitle: "Leitura operacional",
  generalSectionTitle: "Identificacao",
  detailsSectionTitle: "Contexto e notas",
  relationsSectionTitle: "Antes e depois",
  edgeGeneralSectionTitle: "Leitura da transicao",
  edgeLabelLabel: "Rotulo da passagem",
  edgeKindLabel: "Tipo de passagem",
  edgeSourceLabel: "Sai de",
  edgeTargetLabel: "Chega em",
  nodeSubtitle: "Entenda o papel deste ponto no fluxo antes de editar o texto.",
  edgeSubtitle: "Leia a transicao primeiro e ajuste o detalhe so quando necessario.",
  relationsEmptyState: "Ainda nao ha transicoes ou observacoes ligadas a este ponto.",
};

function formatRelationLabel(label: string | undefined) {
  const normalized = label?.trim();
  return normalized ? normalized : undefined;
}

function formatProcessConnectivityLabel(incomingCount: number, outgoingCount: number) {
  if (incomingCount === 0 && outgoingCount === 0) {
    return "Ainda sem conexoes registradas.";
  }

  return `${incomingCount} entrada(s) e ${outgoingCount} saida(s) no fluxo.`;
}

export function resolveProcessNodeRole(input: {
  diagramRole?: DiagramRole;
  kind: NodeKind;
  label?: string;
}): ProcessNodeRole {
  return resolveFlowDiagramRole({
    explicitRole: input.diagramRole,
    nodeKind: input.kind,
    nodeLabel: input.label,
  });
}

export function getProcessRoleMeta(role: ProcessNodeRole, t?: EditorTranslationFn) {
  const meta = PROCESS_ROLE_META[role];

  return {
    ...meta,
    badgeLabel: translateEditor(t, `process.roles.${role}.badgeLabel`, meta.badgeLabel),
    kindLabel: translateEditor(t, `process.roles.${role}.kindLabel`, meta.kindLabel),
    canvasHint: translateEditor(t, `process.roles.${role}.canvasHint`, meta.canvasHint),
    summary: translateEditor(t, `process.roles.${role}.summary`, meta.summary),
    positionEmptyLabel: translateEditor(
      t,
      `process.roles.${role}.positionEmptyLabel`,
      meta.positionEmptyLabel,
    ),
    positionConnectedLabel: translateEditor(
      t,
      `process.roles.${role}.positionConnectedLabel`,
      meta.positionConnectedLabel,
    ),
    guidanceWhenSparse: translateEditor(
      t,
      `process.roles.${role}.guidanceWhenSparse`,
      meta.guidanceWhenSparse,
    ),
    guidanceWhenConnected: translateEditor(
      t,
      `process.roles.${role}.guidanceWhenConnected`,
      meta.guidanceWhenConnected,
    ),
  };
}

export function getProcessNodeKindCopy(kind: NodeKind, t?: EditorTranslationFn) {
  if (kind === "flow-step") {
    return {
      labelOperational: translateEditor(
        t,
        "process.nodeKinds.flow-step.labelOperational",
        "Atividade",
      ),
      description: translateEditor(
        t,
        "process.nodeKinds.flow-step.description",
        "Unidade de trabalho executavel dentro do processo.",
      ),
    };
  }

  if (kind === "note") {
    return {
      labelOperational: translateEditor(
        t,
        "process.nodeKinds.note.labelOperational",
        "Observacao",
      ),
      description: translateEditor(
        t,
        "process.nodeKinds.note.description",
        "Contexto, risco ou excecao que apoia a leitura do fluxo.",
      ),
    };
  }

  return null;
}

export function getProcessEdgeCopy(kind: EdgeKind, t?: EditorTranslationFn) {
  const meta = PROCESS_EDGE_META[kind];

  return {
    ...meta,
    labelOperational: translateEditor(
      t,
      `process.edgeKinds.${kind}.labelOperational`,
      meta.labelOperational,
    ),
    description: translateEditor(
      t,
      `process.edgeKinds.${kind}.description`,
      meta.description,
    ),
    outgoingLaneLabel: translateEditor(
      t,
      `process.edgeKinds.${kind}.outgoingLaneLabel`,
      meta.outgoingLaneLabel,
    ),
    incomingLaneLabel: translateEditor(
      t,
      `process.edgeKinds.${kind}.incomingLaneLabel`,
      meta.incomingLaneLabel,
    ),
    supportingLabel: translateEditor(
      t,
      `process.edgeKinds.${kind}.supportingLabel`,
      meta.supportingLabel,
    ),
    edgeBadgeLabel: translateEditor(
      t,
      `process.edgeKinds.${kind}.edgeBadgeLabel`,
      meta.edgeBadgeLabel,
    ),
    edgeSummaryTemplate: (sourceLabel: string, targetLabel: string) =>
      translateEditor(
        t,
        `process.edgeKinds.${kind}.edgeSummary`,
        meta.edgeSummaryTemplate(sourceLabel, targetLabel),
        { sourceLabel, targetLabel },
      ),
    guidance: meta.guidance.map((entry, index) =>
      translateEditor(
        t,
        `process.edgeKinds.${kind}.guidance.${index}`,
        entry,
      ),
    ),
  };
}

export function getProcessQuickActions(t?: EditorTranslationFn) {
  return PROCESS_QUICK_ACTIONS.map((action) => ({
    ...action,
    label: translateEditor(
      t,
      `process.quickActions.${action.id}.label`,
      action.label,
    ),
    ...(action.edgeLabel
      ? {
          edgeLabel: translateEditor(
            t,
            `process.quickActions.${action.id}.edgeLabel`,
            action.edgeLabel,
          ),
        }
      : {}),
  }));
}

export function getProcessQuickAddRoleOptions(t?: EditorTranslationFn) {
  return PROCESS_QUICK_ADD_ROLE_OPTIONS.map((option) => ({
    ...option,
    label: translateEditor(
      t,
      `process.quickAddRoles.${option.role}.label`,
      option.label,
    ),
    description: translateEditor(
      t,
      `process.quickAddRoles.${option.role}.description`,
      option.description,
    ),
  }));
}

export function getProcessInspectorCopy(t?: EditorTranslationFn) {
  return {
    selectionBadgeLabel: translateEditor(
      t,
      "process.inspector.selectionBadgeLabel",
      PROCESS_INSPECTOR_COPY.selectionBadgeLabel,
    ),
    emptyTitle: translateEditor(
      t,
      "process.inspector.emptyTitle",
      PROCESS_INSPECTOR_COPY.emptyTitle,
    ),
    emptySummary: translateEditor(
      t,
      "process.inspector.emptySummary",
      PROCESS_INSPECTOR_COPY.emptySummary,
    ),
    emptyGuidance: translateEditor(
      t,
      "process.inspector.emptyGuidance",
      PROCESS_INSPECTOR_COPY.emptyGuidance,
    ),
    titleLabel: translateEditor(
      t,
      "process.inspector.titleLabel",
      PROCESS_INSPECTOR_COPY.titleLabel,
    ),
    kindLabel: translateEditor(
      t,
      "process.inspector.kindLabel",
      PROCESS_INSPECTOR_COPY.kindLabel,
    ),
    descriptionLabel: translateEditor(
      t,
      "process.inspector.descriptionLabel",
      PROCESS_INSPECTOR_COPY.descriptionLabel,
    ),
    descriptionPlaceholder: translateEditor(
      t,
      "process.inspector.descriptionPlaceholder",
      PROCESS_INSPECTOR_COPY.descriptionPlaceholder,
    ),
    tagsLabel: translateEditor(
      t,
      "process.inspector.tagsLabel",
      PROCESS_INSPECTOR_COPY.tagsLabel,
    ),
    tagsPlaceholder: translateEditor(
      t,
      "process.inspector.tagsPlaceholder",
      PROCESS_INSPECTOR_COPY.tagsPlaceholder,
    ),
    tagsHelper: translateEditor(
      t,
      "process.inspector.tagsHelper",
      PROCESS_INSPECTOR_COPY.tagsHelper,
    ),
    contextTitle: translateEditor(
      t,
      "process.inspector.contextTitle",
      PROCESS_INSPECTOR_COPY.contextTitle,
    ),
    generalSectionTitle: translateEditor(
      t,
      "process.inspector.generalSectionTitle",
      PROCESS_INSPECTOR_COPY.generalSectionTitle,
    ),
    detailsSectionTitle: translateEditor(
      t,
      "process.inspector.detailsSectionTitle",
      PROCESS_INSPECTOR_COPY.detailsSectionTitle,
    ),
    relationsSectionTitle: translateEditor(
      t,
      "process.inspector.relationsSectionTitle",
      PROCESS_INSPECTOR_COPY.relationsSectionTitle,
    ),
    edgeGeneralSectionTitle: translateEditor(
      t,
      "process.inspector.edgeGeneralSectionTitle",
      PROCESS_INSPECTOR_COPY.edgeGeneralSectionTitle,
    ),
    edgeLabelLabel: translateEditor(
      t,
      "process.inspector.edgeLabelLabel",
      PROCESS_INSPECTOR_COPY.edgeLabelLabel,
    ),
    edgeKindLabel: translateEditor(
      t,
      "process.inspector.edgeKindLabel",
      PROCESS_INSPECTOR_COPY.edgeKindLabel,
    ),
    edgeSourceLabel: translateEditor(
      t,
      "process.inspector.edgeSourceLabel",
      PROCESS_INSPECTOR_COPY.edgeSourceLabel,
    ),
    edgeTargetLabel: translateEditor(
      t,
      "process.inspector.edgeTargetLabel",
      PROCESS_INSPECTOR_COPY.edgeTargetLabel,
    ),
    nodeSubtitle: translateEditor(
      t,
      "process.inspector.nodeSubtitle",
      PROCESS_INSPECTOR_COPY.nodeSubtitle,
    ),
    edgeSubtitle: translateEditor(
      t,
      "process.inspector.edgeSubtitle",
      PROCESS_INSPECTOR_COPY.edgeSubtitle,
    ),
    relationsEmptyState: translateEditor(
      t,
      "process.inspector.relationsEmptyState",
      PROCESS_INSPECTOR_COPY.relationsEmptyState,
    ),
  };
}

export function buildProcessNodeOverview(input: {
  role: ProcessNodeRole;
  incomingCount: number;
  outgoingCount: number;
  relations: ProcessRelationsViewModel;
}, t?: EditorTranslationFn) {
  const meta = getProcessRoleMeta(input.role, t);
  const hasAnyRelation = input.incomingCount + input.outgoingCount > 0;
  const branchCount =
    input.relations.summaryChips.find((chip) => chip.id === "branch")?.count ?? 0;
  const noteCount =
    input.relations.summaryChips.find((chip) => chip.id === "note")?.count ?? 0;
  const guidance: string[] = [];

  if (!hasAnyRelation) {
    guidance.push(meta.guidanceWhenSparse);
  } else {
    guidance.push(meta.guidanceWhenConnected);
  }

  if (input.role === "flow-decision" && branchCount < 2) {
    guidance.push(
      translateEditor(
        t,
        "process.guidance.decisionNeedsPaths",
        "Uma decisao fica mais didatica quando explicita pelo menos dois caminhos.",
      ),
    );
  }

  if (input.role === "flow-note" && noteCount === 0) {
    guidance.push(
      translateEditor(
        t,
        "process.guidance.noteNeedsAnchor",
        "Conecte a observacao ao ponto que ela explica para evitar ruído solto no canvas.",
      ),
    );
  }

  if (input.role === "flow-end" && input.outgoingCount > 0) {
    guidance.push(
      translateEditor(
        t,
        "process.guidance.endShouldTerminate",
        "Revise saídas extras. Encerramentos fortes normalmente terminam o percurso.",
      ),
    );
  }

  if (input.role === "flow-start" && input.incomingCount > 0) {
    guidance.push(
      translateEditor(
        t,
        "process.guidance.startHasIncoming",
        "Entradas no inicio costumam sinalizar um ponto anterior que ainda falta no mapa.",
      ),
    );
  }

  return {
    badgeLabel: meta.badgeLabel,
    kindLabel: meta.kindLabel,
    summary: meta.summary,
    positionLabel:
      hasAnyRelation && input.incomingCount > 0
        ? meta.positionConnectedLabel
        : meta.positionEmptyLabel,
    connectivityLabel: formatProcessConnectivityLabel(
      input.incomingCount,
      input.outgoingCount,
    ),
    guidance,
  } satisfies ProcessNodeOverview;
}

export function buildProcessEdgeOverview(input: {
  kind: EdgeKind;
  label?: string;
  sourceLabel: string;
  targetLabel: string;
}, t?: EditorTranslationFn) {
  const meta = getProcessEdgeCopy(input.kind, t);
  const relationLabel = formatRelationLabel(input.label);
  const guidance = [...meta.guidance];

  if (relationLabel) {
    guidance.unshift(
      translateEditor(
        t,
        "process.edgeOverview.currentLabel",
        `Rotulo atual: ${relationLabel}.`,
        { relationLabel },
      ),
    );
  }

  return {
    badgeLabel: meta.edgeBadgeLabel,
    transitionTypeLabel: meta.labelOperational,
    summary: meta.edgeSummaryTemplate(input.sourceLabel, input.targetLabel),
    guidance,
  } satisfies ProcessEdgeOverview;
}

export function buildProcessRelationsViewModel(input: {
  selectedNodeId: string;
  selectedNodeRole?: DiagramRole;
  selectedNodeKind?: NodeKind;
  selectedNodeLabel?: string;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    label?: string | null;
    edgeKind: EdgeKind;
    sourceRole?: DiagramRole;
    targetRole?: DiagramRole;
  }>;
  nodeLabelById: ReadonlyMap<string, string>;
  limit?: number;
}, t?: EditorTranslationFn) {
  const selectedRole = resolveProcessNodeRole({
    diagramRole: input.selectedNodeRole,
    kind: input.selectedNodeKind ?? "flow-step",
    label: input.selectedNodeLabel,
  });
  const incoming = input.edges.filter((edge) => edge.target === input.selectedNodeId);
  const outgoing = input.edges.filter((edge) => edge.source === input.selectedNodeId);
  const counters = {
    before: 0,
    after: 0,
    branch: 0,
    note: 0,
  };

  const preview = [...incoming, ...outgoing]
    .slice(0, input.limit ?? 6)
    .map((edge) => {
      const direction = edge.target === input.selectedNodeId ? "incoming" : "outgoing";
      const otherNodeId =
        direction === "incoming" ? edge.source : edge.target;
      const otherLabel =
        input.nodeLabelById.get(otherNodeId) ??
        translateEditor(t, "process.fallbacks.untitledItem", "Item sem titulo");
      const sourceLabel = input.nodeLabelById.get(edge.source) ?? edge.source;
      const targetLabel = input.nodeLabelById.get(edge.target) ?? edge.target;
      const otherRole =
        direction === "incoming" ? edge.sourceRole : edge.targetRole;

      let lane: ProcessRelationPreview["lane"];
      if (
        edge.edgeKind === "references" ||
        otherRole === "flow-note" ||
        selectedRole === "flow-note"
      ) {
        lane = "note";
      } else if (
        edge.edgeKind === "depends-on" ||
        otherRole === "flow-decision" ||
        selectedRole === "flow-decision"
      ) {
        lane = "branch";
      } else if (direction === "incoming") {
        lane = "before";
      } else {
        lane = "after";
      }

      counters[lane] += 1;

      const edgeMeta = getProcessEdgeCopy(edge.edgeKind, t);
      const relationLabel = formatRelationLabel(edge.label ?? undefined);

      return {
        id: edge.id,
        edgeKind: edge.edgeKind,
        otherNodeId,
        otherLabel,
        sourceLabel,
        targetLabel,
        direction,
        lane,
        laneLabel:
          lane === "before"
            ? translateEditor(t, "process.lanes.before", "Vem antes")
            : lane === "after"
              ? translateEditor(t, "process.lanes.after", "Segue depois")
              : lane === "branch"
                ? translateEditor(t, "process.lanes.branch", "Bifurcacao")
                : translateEditor(t, "process.lanes.note", "Observacao"),
        transitionLabel:
          direction === "incoming"
            ? edgeMeta.incomingLaneLabel
            : edgeMeta.outgoingLaneLabel,
        supportingLabel: edgeMeta.supportingLabel,
        ...(relationLabel ? { relationLabel } : {}),
      } satisfies ProcessRelationPreview;
    });

  const summaryChips = [
    {
      id: "before" as const,
      label: translateEditor(t, "process.summaryChips.before", "Antes"),
      count: counters.before,
    },
    {
      id: "after" as const,
      label: translateEditor(t, "process.summaryChips.after", "Depois"),
      count: counters.after,
    },
    {
      id: "branch" as const,
      label: translateEditor(t, "process.summaryChips.branch", "Desvios"),
      count: counters.branch,
    },
    {
      id: "note" as const,
      label: translateEditor(t, "process.summaryChips.note", "Observacoes"),
      count: counters.note,
    },
  ].filter((chip) => chip.count > 0);

  return {
    incomingCount: incoming.length,
    outgoingCount: outgoing.length,
    summaryChips,
    preview,
  } satisfies ProcessRelationsViewModel;
}
