import { describe, expect, it } from "vitest";
import {
  listCreationRecipes,
  resolveCreationRecipe,
  resolveRecipeContextBlocks,
  resolveRecipeLayoutCatalog,
  resolveRecipeRuntime,
  resolveRecipeValidationRules,
  validateStrictByRecipe,
} from "./recipe-registry";

describe("creation assistant recipe registry", () => {
  it("registers the five priority profile:view recipes", () => {
    const recipes = listCreationRecipes();
    expect(recipes).toHaveLength(5);
    expect(recipes.map((recipe) => recipe.id)).toEqual([
      "data-model:erd",
      "process:flow",
      "information-structure:sitemap",
      "information-structure:hierarchy",
      "system-architecture:graph",
    ]);
  });

  it("returns runtime as single source for layout/context/persona/seed", () => {
    const runtime = resolveRecipeRuntime({
      profile: "data-model",
      view: "erd",
    });

    expect(runtime.layoutCatalog.recommended).toEqual(["relational", "auto"]);
    expect(runtime.contextBlocks).toEqual(["setup", "erd"]);
    expect(runtime.seedPlan.kind).toBe("erd-native");
    expect(runtime.persona.quickAdd.defaultNodeKind).toBe("entity");
    expect(runtime.persona.quickAdd.defaultEdgeKind).toBe("references");
  });

  it("returns recipe-specific layout catalog and context blocks", () => {
    const erdLayout = resolveRecipeLayoutCatalog({
      profile: "data-model",
      view: "erd",
      fallback: {
        recommended: ["auto"],
        advanced: ["free"],
      },
    });
    expect(erdLayout.recommended).toEqual(["relational", "auto"]);

    const hierarchyContext = resolveRecipeContextBlocks({
      profile: "information-structure",
      view: "hierarchy",
      fallback: ["setup"],
    });
    expect(hierarchyContext).toEqual(["setup", "hierarchy"]);
  });

  it("exposes strict rules and validates with enforcement result", () => {
    const strictRules = resolveRecipeValidationRules({
      profile: "data-model",
      view: "erd",
      phase: "strict",
    });
    expect(strictRules.length).toBeGreaterThan(0);
    expect(strictRules.join(" ")).toContain("import");

    const strictValidation = validateStrictByRecipe({
      projectName: "Projeto",
      profile: "process",
      startStrategy: "manual",
      initialView: "flow",
      layout: "horizontal",
      detailLevel: "intermediate",
      automation: {
        inferRelations: true,
        createLinkFields: true,
        applySuggestedNames: true,
        autoOrganizeOnCreate: true,
        detectInconsistenciesEarly: true,
      },
      context: {
        setup: {
          createExamples: false,
          suggestedBlockCount: 3,
          createInitialRoot: false,
        },
        flow: {
          autoCreateStartEnd: true,
          allowDecisions: true,
          direction: "left-right",
          allowMultipleOutputs: false,
        },
      },
    });

    expect(strictValidation.ok).toBe(false);
    expect(strictValidation.blockingIssueCodes).toContain(
      "process_auto_start_end_requires_examples",
    );
  });

  it("falls back when recipe pair is not registered", () => {
    const fallbackLayout = resolveRecipeLayoutCatalog({
      profile: "blank",
      view: "free",
      fallback: {
        recommended: ["free", "auto"],
        advanced: ["vertical"],
      },
    });
    expect(fallbackLayout.recommended.length).toBeGreaterThan(0);
    expect(resolveCreationRecipe({ profile: "blank", view: "free" })).toBeUndefined();
  });
});
