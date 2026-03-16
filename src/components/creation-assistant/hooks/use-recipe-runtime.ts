import { useMemo } from "react";
import {
  getAllowedStartSourcesForProfile,
  getAllowedTemplatePresetsForProfile,
  getConnectorCapability,
  getContextBlocksForProfileView,
  getLayoutCatalogForView,
  getRecommendedViewsForProfile,
  resolveCreationRecipe,
  resolveRecipeRuntime,
  resolveRecommendedStartStrategy,
  type AssistantCreationSettings,
  type AssistantDraft,
} from "@/src/modules/creation-assistant/domain";

type UseRecipeRuntimeInput = {
  draft: AssistantDraft;
  fromProjectId?: string;
  initialSettings?: AssistantCreationSettings | null;
  initialDraftSourceConfig?: AssistantDraft["sourceConfig"];
};

export function resolveRecipeRuntimeState(input: UseRecipeRuntimeInput) {
  const recommendedViews = getRecommendedViewsForProfile(input.draft.profile);
  const startSources = getAllowedStartSourcesForProfile(input.draft.profile);
  const templatePresets = getAllowedTemplatePresetsForProfile(input.draft.profile);

  const connectorsAvailableForProfile = startSources.filter(
    (source) => getConnectorCapability(source) !== "configure_later",
  );

  const recommendedStartStrategy = resolveRecommendedStartStrategy({
    profile: input.draft.profile,
    connectorsAvailable: connectorsAvailableForProfile,
    fromProjectId: input.fromProjectId,
    hasPreviousSourceConfig: Boolean(
      input.initialSettings?.sourceConfig ?? input.initialDraftSourceConfig,
    ),
  });

  const recipeRuntime = resolveRecipeRuntime({
    profile: input.draft.profile,
    view: input.draft.initialView,
  });
  const resolvedRecipe = resolveCreationRecipe({
    profile: input.draft.profile,
    view: input.draft.initialView,
  });
  const layoutCatalog =
    recipeRuntime.layoutCatalog ??
    getLayoutCatalogForView(input.draft.initialView, input.draft.profile);

  const contextBlocks = new Set(
    recipeRuntime.contextBlocks.length > 0
      ? recipeRuntime.contextBlocks
      : getContextBlocksForProfileView({
          profile: input.draft.profile,
          initialView: input.draft.initialView,
        }),
  );

  return {
    recommendedViews,
    startSources,
    templatePresets,
    connectorsAvailableForProfile,
    recommendedStartStrategy,
    layoutCatalog,
    contextBlocks,
    recipeRuntime,
    recipeTrace: {
      recipeId: recipeRuntime.recipeId,
      recipeFound: Boolean(resolvedRecipe),
      fallbackUsed: !resolvedRecipe,
      ...(resolvedRecipe
        ? {}
        : {
            telemetry: {
              event: "creation_recipe_runtime_fallback",
              reason: "missing_recipe_registry",
            },
          }),
    },
  };
}

export function useRecipeRuntime(input: UseRecipeRuntimeInput) {
  return useMemo(
    () => resolveRecipeRuntimeState(input),
    [
      input.draft,
      input.fromProjectId,
      input.initialDraftSourceConfig,
      input.initialSettings,
    ],
  );
}
