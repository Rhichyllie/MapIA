import { describe, expect, it } from "vitest";
import { resolveProjectCreationContext } from "./resolve-project-creation-context";

describe("resolveProjectCreationContext", () => {
  it("prioritizes creation settings over snapshot/template", () => {
    const result = resolveProjectCreationContext({
      creationSettings: {
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
        context: {},
      },
      snapshotDiagramType: "erd",
      template: "sitemap",
    });

    expect(result.effectiveProfile).toBe("process");
    expect(result.effectiveInitialView).toBe("flow");
    expect(result.effectiveLayout).toBe("horizontal");
    expect(result.sources.profile).toBe("creation-settings");
    expect(result.sources.initialView).toBe("creation-settings");
    expect(result.sources.layout).toBe("creation-settings");
    expect(result.decisionTrace.legacyTemplateFallback.dependencyReal).toBe(false);
  });

  it("falls back to snapshot diagram type when settings are missing", () => {
    const result = resolveProjectCreationContext({
      snapshotDiagramType: "erd",
      template: "graph",
    });

    expect(result.effectiveInitialView).toBe("erd");
    expect(result.effectiveProfile).toBe("data-model");
    expect(result.sources.initialView).toBe("snapshot");
    expect(result.sources.layout).toBe("snapshot");
    expect(result.decisionTrace.legacyTemplateFallback.dependencyReal).toBe(false);
  });

  it("falls back to template when settings and snapshot are missing", () => {
    const result = resolveProjectCreationContext({
      template: "sitemap",
    });

    expect(result.effectiveInitialView).toBe("sitemap");
    expect(result.effectiveProfile).toBe("information-structure");
    expect(result.sources.initialView).toBe("template");
    expect(result.sources.layout).toBe("template");
    expect(result.sources.contextDefaults).toBe("template");
    expect(result.decisionTrace.legacyTemplateFallback.dependencyReal).toBe(true);
    expect(result.decisionTrace.legacyTemplateFallback.fallbackMode).toBe("full");
    expect(result.decisionTrace.legacyTemplateFallback.fallbackReason).toBe(
      "missing_creation_settings",
    );
    expect(result.decisionTrace.legacyTemplateFallback.riskTier).toBe("high");
  });

  it("normalizes incompatible layout from legacy settings", () => {
    const result = resolveProjectCreationContext({
      creationSettings: {
        profile: "data-model",
        startStrategy: "manual",
        initialView: "erd",
        layout: "radial",
        detailLevel: "intermediate",
        automation: {
          inferRelations: true,
          createLinkFields: true,
          applySuggestedNames: true,
          autoOrganizeOnCreate: true,
          detectInconsistenciesEarly: true,
        },
        context: {},
      },
    });

    expect(result.effectiveLayout).toBe("auto");
    expect(result.warningCode).toBe("legacy_layout_normalized_to_auto");
    expect(result.decisionTrace.legacyTemplateFallback.dependencyReal).toBe(false);
  });

  it("keeps legacy projects without creation settings operable", () => {
    const result = resolveProjectCreationContext({});

    expect(result.effectiveInitialView).toBe("graph");
    expect(result.effectiveProfile).toBe("system-architecture");
    expect(result.sources.initialView).toBe("defaults");
    expect(result.sources.profile).toBe("defaults");
    expect(result.sources.layout).toBe("defaults");
    expect(result.decisionTrace.legacyTemplateFallback.dependencyReal).toBe(false);
    expect(result.decisionTrace.legacyTemplateFallback.fallbackMode).toBe("none");
  });

  it("marks partial template dependency when draft is incomplete and template fills gaps", () => {
    const result = resolveProjectCreationContext({
      draft: {
        layout: "auto",
        context: {
          setup: {
            createExamples: true,
            suggestedBlockCount: 3,
            createInitialRoot: false,
            initialRootName: "Nucleo",
          },
        },
      },
      template: "erd",
    });

    expect(result.sources.initialView).toBe("template");
    expect(result.sources.profile).toBe("template");
    expect(result.sources.layout).toBe("draft");
    expect(result.sources.contextDefaults).toBe("draft");
    expect(result.decisionTrace.legacyTemplateFallback.dependencyReal).toBe(true);
    expect(result.decisionTrace.legacyTemplateFallback.fallbackMode).toBe("partial");
    expect(result.decisionTrace.legacyTemplateFallback.fallbackReason).toBe("invalid_settings");
  });
});
