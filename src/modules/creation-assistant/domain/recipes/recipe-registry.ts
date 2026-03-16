import type { EdgeKind, NodeKind } from "@/src/domain";
import type {
  AssistantDraft,
  AutomationToggles,
  InitialView,
  LayoutChoice,
  ProjectProfile,
  SourceStatus,
  StartStrategy,
} from "../creation-assistant";

export type RecipeContextBlock =
  | "setup"
  | "erd"
  | "flow"
  | "sitemap"
  | "hierarchy"
  | "graph";

export type RecipeValidationPhase = "draft" | "guided" | "strict";

export type RecipeValidationRules = Record<RecipeValidationPhase, string[]>;

export type RecipeLayoutCatalog = {
  recommended: LayoutChoice[];
  advanced: LayoutChoice[];
};

export type AutomationCopyMap = Record<
  keyof AutomationToggles,
  {
    label: string;
    help: string;
  }
>;

export type RecipeSeedPlan = {
  kind:
    | "erd-native"
    | "flow-native"
    | "sitemap-native"
    | "hierarchy-native"
    | "graph-native"
    | "mindmap-native"
    | "timeline-native";
  description: string;
};

export type RecipePersona = {
  labels: {
    addPrimary: string;
    addDialogTitle: string;
    addDialogHint: string;
    addConfirm: string;
    quickActionHint?: string;
  };
  quickAdd: {
    defaultNodeKind: NodeKind;
    defaultEdgeKind: EdgeKind;
  };
};

export type RecipeAction = {
  id: string;
  label: string;
  description: string;
};

export type RecipeStrictValidationResult = {
  ok: boolean;
  blockingIssues: string[];
  warnings: string[];
};

export type CreationRecipe = {
  id: `${ProjectProfile}:${InitialView}`;
  profile: ProjectProfile;
  view: InitialView;
  recommendedInitialViews: InitialView[];
  defaultLayoutCatalog: RecipeLayoutCatalog;
  defaultAutomation: {
    toggles: AutomationToggles;
    copy: AutomationCopyMap;
  };
  nativeSeed: RecipeSeedPlan;
  contextBlocks: RecipeContextBlock[];
  validationRules: RecipeValidationRules;
  persona: RecipePersona;
  actions: RecipeAction[];
};

export type RecipeRuntime = {
  recipeId: string;
  profile: ProjectProfile;
  view: InitialView;
  recommendedInitialViews: InitialView[];
  seedPlan: RecipeSeedPlan;
  layoutCatalog: RecipeLayoutCatalog;
  strictRules: string[];
  persona: RecipePersona;
  actions: RecipeAction[];
  contextBlocks: RecipeContextBlock[];
  defaultAutomation: CreationRecipe["defaultAutomation"];
};

const STATUS_READY_FOR_ATTEMPT = "ready_to_attempt_import";
const STATUS_IMPORTED = "imported";

export const DEFAULT_AUTOMATION_COPY: AutomationCopyMap = {
  inferRelations: {
    label: "Inferir relacoes automaticamente",
    help: "Sugere conexoes estruturais com base no contexto inicial.",
  },
  createLinkFields: {
    label: "Criar campos de ligacao quando necessario",
    help: "Adiciona campos auxiliares para manter conexoes consistentes.",
  },
  applySuggestedNames: {
    label: "Aplicar nomes sugeridos",
    help: "Padroniza titulos iniciais com nomenclatura recomendada.",
  },
  autoOrganizeOnCreate: {
    label: "Organizar layout ao criar",
    help: "Aplica disposicao inicial automaticamente ao gerar o mapa.",
  },
  detectInconsistenciesEarly: {
    label: "Detectar inconsistencias desde o inicio",
    help: "Ativa verificacoes semanticas desde o primeiro mapa.",
  },
};

export const DEFAULT_AUTOMATION_TOGGLES: AutomationToggles = {
  inferRelations: true,
  createLinkFields: true,
  applySuggestedNames: true,
  autoOrganizeOnCreate: true,
  detectInconsistenciesEarly: true,
};

function buildStrictResult(
  blockingIssues: string[],
  warnings: string[] = [],
): RecipeStrictValidationResult {
  return {
    ok: blockingIssues.length === 0,
    blockingIssues,
    warnings,
  };
}

