import type { EdgeKind, NodeKind } from "@/src/domain";
import {
  getProcessRoleSemantics,
  isProcessMainEdgeKind,
  resolveDiagramRole,
  resolveProcessConnectionPolicy,
  type ProcessConnectionRestrictionCode,
} from "@/src/modules/diagrams/domain";
import type { DiagramType } from "@/src/modules/graph/domain";
import {
  normalizeErdGraphFromSemantic,
  normalizeErdPolicyFromCustomRules,
  validateErdGraphFull,
  type ErdEditorCommand,
  type ErdSuggestedFix,
} from "@/src/modules/erd/domain";

export type SemanticSeverity = "error" | "warning" | "info" | "suggestion";
export type SemanticMode = "operational" | "technical";
export type SemanticDiagramType = DiagramType | "erd" | undefined;

export type SemanticSuggestedFix = {
  id: string;
  label: string;
  description?: string;
  safety: "safe" | "manual";
  commands: ErdEditorCommand[];
};

export type SemanticNodeRef = {
  id: string;
  kind: NodeKind;
  label?: string;
  payload?: Record<string, unknown>;
};

export type SemanticEdgeRef = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  kind: EdgeKind;
  label?: string;
  payload?: Record<string, unknown>;
};

export type SemanticViolation = {
  code: string;
  severity: SemanticSeverity;
  message: string;
  explanation?: string;
  details?: string;
  suggestedFixes?: Array<SemanticSuggestedFix | string>;
};

export type ConnectionContext = {
  diagramType?: string;
  sourceNode?: SemanticNodeRef;
  targetNode?: SemanticNodeRef;
  edgeKind?: EdgeKind;
  mode: SemanticMode;
};

export type RepairAction =
  | {
      type: "updateEdgeKind";
      edgeId: string;
      nextKind: EdgeKind;
      reason?: string;
    }
  | {
      type: "removeEdge";
      edgeId: string;
      reason?: string;
    }
  | {
      type: "updateNodeKind";
      nodeId: string;
      nextKind: NodeKind;
      reason?: string;
    };

export type RepairPlan = {
  actions: RepairAction[];
  summary: string;
};

export type SemanticIssue = SemanticViolation & {
  id: string;
  targetType: "graph" | "node" | "edge";
  targetId?: string;
};

export type SemanticGraph = {
  nodes: SemanticNodeRef[];
  edges: SemanticEdgeRef[];
  rootNodeId?: string | null;
};

export type SemanticProfile = {
  diagramType: SemanticDiagramType;
  label: string;
  strictRulesEnabled: boolean;
  allowedNodeKinds: NodeKind[];
  allowedEdgeKinds: EdgeKind[];
  defaultEdgeKind: EdgeKind;
};

export type SemanticEngineOptions = {
  strictEnabled?: boolean;
  customRulesJson?: Record<string, unknown>;
};

const ALL_NODE_KINDS: NodeKind[] = [
  "workspace",
  "project",
  "entity",
  "page",
  "flow-step",
  "note",
];
const ALL_EDGE_KINDS: EdgeKind[] = [
  "contains",
  "references",
  "depends-on",
  "flows-to",
  "relates-to",
];

type NodeKindChangeContext = {
  diagramType?: string;
  mode: SemanticMode;
  nodeId: string;
  nextKind: NodeKind;
  nodes: SemanticNodeRef[];
  edges: SemanticEdgeRef[];
};

type EdgeKindChangeContext = {
  diagramType?: string;
  mode: SemanticMode;
  edge: SemanticEdgeRef;
  sourceNode?: SemanticNodeRef;
  targetNode?: SemanticNodeRef;
  nextKind: EdgeKind;
};

type RepairPlanInput = {
  diagramType?: string;
  mode: SemanticMode;
  nodeId: string;
  nextKind: NodeKind;
  nodes: SemanticNodeRef[];
  edges: SemanticEdgeRef[];
};

type FlowProcessRole =
  | "flow-start"
  | "flow-step"
  | "flow-decision"
  | "flow-end"
  | "flow-note";

function readRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function resolveErdAllowNoteNodes(customRulesJson: Record<string, unknown> | undefined) {
  const erdRules = readRecord(customRulesJson?.erd);
  if (!erdRules) {
    return false;
  }

  return (
    erdRules.allowNoteNodes === true ||
    erdRules.allowNoteAsComment === true
  );
}

function normalizeDiagramType(diagramType: string | undefined): SemanticDiagramType {
  if (diagramType === "tree" || diagramType === "flow" || diagramType === "mindmap") {
    return diagramType;
  }

  if (diagramType === "erd") {
    return "erd";
  }

  return undefined;
}

function toSemanticKind(
  diagramType: string | undefined,
  nodeKind: NodeKind,
  nodePayload: Record<string, unknown> | undefined,
): NodeKind | null {
  const normalizedDiagramType = normalizeDiagramType(diagramType);
  const role = resolveDiagramRole({
    diagramType: normalizedDiagramType,
    nodeKind,
    nodePayload: nodePayload ?? {},
  });

  if (role === "meta-workspace" || role === "meta-project") {
    if (normalizedDiagramType === undefined) {
      return nodeKind;
    }

    return null;
  }

  if (role === "tree-root" || role === "tree-node") {
    return "page";
  }

  if (
    role === "flow-start" ||
    role === "flow-step" ||
    role === "flow-end" ||
    role === "flow-decision"
  ) {
    return "flow-step";
  }

  if (role === "flow-note") {
    return "note";
  }

  if (
    role === "mindmap-root" ||
    role === "mindmap-branch" ||
    role === "mindmap-reference"
  ) {
    return "note";
  }

  if (role === "erd-entity") {
    return "entity";
  }

  if (role === "erd-comment") {
    return "note";
  }

  return nodeKind;
}

function getDefaultNodeKindForSemanticDiagramType(
  diagramType: SemanticDiagramType,
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

  if (diagramType === "erd") {
    return "entity";
  }

  return "note";
}

function isNodeKindAllowedForProfile(
  profile: SemanticProfile,
  nodeKind: NodeKind | null | undefined,
): boolean {
  if (!nodeKind) {
    return true;
  }

  if (!profile.strictRulesEnabled) {
    return true;
  }

  if (profile.diagramType === "tree" || profile.diagramType === "mindmap") {
    return true;
  }

  return profile.allowedNodeKinds.includes(nodeKind);
}

function isFlowProcessRole(role: string): role is FlowProcessRole {
  return (
    role === "flow-start" ||
    role === "flow-step" ||
    role === "flow-decision" ||
    role === "flow-end" ||
    role === "flow-note"
  );
}

function resolveFlowProcessRole(node: SemanticNodeRef | undefined): FlowProcessRole | undefined {
  if (!node) {
    return undefined;
  }

  const resolvedRole = resolveDiagramRole({
    diagramType: "flow",
    nodeKind: node.kind,
    nodePayload: node.payload ?? {},
    nodeLabel: node.label,
  });

  return isFlowProcessRole(resolvedRole) ? resolvedRole : undefined;
}

