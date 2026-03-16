import { describe, expect, it } from "vitest";
import { AssistantDraftSchema, type AssistantDraft } from "@/src/modules/creation-assistant/domain";
import { resolveRecipeRuntimeState } from "./use-recipe-runtime";

function buildDraft(partial: Partial<AssistantDraft>): AssistantDraft {
  return AssistantDraftSchema.parse({
    projectName: "Projeto de teste",
    profile: "data-model",
    startStrategy: "manual",
    initialView: "erd",
    layout: "auto",
    detailLevel: "intermediate",
    automation: {
      inferRelations: true,
      createLinkFields: true,
      applySuggestedNames: true,
      autoOrganizeOnCreate: true,
      detectInconsistenciesEarly: true,
    },
    context: {},
    ...partial,
  });
}

describe("useRecipeRuntime helpers", () => {
  it("is deterministic for the same profile:view input", () => {
    const draft = buildDraft({
      profile: "data-model",
      initialView: "erd",
    });

    const first = resolveRecipeRuntimeState({ draft });
    const second = resolveRecipeRuntimeState({ draft });

    expect(first.recipeRuntime.recipeId).toBe("data-model:erd");
    expect(first.layoutCatalog).toEqual(second.layoutCatalog);
    expect(first.contextBlocks).toEqual(second.contextBlocks);
    expect(first.recommendedStartStrategy).toEqual(second.recommendedStartStrategy);
    expect(first.recipeTrace.fallbackUsed).toBe(false);
  });

  it("uses controlled fallback trace when recipe pair is missing", () => {
    const draft = buildDraft({
      profile: "blank",
      initialView: "timeline",
    });

    const runtime = resolveRecipeRuntimeState({ draft });

    expect(runtime.recipeTrace.recipeFound).toBe(false);
    expect(runtime.recipeTrace.fallbackUsed).toBe(true);
    expect(runtime.recipeTrace.telemetry?.event).toBe(
      "creation_recipe_runtime_fallback",
    );
    expect(runtime.recipeRuntime.recipeId).toBe("blank:timeline");
    expect(runtime.layoutCatalog.recommended.length).toBeGreaterThan(0);
  });
});