function normalizeSourceStatusForValidation(
  sourceStatus?: string,
): SourceStatus | undefined {
  if (!sourceStatus) {
    return undefined;
  }

  if (sourceStatus === "not-configured") {
    return "not_configured";
  }
  if (sourceStatus === "prechecked") {
    return "precheck_ok";
  }
  if (sourceStatus === "ready-to-import") {
    return STATUS_READY_FOR_ATTEMPT;
  }

  return sourceStatus as SourceStatus;
}

function buildFallbackPersona(input: {
  profile: ProjectProfile;
  view: InitialView;
}): RecipePersona {
  if (input.view === "erd") {
    return {
      labels: {
        addPrimary: "Adicionar entidade",
        addDialogTitle: "QuickAdd de entidades",
        addDialogHint: "Crie entidades com campos e relacoes.",
        addConfirm: "Adicionar entidade",
      },
      quickAdd: {
        defaultNodeKind: "entity",
        defaultEdgeKind: "references",
      },
    };
  }

  if (input.view === "flow") {
    return {
      labels: {
        addPrimary: "Adicionar atividade",
        addDialogTitle: "QuickAdd do processo",
        addDialogHint: "Insira atividades, decisoes, encerramentos e observacoes do fluxo.",
        addConfirm: "Inserir no fluxo",
      },
      quickAdd: {
        defaultNodeKind: "flow-step",
        defaultEdgeKind: "flows-to",
      },
    };
  }

  if (input.view === "sitemap" || input.view === "hierarchy") {
    return {
      labels: {
        addPrimary: "Adicionar pagina",
        addDialogTitle: "QuickAdd de estrutura",
        addDialogHint: "Adicione paginas e niveis da estrutura.",
        addConfirm: "Adicionar pagina",
      },
      quickAdd: {
        defaultNodeKind: "page",
        defaultEdgeKind: "contains",
      },
    };
  }

  return {
    labels: {
      addPrimary: "Adicionar item",
      addDialogTitle: "QuickAdd",
      addDialogHint: "Adicione itens e conecte rapidamente.",
      addConfirm: "Adicionar item",
    },
    quickAdd: {
      defaultNodeKind: "note",
      defaultEdgeKind: "relates-to",
    },
  };
}

function buildFallbackActions(view: InitialView): RecipeAction[] {
  if (view === "erd") {
    return [
      {
        id: "add-entity",
        label: "Adicionar entidade",
        description: "Cria uma nova entidade com campos iniciais.",
      },
      {
        id: "add-relationship",
        label: "Definir relacao",
        description: "Cria relacao com cardinalidade inicial.",
      },
    ];
  }

  if (view === "flow") {
    return [
      {
        id: "add-step",
        label: "Adicionar etapa",
        description: "Inclui uma etapa no fluxo.",
      },
      {
        id: "add-decision",
        label: "Adicionar decisao",
        description: "Insere um ponto de decisao no fluxo.",
      },
    ];
  }

  if (view === "sitemap") {
    return [
      {
        id: "add-page",
        label: "Adicionar pagina",
        description: "Cria uma nova pagina no mapa.",
      },
      {
        id: "add-section",
        label: "Adicionar secao",
        description: "Cria uma secao principal de navegacao.",
      },
    ];
  }

  if (view === "hierarchy") {
    return [
      {
        id: "add-root-child",
        label: "Adicionar filho",
        description: "Adiciona um novo no filho.",
      },
      {
        id: "add-level",
        label: "Adicionar nivel",
        description: "Cria um novo nivel hierarquico.",
      },
    ];
  }

  return [
    {
      id: "add-item",
      label: "Adicionar item",
      description: "Adiciona um novo item ao mapa.",
    },
    {
      id: "add-connection",
      label: "Adicionar conexao",
      description: "Conecta dois itens do mapa.",
    },
  ];
}

function buildFallbackSeedPlan(view: InitialView): RecipeSeedPlan {
  if (view === "erd") {
    return {
      kind: "erd-native",
      description: "Entidades e relacoes nativas.",
    };
  }
  if (view === "flow") {
    return {
      kind: "flow-native",
      description: "Fluxo nativo com etapas iniciais.",
    };
  }
  if (view === "sitemap") {
    return {
      kind: "sitemap-native",
      description: "Sitemap nativo com Home e secoes.",
    };
  }
  if (view === "hierarchy") {
    return {
      kind: "hierarchy-native",
      description: "Hierarquia nativa com raiz inicial.",
    };
  }

  if (view === "mindmap") {
    return {
      kind: "mindmap-native",
      description: "Mapa mental nativo com tema central.",
    };
  }

  if (view === "timeline") {
    return {
      kind: "timeline-native",
      description: "Timeline nativa com marcos iniciais.",
    };
  }

  return {
    kind: "graph-native",
    description: "Grafo nativo com nucleo e conexoes.",
  };
}