function getFlowRoleLabel(role: FlowProcessRole | undefined) {
  if (role === "flow-start") {
    return "inicio";
  }

  if (role === "flow-step") {
    return "etapa";
  }

  if (role === "flow-decision") {
    return "decisao";
  }

  if (role === "flow-end") {
    return "encerramento";
  }

  if (role === "flow-note") {
    return "observacao";
  }

  return "ponto do processo";
}

function describeFlowNode(node: SemanticNodeRef | undefined) {
  const label = node?.label?.trim();
  if (label) {
    return label;
  }

  return getFlowRoleLabel(resolveFlowProcessRole(node));
}

function normalizeProcessEdgeLabel(label: string | undefined | null) {
  const normalized = label?.trim();
  return normalized ? normalized : undefined;
}

function getFlowEdgeKindLabel(kind: EdgeKind) {
  if (kind === "flows-to") {
    return "continuidade";
  }

  if (kind === "depends-on") {
    return "desvio";
  }

  if (kind === "references") {
    return "observacao";
  }

  return "ligacao";
}

function buildFlowInvalidConnectionViolation(input: {
  sourceNode?: SemanticNodeRef;
  targetNode?: SemanticNodeRef;
  mode: SemanticMode;
  details: string;
}) {
  const sourceLabel = describeFlowNode(input.sourceNode);
  const targetLabel = describeFlowNode(input.targetNode);
  const severity: SemanticSeverity =
    input.mode === "operational" ? "error" : "warning";

  return {
    code: "EDGE_CONNECTION_NOT_ALLOWED",
    severity,
    message: `Ligacao invalida no processo entre ${sourceLabel} e ${targetLabel}.`,
    details: input.details,
    suggestedFixes: [
      "Usar a sugestao de ligacao",
      "Revisar o papel dos pontos conectados",
    ],
  } satisfies SemanticViolation;
}

function buildFlowEdgeKindMismatchViolation(input: {
  attemptedKind: EdgeKind;
  allowedEdgeKinds: EdgeKind[];
  mode: SemanticMode;
}) {
  const severity: SemanticSeverity =
    input.mode === "operational" ? "error" : "warning";
  const allowedLabels = input.allowedEdgeKinds.map(getFlowEdgeKindLabel);

  return {
    code: "EDGE_KIND_NOT_ALLOWED",
    severity,
    message: `Essa ligacao pede ${allowedLabels.join(" ou ")}, e nao ${getFlowEdgeKindLabel(
      input.attemptedKind,
    )}.`,
    details: "Ajuste o tipo da ligacao para manter a leitura do processo clara.",
    suggestedFixes: input.allowedEdgeKinds.map(
      (kind) => `Usar ${getFlowEdgeKindLabel(kind)}`,
    ),
  } satisfies SemanticViolation;
}

function describeProcessConnectionRestriction(
  code: ProcessConnectionRestrictionCode,
) {
  switch (code) {
    case "roles_missing":
      return "Use apenas inicio, etapa, decisao, encerramento e observacao para montar este processo.";
    case "note_to_note":
      return "Observacoes devem apoiar um ponto do processo, e nao outra observacao.";
    case "start_cannot_receive_main":
      return "O inicio abre o processo. Conecte a partir dele para a primeira etapa, em vez de apontar algo para tras.";
    case "end_cannot_emit_main":
      return "O encerramento deve fechar o percurso. Se ainda existe um proximo passo, este ponto provavelmente ainda nao e um encerramento.";
    case "start_requires_forward_target":
      return "O inicio deve apontar para a primeira etapa, uma decisao ou um encerramento valido.";
    case "step_requires_forward_target":
      return "Uma etapa deve continuar para outra etapa, abrir uma decisao ou concluir em um encerramento.";
    case "decision_requires_forward_target":
      return "Uma decisao deve abrir caminhos para outra etapa, outra decisao ou um encerramento claro.";
    default:
      return "A ligacao escolhida nao respeita a gramática operacional deste processo.";
  }
}

function resolveAllowedFlowEdgeKinds(input: {
  sourceNode?: SemanticNodeRef;
  targetNode?: SemanticNodeRef;
  mode: SemanticMode;
}) {
  const sourceRole = resolveFlowProcessRole(input.sourceNode);
  const targetRole = resolveFlowProcessRole(input.targetNode);
  const policy = resolveProcessConnectionPolicy({
    sourceRole,
    targetRole,
  });

  return {
    allowedEdgeKinds: policy.allowedEdgeKinds,
    ...(policy.restrictionCode
      ? {
          violation: buildFlowInvalidConnectionViolation({
            sourceNode: input.sourceNode,
            targetNode: input.targetNode,
            mode: input.mode,
            details: describeProcessConnectionRestriction(policy.restrictionCode),
          }),
        }
      : {}),
    sourceRole: policy.sourceRole,
    targetRole: policy.targetRole,
  };
}

function resolveRecommendedFlowEdgeKind(input: {
  allowedEdgeKinds: EdgeKind[];
  sourceRole?: FlowProcessRole;
}) {
  if (input.allowedEdgeKinds.includes("references")) {
    return "references" as const;
  }

  if (
    input.sourceRole === "flow-decision" &&
    input.allowedEdgeKinds.includes("depends-on")
  ) {
    return "depends-on" as const;
  }

  if (input.allowedEdgeKinds.includes("flows-to")) {
    return "flows-to" as const;
  }

  return input.allowedEdgeKinds[0];
}

function resolveAllowedEdgeKindsForNodes(input: {
  profile: SemanticProfile;
  sourceKind?: NodeKind | null;
  targetKind?: NodeKind | null;
}): EdgeKind[] {
  const { profile, sourceKind, targetKind } = input;

  if (sourceKind === null || targetKind === null) {
    return [];
  }

  if (!sourceKind || !targetKind) {
    return [...profile.allowedEdgeKinds];
  }

  if (profile.diagramType === "tree") {
    return ["contains", "references"];
  }

  if (profile.diagramType === "flow") {
    const sourceIsStep = sourceKind === "flow-step";
    const targetIsStep = targetKind === "flow-step";
    const sourceIsNote = sourceKind === "note";
    const targetIsNote = targetKind === "note";

    if (sourceIsStep && targetIsStep) {
      return ["flows-to", "depends-on"];
    }

    if ((sourceIsStep || sourceIsNote) && (targetIsStep || targetIsNote)) {
      return ["depends-on"];
    }

    return [];
  }

  if (profile.diagramType === "mindmap") {
    return ["relates-to", "references"];
  }

  if (profile.diagramType === "erd") {
    if (sourceKind === "entity" && targetKind === "entity") {
      return ["references", "depends-on"];
    }

    const sourceIsNote = sourceKind === "note";
    const targetIsNote = targetKind === "note";
    const allowNoteNodes = profile.allowedNodeKinds.includes("note");
    if (allowNoteNodes && (sourceIsNote || targetIsNote)) {
      return ["depends-on"];
    }

    return [];
  }

  return [...ALL_EDGE_KINDS];
}

