import {
  AssistantDraftSchema,
  buildDefaultAutomationToggles,
  buildDefaultContextForView,
  getViewCompatibilityRank,
  normalizeLayoutForView,
  resolveRecommendedInitialView,
  resolveRecommendedLayout,
  type AssistantCreationSettings,
  type AssistantDraft,
  type DetailLevel,
  type InitialView,
  type ProjectProfile,
  type StartSource,
  type StartStrategy,
} from "@/src/modules/creation-assistant/domain";
import {
  resolveCreationContext,
  type ProjectTemplate,
} from "@/src/modules/projects/domain";

export type CreationAssistantMode = "new" | "existing";
export type StepId =
  | "project"
  | "scope"
  | "origin"
  | "view"
  | "adjustments"
  | "review";

export type CreationAssistantShellProps = {
  mode: CreationAssistantMode;
  fromProjectId?: string;
  initialProject?: {
    id: string;
    name: string;
    objective?: string;
    template: ProjectTemplate;
  };
  initialSettings?: AssistantCreationSettings | null;
  initialDraftState?: {
    draft: AssistantDraft;
    version: number;
    updatedAt: string;
  } | null;
  snapshotDiagramType?: string;
};

export const STEPS = [
  { id: "project", title: "Projeto", description: "Nome e objetivo do projeto." },
  { id: "scope", title: "Escopo", description: "Perfil do que voce quer mapear." },
  { id: "origin", title: "Origem", description: "Como comecar o mapa inicial." },
  { id: "view", title: "Visao inicial", description: "Modo de leitura inicial." },
  {
    id: "adjustments",
    title: "Ajustes",
    description: "Layout, detalhe, automacao e contexto.",
  },
  { id: "review", title: "Revisao", description: "Resumo final antes de criar." },
] as const;

export const PROFILES: Array<{
  value: ProjectProfile;
  title: string;
  description: string;
}> = [
  { value: "blank", title: "Em branco", description: "Comece sem estrutura fixa." },
  {
    value: "information-structure",
    title: "Estrutura da informacao",
    description: "Conteudo e navegacao.",
  },
  { value: "process", title: "Processo", description: "Etapas e decisoes." },
  {
    value: "data-model",
    title: "Modelo de dados",
    description: "Entidades e relacionamentos.",
  },
  {
    value: "system-architecture",
    title: "Arquitetura do sistema",
    description: "Servicos e dependencias.",
  },
  {
    value: "documents-governance",
    title: "Documentos e governanca",
    description: "Politicas e trilhas.",
  },
  { value: "mixed", title: "Misto", description: "Cenario hibrido." },
];

export const START_STRATEGIES: Array<{
  value: StartStrategy;
  title: string;
  description: string;
}> = [
  { value: "manual", title: "Criar manualmente", description: "Canvas limpo com edicao manual." },
  { value: "import", title: "Importar do sistema", description: "Partir de fonte estruturada." },
  { value: "template", title: "Usar modelo inicial", description: "Preset inicial recomendado." },
  {
    value: "hybrid",
    title: "Combinar importacao e edicao manual",
    description: "Importa e complementa manualmente.",
  },
];

export const DETAIL_LEVELS: DetailLevel[] = ["essential", "intermediate", "detailed"];
export const LOCAL_DRAFT_KEY = "mapia.creation-assistant.new-project.v1";

export const VIEW_DESCRIPTIONS: Record<InitialView, string> = {
  free: "Canvas livre para organizar ideias sem restricoes iniciais.",
  hierarchy: "Estrutura em niveis para organizacao pai-filho.",
  flow: "Fluxo de etapas com transicoes e decisoes.",
  graph: "Rede de relacoes entre elementos conectados.",
  erd: "Modelo entidade-relacionamento para dados.",
  sitemap: "Mapa de paginas e navegacao da informacao.",
  timeline: "Sequencia temporal de marcos e eventos.",
  mindmap: "Mapa mental com ramificacoes a partir de um tema central.",
};

export const GENERIC_SOURCE_KINDS = [
  "csv",
  "json",
  "spreadsheet",
  "cms-export",
  "existing-map",
  "document-repository",
  "custom-import",
  "sql-file",
  "relational-json",
  "code-routes",
  "folder-structure",
  "events",
  "yaml-json",
] as const satisfies readonly StartSource[];

export type GenericSourceConfig = Extract<
  NonNullable<AssistantDraft["sourceConfig"]>,
  { kind: (typeof GENERIC_SOURCE_KINDS)[number] }
>;

export type InitialDraftState = {
  draft: AssistantDraft;
  layoutWarning: string | null;
};

