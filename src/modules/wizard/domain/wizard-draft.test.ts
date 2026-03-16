import { describe, expect, it } from "vitest";
import {
  DEFAULT_WIZARD_ROOT_NODE_NAME,
  WizardDraftSchema,
  WizardReadyPayloadSchema,
} from "./wizard-draft";

describe("WizardDraftSchema", () => {
  it("parses a valid persisted wizard draft", () => {
    const draft = WizardDraftSchema.parse({
      id: "d1804af3-6829-44be-8ff2-fe6f969097e7",
      projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
      status: "draft",
      currentStep: "config",
      payload: {
        template: "graph",
        diagramType: "graph",
        dataSource: "manual",
        config: {
          name: "Mapa de onboarding",
          generateRootNode: true,
          rootNodeName: DEFAULT_WIZARD_ROOT_NODE_NAME,
          allowReapplyLayout: true,
        },
      },
      createdAt: new Date("2026-02-23T00:00:00.000Z"),
      updatedAt: new Date("2026-02-23T00:00:00.000Z"),
    });

    expect(draft.payload.config.name).toBe("Mapa de onboarding");
    expect(draft.currentStep).toBe("config");
  });

  it("accepts supported diagram type with matching layout options when ready", () => {
    const payload = WizardReadyPayloadSchema.parse({
      template: "graph",
      diagramType: "tree",
      layoutOptions: {
        type: "tree",
        direction: "top-down",
        nodeSpacingX: 240,
        nodeSpacingY: 160,
      },
      dataSource: "manual",
      config: {
        name: "Mapa tree",
        generateRootNode: true,
        rootNodeName: "Arquitetura Geral",
        allowReapplyLayout: false,
      },
    });

    expect(payload.diagramType).toBe("tree");
    expect(payload.layoutOptions?.type).toBe("tree");
    expect(payload.config.rootNodeName).toBe("Arquitetura Geral");
    expect(payload.config.allowReapplyLayout).toBe(false);
  });

  it("requires root node name when generateRootNode is enabled", () => {
    expect(() =>
      WizardReadyPayloadSchema.parse({
        template: "graph",
        diagramType: "tree",
        layoutOptions: {
          type: "tree",
          direction: "top-down",
          nodeSpacingX: 240,
          nodeSpacingY: 160,
        },
        dataSource: "manual",
        config: {
          name: "Mapa tree",
          generateRootNode: true,
          rootNodeName: "   ",
        },
      }),
    ).toThrow(/nome do no raiz inicial/i);
  });

  it("allows missing root node name when root generation is disabled", () => {
    const payload = WizardReadyPayloadSchema.parse({
      template: "graph",
      diagramType: "mindmap",
      layoutOptions: {
        type: "mindmap",
        radialSpacing: 220,
      },
      dataSource: "manual",
      config: {
        name: "Mapa mindmap",
        generateRootNode: false,
      },
    });

    expect(payload.config.generateRootNode).toBe(false);
    expect(payload.config.rootNodeName).toBeUndefined();
    expect(payload.config.allowReapplyLayout).toBe(true);
  });
});
