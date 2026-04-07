import { describe, expect, it } from "vitest";
import {
  AssistantDraftSchema,
  applyResolvedSourceLifecycleToDraft,
  getConnectorCapability,
  getContextBlocksForProfileView,
  getAllowedStartSourcesForProfile,
  getLayoutCatalogForView,
  getRecommendedViewsForProfile,
  getViewCompatibilityRank,
  isLayoutAllowedForView,
  resolveRecommendedStartStrategy,
  resolveDiagramIdentityForInitialView,
  resolveSourceConfigPreview,
  resolveSourceLifecycle,
  SourcePrecheckResultSchema,
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

  it("maps initialView to canonical diagram identity and keeps view separate", () => {
    expect(resolveDiagramIdentityForInitialView("hierarchy")).toEqual({
      diagramType: "tree",
      diagramView: "tree",
    });
    expect(resolveDiagramIdentityForInitialView("flow")).toEqual({
      diagramType: "flow",
      diagramView: "flow",
    });
    expect(resolveDiagramIdentityForInitialView("mindmap")).toEqual({
      diagramType: "mindmap",
      diagramView: "mindmap",
    });
    expect(resolveDiagramIdentityForInitialView("erd")).toEqual({
      diagramType: "graph",
      diagramView: "erd",
    });
    expect(resolveDiagramIdentityForInitialView("sitemap")).toEqual({
      diagramType: "tree",
      diagramView: "sitemap",
    });
    expect(resolveDiagramIdentityForInitialView("free")).toEqual({
      diagramType: "graph",
      diagramView: "graph",
    });
  });

  it("resolves recommended start strategy with explainable reason", () => {
    const dataModelRecommendation = resolveRecommendedStartStrategy({
      profile: "data-model",
      connectorsAvailable: ["prisma-schema", "postgres"],
    });
    expect(dataModelRecommendation.strategy).toBe("import");
    expect(dataModelRecommendation.reasonCode).toBe("data_model_structural_import");

    const existingProjectRecommendation = resolveRecommendedStartStrategy({
      profile: "mixed",
      connectorsAvailable: ["json", "csv"],
      fromProjectId: "00000000-0000-0000-0000-000000000001",
      hasPreviousSourceConfig: true,
    });
    expect(existingProjectRecommendation.strategy).toBe("hybrid");
    expect(existingProjectRecommendation.reasonCode).toBe(
      "existing_project_previous_source",
    );

    const dataModelDbRecommendation = resolveRecommendedStartStrategy({
      profile: "data-model",
      connectorsAvailable: ["postgres"],
    });
    expect(dataModelDbRecommendation.strategy).toBe("import");
    expect(dataModelDbRecommendation.reasonCode).toBe(
      "data_model_configurable_import",
    );
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
    expect(csvPreview?.summaryCode).toBe("csv_preview_columns_detected");

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
    expect(jsonPreview?.summaryCode).toBe("json_preview_recognized");

    const openApiPreview = resolveSourceConfigPreview({
      kind: "openapi",
      inputMode: "paste",
      specText: '{"openapi":"3.0.0","paths":{}}',
    });
    expect(openApiPreview?.status).toBe("ready");
    expect(openApiPreview?.recognizedAs).toBe("openapi");
    expect(openApiPreview?.summaryCode).toBe("openapi_preview_recognized");

    const graphQlPreview = resolveSourceConfigPreview({
      kind: "graphql",
      schemaText: "type Query { health: String }",
    });
    expect(graphQlPreview?.status).toBe("ready");
    expect(graphQlPreview?.recognizedAs).toContain("graphql");
    expect(graphQlPreview?.summaryCode).toBe("graphql_preview_recognized");
  });

  it("emits canonical preview and lifecycle descriptors without textual summary fields", () => {
    const preview = resolveSourceConfigPreview({
      kind: "openapi",
      inputMode: "paste",
      specText: JSON.stringify({
        openapi: "3.0.3",
        info: { title: "Platform API" },
        paths: {
          "/health": {
            get: {
              responses: {
                200: { description: "ok" },
              },
            },
          },
        },
      }),
    });

    expect(preview).not.toHaveProperty("message");
    expect(preview?.summaryCode).toBe("openapi_preview_recognized");
    expect(preview?.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "openapi_preview_format" }),
        expect.objectContaining({ code: "openapi_preview_title" }),
      ]),
    );
    expect(
      preview?.details?.some((detail) => detail.code === "legacy_runtime_text"),
    ).toBe(false);

    const lifecycle = resolveSourceLifecycle({
      startStrategy: "import",
      startSource: "openapi",
      sourceConfig: {
        kind: "openapi",
        inputMode: "paste",
        specText: '{"info":{"title":"API without marker"},"paths":{}}',
      },
    });

    expect(lifecycle.precheckResult).not.toHaveProperty("summary");
    expect(lifecycle.precheckResult?.summaryCode).toBe(
      "openapi_document_missing_spec_marker",
    );
    expect(lifecycle.precheckResult?.summaryCode).not.toBe("legacy_runtime_text");
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

  it("derives source lifecycle for import state", () => {
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
    expect(nextDraft.precheckResult?.summaryCode).toBe(
      "prisma_preview_models_detected",
    );
    expect("summary" in (nextDraft.precheckResult ?? {})).toBe(false);
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
  });

  it("keeps legacy textual precheck compatibility read-only", () => {
    const parsed = SourcePrecheckResultSchema.parse({
      level: "warning",
      summary: "Resumo legado",
      details: ["Detalhe legado"],
      recognizedAs: "legacy-source",
    });

    expect(parsed).toEqual({
      level: "warning",
      summaryCode: "legacy_runtime_text",
      summaryValues: { text: "Resumo legado" },
      details: [
        {
          code: "legacy_runtime_text",
          values: { text: "Detalhe legado" },
        },
      ],
      recognizedAs: "legacy-source",
    });
    expect("summary" in parsed).toBe(false);
  });
});
