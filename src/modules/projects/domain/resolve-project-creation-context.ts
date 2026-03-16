import type {
  AssistantContext,
  AssistantCreationSettings,
  AssistantDraft,
} from "@/src/modules/creation-assistant/domain";
import {
  buildDefaultContextForView,
  normalizeLayoutForView,
  resolveCreationRecipe,
  resolveInitialViewFromDiagramType,
  resolveRecommendedLayout,
  type InitialView,
  type LayoutChoice,
  type ProjectProfile,
} from "@/src/modules/creation-assistant/domain";
import type { ProjectTemplate } from "./project";

export type ProjectCreationContextSource =
  | "draft"
  | "creation-settings"
  | "snapshot"
  | "template"
  | "defaults";

export type LegacyTemplateFallbackMode = "none" | "partial" | "full";

export type LegacyTemplateFallbackReason =
  | "none"
  | "missing_creation_settings"
  | "missing_recipe"
  | "invalid_settings"
  | "migration_gap"
  | "unknown";

export type ResolveProjectCreationContextInput = {
  draft?: Partial<AssistantDraft> | null;
  creationSettings?: AssistantCreationSettings | null;
  snapshotDiagramType?: string;
  template?: ProjectTemplate;
};

export type ProjectCreationDecisionTrace = {
  resolversUsed: string[];
  sources: {
    profile: ProjectCreationContextSource;
    initialView: ProjectCreationContextSource;
    layout: ProjectCreationContextSource;
    contextDefaults: ProjectCreationContextSource;
  };
  legacyTemplateFallback: {
    dependencyReal: boolean;
    fallbackMode: LegacyTemplateFallbackMode;
    fallbackReason: LegacyTemplateFallbackReason;
    riskTier: "none" | "low" | "high";
    fieldsFromTemplate: {
      profile: boolean;
      initialView: boolean;
      layout: boolean;
      contextDefaults: boolean;
    };
  };
};

export type ProjectCreationContext = {
  effectiveProfile: ProjectProfile;
  effectiveInitialView: InitialView;
  effectiveLayout: LayoutChoice;
  effectiveContextDefaults: AssistantContext;
  sources: {
    profile: ProjectCreationContextSource;
    initialView: ProjectCreationContextSource;
    layout: ProjectCreationContextSource;
    contextDefaults: ProjectCreationContextSource;
  };
  warning?: string;
  decisionTrace: ProjectCreationDecisionTrace;
};

function inferInitialViewFromTemplate(template?: ProjectTemplate): InitialView {
  if (template === "erd") {
    return "erd";
  }

  if (template === "flowchart") {
    return "flow";
  }

  if (template === "sitemap") {
    return "sitemap";
  }

  return "graph";
}

function inferProfileFromInitialView(initialView: InitialView): ProjectProfile {
  if (initialView === "erd") {
    return "data-model";
  }

  if (initialView === "flow") {
    return "process";
  }

  if (initialView === "sitemap" || initialView === "hierarchy") {
    return "information-structure";
  }

  if (initialView === "graph") {
    return "system-architecture";
  }

  if (initialView === "timeline") {
    return "documents-governance";
  }

  return "blank";
}

function hasContextDefaults(context: unknown) {
  return Boolean(
    context &&
      typeof context === "object" &&
      Object.keys(context as Record<string, unknown>).length > 0,
  );
}

function countTemplateFields(fields: ProjectCreationDecisionTrace["legacyTemplateFallback"]["fieldsFromTemplate"]) {
  return Object.values(fields).filter(Boolean).length;
}

