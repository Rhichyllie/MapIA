import { describe, expect, it } from "vitest";
import { AssistantCreationSettingsSchema } from "@/src/modules/creation-assistant/domain";
import {
  getNextStepState,
  getPreviousStepIndex,
  resolveInitialAssistantState,
  resolveInitialStepState,
} from "./use-creation-assistant-state";

describe("useCreationAssistantState helpers", () => {
  it("initializes stepper state by mode", () => {
    expect(resolveInitialStepState("new")).toEqual({ stepIndex: 0, unlocked: 0 });
    expect(resolveInitialStepState("existing")).toEqual({
      stepIndex: 1,
      unlocked: 1,
    });
  });

  it("prefills existing project data without losing draft semantics", () => {
    const initialSettings = AssistantCreationSettingsSchema.parse({
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
    });

    const initial = resolveInitialAssistantState({
      mode: "existing",
      initialProject: {
        id: "e1983e4b-27f9-46db-9448-7d3897066e47",
        name: "Projeto legado",
        objective: "Mapear etapas",
        template: "flowchart",
      },
      initialSettings,
      initialDraftState: null,
    });

    expect(initial.stepState).toEqual({ stepIndex: 1, unlocked: 1 });
    expect(initial.hydratedInitialDraftState.draft.projectName).toBe("Projeto legado");
    expect(initial.hydratedInitialDraftState.draft.profile).toBe("process");
    expect(initial.hydratedInitialDraftState.draft.initialView).toBe("flow");
  });

  it("computes next/back transitions while draft payload stays untouched", () => {
    const originalDraftPayload = { projectName: "Mapa X" };
    const forward = getNextStepState({
      currentStepIndex: 0,
      currentUnlocked: 0,
      totalSteps: 6,
    });
    const backStepIndex = getPreviousStepIndex(forward.stepIndex);

    expect(forward).toEqual({ stepIndex: 1, unlocked: 1 });
    expect(backStepIndex).toBe(0);
    expect(originalDraftPayload.projectName).toBe("Mapa X");
  });
});