function buildFallbackContextBlocks(view: InitialView): RecipeContextBlock[] {
  if (view === "erd") {
    return ["setup", "erd"];
  }
  if (view === "flow") {
    return ["setup", "flow"];
  }
  if (view === "sitemap") {
    return ["setup", "sitemap"];
  }
  if (view === "hierarchy") {
    return ["setup", "hierarchy"];
  }

  return ["setup", "graph"];
}

function buildFallbackLayoutCatalog(view: InitialView): RecipeLayoutCatalog {
  if (view === "erd") {
    return {
      recommended: ["relational", "auto"],
      advanced: ["free"],
    };
  }
  if (view === "flow") {
    return {
      recommended: ["horizontal", "vertical", "auto"],
      advanced: ["free"],
    };
  }
  if (view === "sitemap" || view === "hierarchy") {
    return {
      recommended: ["vertical", "horizontal", "auto"],
      advanced: ["free"],
    };
  }
  if (view === "mindmap") {
    return {
      recommended: ["radial", "auto"],
      advanced: ["free"],
    };
  }

  return {
    recommended: ["auto", "free"],
    advanced: ["vertical", "horizontal", "radial", "relational"],
  };
}

function validateDataModelErdStrict(draft: AssistantDraft) {
  const blockingIssues: string[] = [];
  const warnings: string[] = [];

  if (
    draft.startStrategy === "import" &&
    !isSourceStatusValidForStrictPhase({
      strategy: draft.startStrategy,
      sourceStatus: draft.sourceStatus,
    })
  ) {
    blockingIssues.push(
      "Importacao exige fonte em estado 'Pronta para tentar importar' ou 'Importada com sucesso'.",
    );
  }

  if (draft.startStrategy === "template") {
    warnings.push(
      "Template ativo: valide fonte depois caso precise sincronizar o ERD com sistema externo.",
    );
  }

  return buildStrictResult(blockingIssues, warnings);
}

function validateProcessFlowStrict(draft: AssistantDraft) {
  const blockingIssues: string[] = [];
  const warnings: string[] = [];
  const shouldCreateStartEnd = draft.context.flow?.autoCreateStartEnd ?? true;
  const createExamples = draft.context.setup?.createExamples ?? true;

  if (shouldCreateStartEnd && !createExamples) {
    blockingIssues.push(
      "Com 'Criar inicio e fim automaticamente' ativo, habilite 'Criar exemplos automaticos' para gerar o plano inicial.",
    );
  }

  if ((draft.context.flow?.allowMultipleOutputs ?? false) && !shouldCreateStartEnd) {
    warnings.push(
      "Multiplas saidas ativas sem inicio/fim automatico: revise consistencia do fluxo no editor.",
    );
  }

  return buildStrictResult(blockingIssues, warnings);
}

function validateInfoSitemapStrict(draft: AssistantDraft) {
  const blockingIssues: string[] = [];
  const autoCreateHome = draft.context.sitemap?.autoCreateHome ?? true;
  const createExamples = draft.context.setup?.createExamples ?? true;

  if (autoCreateHome && !createExamples) {
    blockingIssues.push(
      "Com 'Criar Home automaticamente' ativo, habilite 'Criar exemplos automaticos' para gerar a Home inicial.",
    );
  }

  return buildStrictResult(blockingIssues);
}

function validateInfoHierarchyStrict(draft: AssistantDraft) {
  const blockingIssues: string[] = [];
  const createRoot = draft.context.hierarchy?.createRoot ?? true;
  const createExamples = draft.context.setup?.createExamples ?? true;

  if (createRoot && !createExamples) {
    blockingIssues.push(
      "Com 'Criar no raiz' ativo, habilite 'Criar exemplos automaticos' para gerar a raiz inicial.",
    );
  }

  return buildStrictResult(blockingIssues);
}

function validateSystemGraphStrict(draft: AssistantDraft) {
  const blockingIssues: string[] = [];
  const createExamples = draft.context.setup?.createExamples ?? true;

  if (draft.profile !== "blank" && draft.profile !== "mixed" && !createExamples) {
    blockingIssues.push(
      "Para este escopo, mantenha 'Criar exemplos automaticos' ativo para garantir no nucleo inicial no grafo.",
    );
  }

  return buildStrictResult(blockingIssues);
}

