import type { EdgeKind, GraphSnapshot, NodeKind } from "@/src/domain";
import {
  resolveGraphEdgeSemantic,
  writeDiagramRoleToPayload,
  type DiagramRole,
} from "@/src/modules/diagrams/domain";
import type {
  AssistantCreationSettings,
  AssistantDraft,
  TemplatePreset,
} from "../creation-assistant";
import { resolveRecipeRuntime } from "../recipes";

type SeedBuilder = {
  nodes: GraphSnapshot["nodes"];
  edges: GraphSnapshot["edges"];
  addNode: (input: {
    kind: NodeKind;
    label: string;
    position: { x: number; y: number };
    data?: Record<string, unknown>;
  }) => string;
  addEdge: (input: {
    sourceNodeId: string;
    targetNodeId: string;
    kind: EdgeKind;
    label?: string;
    data?: Record<string, unknown>;
  }) => string;
};

export type InitialSeedGraph = {
  nodes: GraphSnapshot["nodes"];
  edges: GraphSnapshot["edges"];
  rootNodeName?: string;
};

function createSeedBuilder(projectId: string): SeedBuilder {
  const nodes: GraphSnapshot["nodes"] = [];
  const edges: GraphSnapshot["edges"] = [];

  return {
    nodes,
    edges,
    addNode(input) {
      const id = crypto.randomUUID();
      nodes.push({
        id,
        projectId,
        kind: input.kind,
        label: input.label,
        position: input.position,
        data: input.data ?? {},
        externalRefs: [],
      });
      return id;
    },
    addEdge(input) {
      const id = crypto.randomUUID();
      edges.push({
        id,
        projectId,
        sourceNodeId: input.sourceNodeId,
        targetNodeId: input.targetNodeId,
        kind: input.kind,
        label: input.label,
        data: input.data ?? {},
        externalRefs: [],
      });
      return id;
    },
  };
}

function resolveSeedCount(settings: AssistantCreationSettings) {
  const configured = settings.context.setup?.suggestedBlockCount;
  if (typeof configured === "number") {
    return Math.max(1, Math.min(12, configured));
  }

  const detailLevel = settings.detailLevel;
  if (detailLevel === "essential") {
    return 2;
  }
  if (detailLevel === "intermediate") {
    return 3;
  }

  return 4;
}

function shouldCreateExamples(settings: AssistantCreationSettings) {
  return settings.context.setup?.createExamples ?? true;
}

function appendTimestampFields(
  fields: Array<Record<string, unknown>>,
  settings: AssistantCreationSettings,
) {
  if (!settings.context.erd?.generateTimestamps) {
    return fields;
  }

  return [
    ...fields,
    {
      id: crypto.randomUUID(),
      name: "createdAt",
      type: "timestamp",
      flags: ["NOT_NULL"],
    },
    {
      id: crypto.randomUUID(),
      name: "updatedAt",
      type: "timestamp",
      flags: ["NOT_NULL"],
    },
  ];
}

function buildSeedPayload(input: {
  role?: DiagramRole;
  data?: Record<string, unknown>;
}) {
  const baseData = { ...(input.data ?? {}) };

  if (!input.role) {
    return baseData;
  }

  return writeDiagramRoleToPayload(baseData, input.role);
}

