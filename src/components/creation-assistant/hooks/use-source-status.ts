import { useMemo } from "react";
import {
  getSourceStatusLabel,
  getSourceStatusSummary,
  resolveSourceLifecycle,
  type AssistantDraft,
} from "@/src/modules/creation-assistant/domain";

export function resolveSourceStatusState(draft: AssistantDraft) {
  const sourceLifecycle = resolveSourceLifecycle({
    startStrategy: draft.startStrategy,
    startSource: draft.startSource,
    sourceConfig: draft.sourceConfig,
    sourceStatus: draft.sourceStatus,
    precheckResult: draft.precheckResult,
    lastError: draft.lastError,
    lastCheckedAt: draft.lastCheckedAt,
  });

  const sourceStatusLabel = getSourceStatusLabel(sourceLifecycle.sourceStatus);
  const sourceStatusSummary = getSourceStatusSummary({
    sourceStatus: sourceLifecycle.sourceStatus,
    precheckResult: sourceLifecycle.precheckResult,
    sourceSelected: Boolean(draft.startSource),
  });

  return {
    sourceLifecycle,
    sourceStatusLabel,
    sourceStatusSummary,
    isConnectLaterSelected: Boolean(draft.startSource) && !draft.sourceConfig,
  };
}

export function useSourceStatus(draft: AssistantDraft) {
  const sourceStatusState = useMemo(
    () => resolveSourceStatusState(draft),
    [
      draft.lastCheckedAt,
      draft.lastError,
      draft.precheckResult,
      draft.sourceConfig,
      draft.sourceStatus,
      draft.startSource,
      draft.startStrategy,
    ],
  );

  return {
    sourceLifecycle: sourceStatusState.sourceLifecycle,
    sourceStatusLabel: sourceStatusState.sourceStatusLabel,
    sourceStatusSummary: sourceStatusState.sourceStatusSummary,
    isConnectLaterSelected: sourceStatusState.isConnectLaterSelected,
  };
}