function resolveRecommendedEdgeKind(input: {
  profile: SemanticProfile;
  sourceKind?: NodeKind | null;
  targetKind?: NodeKind | null;
  allowedEdgeKinds: EdgeKind[];
}): EdgeKind | undefined {
  const { profile, sourceKind, targetKind, allowedEdgeKinds } = input;

  if (allowedEdgeKinds.length === 0) {
    return undefined;
  }

  if (profile.diagramType === "flow") {
    if (sourceKind === "flow-step" && targetKind === "flow-step") {
      return allowedEdgeKinds.includes("flows-to") ? "flows-to" : allowedEdgeKinds[0];
    }

    return allowedEdgeKinds.includes("depends-on")
      ? "depends-on"
      : allowedEdgeKinds[0];
  }

  if (profile.diagramType === "erd") {
    if (sourceKind === "note" || targetKind === "note") {
      return allowedEdgeKinds.includes("depends-on")
        ? "depends-on"
        : allowedEdgeKinds[0];
    }
  }

  if (allowedEdgeKinds.includes(profile.defaultEdgeKind)) {
    return profile.defaultEdgeKind;
  }

  return allowedEdgeKinds[0];
}

function buildInvalidConnectionViolation(input: {
  profile: SemanticProfile;
  sourceNode?: SemanticNodeRef;
  targetNode?: SemanticNodeRef;
  mode: SemanticMode;
}): SemanticViolation {
  const sourceLabel = input.sourceNode?.label?.trim() || input.sourceNode?.kind || "origem";
  const targetLabel = input.targetNode?.label?.trim() || input.targetNode?.kind || "destino";
  const diagramLabel = input.profile.label.toLowerCase();
  const severity: SemanticSeverity =
    input.mode === "operational" ? "error" : "warning";

  return {
    code: "EDGE_CONNECTION_NOT_ALLOWED",
    severity,
    message: `Conexao invalida para ${diagramLabel}: ${sourceLabel} -> ${targetLabel}.`,
    details: "Escolha uma relacao permitida pelo assistente de conexao.",
    suggestedFixes: ["Selecionar relacao recomendada", "Cancelar conexao"],
  };
}

function cloneNodeMapWithKindOverride(input: {
  nodes: SemanticNodeRef[];
  nodeId: string;
  nextKind: NodeKind;
}) {
  const nodeMap = new Map(
    input.nodes.map((node) => [node.id, node] as const),
  );
  const targetNode = nodeMap.get(input.nodeId);

  if (!targetNode) {
    return nodeMap;
  }

  nodeMap.set(input.nodeId, {
    ...targetNode,
    kind: input.nextKind,
  });

  return nodeMap;
}

function buildIssueId(
  code: string,
  targetType: SemanticIssue["targetType"],
  targetId: string | undefined,
  index: number,
) {
  return `${code}:${targetType}:${targetId ?? "graph"}:${index}`;
}

function mapErdFixesToSemanticFixes(
  fixes: ErdSuggestedFix[] | undefined,
): SemanticSuggestedFix[] | undefined {
  if (!fixes || fixes.length === 0) {
    return undefined;
  }

  return fixes.map((fix) => ({
    id: fix.id,
    label: fix.label,
    ...(fix.description ? { description: fix.description } : {}),
    safety: fix.safety,
    commands: fix.commands,
  }));
}

export function getSemanticProfile(
  diagramType: string | undefined,
  options?: SemanticEngineOptions,
): SemanticProfile {
  const normalized = normalizeDiagramType(diagramType);
  const strictEnabled = options?.strictEnabled ?? true;
  const allowErdNoteNodes = resolveErdAllowNoteNodes(options?.customRulesJson);

  if (normalized === "tree") {
    return {
      diagramType: "tree",
      label: "Hierarquia",
      strictRulesEnabled: strictEnabled,
      allowedNodeKinds: ["page", "note"],
      allowedEdgeKinds: ["contains", "references"],
      defaultEdgeKind: "contains",
    };
  }

  if (normalized === "flow") {
    return {
      diagramType: "flow",
      label: "Processo",
      strictRulesEnabled: strictEnabled,
      allowedNodeKinds: ["flow-step", "note"],
      allowedEdgeKinds: ["flows-to", "depends-on", "references"],
      defaultEdgeKind: "flows-to",
    };
  }

  if (normalized === "mindmap") {
    return {
      diagramType: "mindmap",
      label: "Mapa mental",
      strictRulesEnabled: strictEnabled,
      allowedNodeKinds: ["note", "page"],
      allowedEdgeKinds: ["relates-to", "references"],
      defaultEdgeKind: "relates-to",
    };
  }

  if (normalized === "erd") {
    return {
      diagramType: "erd",
      label: "ERD",
      strictRulesEnabled: strictEnabled,
      allowedNodeKinds: allowErdNoteNodes ? ["entity", "note"] : ["entity"],
      allowedEdgeKinds: ["references", "depends-on"],
      defaultEdgeKind: "references",
    };
  }

  return {
    diagramType: undefined,
    label: "Definir durante a criacao",
    strictRulesEnabled: false,
    allowedNodeKinds: [...ALL_NODE_KINDS],
    allowedEdgeKinds: [...ALL_EDGE_KINDS],
    defaultEdgeKind: "relates-to",
  };
}

