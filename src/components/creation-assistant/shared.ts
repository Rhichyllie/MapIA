import {
  AssistantDraftSchema,
  buildDefaultAutomationToggles,
  buildDefaultContextForView,
  normalizeLayoutForView,
  resolveRecommendedInitialView,
  resolveRecommendedLayout,
  type AssistantCreationSettings,
  type AssistantContext,
  type AssistantDraft,
  type CreationAssistantValidationIssueCode,
  type DetailLevel,
  type InitialView,
  type LayoutNormalizationWarningCode,
  type ProjectProfile,
  type RecipeStrictValidationIssueCode,
  type StartSource,
  type StartStrategy,
} from "@/src/modules/creation-assistant/domain";
import ptBRMessages from "@/messages/pt-BR.json";
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
  snapshotDiagramView?: string;
};

export const STEP_IDS = [
  "project",
  "scope",
  "origin",
  "view",
  "adjustments",
  "review",
] as const satisfies readonly StepId[];

export const PROJECT_PROFILES = [
  "blank",
  "information-structure",
  "process",
  "data-model",
  "system-architecture",
  "documents-governance",
  "mixed",
] as const satisfies readonly ProjectProfile[];

export const START_STRATEGY_VALUES = [
  "manual",
  "import",
  "template",
  "hybrid",
] as const satisfies readonly StartStrategy[];

export const DETAIL_LEVELS: DetailLevel[] = ["essential", "intermediate", "detailed"];
export const LOCAL_DRAFT_KEY = "mapia.creation-assistant.new-project.v1";

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
  layoutWarningCode: LayoutNormalizationWarningCode | null;
};

export type CreationAssistantDefaultLabels = {
  projectName: string;
  rootName: string;
  hierarchyRootName: string;
};

export const DEFAULT_INITIAL_DRAFT_LABELS: CreationAssistantDefaultLabels = {
  projectName: ptBRMessages.Create.defaults.projectName,
  rootName: ptBRMessages.Create.defaults.rootName,
  hierarchyRootName: ptBRMessages.Create.defaults.hierarchyRootName,
};

const LEGACY_DEFAULT_SETUP_ROOT_NAMES = new Set([
  "No raiz",
  "Nucleo",
  "Root node",
  "Core",
]);

function resolveDefaultRootNameForView(
  initialView: InitialView,
  labels: CreationAssistantDefaultLabels,
) {
  return initialView === "hierarchy"
    ? labels.hierarchyRootName
    : labels.rootName;
}

export function localizeAssistantContextDefaults(
  context: AssistantContext,
  initialView: InitialView,
  labels: CreationAssistantDefaultLabels,
): AssistantContext {
  if (!context.setup) {
    return context;
  }

  const currentRootName = context.setup.initialRootName?.trim();
  const shouldReplaceRootName =
    !currentRootName ||
    LEGACY_DEFAULT_SETUP_ROOT_NAMES.has(currentRootName);

  if (!shouldReplaceRootName) {
    return context;
  }

  return {
    ...context,
    setup: {
      ...context.setup,
      initialRootName: resolveDefaultRootNameForView(initialView, labels),
    },
  };
}

export function buildLocalizedDefaultContextForView(
  initialView: InitialView,
  profile: ProjectProfile | undefined,
  labels: CreationAssistantDefaultLabels,
) {
  return localizeAssistantContextDefaults(
    buildDefaultContextForView(initialView, profile),
    initialView,
    labels,
  );
}

