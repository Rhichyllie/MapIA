import { describe, expect, it } from "vitest";
import enUSMessages from "@/messages/en-US.json";
import ptBRMessages from "@/messages/pt-BR.json";
import { createCreationAssistantLabels } from "./creation-assistant-i18n";
import { parseError } from "./shared";

describe("creation assistant shared helpers", () => {
  it("resolves validation issues from API payload codes in pt-BR", () => {
    const labels = createCreationAssistantLabels(ptBRMessages, "pt-BR");

    const message = parseError(
      {
        error: "VALIDATION_ERROR",
        issues: [
          {
            path: "sourceConfig.mapping.labelField",
            message: "generic_mapping_field_not_found",
            params: {
              i18nValues: {
                field: "titulo",
              },
            },
          },
        ],
      },
      "fallback",
      labels.hooks.getValidationIssueMessage,
    );

    expect(message).toBe("Campo mapeado nao encontrado no preview: titulo.");
  });

  it("resolves validation issues from API payload codes in en-US", () => {
    const labels = createCreationAssistantLabels(enUSMessages, "en-US");

    const message = parseError(
      {
        error: "VALIDATION_ERROR",
        issues: [
          {
            path: "sourceConfig.specText",
            message: "openapi_document_parse_failed",
          },
        ],
      },
      "fallback",
      labels.hooks.getValidationIssueMessage,
    );

    expect(message).toBe(
      "The document could not be parsed as valid JSON or YAML.",
    );
  });
});