export function validateEdgeCreation(
  ctx: ConnectionContext,
  options?: SemanticEngineOptions,
): {
  ok: boolean;
  violation?: SemanticViolation;
  allowedEdgeKinds: EdgeKind[];
  recommendedEdgeKind?: EdgeKind;
} {
  const profile = getSemanticProfile(ctx.diagramType, options);
  const sourceSemanticKind = ctx.sourceNode
    ? toSemanticKind(ctx.diagramType, ctx.sourceNode.kind, ctx.sourceNode.payload)
    : undefined;
  const targetSemanticKind = ctx.targetNode
    ? toSemanticKind(ctx.diagramType, ctx.targetNode.kind, ctx.targetNode.payload)
    : undefined;
  const flowConnection =
    profile.diagramType === "flow"
      ? resolveAllowedFlowEdgeKinds({
          sourceNode: ctx.sourceNode,
          targetNode: ctx.targetNode,
          mode: ctx.mode,
        })
      : null;
  const allowedEdgeKinds =
    flowConnection?.allowedEdgeKinds ??
    resolveAllowedEdgeKindsForNodes({
      profile,
      sourceKind: sourceSemanticKind,
      targetKind: targetSemanticKind,
    });
  const recommendedEdgeKind =
    profile.diagramType === "flow"
      ? resolveRecommendedFlowEdgeKind({
          allowedEdgeKinds,
          sourceRole: flowConnection?.sourceRole,
        })
      : resolveRecommendedEdgeKind({
          profile,
          sourceKind: sourceSemanticKind,
          targetKind: targetSemanticKind,
          allowedEdgeKinds,
        });

  if (!ctx.sourceNode || !ctx.targetNode) {
    return {
      ok: false,
      allowedEdgeKinds,
      recommendedEdgeKind,
      violation: {
        code: "EDGE_CONNECTION_MISSING_ENDPOINT",
        severity: "error",
        message: "Conexao incompleta: origem e destino sao obrigatorios.",
      },
    };
  }

  if (allowedEdgeKinds.length === 0) {
    return {
      ok: false,
      allowedEdgeKinds,
      recommendedEdgeKind,
      violation:
        flowConnection?.violation ??
        buildInvalidConnectionViolation({
          profile,
          sourceNode: ctx.sourceNode,
          targetNode: ctx.targetNode,
          mode: ctx.mode,
        }),
    };
  }

  if (ctx.edgeKind && !allowedEdgeKinds.includes(ctx.edgeKind)) {
    return {
      ok: false,
      allowedEdgeKinds,
      recommendedEdgeKind,
      violation:
        profile.diagramType === "flow"
          ? buildFlowEdgeKindMismatchViolation({
              attemptedKind: ctx.edgeKind,
              allowedEdgeKinds,
              mode: ctx.mode,
            })
          : {
              code: "EDGE_KIND_NOT_ALLOWED",
              severity: ctx.mode === "operational" ? "error" : "warning",
              message: `Relacao '${ctx.edgeKind}' nao permitida para esta conexao.`,
              details: "Use uma das relacoes permitidas para manter integridade semantica.",
              suggestedFixes: allowedEdgeKinds.map((kind) => `Usar '${kind}'`),
            },
    };
  }

  return {
    ok: true,
    allowedEdgeKinds,
    recommendedEdgeKind,
  };
}

export function buildRepairPlanForNodeKindChange(
  input: RepairPlanInput,
  options?: SemanticEngineOptions,
): RepairPlan {
  const profile = getSemanticProfile(input.diagramType, options);
  const nodeMap = cloneNodeMapWithKindOverride({
    nodes: input.nodes,
    nodeId: input.nodeId,
    nextKind: input.nextKind,
  });
  const actions: RepairAction[] = [];
  const relatedEdges = input.edges.filter(
    (edge) => edge.sourceNodeId === input.nodeId || edge.targetNodeId === input.nodeId,
  );
  const semanticNextKind = toSemanticKind(
    input.diagramType,
    input.nextKind,
    nodeMap.get(input.nodeId)?.payload,
  );

  const nodeKindAllowed = isNodeKindAllowedForProfile(profile, semanticNextKind);
  if (!nodeKindAllowed && input.mode === "operational") {
    const fallbackKind = getDefaultNodeKindForSemanticDiagramType(profile.diagramType);
    if (fallbackKind !== input.nextKind) {
      actions.push({
        type: "updateNodeKind",
        nodeId: input.nodeId,
        nextKind: fallbackKind,
        reason: "Tipo nao permitido para o perfil semantico atual.",
      });
    }
  }

  for (const edge of relatedEdges) {
    const sourceNode = nodeMap.get(edge.sourceNodeId);
    const targetNode = nodeMap.get(edge.targetNodeId);

    const validation = validateEdgeCreation({
      diagramType: input.diagramType,
      sourceNode,
      targetNode,
      edgeKind: edge.kind,
      mode: input.mode,
    }, options);

    if (validation.ok) {
      continue;
    }

    if (validation.recommendedEdgeKind) {
      actions.push({
        type: "updateEdgeKind",
        edgeId: edge.id,
        nextKind: validation.recommendedEdgeKind,
        reason: "Ajuste automatico para manter consistencia das relacoes.",
      });
      continue;
    }

    actions.push({
      type: "removeEdge",
      edgeId: edge.id,
      reason: "Relacao sem alternativa semantica valida.",
    });
  }

  const updateEdgeCount = actions.filter((action) => action.type === "updateEdgeKind").length;
  const removeEdgeCount = actions.filter((action) => action.type === "removeEdge").length;
  const updateNodeCount = actions.filter((action) => action.type === "updateNodeKind").length;

  const summaryParts = [
    updateNodeCount > 0 ? `${updateNodeCount} tipo(s) de no ajustado(s)` : null,
    updateEdgeCount > 0 ? `${updateEdgeCount} relacao(oes) reclassificada(s)` : null,
    removeEdgeCount > 0 ? `${removeEdgeCount} relacao(oes) removida(s)` : null,
  ].filter(Boolean);

  return {
    actions,
    summary:
      summaryParts.length > 0
        ? `Plano de reparo: ${summaryParts.join(", ")}.`
        : "Nenhum reparo necessario.",
  };
}

export function validateNodeKindChange(
  ctx: NodeKindChangeContext,
  options?: SemanticEngineOptions,
): {
  ok: boolean;
  violations: SemanticViolation[];
  repairPlan?: RepairPlan;
} {
  const profile = getSemanticProfile(ctx.diagramType, options);
  const nodeMap = new Map(ctx.nodes.map((node) => [node.id, node] as const));
  const targetNode = nodeMap.get(ctx.nodeId);
  const violations: SemanticViolation[] = [];

  if (!targetNode) {
    return {
      ok: false,
      violations: [
        {
          code: "NODE_NOT_FOUND",
          severity: "error",
          message: "Nao foi possivel validar: no nao encontrado.",
        },
      ],
    };
  }

  const semanticNextKind = toSemanticKind(
    ctx.diagramType,
    ctx.nextKind,
    targetNode.payload,
  );

  if (!isNodeKindAllowedForProfile(profile, semanticNextKind)) {
    violations.push({
      code: "NODE_KIND_NOT_ALLOWED",
      severity: ctx.mode === "operational" ? "error" : "warning",
      message: `Tipo '${ctx.nextKind}' nao recomendado para o diagrama ${profile.label}.`,
      details:
        ctx.mode === "operational"
          ? "Escolha um tipo compativel ou ajuste o diagrama no Assistente de criacao."
          : "No modo tecnico voce pode aplicar com consciencia, mas o audit indicara inconsistencias.",
      suggestedFixes: profile.allowedNodeKinds.map((kind) => `Usar '${kind}'`),
    });
  }

  const projectedNodeMap = cloneNodeMapWithKindOverride({
    nodes: ctx.nodes,
    nodeId: ctx.nodeId,
    nextKind: ctx.nextKind,
  });
  const relatedEdges = ctx.edges.filter(
    (edge) => edge.sourceNodeId === ctx.nodeId || edge.targetNodeId === ctx.nodeId,
  );

  for (const edge of relatedEdges) {
    const sourceNode = projectedNodeMap.get(edge.sourceNodeId);
    const targetNode = projectedNodeMap.get(edge.targetNodeId);
    const connectionValidation = validateEdgeCreation({
      diagramType: ctx.diagramType,
      sourceNode,
      targetNode,
      edgeKind: edge.kind,
      mode: ctx.mode,
    }, options);

    if (!connectionValidation.ok) {
      violations.push({
        code: "EDGE_INVALID_AFTER_NODE_KIND_CHANGE",
        severity: connectionValidation.violation?.severity ?? "error",
        message: `A relacao '${edge.id}' ficaria invalida apos a troca de tipo.`,
        details:
          connectionValidation.violation?.message ??
          "Relacao incompatível com o novo tipo de no.",
      });
    }
  }

  const repairPlan = buildRepairPlanForNodeKindChange({
    diagramType: ctx.diagramType,
    mode: ctx.mode,
    nodeId: ctx.nodeId,
    nextKind: ctx.nextKind,
    nodes: ctx.nodes,
    edges: ctx.edges,
  }, options);
  const hasRepairActions = repairPlan.actions.length > 0;
  const hasErrors = violations.some((violation) => violation.severity === "error");

  return {
    ok: !hasErrors,
    violations,
    repairPlan: hasRepairActions ? repairPlan : undefined,
  };
}

