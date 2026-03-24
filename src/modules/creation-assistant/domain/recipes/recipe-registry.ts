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

export type RecipeSeedPlan = {
  kind:
    | "erd-native"
    | "flow-native"
    | "sitemap-native"
    | "hierarchy-native"
    | "graph-native"
    | "mindmap-native"
    | "timeline-native";
};

export type RecipePersona = {
  quickAdd: {
    defaultNodeKind: NodeKind;
    defaultEdgeKind: EdgeKind;
  };
};

export type RecipeStrictValidationIssueCode =
  | "import_source_not_ready"
  | "process_auto_start_end_requires_examples"
  | "sitemap_auto_home_requires_examples"
  | "hierarchy_root_requires_examples"
  | "system_graph_requires_examples";

export type RecipeStrictValidationWarningCode =
  | "data_model_template_requires_source_validation"
  | "process_multiple_outputs_without_auto_start_end"
  | "hybrid_without_source_config_creates_manual_map";

export type RecipeStrictValidationResult = {
  ok: boolean;
  blockingIssueCodes: RecipeStrictValidationIssueCode[];
  warningCodes: RecipeStrictValidationWarningCode[];
};

export type CreationRecipe = {
  id: `${ProjectProfile}:${InitialView}`;
  profile: ProjectProfile;
  view: InitialView;
  recommendedInitialViews: InitialView[];
  defaultLayoutCatalog: RecipeLayoutCatalog;
  nativeSeed: RecipeSeedPlan;
  contextBlocks: RecipeContextBlock[];
  validationRules: RecipeValidationRules;
  persona: RecipePersona;
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
  contextBlocks: RecipeContextBlock[];
};

const STATUS_READY_FOR_ATTEMPT = "ready_to_attempt_import";
const STATUS_IMPORTED = "imported";

export const DEFAULT_AUTOMATION_TOGGLES: AutomationToggles = {
  inferRelations: true,
  createLinkFields: true,
  applySuggestedNames: true,
  autoOrganizeOnCreate: true,
  detectInconsistenciesEarly: true,
};

function buildStrictResult(
  blockingIssueCodes: RecipeStrictValidationIssueCode[],
  warningCodes: RecipeStrictValidationWarningCode[] = [],
): RecipeStrictValidationResult {
  const uniqueBlockingIssueCodes = [...new Set(blockingIssueCodes)];
  const uniqueWarningCodes = [...new Set(warningCodes)];

  return {
    ok: uniqueBlockingIssueCodes.length === 0,
    blockingIssueCodes: uniqueBlockingIssueCodes,
    warningCodes: uniqueWarningCodes,
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
      quickAdd: {
        defaultNodeKind: "entity",
        defaultEdgeKind: "references",
      },
    };
  }

  if (input.view === "flow") {
    return {
      quickAdd: {
        defaultNodeKind: "flow-step",
        defaultEdgeKind: "flows-to",
      },
    };
  }

  if (input.view === "sitemap" || input.view === "hierarchy") {
    return {
      quickAdd: {
        defaultNodeKind: "page",
        defaultEdgeKind: "contains",
      },
    };
  }

  return {
    quickAdd: {
      defaultNodeKind: "note",
      defaultEdgeKind: "relates-to",
    },
  };
}