function seedErdBasicTemplate(
  builder: SeedBuilder,
  settings: AssistantCreationSettings,
) {
  const userId = builder.addNode({
    kind: "entity",
    label: "User",
    position: { x: 180, y: 120 },
    data: {
      fields: appendTimestampFields(
        [
          {
            id: crypto.randomUUID(),
            name: "id",
            type: "uuid",
            flags: ["PK", "NOT_NULL"],
          },
          {
            id: crypto.randomUUID(),
            name: "email",
            type: "text",
            flags: ["UNIQUE", "NOT_NULL"],
          },
        ],
        settings,
      ),
      ...(settings.context.erd?.suggestIndexes
        ? {
            suggestedIndexes: [{ fields: ["email"], unique: true }],
          }
        : {}),
    },
  });

  const postId = builder.addNode({
    kind: "entity",
    label: "Post",
    position: { x: 580, y: 250 },
    data: {
      fields: appendTimestampFields(
        [
          {
            id: crypto.randomUUID(),
            name: "id",
            type: "uuid",
            flags: ["PK", "NOT_NULL"],
          },
          {
            id: crypto.randomUUID(),
            name: "userId",
            type: "uuid",
            flags: ["FK", "NOT_NULL"],
          },
        ],
        settings,
      ),
      ...(settings.context.erd?.suggestIndexes
        ? {
            suggestedIndexes: [{ fields: ["userId"], unique: false }],
          }
        : {}),
    },
  });

  builder.addEdge({
    sourceNodeId: userId,
    targetNodeId: postId,
    kind: "references",
    label: "1:N",
    data: {
      cardinality: {
        minSource: 1,
        maxSource: 1,
        minTarget: 0,
        maxTarget: "N",
      },
    },
  });
}

function seedErd(input: {
  builder: SeedBuilder;
  settings: AssistantCreationSettings;
  templatePreset?: TemplatePreset;
}) {
  if (input.templatePreset === "erd-basic") {
    seedErdBasicTemplate(input.builder, input.settings);
    return;
  }

  const shouldUseDefaultPk = input.settings.context.erd?.useDefaultIdPk ?? true;
  const shouldCreateFk = input.settings.context.erd?.autoCreateFk ?? true;
  const fields = appendTimestampFields(
    shouldUseDefaultPk
      ? [
          {
            id: crypto.randomUUID(),
            name: "id",
            type: "uuid",
            flags: ["PK", "NOT_NULL"],
          },
        ]
      : [],
    input.settings,
  );

  const mainEntityId = input.builder.addNode({
    kind: "entity",
    label: "EntidadePrincipal",
    position: { x: 180, y: 120 },
    data: {
      fields,
      semantic: {
        hasPk: shouldUseDefaultPk,
      },
      ...(input.settings.context.erd?.suggestIndexes
        ? {
            suggestedIndexes: [{ fields: ["id"], unique: true }],
          }
        : {}),
    },
  });

  if (!shouldCreateFk) {
    return;
  }

  const relatedEntityId = input.builder.addNode({
    kind: "entity",
    label: "EntidadeRelacionada",
    position: { x: 580, y: 260 },
    data: {
      fields: appendTimestampFields(
        [
          {
            id: crypto.randomUUID(),
            name: "id",
            type: "uuid",
            flags: ["PK", "NOT_NULL"],
          },
        ],
        input.settings,
      ),
      ...(input.settings.context.erd?.suggestIndexes
        ? {
            suggestedIndexes: [{ fields: ["id"], unique: true }],
          }
        : {}),
    },
  });

  input.builder.addEdge({
    sourceNodeId: mainEntityId,
    targetNodeId: relatedEntityId,
    kind: "references",
    label: "1:N",
    data: {
      cardinality: {
        minSource: 1,
        maxSource: 1,
        minTarget: 0,
        maxTarget: "N",
      },
    },
  });
}

