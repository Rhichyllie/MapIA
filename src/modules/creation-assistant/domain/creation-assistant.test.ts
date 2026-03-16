import { describe, expect, it } from "vitest";
import {
  AssistantDraftSchema,
  applyResolvedSourceLifecycleToDraft,
  getConnectorCapability,
  getContextBlocksForProfileView,
  getAllowedStartSourcesForProfile,
  getLayoutCatalogForView,
  getSourceStatusLabel,
  getStartStrategyLabel,
  getRecommendedViewsForProfile,
  getViewCompatibilityRank,
  isLayoutAllowedForView,
  resolveRecommendedStartStrategy,
  resolveSourceConfigPreview,
  resolveDiagramTypeForInitialView,
} from "./creation-assistant";

describe("creation-assistant domain", () => {
  it("implements requested compatibility ranks including mixed refinement", () => {
    expect(getViewCompatibilityRank("blank", "free")).toBe("primary");
    expect(getViewCompatibilityRank("blank", "mindmap")).toBe("primary");
    expect(getViewCompatibilityRank("blank", "erd")).toBe("experimental");

    expect(getViewCompatibilityRank("information-structure", "sitemap")).toBe(
      "primary",
    );
    expect(getViewCompatibilityRank("information-structure", "erd")).toBe(
      "incompatible",
    );

    expect(getViewCompatibilityRank("process", "flow")).toBe("primary");
    expect(getViewCompatibilityRank("process", "sitemap")).toBe("incompatible");

    expect(getViewCompatibilityRank("data-model", "erd")).toBe("primary");
    expect(getViewCompatibilityRank("data-model", "hierarchy")).toBe(
      "experimental",
    );

    expect(getViewCompatibilityRank("mixed", "graph")).toBe("primary");
    expect(getViewCompatibilityRank("mixed", "free")).toBe("primary");
    expect(getViewCompatibilityRank("mixed", "flow")).toBe("secondary");
    expect(getViewCompatibilityRank("mixed", "mindmap")).toBe("experimental");
  });

  it("splits recommended and other blocks correctly", () => {
    const processViews = getRecommendedViewsForProfile("process");
    expect(processViews.recommended).toEqual(["flow"]);
    expect(processViews.other).toContain("hierarchy");
    expect(processViews.incompatible).toContain("erd");

    const mixedViews = getRecommendedViewsForProfile("mixed");
    expect(mixedViews.recommended).toEqual(["graph", "free"]);
    expect(mixedViews.other).toContain("flow");
    expect(mixedViews.other).toContain("mindmap");
  });

  it("validates start strategy with source/template/sourceConfig contracts", () => {
    const invalidTemplate = AssistantDraftSchema.safeParse({
      projectName: "Projeto",
      profile: "data-model",
      startStrategy: "template",
      startSource: "postgres",
      templatePreset: "erd-basic",
      initialView: "erd",
      layout: "relational",
      detailLevel: "intermediate",
      automation: {
        inferRelations: true,
        createLinkFields: true,
        applySuggestedNames: true,
        autoOrganizeOnCreate: true,
        detectInconsistenciesEarly: true,
      },
      context: {},
    });
    expect(invalidTemplate.success).toBe(false);

    const validImport = AssistantDraftSchema.safeParse({
      projectName: "Projeto",
      profile: "data-model",
      startStrategy: "import",
      startSource: "prisma-schema",
      sourceConfig: {
        kind: "prisma-schema",
        inputMode: "paste",
        schemaText: "model User { id String @id }",
      },
      initialView: "erd",
      layout: "relational",
      detailLevel: "intermediate",
      automation: {
        inferRelations: true,
        createLinkFields: true,
        applySuggestedNames: true,
        autoOrganizeOnCreate: true,
        detectInconsistenciesEarly: true,
      },
      context: {},
    });
    expect(validImport.success).toBe(true);
  });

  it("enforces layout catalog by view", () => {
    const erdCatalog = getLayoutCatalogForView("erd", "data-model");
    expect(erdCatalog.recommended).toEqual(["relational", "auto"]);
    expect(erdCatalog.advanced).toContain("free");

    expect(isLayoutAllowedForView("erd", "relational", "data-model")).toBe(true);
    expect(isLayoutAllowedForView("erd", "radial", "data-model")).toBe(false);

    expect(isLayoutAllowedForView("flow", "vertical", "process")).toBe(true);
    expect(isLayoutAllowedForView("flow", "relational", "process")).toBe(false);
  });

  it("validates start source whitelist per profile", () => {
    const processSources = getAllowedStartSourcesForProfile("process");
    expect(processSources).toEqual(["spreadsheet", "csv"]);
  });

  it("maps initialView to diagramType compatibly", () => {
    expect(resolveDiagramTypeForInitialView("hierarchy")).toBe("tree");
    expect(resolveDiagramTypeForInitialView("flow")).toBe("flow");
    expect(resolveDiagramTypeForInitialView("mindmap")).toBe("mindmap");
    expect(resolveDiagramTypeForInitialView("erd")).toBe("erd");
    expect(resolveDiagramTypeForInitialView("sitemap")).toBe("sitemap");
    expect(resolveDiagramTypeForInitialView("free")).toBe("graph");
  });

  it("resolves recommended start strategy with explainable reason", () => {
    const dataModelRecommendation = resolveRecommendedStartStrategy({
      profile: "data-model",
      connectorsAvailable: ["prisma-schema", "postgres"],
    });
    expect(dataModelRecommendation.strategy).toBe("import");
    expect(getStartStrategyLabel(dataModelRecommendation.strategy)).toBe(
      "Importar do sistema",
    );
    expect(dataModelRecommendation.reason.length).toBeGreaterThan(10);

    const existingProjectRecommendation = resolveRecommendedStartStrategy({
      profile: "mixed",
      connectorsAvailable: ["json", "csv"],
      fromProjectId: "00000000-0000-0000-0000-000000000001",
      hasPreviousSourceConfig: true,
    });
    expect(existingProjectRecommendation.strategy).toBe("hybrid");

    const dataModelDbRecommendation = resolveRecommendedStartStrategy({
      profile: "data-model",
      connectorsAvailable: ["postgres"],
    });
    expect(dataModelDbRecommendation.strategy).toBe("import");
  });

  it("classifies connectors with hardening capability model", () => {
    expect(getConnectorCapability("prisma-schema")).toBe("full_import");
    expect(getConnectorCapability("postgres")).toBe("configurable_import");
    expect(getConnectorCapability("openapi")).toBe("preview_only");
    expect(getConnectorCapability("csv")).toBe("preview_only");
  });

  it("builds source preview for csv/json/openapi/graphql", () => {
    const csvPreview = resolveSourceConfigPreview({
      kind: "csv",
      inputMode: "paste",
      text: "id,name,parent\n1,Home,\n2,Blog,1",
      delimiter: ",",
      hasHeader: true,
      previewRows: 5,
      mapping: {},
    });
    expect(csvPreview?.status).toBe("ready");
    expect(csvPreview?.fields).toContain("id");

    const jsonPreview = resolveSourceConfigPreview({
      kind: "json",
      inputMode: "paste",
      text: '[{"id":"1","label":"Home"}]',
      hasHeader: true,
      previewRows: 5,
      mapping: {},
    });
    expect(jsonPreview?.status).toBe("ready");
    expect(jsonPreview?.fields).toContain("id");

    const openApiPreview = resolveSourceConfigPreview({
      kind: "openapi",
      inputMode: "paste",
      specText: '{"openapi":"3.0.0","paths":{}}',
    });
    expect(openApiPreview?.status).toBe("ready");
    expect(openApiPreview?.recognizedAs).toBe("openapi");

    const graphQlPreview = resolveSourceConfigPreview({
      kind: "graphql",
      schemaText: "type Query { health: String }",
    });
    expect(graphQlPreview?.status).toBe("ready");
    expect(graphQlPreview?.recognizedAs).toContain("graphql");
  });

  it("resolves recipe context blocks for prioritized profile:view", () => {
    expect(
      getContextBlocksForProfileView({
        profile: "data-model",
        initialView: "erd",
      }),
    ).toEqual(["setup", "erd"]);

    expect(
      getContextBlocksForProfileView({
        profile: "system-architecture",
        initialView: "graph",
      }),
    ).toEqual(["setup", "graph"]);
  });

  it("derives source lifecycle and labels for import state", () => {
    const nextDraft = applyResolvedSourceLifecycleToDraft({
      projectName: "Projeto",
      profile: "data-model",
      startStrategy: "import",
      startSource: "prisma-schema",
      sourceConfig: {
        kind: "prisma-schema",
        inputMode: "paste",
        schemaText: "model User { id String @id }",
      },
      initialView: "erd",
      layout: "relational",
      detailLevel: "intermediate",
      automation: {
        inferRelations: true,
        createLinkFields: true,
        applySuggestedNames: true,
        autoOrganizeOnCreate: true,
        detectInconsistenciesEarly: true,
      },
      context: {},
    });

    expect(nextDraft.sourceStatus).toBe("ready_to_attempt_import");
    expect(nextDraft.precheckResult?.level).toBe("ok");
    expect(getSourceStatusLabel(nextDraft.sourceStatus!)).toContain("tentar");
  });

  it("derives precheck_ok for preview-only connectors", () => {
    const nextDraft = applyResolvedSourceLifecycleToDraft({
      projectName: "Projeto",
      profile: "information-structure",
      startStrategy: "import",
      startSource: "json",
      sourceConfig: {
        kind: "json",
        inputMode: "paste",
        text: '[{"id":"1","label":"Home"}]',
        hasHeader: true,
        previewRows: 5,
        mapping: {},
      },
      initialView: "sitemap",
      layout: "vertical",
      detailLevel: "intermediate",
      automation: {
        inferRelations: true,
        createLinkFields: true,
        applySuggestedNames: true,
        autoOrganizeOnCreate: true,
        detectInconsistenciesEarly: true,
      },
      context: {},
    });

    expect(nextDraft.sourceStatus).toBe("precheck_ok");
    expect(getSourceStatusLabel(nextDraft.sourceStatus!)).toContain("Pre-verificacao");
  });
});
