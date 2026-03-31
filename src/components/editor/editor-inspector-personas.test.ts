import { describe, expect, it } from "vitest";
import {
  createOperationalNodeDraft,
  getFriendlyEdgeKindLabel,
  getFriendlyNodeKindLabel,
  mergeOperationalNodePayload,
} from "./editor-inspector-personas";

describe("editor-inspector-personas", () => {
  it("maps node and edge kinds to friendly labels", () => {
    expect(getFriendlyNodeKindLabel("page")).toBe("Secao");
    expect(getFriendlyNodeKindLabel("flow-step")).toBe("Etapa");
    expect(getFriendlyEdgeKindLabel("contains")).toBe("Contem");
    expect(getFriendlyEdgeKindLabel("relates-to")).toBe("Relaciona");
  });

  it("creates operational draft from payload", () => {
    const draft = createOperationalNodeDraft({
      label: "Cadastro",
      kind: "page",
      payload: {
        description: "Fluxo de cadastro",
        tags: ["onboarding", "portal"],
      },
    });

    expect(draft).toEqual({
      label: "Cadastro",
      kind: "page",
      diagramRole: undefined,
      description: "Fluxo de cadastro",
      tagsText: "onboarding, portal",
      owner: "",
      area: "",
      channel: "",
      criticality: "",
      sla: "",
      rule: "",
      exception: "",
    });
  });

  it("merges operational payload without losing unknown fields", () => {
    const merged = mergeOperationalNodePayload(
      {
        custom: { level: 2 },
        owner: "time-a",
        tags: ["old"],
        __mapia: {
          process: {
            owner: "time-a",
            channel: "portal",
          },
        },
      },
      {
        description: "Novo resumo",
        tagsText: "onboarding, portal, onboarding",
        owner: "time-a",
        area: "cadastro",
        channel: "portal",
        criticality: "high",
        sla: "24h",
        rule: "validar documentos",
        exception: "",
      },
    );

    expect(merged).toEqual({
      custom: { level: 2 },
      owner: "time-a",
      description: "Novo resumo",
      tags: ["onboarding", "portal"],
      __mapia: {
        process: {
          owner: "time-a",
          area: "cadastro",
          channel: "portal",
          criticality: "high",
          sla: "24h",
          rule: "validar documentos",
        },
      },
    });
  });

  it("removes description and tags when operational inputs are empty", () => {
    const merged = mergeOperationalNodePayload(
      {
        description: "remover",
        tags: ["remove"],
        keep: true,
      },
      {
        description: "   ",
        tagsText: " ,  , ",
        owner: "",
        area: "",
        channel: "",
        criticality: "",
        sla: "",
        rule: "",
        exception: "",
      },
    );

    expect(merged).toEqual({
      keep: true,
    });
  });
});