export function resolveProjectCreationContext(
  input: ResolveProjectCreationContextInput,
): ProjectCreationContext {
  const profileFromDraft = input.draft?.profile;
  const profileFromSettings = input.creationSettings?.profile;
  const viewFromDraft = input.draft?.initialView;
  const viewFromSettings = input.creationSettings?.initialView;
  const viewFromSnapshot = resolveInitialViewFromDiagramType(
    input.snapshotDiagramType,
  );
  const viewFromTemplate = inferInitialViewFromTemplate(input.template);

  const effectiveInitialView =
    viewFromDraft ??
    viewFromSettings ??
    (input.snapshotDiagramType ? viewFromSnapshot : undefined) ??
    viewFromTemplate;
  const initialViewSource: ProjectCreationContextSource =
    viewFromDraft
      ? "draft"
      : viewFromSettings
        ? "creation-settings"
        : input.snapshotDiagramType
          ? "snapshot"
          : input.template
            ? "template"
            : "defaults";

  const effectiveProfile =
    profileFromDraft ??
    profileFromSettings ??
    inferProfileFromInitialView(effectiveInitialView);
  const profileSource: ProjectCreationContextSource =
    profileFromDraft
      ? "draft"
      : profileFromSettings
        ? "creation-settings"
        : initialViewSource === "snapshot" || initialViewSource === "template"
          ? initialViewSource
          : "defaults";

  const inputLayout = input.draft?.layout ?? input.creationSettings?.layout;
  const rawLayoutSource: ProjectCreationContextSource =
    input.draft?.layout
      ? "draft"
      : input.creationSettings?.layout
        ? "creation-settings"
        : initialViewSource === "template"
          ? "template"
          : initialViewSource === "snapshot"
            ? "snapshot"
            : "defaults";
  const normalizedLayout = normalizeLayoutForView({
    profile: effectiveProfile,
    initialView: effectiveInitialView,
    layout: inputLayout,
  });
  const effectiveLayout =
    normalizedLayout.layout ?? resolveRecommendedLayout(effectiveInitialView);
  const layoutSource: ProjectCreationContextSource = inputLayout
    ? rawLayoutSource
    : rawLayoutSource;

  const contextFromDraft = input.draft?.context;
  const contextFromSettings = input.creationSettings?.context;
  const contextDefaultsSource: ProjectCreationContextSource =
    hasContextDefaults(contextFromDraft)
      ? "draft"
      : hasContextDefaults(contextFromSettings)
        ? "creation-settings"
        : profileSource === "template" || initialViewSource === "template"
          ? "template"
          : profileSource === "snapshot" || initialViewSource === "snapshot"
            ? "snapshot"
            : "defaults";

  const defaultContext = buildDefaultContextForView(
    effectiveInitialView,
    effectiveProfile,
  );
  const effectiveContextDefaults = hasContextDefaults(contextFromDraft)
    ? { ...defaultContext, ...(contextFromDraft as AssistantContext) }
    : hasContextDefaults(contextFromSettings)
      ? { ...defaultContext, ...(contextFromSettings as AssistantContext) }
      : defaultContext;

  const fieldsFromTemplate = {
    profile: profileSource === "template",
    initialView: initialViewSource === "template",
    layout: layoutSource === "template",
    contextDefaults: contextDefaultsSource === "template",
  } as const;
  const templateFieldCount = countTemplateFields(fieldsFromTemplate);
  const dependencyReal = templateFieldCount > 0;

  const recipeMissing = !resolveCreationRecipe({
    profile: effectiveProfile,
    view: effectiveInitialView,
  });
  const missingCreationSettings = !input.creationSettings && !input.draft;
  const snapshotCouldNotResolve =
    Boolean(input.snapshotDiagramType) &&
    initialViewSource === "template" &&
    viewFromSnapshot === "free" &&
    input.snapshotDiagramType !== "graph";

  let fallbackReason: LegacyTemplateFallbackReason = "none";
  if (dependencyReal) {
    if (missingCreationSettings) {
      fallbackReason = "missing_creation_settings";
    } else if (recipeMissing) {
      fallbackReason = "missing_recipe";
    } else if (normalizedLayout.normalized) {
      fallbackReason = "invalid_settings";
    } else if (snapshotCouldNotResolve) {
      fallbackReason = "migration_gap";
    } else if (input.creationSettings || input.draft) {
      fallbackReason = "invalid_settings";
    } else {
      fallbackReason = "unknown";
    }
  }

  const fallbackMode: LegacyTemplateFallbackMode = !dependencyReal
    ? "none"
    : templateFieldCount >= 3
      ? "full"
      : "partial";

  const riskTier: ProjectCreationDecisionTrace["legacyTemplateFallback"]["riskTier"] =
    !dependencyReal ? "none" : templateFieldCount >= 2 ? "high" : "low";

  const resolversUsed = Array.from(
    new Set(
      [
        input.draft ? "draft" : null,
        input.creationSettings ? "creation-settings" : null,
        input.snapshotDiagramType ? "snapshot" : null,
        input.template ? "legacy-template" : null,
        "recipe-runtime",
        normalizedLayout.normalized ? "layout-normalizer" : null,
        profileSource === "defaults" ||
        initialViewSource === "defaults" ||
        layoutSource === "defaults" ||
        contextDefaultsSource === "defaults"
          ? "defaults"
          : null,
      ].filter((value): value is string => Boolean(value)),
    ),
  );

  const decisionTrace: ProjectCreationDecisionTrace = {
    resolversUsed,
    sources: {
      profile: profileSource,
      initialView: initialViewSource,
      layout: layoutSource,
      contextDefaults: contextDefaultsSource,
    },
    legacyTemplateFallback: {
      dependencyReal,
      fallbackMode,
      fallbackReason,
      riskTier,
      fieldsFromTemplate,
    },
  };

  return {
    effectiveProfile,
    effectiveInitialView,
    effectiveLayout,
    effectiveContextDefaults,
    sources: {
      profile: profileSource,
      initialView: initialViewSource,
      layout: layoutSource,
      contextDefaults: contextDefaultsSource,
    },
    decisionTrace,
    ...(normalizedLayout.warning ? { warning: normalizedLayout.warning } : {}),
  };
}

export function resolveCreationContext(input: ResolveProjectCreationContextInput) {
  const context = resolveProjectCreationContext(input);
  return {
    context,
    decisionTrace: context.decisionTrace,
  };
}