const recipeList = [
  {
    id: "data-model:erd",
    profile: "data-model",
    view: "erd",
    recommendedInitialViews: ["erd", "graph", "free"],
    defaultLayoutCatalog: {
      recommended: ["relational", "auto"],
      advanced: ["free"],
    },
    defaultAutomation: {
      toggles: DEFAULT_AUTOMATION_TOGGLES,
      copy: DEFAULT_AUTOMATION_COPY,
    },
    nativeSeed: {
      kind: "erd-native",
      description: "Entidades e relacionamentos nativos de modelo de dados.",
    },
    contextBlocks: ["setup", "erd"],
    validationRules: {
      draft: [
        "Permite rascunho com estrategia e visao coerentes.",
        "Exige layout valido para ERD.",
      ],
      guided: [
        "Se importar, requer fonte selecionada e configuracao minima.",
        "Aplica checagem de contexto ERD no assistente.",
      ],
      strict: [
        "Importacao exige estado de fonte pronto para tentativa ou importado.",
      ],
    },
    persona: {
      labels: {
        addPrimary: "Adicionar entidade",
        addDialogTitle: "QuickAdd de entidades",
        addDialogHint: "Crie entidades com campos, PK/FK e cardinalidade.",
        addConfirm: "Adicionar entidade",
        quickActionHint: "Acao recomendada: Definir cardinalidade",
      },
      quickAdd: {
        defaultNodeKind: "entity",
        defaultEdgeKind: "references",
      },
    },
    actions: [
      {
        id: "add-entity",
        label: "Adicionar entidade",
        description: "Cria uma nova entidade.",
      },
      {
        id: "define-cardinality",
        label: "Definir cardinalidade",
        description: "Define cardinalidade entre entidades.",
      },
    ],
  },
  {
    id: "process:flow",
    profile: "process",
    view: "flow",
    recommendedInitialViews: ["flow", "hierarchy", "timeline"],
    defaultLayoutCatalog: {
      recommended: ["horizontal", "vertical", "auto"],
      advanced: ["free"],
    },
    defaultAutomation: {
      toggles: DEFAULT_AUTOMATION_TOGGLES,
      copy: DEFAULT_AUTOMATION_COPY,
    },
    nativeSeed: {
      kind: "flow-native",
      description: "Fluxo nativo com inicio/fim e etapas.",
    },
    contextBlocks: ["setup", "flow"],
    validationRules: {
      draft: [
        "Aceita criacao manual/template para fluxos simples.",
      ],
      guided: [
        "Recomenda inicio/fim automatico para acelerar o primeiro mapa.",
      ],
      strict: [
        "Com inicio/fim automatico ativo, deve existir plano real para gerar esses nos.",
      ],
    },
    persona: {
      labels: {
        addPrimary: "Adicionar atividade",
        addDialogTitle: "QuickAdd de processo",
        addDialogHint:
          "Adicione atividades, decisoes, encerramentos e observacoes do fluxo operacional.",
        addConfirm: "Inserir no fluxo",
        quickActionHint: "Sugestao: continue o fluxo ou abra uma bifurcacao quando houver regra.",
      },
      quickAdd: {
        defaultNodeKind: "flow-step",
        defaultEdgeKind: "flows-to",
      },
    },
    actions: [
      {
        id: "add-step",
        label: "Adicionar etapa",
        description: "Inclui uma etapa no fluxo.",
      },
      {
        id: "add-decision",
        label: "Adicionar decisao",
        description: "Insere um ponto de decisao.",
      },
    ],
  },
  {
    id: "information-structure:sitemap",
    profile: "information-structure",
    view: "sitemap",
    recommendedInitialViews: ["sitemap", "hierarchy", "graph"],
    defaultLayoutCatalog: {
      recommended: ["vertical", "horizontal", "auto"],
      advanced: ["free"],
    },
    defaultAutomation: {
      toggles: DEFAULT_AUTOMATION_TOGGLES,
      copy: DEFAULT_AUTOMATION_COPY,
    },
    nativeSeed: {
      kind: "sitemap-native",
      description: "Mapa de navegacao com Home e secoes.",
    },
    contextBlocks: ["setup", "sitemap"],
    validationRules: {
      draft: ["Aceita rascunho com estrutura de navegacao inicial."],
      guided: ["Recomenda Home automatica e secoes principais."],
      strict: [
        "Com Home automatica ativa, deve existir plano real para gerar a Home.",
      ],
    },
    persona: {
      labels: {
        addPrimary: "Adicionar pagina",
        addDialogTitle: "QuickAdd de paginas",
        addDialogHint: "Crie paginas e secoes com navegacao coerente.",
        addConfirm: "Adicionar pagina",
      },
      quickAdd: {
        defaultNodeKind: "page",
        defaultEdgeKind: "contains",
      },
    },
    actions: [
      {
        id: "add-page",
        label: "Adicionar pagina",
        description: "Cria uma pagina no sitemap.",
      },
      {
        id: "add-navigation-path",
        label: "Adicionar caminho",
        description: "Cria caminho de navegacao entre paginas.",
      },
    ],
  },
  {
    id: "information-structure:hierarchy",
    profile: "information-structure",
    view: "hierarchy",
    recommendedInitialViews: ["hierarchy", "sitemap", "graph"],
    defaultLayoutCatalog: {
      recommended: ["vertical", "horizontal", "auto"],
      advanced: ["free"],
    },
    defaultAutomation: {
      toggles: DEFAULT_AUTOMATION_TOGGLES,
      copy: DEFAULT_AUTOMATION_COPY,
    },
    nativeSeed: {
      kind: "hierarchy-native",
      description: "Hierarquia nativa com raiz e profundidade inicial.",
    },
    contextBlocks: ["setup", "hierarchy"],
    validationRules: {
      draft: ["Permite estruturar niveis sem obrigar importacao."],
      guided: ["Recomenda no raiz e direcao explicita."],
      strict: ["Com no raiz ativo, deve existir plano real para gerar a raiz."],
    },
    persona: {
      labels: {
        addPrimary: "Adicionar secao",
        addDialogTitle: "QuickAdd de secoes",
        addDialogHint: "Estruture secoes com hierarquia consistente.",
        addConfirm: "Adicionar secao",
      },
      quickAdd: {
        defaultNodeKind: "page",
        defaultEdgeKind: "contains",
      },
    },
    actions: [
      {
        id: "add-section",
        label: "Adicionar secao",
        description: "Cria uma nova secao hierarquica.",
      },
      {
        id: "add-child-node",
        label: "Adicionar filho",
        description: "Cria um filho para o no selecionado.",
      },
    ],
  },
  {
    id: "system-architecture:graph",
    profile: "system-architecture",
    view: "graph",
    recommendedInitialViews: ["graph", "hierarchy", "flow"],
    defaultLayoutCatalog: {
      recommended: ["auto", "free"],
      advanced: ["vertical", "horizontal", "radial", "relational"],
    },
    defaultAutomation: {
      toggles: DEFAULT_AUTOMATION_TOGGLES,
      copy: DEFAULT_AUTOMATION_COPY,
    },
    nativeSeed: {
      kind: "graph-native",
      description: "Nucleo arquitetural com relacoes iniciais.",
    },
    contextBlocks: ["setup", "graph"],
    validationRules: {
      draft: ["Aceita configuracao com foco em relacoes de servicos."],
      guided: ["Recomenda agrupamento automatico e reducao de cruzamentos."],
      strict: [
        "Para arquitetura, a aplicacao exige plano de seed com no nucleo inicial.",
      ],
    },
    persona: {
      labels: {
        addPrimary: "Adicionar componente",
        addDialogTitle: "QuickAdd de arquitetura",
        addDialogHint: "Mapeie componentes, interfaces e dependencias.",
        addConfirm: "Adicionar componente",
      },
      quickAdd: {
        defaultNodeKind: "entity",
        defaultEdgeKind: "depends-on",
      },
    },
    actions: [
      {
        id: "add-component",
        label: "Adicionar componente",
        description: "Cria um componente arquitetural.",
      },
      {
        id: "add-dependency",
        label: "Adicionar dependencia",
        description: "Conecta componentes por dependencia.",
      },
    ],
  },
] as const satisfies readonly CreationRecipe[];