function seedFlow(input: {
  builder: SeedBuilder;
  settings: AssistantCreationSettings;
}) {
  const direction = input.settings.context.flow?.direction ?? "left-right";
  const shouldCreateStartEnd = input.settings.context.flow?.autoCreateStartEnd ?? true;
  const shouldAllowDecisions = input.settings.context.flow?.allowDecisions ?? true;
  const allowMultipleOutputs =
    input.settings.context.flow?.allowMultipleOutputs ?? false;
  const resolveFlowPosition = (column: number, lane = 0) =>
    direction === "top-down"
      ? { x: 220 + lane * 250, y: 120 + column * 180 }
      : { x: 140 + column * 270, y: 180 + lane * 220 };
  const firstMainColumn = shouldCreateStartEnd ? 1 : 0;

  const intakeStepId = input.builder.addNode({
    kind: "flow-step",
    label: "Receber solicitacao",
    position: resolveFlowPosition(firstMainColumn),
    data: buildSeedPayload({
      role: "flow-step",
      data: {
        description: "Registro inicial do pedido, caso ou demanda que entra no processo.",
      },
    }),
  });

  let analysisStepId = intakeStepId;
  if (shouldAllowDecisions) {
    analysisStepId = input.builder.addNode({
      kind: "flow-step",
      label: "Analisar solicitacao",
      position: resolveFlowPosition(firstMainColumn + 1),
      data: buildSeedPayload({
        role: "flow-step",
        data: {
          description: "Confere informacoes, contexto e criterios antes da proxima passagem.",
        },
      }),
    });

    input.builder.addEdge({
      sourceNodeId: intakeStepId,
      targetNodeId: analysisStepId,
      kind: "flows-to",
    });
  }

  let startId: string | undefined;
  let endId: string | undefined;
  if (shouldCreateStartEnd) {
    startId = input.builder.addNode({
      kind: "flow-step",
      label: "Inicio",
      position: resolveFlowPosition(0),
      data: buildSeedPayload({
        role: "flow-start",
        data: {
          description: "Ponto que abre este percurso operacional.",
        },
      }),
    });
    endId = input.builder.addNode({
      kind: "flow-step",
      label: "Encerrar processo",
      position: resolveFlowPosition(shouldAllowDecisions ? firstMainColumn + 4 : firstMainColumn + 2),
      data: buildSeedPayload({
        role: "flow-end",
        data: {
          description: "Resultado final esperado para este fluxo inicial.",
        },
      }),
    });
    input.builder.addEdge({
      sourceNodeId: startId,
      targetNodeId: intakeStepId,
      kind: "flows-to",
    });
  }

  if (shouldAllowDecisions) {
    const decisionId = input.builder.addNode({
      kind: "flow-step",
      label: "Aprovacao necessaria?",
      position: resolveFlowPosition(firstMainColumn + 2),
      data: buildSeedPayload({
        role: "flow-decision",
        data: {
          description: "Define se o processo segue direto ou passa por aprovacao.",
          allowMultipleOutputs,
        },
      }),
    });
    const executionStepId = input.builder.addNode({
      kind: "flow-step",
      label: "Executar atendimento",
      position: resolveFlowPosition(firstMainColumn + 3),
      data: buildSeedPayload({
        role: "flow-step",
        data: {
          description: "Realiza a entrega principal depois da analise ou aprovacao.",
        },
      }),
    });
    const approvalStepId = input.builder.addNode({
      kind: "flow-step",
      label: "Solicitar aprovacao",
      position: resolveFlowPosition(firstMainColumn + 3, 1),
      data: buildSeedPayload({
        role: "flow-step",
        data: {
          description: "Encaminha a decisao para a pessoa ou area responsavel.",
        },
      }),
    });
    const noteId = input.builder.addNode({
      kind: "note",
      label: "Criterio de aprovacao",
      position: resolveFlowPosition(firstMainColumn + 2, -1),
      data: buildSeedPayload({
        role: "flow-note",
        data: {
          description: "Use esta observacao para registrar regra, SLA ou excecao.",
        },
      }),
    });

    input.builder.addEdge({
      sourceNodeId: analysisStepId,
      targetNodeId: decisionId,
      kind: "flows-to",
    });
    input.builder.addEdge({
      sourceNodeId: decisionId,
      targetNodeId: executionStepId,
      kind: "flows-to",
      label: "Nao",
    });
    input.builder.addEdge({
      sourceNodeId: decisionId,
      targetNodeId: approvalStepId,
      kind: "depends-on",
      label: "Sim",
    });
    input.builder.addEdge({
      sourceNodeId: approvalStepId,
      targetNodeId: executionStepId,
      kind: "flows-to",
      label: "Aprovado",
    });
    input.builder.addEdge({
      sourceNodeId: noteId,
      targetNodeId: decisionId,
      kind: "references",
      label: "Regra",
    });

    if (allowMultipleOutputs) {
      const escalationStepId = input.builder.addNode({
        kind: "flow-step",
        label: "Acionar area responsavel",
        position: resolveFlowPosition(firstMainColumn + 3, 2),
        data: buildSeedPayload({
          role: "flow-step",
          data: {
            description: "Demonstra um caminho adicional quando o processo exige escalonamento.",
          },
        }),
      });

      input.builder.addEdge({
        sourceNodeId: decisionId,
        targetNodeId: escalationStepId,
        kind: "depends-on",
        label: "Escalonar",
      });
      input.builder.addEdge({
        sourceNodeId: escalationStepId,
        targetNodeId: executionStepId,
        kind: "flows-to",
        label: "Retorna",
      });
    }

    if (endId) {
      input.builder.addEdge({
        sourceNodeId: executionStepId,
        targetNodeId: endId,
        kind: "flows-to",
      });
    }
    return;
  }

  const executionStepId = input.builder.addNode({
    kind: "flow-step",
    label: "Executar atividade",
    position: resolveFlowPosition(firstMainColumn + 1),
    data: buildSeedPayload({
      role: "flow-step",
      data: {
        description: "Representa a principal entrega deste fluxo inicial.",
      },
    }),
  });
  const noteId = input.builder.addNode({
    kind: "note",
    label: "Observacao de apoio",
    position: resolveFlowPosition(firstMainColumn + 1, -1),
    data: buildSeedPayload({
      role: "flow-note",
      data: {
        description: "Use para registrar contexto, risco, SLA ou excecao relevante.",
      },
    }),
  });

  input.builder.addEdge({
    sourceNodeId: intakeStepId,
    targetNodeId: executionStepId,
    kind: "flows-to",
  });
  input.builder.addEdge({
    sourceNodeId: noteId,
    targetNodeId: executionStepId,
    kind: "references",
    label: "Apoio",
  });

  if (endId) {
    input.builder.addEdge({
      sourceNodeId: executionStepId,
      targetNodeId: endId,
      kind: "flows-to",
    });
  }
}

