import { useState } from "react";
import {
  AssistantDraftSchema,
  normalizeLayoutForView,
  type AssistantDraft,
  type InitialView,
  type LayoutChoice,
} from "@/src/modules/creation-assistant/domain";
import {
  buildInitialDraft,
  buildLocalizedDefaultContextForView,
  DEFAULT_INITIAL_DRAFT_LABELS,
  LOCAL_DRAFT_KEY,
  localizeAssistantDraftDefaults,
  type CreationAssistantDefaultLabels,
  type CreationAssistantMode,
  type CreationAssistantShellProps,
} from "../shared";

export type CreationAssistantStepState = {
  stepIndex: number;
  unlocked: number;
};

export function resolveInitialStepState(
  mode: CreationAssistantMode,
): CreationAssistantStepState {
  return mode === "existing"
    ? { stepIndex: 1, unlocked: 1 }
    : { stepIndex: 0, unlocked: 0 };
}

export function getPreviousStepIndex(currentStepIndex: number) {
  return Math.max(0, currentStepIndex - 1);
}

export function getNextStepState(input: {
  currentStepIndex: number;
  currentUnlocked: number;
  totalSteps: number;
}) {
  const nextStepIndex = Math.min(input.currentStepIndex + 1, input.totalSteps - 1);
  return {
    stepIndex: nextStepIndex,
    unlocked: Math.max(input.currentUnlocked, nextStepIndex),
  };
}

export function resolveInitialAssistantState(input: {
  mode: CreationAssistantMode;
  initialProject?: CreationAssistantShellProps["initialProject"];
  initialSettings?: CreationAssistantShellProps["initialSettings"];
  initialDraftState?: CreationAssistantShellProps["initialDraftState"];
  snapshotDiagramType?: string;
  snapshotDiagramView?: string;
  labels?: CreationAssistantDefaultLabels;
}) {
  const hydratedInitialDraftState = buildInitialDraft({
    initialProject: input.initialProject,
    initialSettings: input.initialSettings,
    initialDraftState: input.initialDraftState,
    snapshotDiagramType: input.snapshotDiagramType,
    snapshotDiagramView: input.snapshotDiagramView,
    labels: input.labels,
  });
  const stepState = resolveInitialStepState(input.mode);

  return {
    hydratedInitialDraftState,
    stepState,
    draftVersion: input.initialDraftState?.version ?? null,
  };
}

export function useCreationAssistantState(input: {
  mode: CreationAssistantMode;
  initialProject?: CreationAssistantShellProps["initialProject"];
  initialSettings?: CreationAssistantShellProps["initialSettings"];
  initialDraftState?: CreationAssistantShellProps["initialDraftState"];
  snapshotDiagramType?: string;
  snapshotDiagramView?: string;
  labels?: CreationAssistantDefaultLabels;
}) {
  const initialAssistantState = resolveInitialAssistantState(input);
  const hydratedInitialDraftState = initialAssistantState.hydratedInitialDraftState;

  const [draft, setDraft] = useState<AssistantDraft>(() => {
    if (input.mode !== "new" || typeof window === "undefined") {
      return hydratedInitialDraftState.draft;
    }

    const raw = window.localStorage.getItem(LOCAL_DRAFT_KEY);
    if (!raw) {
      return hydratedInitialDraftState.draft;
    }

    const parsed = AssistantDraftSchema.safeParse(JSON.parse(raw));
    return parsed.success
      ? localizeAssistantDraftDefaults(
          parsed.data,
          input.labels ?? DEFAULT_INITIAL_DRAFT_LABELS,
        )
      : hydratedInitialDraftState.draft;
  });
  const [legacyLayoutWarningCode] = useState(
    hydratedInitialDraftState.layoutWarningCode,
  );
  const [stepIndex, setStepIndex] = useState(initialAssistantState.stepState.stepIndex);
  const [unlocked, setUnlocked] = useState(initialAssistantState.stepState.unlocked);
  const [showAdvancedLayouts, setShowAdvancedLayouts] = useState(false);
  const [showAdvancedStructure, setShowAdvancedStructure] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [draftVersion, setDraftVersion] = useState<number | null>(initialAssistantState.draftVersion);

  function synchronizeDirectionalContext(nextDraft: AssistantDraft): AssistantDraft {
    if (nextDraft.initialView === "flow") {
      const baseFlow =
        nextDraft.context.flow ??
        buildLocalizedDefaultContextForView(
          "flow",
          nextDraft.profile,
          input.labels ?? DEFAULT_INITIAL_DRAFT_LABELS,
        ).flow;
      if (!baseFlow) {
        return nextDraft;
      }
      const nextDirection =
        nextDraft.layout === "vertical"
          ? "top-down"
          : nextDraft.layout === "horizontal"
            ? "left-right"
            : baseFlow.direction;

      return {
        ...nextDraft,
        context: {
          ...nextDraft.context,
          flow: {
            ...baseFlow,
            direction: nextDirection,
          },
        },
      };
    }

    if (nextDraft.initialView === "hierarchy") {
      const baseHierarchy =
        nextDraft.context.hierarchy ??
        buildLocalizedDefaultContextForView(
          "hierarchy",
          nextDraft.profile,
          input.labels ?? DEFAULT_INITIAL_DRAFT_LABELS,
        ).hierarchy;
      if (!baseHierarchy) {
        return nextDraft;
      }
      const nextDirection =
        nextDraft.layout === "horizontal"
          ? "left-right"
          : nextDraft.layout === "vertical"
            ? "top-down"
            : baseHierarchy.direction;

      return {
        ...nextDraft,
        context: {
          ...nextDraft.context,
          hierarchy: {
            ...baseHierarchy,
            direction: nextDirection,
          },
        },
      };
    }

    return nextDraft;
  }

  function updateDraft(updater: (current: AssistantDraft) => AssistantDraft) {
    setDraft((current) => updater(current));
  }

  function selectInitialView(nextView: InitialView) {
    setDraft((current) => {
      const normalized = normalizeLayoutForView({
        profile: current.profile,
        initialView: nextView,
        layout: current.layout,
      });
      return synchronizeDirectionalContext({
        ...current,
        initialView: nextView,
        layout: normalized.layout,
        context: {
          ...buildLocalizedDefaultContextForView(
            nextView,
            current.profile,
            input.labels ?? DEFAULT_INITIAL_DRAFT_LABELS,
          ),
          ...current.context,
        },
      });
    });
  }

  function selectLayout(nextLayout: LayoutChoice) {
    setDraft((current) =>
      synchronizeDirectionalContext({
        ...current,
        layout: nextLayout,
      }),
    );
  }

  return {
    draft,
    setDraft,
    updateDraft,
    legacyLayoutWarningCode,
    stepIndex,
    setStepIndex,
    unlocked,
    setUnlocked,
    showAdvancedLayouts,
    setShowAdvancedLayouts,
    showAdvancedStructure,
    setShowAdvancedStructure,
    isBusy,
    setIsBusy,
    error,
    setError,
    success,
    setSuccess,
    draftVersion,
    setDraftVersion,
    synchronizeDirectionalContext,
    selectInitialView,
    selectLayout,
  };
}