export function localizeAssistantDraftDefaults(
  draft: AssistantDraft,
  labels: CreationAssistantDefaultLabels,
): AssistantDraft {
  return {
    ...draft,
    context: localizeAssistantContextDefaults(
      draft.context,
      draft.initialView,
      labels,
    ),
  };
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

export function parseError(
  payload: unknown,
  fallback: string,
  resolveIssueCode?: (
    code: RecipeStrictValidationIssueCode | CreationAssistantValidationIssueCode,
    values?: Record<string, string | number>,
  ) => string,
) {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }
  const record = payload as Record<string, unknown>;

  if (
    Array.isArray(record.issues) &&
    typeof record.issues[0] === "object" &&
    record.issues[0] !== null
  ) {
    const firstIssue = record.issues[0] as {
      message?: unknown;
      params?: { i18nValues?: unknown };
    };
    if (typeof firstIssue.message === "string") {
      const values =
        firstIssue.params?.i18nValues &&
        typeof firstIssue.params.i18nValues === "object" &&
        !Array.isArray(firstIssue.params.i18nValues)
          ? (firstIssue.params.i18nValues as Record<string, string | number>)
          : undefined;
      return resolveIssueCode
        ? resolveIssueCode(
            firstIssue.message as
              | RecipeStrictValidationIssueCode
              | CreationAssistantValidationIssueCode,
            values,
          )
        : firstIssue.message;
    }
  }

  if (
    Array.isArray(record.blockingIssueCodes) &&
    typeof record.blockingIssueCodes[0] === "string"
  ) {
    const code = record.blockingIssueCodes[0] as RecipeStrictValidationIssueCode;
    return resolveIssueCode ? resolveIssueCode(code) : code;
  }
  if (
    Array.isArray(record.blockingIssues) &&
    typeof record.blockingIssues[0] === "string"
  ) {
    return record.blockingIssues[0];
  }
  if (
    record.details &&
    typeof record.details === "object" &&
    Array.isArray((record.details as { blockingIssueCodes?: unknown[] }).blockingIssueCodes) &&
    typeof (record.details as { blockingIssueCodes: unknown[] }).blockingIssueCodes[0] ===
      "string"
  ) {
    const code = (record.details as { blockingIssueCodes: string[] })
      .blockingIssueCodes[0] as RecipeStrictValidationIssueCode;
    return resolveIssueCode ? resolveIssueCode(code) : code;
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
  snapshotDiagramView?: string;
  labels?: CreationAssistantDefaultLabels;
}): InitialDraftState {
  const labels = input.labels ?? DEFAULT_INITIAL_DRAFT_LABELS;

  if (input.initialDraftState?.draft) {
    const parsedDraft = AssistantDraftSchema.safeParse(input.initialDraftState.draft);
    if (parsedDraft.success) {
      return {
        draft: localizeAssistantDraftDefaults(parsedDraft.data, labels),
        layoutWarningCode: null,
      };
    }
  }

  const { context } = resolveCreationContext({
    creationSettings: input.initialSettings,
    snapshotDiagramType: input.snapshotDiagramType,
    snapshotDiagramView: input.snapshotDiagramView,
    template: input.initialProject?.template,
  });
  const profile = context.effectiveProfile;
  const initialView = context.effectiveInitialView ?? resolveRecommendedInitialView(profile);
  const normalized = normalizeLayoutForView({
    profile,
    initialView,
    layout: context.effectiveLayout,
  });
  const layoutWarningCode = context.warningCode ?? normalized.warningCode;
  const parsed = AssistantDraftSchema.safeParse({
    projectName: input.initialProject?.name ?? labels.projectName,
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
    context: context.effectiveContextDefaults
      ? localizeAssistantContextDefaults(
          context.effectiveContextDefaults,
          initialView,
          labels,
        )
      : buildLocalizedDefaultContextForView(initialView, profile, labels),
  });
  if (parsed.success) {
    return {
      draft: localizeAssistantDraftDefaults(parsed.data, labels),
      layoutWarningCode,
    };
  }

  return {
    draft: AssistantDraftSchema.parse({
      projectName: labels.projectName,
      profile: "blank",
      startStrategy: "manual",
      initialView: "free",
      layout: resolveRecommendedLayout("free", "blank"),
      detailLevel: "intermediate",
      automation: buildDefaultAutomationToggles(),
      context: buildLocalizedDefaultContextForView("free", "blank", labels),
    }),
    layoutWarningCode,
  };
}