function seedSitemap(input: {
  builder: SeedBuilder;
  settings: AssistantCreationSettings;
}) {
  const shouldCreateHome = input.settings.context.sitemap?.autoCreateHome ?? true;
  const shouldGenerateSections =
    input.settings.context.sitemap?.generateMainSections ?? true;
  const count = resolveSeedCount(input.settings);

  const homeId = shouldCreateHome
    ? input.builder.addNode({
        kind: "page",
        label: "Home",
        position: { x: 200, y: 120 },
        data: buildSeedPayload({
          role: "sitemap-home",
          data: {
            showNavDepth: input.settings.context.sitemap?.showNavDepth ?? true,
          },
        }),
      })
    : undefined;

  if (!shouldGenerateSections) {
    return;
  }

  const sectionLabels = ["Produtos", "Servicos", "Sobre", "Contato"].slice(0, count);
  sectionLabels.forEach((section, index) => {
    const sectionId = input.builder.addNode({
      kind: "page",
      label: section,
      position: { x: 60 + index * 220, y: 320 },
      data: buildSeedPayload({
        role: "sitemap-section",
      }),
    });

    if (homeId) {
      input.builder.addEdge({
        sourceNodeId: homeId,
        targetNodeId: sectionId,
        kind: "contains",
        label: "secao",
      });
    }
  });
}

function seedHierarchy(input: {
  builder: SeedBuilder;
  settings: AssistantCreationSettings;
}) {
  const direction = input.settings.context.hierarchy?.direction ?? "top-down";
  const shouldCreateRoot =
    (input.settings.context.hierarchy?.createRoot ?? true) &&
    (input.settings.context.setup?.createInitialRoot ?? true);
  const configuredRootName =
    input.settings.context.setup?.createInitialRoot === false
      ? undefined
      : input.settings.context.setup?.initialRootName?.trim();
  const depthHint = input.settings.context.hierarchy?.initialDepthHint ?? 2;
  const depth = Math.max(depthHint, 2);
  const rootLabel = configuredRootName || (shouldCreateRoot ? "No raiz" : "Estrutura principal");

  const rootId = input.builder.addNode({
    kind: "page",
    label: rootLabel,
    position: { x: 220, y: 120 },
    data: buildSeedPayload({
      role: "hierarchy-root",
      data: {
        direction,
      },
    }),
  });

  for (let level = 1; level <= depth; level += 1) {
    const nodeId = input.builder.addNode({
      kind: "page",
      label: `Nivel ${level}`,
      position:
        direction === "left-right"
          ? { x: 220 + level * 240, y: 120 }
          : { x: 220, y: 120 + level * 180 },
      data: buildSeedPayload({
        role: "hierarchy-node",
        data: {
          level,
        },
      }),
    });
    input.builder.addEdge({
      sourceNodeId: level === 1 ? rootId : input.builder.nodes[input.builder.nodes.length - 2].id,
      targetNodeId: nodeId,
      kind: "contains",
      label: "contém",
    });
  }
}

