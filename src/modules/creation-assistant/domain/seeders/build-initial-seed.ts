import type { EdgeKind, GraphSnapshot, NodeKind } from "@/src/domain";
import { resolveGraphEdgeSemantic } from "@/src/modules/diagrams/domain";
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

  const stepNodeId = input.builder.addNode({
    kind: "flow-step",
    label: "Etapa 1",
    position: direction === "top-down" ? { x: 220, y: 280 } : { x: 360, y: 180 },
    data: {
      role: "flow-step",
    },
  });

  let startId: string | undefined;
  let endId: string | undefined;
  if (shouldCreateStartEnd) {
    startId = input.builder.addNode({
      kind: "flow-step",
      label: "Inicio",
      position: direction === "top-down" ? { x: 220, y: 120 } : { x: 120, y: 180 },
      data: {
        role: "flow-start",
      },
    });
    endId = input.builder.addNode({
      kind: "flow-step",
      label: "Fim",
      position: direction === "top-down" ? { x: 220, y: 440 } : { x: 600, y: 180 },
      data: {
        role: "flow-end",
      },
    });
    input.builder.addEdge({
      sourceNodeId: startId,
      targetNodeId: stepNodeId,
      kind: "flows-to",
    });
    input.builder.addEdge({
      sourceNodeId: stepNodeId,
      targetNodeId: endId,
      kind: "flows-to",
    });
  }

  if (shouldAllowDecisions) {
    const decisionId = input.builder.addNode({
      kind: "flow-step",
      label: "Decisao",
      position:
        direction === "top-down"
          ? { x: 430, y: 280 }
          : { x: 360, y: 360 },
      data: {
        role: "flow-decision",
        allowMultipleOutputs:
          input.settings.context.flow?.allowMultipleOutputs ?? false,
      },
    });

    input.builder.addEdge({
      sourceNodeId: stepNodeId,
      targetNodeId: decisionId,
      kind: "depends-on",
      label: "decisao",
    });
    if (endId) {
      input.builder.addEdge({
        sourceNodeId: decisionId,
        targetNodeId: endId,
        kind: "flows-to",
        label: "continua",
      });
    }
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
        data: {
          role: "sitemap-home",
          showNavDepth: input.settings.context.sitemap?.showNavDepth ?? true,
        },
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
      data: {
        role: "sitemap-section",
      },
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
    data: {
      role: "hierarchy-root",
      direction,
    },
  });

  for (let level = 1; level <= depth; level += 1) {
    const nodeId = input.builder.addNode({
      kind: "page",
      label: `Nivel ${level}`,
      position:
        direction === "left-right"
          ? { x: 220 + level * 240, y: 120 }
          : { x: 220, y: 120 + level * 180 },
      data: {
        role: "hierarchy-node",
        level,
      },
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
    data: {
      role: "graph-core",
      autoGroup: input.settings.context.graph?.autoGroup ?? true,
      reduceCrossing: input.settings.context.graph?.reduceCrossing ?? true,
    },
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
      data: {
        role: "graph-topic",
        showEdgeLabels: input.settings.context.graph?.showEdgeLabels ?? true,
      },
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
    data: {
      role: "graph-supporting",
      showEdgeLabels: input.settings.context.graph?.showEdgeLabels ?? true,
    },
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
    data: {
      role: "mindmap-root",
    },
  });

  for (let index = 0; index < count; index += 1) {
    const branchId = input.builder.addNode({
      kind: "note",
      label: `Ramo ${index + 1}`,
      position: { x: 120 + index * 200, y: index % 2 === 0 ? 40 : 360 },
      data: {
        role: "mindmap-branch",
      },
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
      data: {
        role: "timeline-milestone",
      },
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