const recipeById = new Map<string, CreationRecipe>(
  recipeList.map((recipe) => [recipe.id, recipe]),
);

const strictValidatorByRecipeId: Partial<
  Record<CreationRecipe["id"], (draft: AssistantDraft) => RecipeStrictValidationResult>
> = {
  "data-model:erd": validateDataModelErdStrict,
  "process:flow": validateProcessFlowStrict,
  "information-structure:sitemap": validateInfoSitemapStrict,
  "information-structure:hierarchy": validateInfoHierarchyStrict,
  "system-architecture:graph": validateSystemGraphStrict,
};

export function listCreationRecipes() {
  return [...recipeList];
}

export function resolveCreationRecipe(input: {
  profile: ProjectProfile;
  view: InitialView;
}) {
  return recipeById.get(`${input.profile}:${input.view}` as const);
}

export function resolveRecipeRuntime(input: {
  profile: ProjectProfile;
  view: InitialView;
}): RecipeRuntime {
  const recipe = resolveCreationRecipe(input);
  if (recipe) {
    return {
      recipeId: recipe.id,
      profile: recipe.profile,
      view: recipe.view,
      recommendedInitialViews: [...recipe.recommendedInitialViews],
      seedPlan: recipe.nativeSeed,
      layoutCatalog: recipe.defaultLayoutCatalog,
      strictRules: recipe.validationRules.strict,
      persona: recipe.persona,
      actions: recipe.actions,
      contextBlocks: recipe.contextBlocks,
      defaultAutomation: recipe.defaultAutomation,
    };
  }

  const fallbackLayout = buildFallbackLayoutCatalog(input.view);
  return {
    recipeId: `${input.profile}:${input.view}`,
    profile: input.profile,
    view: input.view,
    recommendedInitialViews: [input.view],
    seedPlan: buildFallbackSeedPlan(input.view),
    layoutCatalog: fallbackLayout,
    strictRules: [],
    persona: buildFallbackPersona(input),
    actions: buildFallbackActions(input.view),
    contextBlocks: buildFallbackContextBlocks(input.view),
    defaultAutomation: {
      toggles: DEFAULT_AUTOMATION_TOGGLES,
      copy: DEFAULT_AUTOMATION_COPY,
    },
  };
}