function seedGraph(input: {
  builder: SeedBuilder;
  settings: AssistantCreationSettings;
  includeObjective?: string;
}) {
  const count = Math.max(3, resolveSeedCount(input.settings));
  const rootLabel =
    input.settings.context.setup?.createInitialRoot === false
      ? "Nucleo"
      : (input.settings.context.setup?.initialRootName?.trim() ?? "Nucleo");
  const coreId = input.builder.addNode({
    kind: "entity",
    label: rootLabel,
    position: { x: 320, y: 220 },
    data: buildSeedPayload({
      role: "graph-core",
      data: {
        autoGroup: input.settings.context.graph?.autoGroup ?? true,
        reduceCrossing: input.settings.context.graph?.reduceCrossing ?? true,
      },
    }),
  });
  const topicIds: string[] = [];

  for (let index = 0; index < count; index += 1) {
    const angle = (-Math.PI / 2) + (index * (Math.PI * 2)) / count;
    const radius = 210 + (index % 2 === 0 ? 18 : -10);
    const topicId = input.builder.addNode({
      kind: "entity",
      label: `Componente ${index + 1}`,
      position: {
        x: 320 + Math.cos(angle) * radius,
        y: 220 + Math.sin(angle) * radius,
      },
      data: buildSeedPayload({
        role: "graph-topic",
        data: {
          showEdgeLabels: input.settings.context.graph?.showEdgeLabels ?? true,
        },
      }),
    });
    topicIds.push(topicId);
    input.builder.addEdge({
      sourceNodeId: coreId,
      targetNodeId: topicId,
      kind: "depends-on",
      label: resolveGraphEdgeSemantic("depends-on").defaultVerbLabel.toLowerCase(),
    });

    if (index > 0 && index % 2 === 0) {
      const previousTopicId = topicIds[index - 1];
      if (!previousTopicId) {
        continue;
      }

      input.builder.addEdge({
        sourceNodeId: previousTopicId,
        targetNodeId: topicId,
        kind: "relates-to",
        label: resolveGraphEdgeSemantic("relates-to").defaultVerbLabel.toLowerCase(),
      });
    }
  }

  const supportNodeId = input.builder.addNode({
    kind: "page",
    label: "Servico auxiliar",
    position: { x: 96, y: 384 },
    data: buildSeedPayload({
      role: "graph-supporting",
      data: {
        showEdgeLabels: input.settings.context.graph?.showEdgeLabels ?? true,
      },
    }),
  });
  input.builder.addEdge({
    sourceNodeId: supportNodeId,
    targetNodeId: coreId,
    kind: "references",
    label: resolveGraphEdgeSemantic("references").defaultVerbLabel.toLowerCase(),
  });

  if (input.includeObjective?.trim()) {
    const objectiveId = input.builder.addNode({
      kind: "note",
      label: "Contexto",
      position: { x: 48, y: 84 },
      data: {
        description: input.includeObjective.trim(),
      },
    });
    input.builder.addEdge({
      sourceNodeId: coreId,
      targetNodeId: objectiveId,
      kind: "references",
      label: "contextualiza",
    });
  }
}

