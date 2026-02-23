import { describe, expect, it } from "vitest";
import { WizardDraftSchema } from "./wizard-draft";

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
        },
      },
      createdAt: new Date("2026-02-23T00:00:00.000Z"),
      updatedAt: new Date("2026-02-23T00:00:00.000Z"),
    });

    expect(draft.payload.config.name).toBe("Mapa de onboarding");
    expect(draft.currentStep).toBe("config");
  });
});