export function resolveRecipeLayoutCatalog(input: {
  profile?: ProjectProfile;
  view: InitialView;
  fallback: RecipeLayoutCatalog;
}) {
  if (!input.profile) {
    return input.fallback;
  }

  return resolveRecipeRuntime({
    profile: input.profile,
    view: input.view,
  }).layoutCatalog;
}

export function resolveRecipeContextBlocks(input: {
  profile?: ProjectProfile;
  view: InitialView;
  fallback: RecipeContextBlock[];
}) {
  if (!input.profile) {
    return input.fallback;
  }

  return resolveRecipeRuntime({
    profile: input.profile,
    view: input.view,
  }).contextBlocks;
}

export function resolveRecipeValidationRules(input: {
  profile: ProjectProfile;
  view: InitialView;
  phase: RecipeValidationPhase;
}) {
  return (
    resolveCreationRecipe({
      profile: input.profile,
      view: input.view,
    })?.validationRules[input.phase] ?? []
  );
}

export function resolveRecipePersona(input: {
  profile: ProjectProfile;
  view: InitialView;
}) {
  return resolveRecipeRuntime(input).persona;
}

export function resolveRecipeActions(input: {
  profile: ProjectProfile;
  view: InitialView;
}) {
  return resolveRecipeRuntime(input).actions;
}

export function isSourceStatusValidForStrictPhase(input: {
  strategy: StartStrategy;
  sourceStatus?: string;
}) {
  if (input.strategy !== "import") {
    return true;
  }

  const normalized = normalizeSourceStatusForValidation(input.sourceStatus);
  return normalized === STATUS_READY_FOR_ATTEMPT || normalized === STATUS_IMPORTED;
}

export function validateStrictByRecipe(draft: AssistantDraft): RecipeStrictValidationResult {
  const runtime = resolveRecipeRuntime({
    profile: draft.profile,
    view: draft.initialView,
  });
  const validator = strictValidatorByRecipeId[runtime.recipeId as CreationRecipe["id"]];
  const recipeResult = validator ? validator(draft) : buildStrictResult([]);

  const blockingIssues = [...recipeResult.blockingIssues];
  const warnings = [...recipeResult.warnings];

  if (
    draft.startStrategy === "import" &&
    !isSourceStatusValidForStrictPhase({
      strategy: draft.startStrategy,
      sourceStatus: draft.sourceStatus,
    })
  ) {
    blockingIssues.push(
      "Importacao exige status da fonte em 'Pronta para tentar importar' ou 'Importada com sucesso'.",
    );
  }

  if (
    draft.startStrategy === "hybrid" &&
    draft.startSource &&
    !draft.sourceConfig
  ) {
    warnings.push(
      "Modo hibrido sem configuracao de fonte: o mapa inicial sera criado sem importacao automatica.",
    );
  }

  return buildStrictResult(blockingIssues, warnings);
}