export function rankLabel(profile: ProjectProfile, view: InitialView) {
  const rank = getViewCompatibilityRank(profile, view);

  if (rank === "primary") return "Principal";
  if (rank === "secondary") return "Secundaria";
  if (rank === "experimental") return "Experimental";
  return "Incompativel";
}

export function isGenericSourceKind(
  kind: StartSource,
): kind is (typeof GENERIC_SOURCE_KINDS)[number] {
  return (GENERIC_SOURCE_KINDS as readonly string[]).includes(kind);
}

export function isGenericSourceConfig(
  sourceConfig: AssistantDraft["sourceConfig"] | undefined,
): sourceConfig is GenericSourceConfig {
  if (!sourceConfig) {
    return false;
  }

  return isGenericSourceKind(sourceConfig.kind as StartSource);
}

export function parseError(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }
  const record = payload as Record<string, unknown>;
  if (
    Array.isArray(record.blockingIssues) &&
    typeof record.blockingIssues[0] === "string"
  ) {
    return record.blockingIssues[0];
  }
  if (
    record.details &&
    typeof record.details === "object" &&
    Array.isArray((record.details as { blockingIssues?: unknown[] }).blockingIssues) &&
    typeof (record.details as { blockingIssues: unknown[] }).blockingIssues[0] === "string"
  ) {
    return (record.details as { blockingIssues: string[] }).blockingIssues[0];
  }
  return typeof record.message === "string" ? record.message : fallback;
}

export function buildInitialDraft(input: {
  initialProject?: CreationAssistantShellProps["initialProject"];
  initialSettings?: AssistantCreationSettings | null;
  initialDraftState?: CreationAssistantShellProps["initialDraftState"];
  snapshotDiagramType?: string;
}): InitialDraftState {
  if (input.initialDraftState?.draft) {
    const parsedDraft = AssistantDraftSchema.safeParse(input.initialDraftState.draft);
    if (parsedDraft.success) {
      return {
        draft: parsedDraft.data,
        layoutWarning: null,
      };
    }
  }

  const { context } = resolveCreationContext({
    creationSettings: input.initialSettings,
    snapshotDiagramType: input.snapshotDiagramType,
    template: input.initialProject?.template,
  });
  const profile = context.effectiveProfile;
  const initialView = context.effectiveInitialView ?? resolveRecommendedInitialView(profile);
  const normalized = normalizeLayoutForView({
    profile,
    initialView,
    layout: context.effectiveLayout,
  });
  const layoutWarning = context.warning ?? normalized.warning;
  const parsed = AssistantDraftSchema.safeParse({
    projectName: input.initialProject?.name ?? "Novo projeto",
    ...(input.initialProject?.objective
      ? { projectObjective: input.initialProject.objective }
      : {}),
    profile,
    startStrategy: input.initialSettings?.startStrategy ?? "manual",
    ...(input.initialSettings?.startSource
      ? { startSource: input.initialSettings.startSource }
      : {}),
    ...(input.initialSettings?.templatePreset
      ? { templatePreset: input.initialSettings.templatePreset }
      : {}),
    ...(input.initialSettings?.sourceConfig
      ? { sourceConfig: input.initialSettings.sourceConfig }
      : {}),
    ...(input.initialSettings?.sourceStatus
      ? { sourceStatus: input.initialSettings.sourceStatus }
      : {}),
    ...(input.initialSettings?.precheckResult
      ? { precheckResult: input.initialSettings.precheckResult }
      : {}),
    ...(input.initialSettings?.lastError ? { lastError: input.initialSettings.lastError } : {}),
    ...(input.initialSettings?.lastCheckedAt
      ? { lastCheckedAt: input.initialSettings.lastCheckedAt }
      : {}),
    initialView,
    layout: normalized.layout,
    detailLevel: input.initialSettings?.detailLevel ?? "intermediate",
    automation: input.initialSettings?.automation ?? buildDefaultAutomationToggles(),
    context: context.effectiveContextDefaults ?? buildDefaultContextForView(initialView, profile),
  });
  if (parsed.success) {
    return {
      draft: parsed.data,
      layoutWarning,
    };
  }

  return {
    draft: AssistantDraftSchema.parse({
      projectName: "Novo projeto",
      profile: "blank",
      startStrategy: "manual",
      initialView: "free",
      layout: resolveRecommendedLayout("free", "blank"),
      detailLevel: "intermediate",
      automation: buildDefaultAutomationToggles(),
      context: buildDefaultContextForView("free", "blank"),
    }),
    layoutWarning,
  };
}