function seedMindmap(input: {
  builder: SeedBuilder;
  settings: AssistantCreationSettings;
  includeObjective?: string;
}) {
  const count = resolveSeedCount(input.settings);
  const rootLabel =
    input.settings.context.setup?.createInitialRoot === false
      ? "Tema central"
      : (input.settings.context.setup?.initialRootName?.trim() ?? "Tema central");
  const centerId = input.builder.addNode({
    kind: "note",
    label: rootLabel,
    position: { x: 280, y: 200 },
    data: buildSeedPayload({
      role: "mindmap-root",
    }),
  });

  for (let index = 0; index < count; index += 1) {
    const branchId = input.builder.addNode({
      kind: "note",
      label: `Ramo ${index + 1}`,
      position: { x: 120 + index * 200, y: index % 2 === 0 ? 40 : 360 },
      data: buildSeedPayload({
        role: "mindmap-branch",
      }),
    });
    input.builder.addEdge({
      sourceNodeId: centerId,
      targetNodeId: branchId,
      kind: "relates-to",
      label: "ramo",
    });
  }

  if (input.includeObjective?.trim()) {
    const objectiveId = input.builder.addNode({
      kind: "note",
      label: "Objetivo",
      position: { x: -120, y: 200 },
      data: {
        description: input.includeObjective.trim(),
      },
    });
    input.builder.addEdge({
      sourceNodeId: centerId,
      targetNodeId: objectiveId,
      kind: "references",
      label: "foco",
    });
  }
}

function seedTimeline(input: {
  builder: SeedBuilder;
  settings: AssistantCreationSettings;
}) {
  const count = resolveSeedCount(input.settings);
  let previousId: string | null = null;

  for (let index = 0; index < count; index += 1) {
    const milestoneId = input.builder.addNode({
      kind: "note",
      label: `Marco ${index + 1}`,
      position: { x: 140 + index * 220, y: 220 },
      data: buildSeedPayload({
        role: "timeline-milestone",
      }),
    });

    if (previousId) {
      input.builder.addEdge({
        sourceNodeId: previousId,
        targetNodeId: milestoneId,
        kind: "flows-to",
        label: "proximo",
      });
    }

    previousId = milestoneId;
  }
}

export function buildInitialSeedGraph(input: {
  projectId: string;
  draft: AssistantDraft;
  settings: AssistantCreationSettings;
}): InitialSeedGraph {
  const builder = createSeedBuilder(input.projectId);
  const createExamples = shouldCreateExamples(input.settings);
  if (!createExamples) {
    return {
      nodes: builder.nodes,
      edges: builder.edges,
    };
  }

  const runtime = resolveRecipeRuntime({
    profile: input.settings.profile,
    view: input.settings.initialView,
  });

  switch (runtime.seedPlan.kind) {
    case "erd-native":
      seedErd({
        builder,
        settings: input.settings,
        templatePreset: input.settings.templatePreset,
      });
      return {
        nodes: builder.nodes,
        edges: builder.edges,
      };
    case "flow-native":
      seedFlow({
        builder,
        settings: input.settings,
      });
      return {
        nodes: builder.nodes,
        edges: builder.edges,
      };
    case "sitemap-native":
      seedSitemap({
        builder,
        settings: input.settings,
      });
      return {
        nodes: builder.nodes,
        edges: builder.edges,
      };
    case "hierarchy-native":
      seedHierarchy({
        builder,
        settings: input.settings,
      });
      return {
        nodes: builder.nodes,
        edges: builder.edges,
        rootNodeName: input.settings.context.hierarchy?.createRoot === false
          ? "Estrutura principal"
          : (input.settings.context.setup?.createInitialRoot === false
            ? "No raiz"
            : (input.settings.context.setup?.initialRootName?.trim() ?? "No raiz")),
      };
    case "mindmap-native":
      seedMindmap({
        builder,
        settings: input.settings,
        includeObjective: input.draft.projectObjective,
      });
      return {
        nodes: builder.nodes,
        edges: builder.edges,
      };
    case "timeline-native":
      seedTimeline({
        builder,
        settings: input.settings,
      });
      return {
        nodes: builder.nodes,
        edges: builder.edges,
      };
    case "graph-native":
    default:
      seedGraph({
        builder,
        settings: input.settings,
        includeObjective: input.draft.projectObjective,
      });
      return {
        nodes: builder.nodes,
        edges: builder.edges,
      };
  }
}