export function validateEdgeKindChange(
  ctx: EdgeKindChangeContext,
  options?: SemanticEngineOptions,
): {
  ok: boolean;
  violation?: SemanticViolation;
  recommendedEdgeKind?: EdgeKind;
} {
  const validation = validateEdgeCreation({
    diagramType: ctx.diagramType,
    sourceNode: ctx.sourceNode,
    targetNode: ctx.targetNode,
    edgeKind: ctx.nextKind,
    mode: ctx.mode,
  }, options);

  if (!validation.ok) {
    return {
      ok: false,
      violation: validation.violation,
      recommendedEdgeKind: validation.recommendedEdgeKind,
    };
  }

  return {
    ok: true,
    recommendedEdgeKind: validation.recommendedEdgeKind,
  };
}

export function runGraphAudit(
  graph: SemanticGraph,
  diagramType: string | undefined,
  mode: SemanticMode,
  options?: SemanticEngineOptions,
): {
  issues: SemanticIssue[];
  counters: {
    total: number;
    nodes: number;
    edges: number;
    graph: number;
  };
  bySeverity: Record<SemanticSeverity, number>;
} {
  const profile = getSemanticProfile(diagramType, options);
  const issues: SemanticIssue[] = [];
  const sortedNodes = [...graph.nodes].sort((a, b) => a.id.localeCompare(b.id));
  const nodeMap = new Map(
    sortedNodes.map((node) => [node.id, node] as const),
  );
  const semanticKindByNodeId = new Map(
    sortedNodes.map((node) => [
      node.id,
      toSemanticKind(diagramType, node.kind, node.payload),
    ] as const),
  );
  const sortedEdges = [...graph.edges].sort((a, b) => a.id.localeCompare(b.id));

  const bySeverityBase: Record<SemanticSeverity, number> = {
    error: 0,
    warning: 0,
    info: 0,
    suggestion: 0,
  };

  if (profile.diagramType === "erd") {
    for (const node of sortedNodes) {
      const semanticKind = semanticKindByNodeId.get(node.id);
      if (!semanticKind) {
        continue;
      }

      if (!isNodeKindAllowedForProfile(profile, semanticKind)) {
        const severity: SemanticSeverity =
          mode === "operational" ? "error" : "warning";
        issues.push({
          id: buildIssueId("NODE_KIND_OUT_OF_PROFILE", "node", node.id, issues.length),
          code: "NODE_KIND_OUT_OF_PROFILE",
          severity,
          message: `No '${node.label ?? node.id}' usa tipo '${node.kind}' fora do perfil ${profile.label}.`,
          details: `Tipos permitidos: ${profile.allowedNodeKinds.join(", ")}.`,
          targetType: "node",
          targetId: node.id,
        });
      }
    }

    for (const edge of sortedEdges) {
      const sourceNode = nodeMap.get(edge.sourceNodeId);
      const targetNode = nodeMap.get(edge.targetNodeId);

      if (!sourceNode || !targetNode) {
        issues.push({
          id: buildIssueId("EDGE_ENDPOINT_NOT_FOUND", "edge", edge.id, issues.length),
          code: "EDGE_ENDPOINT_NOT_FOUND",
          severity: "error",
          message: `Aresta '${edge.id}' aponta para no inexistente.`,
          details: "Ajuste origem/destino ou remova a relacao quebrada.",
          targetType: "edge",
          targetId: edge.id,
        });
        continue;
      }

      const sourceSemanticKind = semanticKindByNodeId.get(sourceNode.id);
      const targetSemanticKind = semanticKindByNodeId.get(targetNode.id);

      if (sourceSemanticKind === null || targetSemanticKind === null) {
        continue;
      }

      const validation = validateEdgeCreation({
        diagramType,
        sourceNode,
        targetNode,
        edgeKind: edge.kind,
        mode,
      }, options);

      if (!validation.ok) {
        issues.push({
          id: buildIssueId(
            validation.violation?.code ?? "EDGE_SEMANTIC_INVALID",
            "edge",
            edge.id,
            issues.length,
          ),
          code: validation.violation?.code ?? "EDGE_SEMANTIC_INVALID",
          severity: validation.violation?.severity ?? "error",
          message:
            validation.violation?.message ??
            `Aresta '${edge.id}' viola regra semantica.`,
          details: validation.violation?.details,
          targetType: "edge",
          targetId: edge.id,
        });
      }
    }

    const erdGraph = normalizeErdGraphFromSemantic({
      nodes: sortedNodes,
      edges: sortedEdges,
    });
    const erdPolicy = normalizeErdPolicyFromCustomRules(options?.customRulesJson);
    const erdValidation = validateErdGraphFull({
      graph: erdGraph,
      policy: erdPolicy,
    });

    for (const diagnostic of erdValidation.diagnostics) {
      const semanticIssue: SemanticIssue = {
        id: diagnostic.id,
        code: diagnostic.code,
        severity: diagnostic.severity,
        message: diagnostic.message,
        explanation: diagnostic.explanation,
        details: diagnostic.explanation,
        suggestedFixes: mapErdFixesToSemanticFixes(diagnostic.suggestedFixes),
        targetType:
          diagnostic.target.type === "graph"
            ? "graph"
            : diagnostic.target.type === "relation"
              ? "edge"
              : "node",
        targetId:
          diagnostic.target.type === "entity"
            ? diagnostic.target.entityId
            : diagnostic.target.type === "field"
              ? diagnostic.target.entityId
              : diagnostic.target.type === "relation"
                ? diagnostic.target.relationId
                : undefined,
      };

      issues.push(semanticIssue);
    }

    const bySeverity = { ...bySeverityBase };
    for (const issue of issues) {
      bySeverity[issue.severity] += 1;
    }

    return {
      issues,
      counters: {
        total: issues.length,
        nodes: issues.filter((issue) => issue.targetType === "node").length,
        edges: issues.filter((issue) => issue.targetType === "edge").length,
        graph: issues.filter((issue) => issue.targetType === "graph").length,
      },
      bySeverity,
    };
  }

  if (profile.diagramType === undefined) {
    issues.push({
      id: buildIssueId("DIAGRAM_TYPE_UNDEFINED", "graph", undefined, issues.length),
      code: "DIAGRAM_TYPE_UNDEFINED",
      severity: "warning",
      message: "Defina o tipo no Assistente de criacao para aplicar semantica forte.",
      details: "Enquanto isso, o editor opera com validacao flexivel.",
      targetType: "graph",
    });
  }

  if (profile.diagramType === "flow") {
    const flowRoleByNodeId = new Map(
      sortedNodes.map((node) => [node.id, resolveFlowProcessRole(node)] as const),
    );
    const processIncomingCountByNodeId = new Map<string, number>();
    const processOutgoingCountByNodeId = new Map<string, number>();
    const namedOutgoingCountByNodeId = new Map<string, number>();
    const totalConnectionCountByNodeId = new Map<string, number>();
    const processTargetsBySource = new Map<string, Set<string>>();
    const processSourcesByTarget = new Map<string, Set<string>>();

    for (const node of sortedNodes) {
      processIncomingCountByNodeId.set(node.id, 0);
      processOutgoingCountByNodeId.set(node.id, 0);
      namedOutgoingCountByNodeId.set(node.id, 0);
      totalConnectionCountByNodeId.set(node.id, 0);
    }

    for (const edge of sortedEdges) {
      totalConnectionCountByNodeId.set(
        edge.sourceNodeId,
        (totalConnectionCountByNodeId.get(edge.sourceNodeId) ?? 0) + 1,
      );
      totalConnectionCountByNodeId.set(
        edge.targetNodeId,
        (totalConnectionCountByNodeId.get(edge.targetNodeId) ?? 0) + 1,
      );

      if (!isProcessMainEdgeKind(edge.kind)) {
        continue;
      }

      processIncomingCountByNodeId.set(
        edge.targetNodeId,
        (processIncomingCountByNodeId.get(edge.targetNodeId) ?? 0) + 1,
      );
      processOutgoingCountByNodeId.set(
        edge.sourceNodeId,
        (processOutgoingCountByNodeId.get(edge.sourceNodeId) ?? 0) + 1,
      );

      const targetIds = processTargetsBySource.get(edge.sourceNodeId) ?? new Set<string>();
      targetIds.add(edge.targetNodeId);
      processTargetsBySource.set(edge.sourceNodeId, targetIds);
      const sourceIds = processSourcesByTarget.get(edge.targetNodeId) ?? new Set<string>();
      sourceIds.add(edge.sourceNodeId);
      processSourcesByTarget.set(edge.targetNodeId, sourceIds);

      if (normalizeProcessEdgeLabel(edge.label)) {
        namedOutgoingCountByNodeId.set(
          edge.sourceNodeId,
          (namedOutgoingCountByNodeId.get(edge.sourceNodeId) ?? 0) + 1,
        );
      }
    }

    const startNodes = sortedNodes.filter(
      (node) => flowRoleByNodeId.get(node.id) === "flow-start",
    );
    const endNodes = sortedNodes.filter(
      (node) => flowRoleByNodeId.get(node.id) === "flow-end",
    );
    const reachableFromStart = new Set<string>();
    const canReachEnd = new Set<string>();

    if (startNodes.length > 0) {
      const queue = startNodes.map((node) => node.id);
      for (const startNode of startNodes) {
        reachableFromStart.add(startNode.id);
      }

      while (queue.length > 0) {
        const current = queue.shift();
        if (!current) {
          continue;
        }

        for (const targetId of processTargetsBySource.get(current) ?? []) {
          if (reachableFromStart.has(targetId)) {
            continue;
          }

          reachableFromStart.add(targetId);
          queue.push(targetId);
        }
      }
    }

    if (endNodes.length > 0) {
      const queue = endNodes.map((node) => node.id);
      for (const endNode of endNodes) {
        canReachEnd.add(endNode.id);
      }

      while (queue.length > 0) {
        const current = queue.shift();
        if (!current) {
          continue;
        }

        for (const sourceId of processSourcesByTarget.get(current) ?? []) {
          if (canReachEnd.has(sourceId)) {
            continue;
          }

          canReachEnd.add(sourceId);
          queue.push(sourceId);
        }
      }
    }

    if (startNodes.length === 0) {
      issues.push({
        id: buildIssueId("FLOW_START_MISSING", "graph", undefined, issues.length),
        code: "FLOW_START_MISSING",
        severity: "warning",
        message: "O mapa de processo ainda nao tem um inicio explicito.",
        details: "Defina onde o processo comeca para deixar a leitura mais clara.",
        targetType: "graph",
      });
    } else if (startNodes.length > 1) {
      issues.push({
        id: buildIssueId("FLOW_MULTIPLE_STARTS", "graph", undefined, issues.length),
        code: "FLOW_MULTIPLE_STARTS",
        severity: "warning",
        message: "Existem varios pontos marcados como inicio no mesmo processo.",
        details: "Mantenha multiplos inicios apenas quando o processo realmente tiver aberturas independentes.",
        targetType: "graph",
      });
    }

    if (endNodes.length === 0) {
      issues.push({
        id: buildIssueId("FLOW_END_MISSING", "graph", undefined, issues.length),
        code: "FLOW_END_MISSING",
        severity: "warning",
        message: "O mapa de processo ainda nao mostra um encerramento explicito.",
        details: "Defina pelo menos um ponto final para comunicar o desfecho do percurso.",
        targetType: "graph",
      });
    } else if (
      endNodes.length > 0 &&
      !endNodes.some((node) => reachableFromStart.has(node.id))
    ) {
      issues.push({
        id: buildIssueId("FLOW_NO_REACHABLE_END", "graph", undefined, issues.length),
        code: "FLOW_NO_REACHABLE_END",
        severity: "warning",
        message: "O processo tem encerramentos, mas nenhum deles e alcancado a partir do inicio.",
        details: "Revise a continuidade principal para garantir que pelo menos um percurso chega a um encerramento real.",
        targetType: "graph",
      });
    }

    for (const node of sortedNodes) {
      const semanticKind = semanticKindByNodeId.get(node.id);
      if (!semanticKind) {
        continue;
      }

      if (!isNodeKindAllowedForProfile(profile, semanticKind)) {
        const severity: SemanticSeverity =
          mode === "operational" ? "error" : "warning";
        issues.push({
          id: buildIssueId("NODE_KIND_OUT_OF_PROFILE", "node", node.id, issues.length),
          code: "NODE_KIND_OUT_OF_PROFILE",
          severity,
          message: `No '${node.label ?? node.id}' usa tipo '${node.kind}' fora do perfil ${profile.label}.`,
          details: `Tipos permitidos: ${profile.allowedNodeKinds.join(", ")}.`,
          targetType: "node",
          targetId: node.id,
        });
      }

      const role = flowRoleByNodeId.get(node.id);
      const incomingProcessCount = processIncomingCountByNodeId.get(node.id) ?? 0;
      const outgoingProcessCount = processOutgoingCountByNodeId.get(node.id) ?? 0;
      const namedOutgoingCount = namedOutgoingCountByNodeId.get(node.id) ?? 0;
      const totalConnectionCount = totalConnectionCountByNodeId.get(node.id) ?? 0;
      const roleSemantics = role ? getProcessRoleSemantics(role) : null;

      if (role && totalConnectionCount === 0) {
        issues.push({
          id: buildIssueId("FLOW_NODE_ISOLATED", "node", node.id, issues.length),
          code: "FLOW_NODE_ISOLATED",
          severity: roleSemantics?.isolatedSeverity ?? "warning",
          message:
            role === "flow-note"
              ? `A observacao '${node.label ?? node.id}' ainda esta solta no mapa.`
              : `O ponto '${node.label ?? node.id}' ainda esta isolado no processo.`,
          details:
            role === "flow-note"
              ? "Conecte a observacao ao trecho que ela esclarece."
              : "Conecte de onde este ponto vem e para onde ele segue para evitar ilhas operacionais.",
          targetType: "node",
          targetId: node.id,
        });
      }

      if (
        role &&
        role !== "flow-start" &&
        role !== "flow-note" &&
        incomingProcessCount === 0 &&
        outgoingProcessCount > 0
      ) {
        issues.push({
          id: buildIssueId("FLOW_NODE_MISSING_ORIGIN", "node", node.id, issues.length),
          code: "FLOW_NODE_MISSING_ORIGIN",
          severity: "warning",
          message: `O ponto '${node.label ?? node.id}' abre caminho, mas nao mostra de onde vem.`,
          details: "Conecte a etapa anterior ou reveja se este ponto deveria ser o inicio do processo.",
          targetType: "node",
          targetId: node.id,
        });
      }

      if (role === "flow-decision" && outgoingProcessCount < 2) {
        issues.push({
          id: buildIssueId("FLOW_DECISION_NEEDS_BRANCHES", "node", node.id, issues.length),
          code: "FLOW_DECISION_NEEDS_BRANCHES",
          severity: "warning",
          message: `A decisao '${node.label ?? node.id}' ainda nao mostra caminhos suficientes.`,
          details: "Adicione pelo menos dois caminhos para explicitar alternativas ou condicoes.",
          targetType: "node",
          targetId: node.id,
        });
      }

      if (
        role === "flow-decision" &&
        outgoingProcessCount >= 2 &&
        namedOutgoingCount < Math.min(outgoingProcessCount, 2)
      ) {
        issues.push({
          id: buildIssueId("FLOW_DECISION_PATHS_NEED_LABELS", "node", node.id, issues.length),
          code: "FLOW_DECISION_PATHS_NEED_LABELS",
          severity: "warning",
          message: `A decisao '${node.label ?? node.id}' ainda nao nomeia bem as suas saidas.`,
          details: "Use rotulos curtos como 'Sim', 'Nao', 'Excecao' ou outro criterio operacional para cada caminho.",
          targetType: "node",
          targetId: node.id,
        });
      }

      if (role === "flow-decision") {
        const normalizedLabels = sortedEdges
          .filter(
            (edge) =>
              edge.sourceNodeId === node.id &&
              isProcessMainEdgeKind(edge.kind) &&
              Boolean(normalizeProcessEdgeLabel(edge.label)),
          )
          .map((edge) => normalizeProcessEdgeLabel(edge.label)!)
          .map((label) =>
            label
              .normalize("NFD")
              .replace(/\p{Diacritic}/gu, "")
              .trim()
              .toLowerCase(),
          );
        const duplicatedLabel = normalizedLabels.find(
          (label, index) => normalizedLabels.indexOf(label) !== index,
        );

        if (duplicatedLabel) {
          issues.push({
            id: buildIssueId("FLOW_DECISION_DUPLICATED_LABELS", "node", node.id, issues.length),
            code: "FLOW_DECISION_DUPLICATED_LABELS",
            severity: "warning",
            message: `A decisao '${node.label ?? node.id}' repete nomes de saida e perde clareza.`,
            details: "Diferencie cada caminho da decisao com rotulos unicos e curtos.",
            targetType: "node",
            targetId: node.id,
          });
        }
      }

      if (
        (role === "flow-start" || role === "flow-step") &&
        outgoingProcessCount > 1
      ) {
        issues.push({
          id: buildIssueId("FLOW_STEP_MULTIPLE_OUTPUTS", "node", node.id, issues.length),
          code: "FLOW_STEP_MULTIPLE_OUTPUTS",
          severity: "warning",
          message: `O ponto '${node.label ?? node.id}' abre varios caminhos sem estar marcado como decisao.`,
          details: "Considere transformar esse ponto em decisao para deixar a bifurcacao explicita.",
          targetType: "node",
          targetId: node.id,
        });
      }

      if (role === "flow-start" && outgoingProcessCount === 0) {
        issues.push({
          id: buildIssueId("FLOW_START_WITHOUT_PATH", "node", node.id, issues.length),
          code: "FLOW_START_WITHOUT_PATH",
          severity: "error",
          message: `O inicio '${node.label ?? node.id}' ainda nao dispara o processo.`,
          details: "Conecte a primeira etapa ou remova este ponto se ele ainda nao for o inicio real.",
          targetType: "node",
          targetId: node.id,
        });
      }

      if (role === "flow-end" && incomingProcessCount === 0) {
        issues.push({
          id: buildIssueId("FLOW_END_WITHOUT_INCOMING", "node", node.id, issues.length),
          code: "FLOW_END_WITHOUT_INCOMING",
          severity: "warning",
          message: `O encerramento '${node.label ?? node.id}' ainda nao recebe nenhum caminho.`,
          details: "Conecte a etapa que leva a este encerramento para que ele represente um desfecho real.",
          targetType: "node",
          targetId: node.id,
        });
      }

      if (
        role &&
        role !== "flow-end" &&
        role !== "flow-note" &&
        incomingProcessCount > 0 &&
        outgoingProcessCount === 0
      ) {
        issues.push({
          id: buildIssueId("FLOW_NODE_DEAD_END", "node", node.id, issues.length),
          code: "FLOW_NODE_DEAD_END",
          severity: roleSemantics?.deadEndSeverity ?? "warning",
          message: `O ponto '${node.label ?? node.id}' recebe fluxo, mas ainda termina sem um desfecho claro.`,
          details: "Conecte a proxima etapa, uma decisao ou um encerramento para evitar caminho morto.",
          targetType: "node",
          targetId: node.id,
        });
      }

      if (role === "flow-note" && totalConnectionCount === 0) {
        issues.push({
          id: buildIssueId("FLOW_NOTE_ORPHAN", "node", node.id, issues.length),
          code: "FLOW_NOTE_ORPHAN",
          severity: "info",
          message: `A observacao '${node.label ?? node.id}' ainda nao apoia nenhum ponto do processo.`,
          details: "Conecte a observacao ao trecho que ela esclarece.",
          targetType: "node",
          targetId: node.id,
        });
      }

      if (
        role &&
        role !== "flow-note" &&
        startNodes.length > 0 &&
        !reachableFromStart.has(node.id)
      ) {
        issues.push({
          id: buildIssueId("FLOW_NODE_UNREACHABLE_FROM_START", "node", node.id, issues.length),
          code: "FLOW_NODE_UNREACHABLE_FROM_START",
          severity: "warning",
          message: `O ponto '${node.label ?? node.id}' nao e alcancado a partir do inicio do processo.`,
          details: "Revise as ligacoes principais ou defina se este trecho pertence a outro fluxo.",
          targetType: "node",
          targetId: node.id,
        });
      }

      if (
        role &&
        role !== "flow-note" &&
        role !== "flow-end" &&
        endNodes.length > 0 &&
        reachableFromStart.has(node.id) &&
        !canReachEnd.has(node.id)
      ) {
        issues.push({
          id: buildIssueId("FLOW_NODE_WITHOUT_CLOSURE", "node", node.id, issues.length),
          code: "FLOW_NODE_WITHOUT_CLOSURE",
          severity: "warning",
          message: `O trecho que passa por '${node.label ?? node.id}' nao chega a um encerramento conhecido.`,
          details: "Revise a continuidade principal e os desvios para garantir um desfecho operacional.",
          targetType: "node",
          targetId: node.id,
        });
      }
    }
  }

  if (profile.diagramType === "mindmap" && graph.rootNodeId) {
    const auditNodeIds = new Set(
      sortedNodes
        .filter((node) => semanticKindByNodeId.get(node.id) !== null)
        .map((node) => node.id),
    );
    const rootNode = auditNodeIds.has(graph.rootNodeId)
      ? nodeMap.get(graph.rootNodeId)
      : undefined;

    if (!rootNode) {
      issues.push({
        id: buildIssueId("MINDMAP_ROOT_NOT_FOUND", "graph", graph.rootNodeId, issues.length),
        code: "MINDMAP_ROOT_NOT_FOUND",
        severity: "warning",
        message: "Root configurado no layout nao foi encontrado no grafo.",
        targetType: "graph",
      });
    } else {
      const adjacency = new Map<string, Set<string>>();
      for (const nodeId of auditNodeIds) {
        adjacency.set(nodeId, new Set());
      }

      for (const edge of sortedEdges) {
        if (!auditNodeIds.has(edge.sourceNodeId) || !auditNodeIds.has(edge.targetNodeId)) {
          continue;
        }

        adjacency.get(edge.sourceNodeId)?.add(edge.targetNodeId);
        adjacency.get(edge.targetNodeId)?.add(edge.sourceNodeId);
      }

      const visited = new Set<string>([graph.rootNodeId]);
      const queue: string[] = [graph.rootNodeId];

      while (queue.length > 0) {
        const current = queue.shift();
        if (!current) {
          continue;
        }

        const neighbors = adjacency.get(current);
        if (!neighbors) {
          continue;
        }

        for (const nextId of neighbors) {
          if (visited.has(nextId)) {
            continue;
          }
          visited.add(nextId);
          queue.push(nextId);
        }
      }

      for (const node of sortedNodes) {
        if (!auditNodeIds.has(node.id)) {
          continue;
        }

        if (visited.has(node.id)) {
          continue;
        }

        issues.push({
          id: buildIssueId(
            "MINDMAP_NODE_DISCONNECTED_FROM_ROOT",
            "node",
            node.id,
            issues.length,
          ),
          code: "MINDMAP_NODE_DISCONNECTED_FROM_ROOT",
          severity: "warning",
          message: `No '${node.label ?? node.id}' desconectado da raiz do mapa mental.`,
          targetType: "node",
          targetId: node.id,
        });
      }
    }
  }

  for (const edge of sortedEdges) {
    const sourceNode = nodeMap.get(edge.sourceNodeId);
    const targetNode = nodeMap.get(edge.targetNodeId);

    if (!sourceNode || !targetNode) {
      issues.push({
        id: buildIssueId("EDGE_ENDPOINT_NOT_FOUND", "edge", edge.id, issues.length),
        code: "EDGE_ENDPOINT_NOT_FOUND",
        severity: "error",
        message: `Aresta '${edge.id}' aponta para no inexistente.`,
        targetType: "edge",
        targetId: edge.id,
      });
      continue;
    }

    const sourceSemanticKind = semanticKindByNodeId.get(sourceNode.id);
    const targetSemanticKind = semanticKindByNodeId.get(targetNode.id);

    if (sourceSemanticKind === null || targetSemanticKind === null) {
      continue;
    }

    const validation = validateEdgeCreation({
      diagramType,
      sourceNode,
      targetNode,
      edgeKind: edge.kind,
      mode,
    }, options);

    if (!validation.ok) {
      issues.push({
        id: buildIssueId(
          validation.violation?.code ?? "EDGE_SEMANTIC_INVALID",
          "edge",
          edge.id,
          issues.length,
        ),
        code: validation.violation?.code ?? "EDGE_SEMANTIC_INVALID",
        severity: validation.violation?.severity ?? "error",
        message:
          validation.violation?.message ??
          `Aresta '${edge.id}' viola regra semantica.`,
        details: validation.violation?.details,
        targetType: "edge",
        targetId: edge.id,
      });
    }
  }

  const bySeverity: Record<SemanticSeverity, number> = {
    ...bySeverityBase,
  };
  for (const issue of issues) {
    bySeverity[issue.severity] += 1;
  }

  return {
    issues,
    counters: {
      total: issues.length,
      nodes: issues.filter((issue) => issue.targetType === "node").length,
      edges: issues.filter((issue) => issue.targetType === "edge").length,
      graph: issues.filter((issue) => issue.targetType === "graph").length,
    },
    bySeverity,
  };
}
