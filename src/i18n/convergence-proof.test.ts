import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  normalizeLayoutForView,
  resolveRecipeRuntime,
  resolveRecommendedStartStrategy,
} from "@/src/modules/creation-assistant/domain";
import { resolveEditorPersona } from "@/src/modules/editor/domain";

function readRepoFile(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("i18n convergence proof", () => {
  it("keeps messages.ts bound only to the official JSON catalogs", () => {
    const source = readRepoFile("src/i18n/messages.ts");

    expect(source).toContain('import ptBRMessages from "@/messages/pt-BR.json"');
    expect(source).toContain('import enUSMessages from "@/messages/en-US.json"');
    expect(source).not.toContain("messages/editor");
    expect(source).not.toContain("ptBREditorMessages");
    expect(source).not.toContain("enUSEditorMessages");
  });

  it("keeps metadata localized through the locale segment instead of a single global title", () => {
    const rootLayoutSource = readRepoFile("app/layout.tsx");
    const localeLayoutSource = readRepoFile("app/[locale]/layout.tsx");
    const metadataSource = readRepoFile("src/i18n/metadata.ts");

    expect(rootLayoutSource).not.toContain("generateMetadata");
    expect(localeLayoutSource).toContain("generateMetadata");
    expect(localeLayoutSource).toContain("buildLocalizedLayoutMetadata");
    expect(metadataSource).toContain("Metadata.routes");
    expect(metadataSource).toContain("buildLocalizedPathname");
  });

  it("does not keep legacy editor catalog files on disk", () => {
    expect(existsSync(join(process.cwd(), "messages/editor"))).toBe(false);
  });

  it("keeps proxy locale resolution free of locale-specific branches", () => {
    const proxySource = readRepoFile("proxy.ts");
    const helperSource = readRepoFile("src/i18n/proxy-helpers.ts");
    const combinedSource = `${proxySource}\n${helperSource}`;

    expect(combinedSource).not.toContain('"en-US"');
    expect(helperSource).toContain("resolveLocaleFromPathname");
    expect(helperSource).toContain("buildLocalizedPathname");
  });

  it("keeps visible editor quick-add copy in the catalog layer instead of domain personas", () => {
    const shellSource = readRepoFile("src/components/editor/editor-shell.tsx");
    const recipeSource = readRepoFile(
      "src/modules/creation-assistant/domain/recipes/recipe-registry.ts",
    );
    const personaSource = readRepoFile("src/modules/editor/domain/editor-personas.ts");

    expect(shellSource).toContain("shell.quickAdd.copy.");
    expect(shellSource).not.toContain("editorPersona.labels");
    expect(recipeSource).not.toContain("addPrimary:");
    expect(recipeSource).not.toContain("addDialogTitle");
    expect(recipeSource).not.toContain("addDialogHint");
    expect(recipeSource).not.toContain("addConfirm");
    expect(recipeSource).not.toContain("quickActionHint");
    expect(personaSource).not.toContain("labels:");
  });

  it("keeps the visible locale switcher keyed by locale ids instead of hardcoded aliases", () => {
    const switcherSource = readRepoFile("src/components/i18n/locale-switcher.tsx");
    const helperSource = readRepoFile("src/i18n/locale-switcher.ts");

    expect(switcherSource).not.toContain("localeOptionKeys");
    expect(switcherSource).not.toContain("options.ptBR");
    expect(switcherSource).not.toContain("options.enUS");
    expect(helperSource).toContain("resolveLocaleSwitcherOptions");
  });

  it("keeps the visible switcher mounted only in the deliberate shell entry points", () => {
    const loginSource = readRepoFile("app/[locale]/login/page.tsx");
    const protectedShellSource = readRepoFile(
      "src/components/layout/protected-shell.tsx",
    );
    const dashboardSource = readRepoFile(
      "src/components/dashboard/dashboard-projects-panel.tsx",
    );
    const createShellSource = readRepoFile(
      "src/components/creation-assistant/creation-assistant-shell.tsx",
    );
    const editorShellSource = readRepoFile("src/components/editor/editor-shell.tsx");

    expect(loginSource).toContain("<LocaleSwitcher");
    expect(protectedShellSource).toContain("<LocaleSwitcher");
    expect(dashboardSource).not.toContain("LocaleSwitcher");
    expect(createShellSource).not.toContain("LocaleSwitcher");
    expect(editorShellSource).not.toContain("LocaleSwitcher");
  });

  it("keeps recipe and editor personas technical, without UI label payloads", () => {
    const recipeRuntime = resolveRecipeRuntime({
      profile: "process",
      view: "flow",
    });
    const editorPersona = resolveEditorPersona("process", "flow") as Record<
      string,
      unknown
    >;

    expect(Object.keys(recipeRuntime.persona)).toEqual(["quickAdd"]);
    expect("labels" in (recipeRuntime.persona as Record<string, unknown>)).toBe(
      false,
    );
    expect(editorPersona).toMatchObject({
      id: "process:flow",
      profile: "process",
      initialView: "flow",
      quickAdd: {
        defaultNodeKind: "flow-step",
        defaultEdgeKind: "flows-to",
      },
    });
    expect("labels" in editorPersona).toBe(false);
  });

  it("keeps creation assistant runtime aligned with canonical codes instead of localized payloads", () => {
    const originStepSource = readRepoFile(
      "src/components/creation-assistant/steps/origin-step.tsx",
    );
    const draftSyncSource = readRepoFile(
      "src/components/creation-assistant/hooks/use-creation-draft-sync.ts",
    );
    const sharedSource = readRepoFile(
      "src/components/creation-assistant/shared.ts",
    );
    const i18nSource = readRepoFile(
      "src/components/creation-assistant/creation-assistant-i18n.ts",
    );
    const domainSource = readRepoFile(
      "src/modules/creation-assistant/domain/creation-assistant.ts",
    );
    const recipeSource = readRepoFile(
      "src/modules/creation-assistant/domain/recipes/recipe-registry.ts",
    );
    const applyRouteSource = readRepoFile(
      "app/api/projects/[projectId]/creation-apply/route.ts",
    );
    const createRouteSource = readRepoFile(
      "app/api/projects/create-with-assistant/route.ts",
    );
    const useCasesSource = readRepoFile(
      "src/modules/creation-assistant/application/use-cases.ts",
    );
    const recommendation = resolveRecommendedStartStrategy({
      profile: "data-model",
      connectorsAvailable: ["prisma-schema"],
    }) as Record<string, unknown>;
    const normalizedLayout = normalizeLayoutForView({
      profile: "data-model",
      initialView: "erd",
      layout: "radial",
    }) as Record<string, unknown>;

    expect(originStepSource).toContain("recommendedStartStrategy.reasonCode");
    expect(originStepSource).not.toContain("recommendedStartStrategy.reason)");
    expect(draftSyncSource).toContain("getValidationIssueMessage");
    expect(sharedSource).toContain("record.issues");
    expect(i18nSource).toContain("getSourcePreviewCopy");
    expect(i18nSource).toContain("sourcePreviewSummaryPaths");
    expect(domainSource).toContain("summaryCode:");
    expect(domainSource).not.toContain("summary: preview.message");
    expect(domainSource).not.toContain('message: "Cole o schema Prisma');
    expect(domainSource).not.toContain('summary: "Verificacao inicial falhou."');
    expect(recipeSource).toContain("blockingIssueCodes.push");
    expect(recipeSource).not.toContain("blockingIssues.push(");
    expect(applyRouteSource).not.toContain("statusLabel");
    expect(applyRouteSource).not.toContain("whatWillBeCreated");
    expect(applyRouteSource).not.toContain("getSourceStatusPresentation");
    expect(createRouteSource).not.toContain("statusLabel");
    expect(createRouteSource).not.toContain("getSourceStatusPresentation");
    expect(useCasesSource).not.toContain("whatWillBeCreated");
    expect(recommendation).toEqual({
      strategy: "import",
      reasonCode: "data_model_structural_import",
    });
    expect("reason" in recommendation).toBe(false);
    expect(normalizedLayout).toMatchObject({
      layout: "auto",
      normalized: true,
      warningCode: "legacy_layout_normalized_to_auto",
    });
    expect("warning" in normalizedLayout).toBe(false);
  });

  it("keeps legacy textual compatibility isolated from canonical runtime emission", () => {
    const domainSource = readRepoFile(
      "src/modules/creation-assistant/domain/creation-assistant.ts",
    );
    const i18nSource = readRepoFile(
      "src/components/creation-assistant/creation-assistant-i18n.ts",
    );
    const sharedSource = readRepoFile(
      "src/components/creation-assistant/shared.ts",
    );
    const stateSource = readRepoFile(
      "src/components/creation-assistant/hooks/use-creation-assistant-state.ts",
    );
    const applyRouteSource = readRepoFile(
      "app/api/projects/[projectId]/creation-apply/route.ts",
    );
    const createRouteSource = readRepoFile(
      "app/api/projects/create-with-assistant/route.ts",
    );

    expect(domainSource).toContain('summaryCode: "legacy_runtime_text" as const');
    expect(i18nSource).toContain('descriptor.code === "legacy_runtime_text"');
    expect(sharedSource).toContain("hierarchyRootName");
    expect(stateSource).toContain("buildLocalizedDefaultContextForView");
    expect(applyRouteSource).not.toContain("legacy_runtime_text");
    expect(createRouteSource).not.toContain("legacy_runtime_text");
  });
});