function buildFallbackSeedPlan(view: InitialView): RecipeSeedPlan {
  if (view === "erd") {
    return {
      kind: "erd-native",
    };
  }
  if (view === "flow") {
    return {
      kind: "flow-native",
    };
  }
  if (view === "sitemap") {
    return {
      kind: "sitemap-native",
    };
  }
  if (view === "hierarchy") {
    return {
      kind: "hierarchy-native",
    };
  }

  if (view === "mindmap") {
    return {
      kind: "mindmap-native",
    };
  }

  if (view === "timeline") {
    return {
      kind: "timeline-native",
    };
  }

  return {
    kind: "graph-native",
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
  const blockingIssueCodes: RecipeStrictValidationIssueCode[] = [];
  const warningCodes: RecipeStrictValidationWarningCode[] = [];

  if (
    draft.startStrategy === "import" &&
    !isSourceStatusValidForStrictPhase({
      strategy: draft.startStrategy,
      sourceStatus: draft.sourceStatus,
    })
  ) {
    blockingIssueCodes.push("import_source_not_ready");
  }

  if (draft.startStrategy === "template") {
    warningCodes.push("data_model_template_requires_source_validation");
  }

  return buildStrictResult(blockingIssueCodes, warningCodes);
}

function validateProcessFlowStrict(draft: AssistantDraft) {
  const blockingIssueCodes: RecipeStrictValidationIssueCode[] = [];
  const warningCodes: RecipeStrictValidationWarningCode[] = [];
  const shouldCreateStartEnd = draft.context.flow?.autoCreateStartEnd ?? true;
  const createExamples = draft.context.setup?.createExamples ?? true;

  if (shouldCreateStartEnd && !createExamples) {
    blockingIssueCodes.push("process_auto_start_end_requires_examples");
  }

  if ((draft.context.flow?.allowMultipleOutputs ?? false) && !shouldCreateStartEnd) {
    warningCodes.push("process_multiple_outputs_without_auto_start_end");
  }

  return buildStrictResult(blockingIssueCodes, warningCodes);
}

function validateInfoSitemapStrict(draft: AssistantDraft) {
  const blockingIssueCodes: RecipeStrictValidationIssueCode[] = [];
  const autoCreateHome = draft.context.sitemap?.autoCreateHome ?? true;
  const createExamples = draft.context.setup?.createExamples ?? true;

  if (autoCreateHome && !createExamples) {
    blockingIssueCodes.push("sitemap_auto_home_requires_examples");
  }

  return buildStrictResult(blockingIssueCodes);
}

function validateInfoHierarchyStrict(draft: AssistantDraft) {
  const blockingIssueCodes: RecipeStrictValidationIssueCode[] = [];
  const createRoot = draft.context.hierarchy?.createRoot ?? true;
  const createExamples = draft.context.setup?.createExamples ?? true;

  if (createRoot && !createExamples) {
    blockingIssueCodes.push("hierarchy_root_requires_examples");
  }

  return buildStrictResult(blockingIssueCodes);
}

function validateSystemGraphStrict(draft: AssistantDraft) {
  const blockingIssueCodes: RecipeStrictValidationIssueCode[] = [];
  const createExamples = draft.context.setup?.createExamples ?? true;

  if (draft.profile !== "blank" && draft.profile !== "mixed" && !createExamples) {
    blockingIssueCodes.push("system_graph_requires_examples");
  }

  return buildStrictResult(blockingIssueCodes);
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
    nativeSeed: {
      kind: "erd-native",
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
      quickAdd: {
        defaultNodeKind: "entity",
        defaultEdgeKind: "references",
      },
    },
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
    nativeSeed: {
      kind: "flow-native",
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
      quickAdd: {
        defaultNodeKind: "flow-step",
        defaultEdgeKind: "flows-to",
      },
    },
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
    nativeSeed: {
      kind: "sitemap-native",
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
      quickAdd: {
        defaultNodeKind: "page",
        defaultEdgeKind: "contains",
      },
    },
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
    nativeSeed: {
      kind: "hierarchy-native",
    },
    contextBlocks: ["setup", "hierarchy"],
    validationRules: {
      draft: ["Permite estruturar niveis sem obrigar importacao."],
      guided: ["Recomenda no raiz e direcao explicita."],
      strict: ["Com no raiz ativo, deve existir plano real para gerar a raiz."],
    },
    persona: {
      quickAdd: {
        defaultNodeKind: "page",
        defaultEdgeKind: "contains",
      },
    },
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
    nativeSeed: {
      kind: "graph-native",
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
      quickAdd: {
        defaultNodeKind: "entity",
        defaultEdgeKind: "depends-on",
      },
    },
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
      contextBlocks: recipe.contextBlocks,
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
    contextBlocks: buildFallbackContextBlocks(input.view),
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

  const blockingIssueCodes = [...recipeResult.blockingIssueCodes];
  const warningCodes = [...recipeResult.warningCodes];

  if (
    draft.startStrategy === "import" &&
    !isSourceStatusValidForStrictPhase({
      strategy: draft.startStrategy,
      sourceStatus: draft.sourceStatus,
    })
  ) {
    blockingIssueCodes.push("import_source_not_ready");
  }

  if (
    draft.startStrategy === "hybrid" &&
    draft.startSource &&
    !draft.sourceConfig
  ) {
    warningCodes.push("hybrid_without_source_config_creates_manual_map");
  }

  return buildStrictResult(blockingIssueCodes, warningCodes);
}
