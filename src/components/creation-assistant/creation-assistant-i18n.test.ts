import { describe, expect, it } from "vitest";
import enUSMessages from "@/messages/en-US.json";
import ptBRMessages from "@/messages/pt-BR.json";
import {
  AssistantDraftSchema,
  resolveSourceConfigPreview,
} from "@/src/modules/creation-assistant/domain";
import { createCreationAssistantLabels } from "./creation-assistant-i18n";
import { resolveSourceStatusState } from "./hooks/use-source-status";

function buildDraft() {
  return AssistantDraftSchema.parse({
    projectName: "Projeto",
    profile: "information-structure",
    startStrategy: "import",
    startSource: "json",
    sourceConfig: {
      kind: "json",
      inputMode: "paste",
      text: '[{"id":"1","label":"Home"}]',
      previewRows: 5,
      hasHeader: true,
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
}

describe("creation assistant i18n", () => {
  it("resolves source preview copy in pt-BR from the official catalog", () => {
    const labels = createCreationAssistantLabels(ptBRMessages, "pt-BR");
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

    const copy = labels.getSourcePreviewCopy(preview);

    expect(copy?.summary).toContain("Reconhecimento preliminar OpenAPI concluido");
    expect(copy?.details).toContain("Formato: JSON");
    expect(copy?.details).toContain("Titulo: Platform API");
  });

  it("resolves source preview copy in en-US from the official catalog", () => {
    const labels = createCreationAssistantLabels(enUSMessages, "en-US");
    const preview = resolveSourceConfigPreview({
      kind: "csv",
      inputMode: "paste",
      text: "id,name,parent\n1,Home,\n2,Blog,1",
      delimiter: ",",
      previewRows: 5,
      hasHeader: true,
      mapping: {},
    });

    const copy = labels.getSourcePreviewCopy(preview);

    expect(copy?.summary).toBe("Preliminary recognition: 3 columns found.");
  });

  it("resolves precheck summary in pt-BR through canonical codes", () => {
    const labels = createCreationAssistantLabels(ptBRMessages, "pt-BR");
    const status = resolveSourceStatusState(buildDraft(), labels);

    expect(status.sourceStatusSummary).toContain("Pre-verificacao OK");
    expect(status.sourceStatusSummary).toContain(
      "JSON reconhecido no preview assistido para configuracao inicial.",
    );
  });

  it("resolves precheck summary in en-US through canonical codes", () => {
    const labels = createCreationAssistantLabels(enUSMessages, "en-US");
    const status = resolveSourceStatusState(buildDraft(), labels);

    expect(status.sourceStatusSummary).toContain("Precheck OK");
    expect(status.sourceStatusSummary).toContain(
      "JSON recognized in the assisted preview for the initial setup.",
    );
  });

  it("keeps legacy precheck payloads readable without reviving textual runtime emission", () => {
    const labels = createCreationAssistantLabels(enUSMessages, "en-US");
    const copy = labels.getSourcePrecheckCopy({
      level: "warning",
      summaryCode: "legacy_runtime_text",
      summaryValues: { text: "Legacy summary" },
      details: [
        {
          code: "legacy_runtime_text",
          values: { text: "Legacy detail" },
        },
      ],
    });

    expect(copy).toEqual({
      summary: "Legacy summary",
      details: ["Legacy detail"],
    });
  });
});
