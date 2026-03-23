import { useMemo } from "react";
import {
  resolveSourceLifecycle,
  type AssistantDraft,
} from "@/src/modules/creation-assistant/domain";
import type { CreationAssistantLabels } from "../creation-assistant-i18n";
import { createCreationAssistantLabels } from "../creation-assistant-i18n";
import ptBRMessages from "@/messages/pt-BR.json";

const defaultLabels = createCreationAssistantLabels(ptBRMessages, "pt-BR");

export function resolveSourceStatusState(
  draft: AssistantDraft,
  labels: Pick<
    CreationAssistantLabels,
    "getSourceStatusLabel" | "getSourceStatusSummary"
  > = defaultLabels,
) {
  const sourceLifecycle = resolveSourceLifecycle({
    startStrategy: draft.startStrategy,
    startSource: draft.startSource,
    sourceConfig: draft.sourceConfig,
    sourceStatus: draft.sourceStatus,
    precheckResult: draft.precheckResult,
    lastError: draft.lastError,
    lastCheckedAt: draft.lastCheckedAt,
  });

  const sourceStatusLabel = labels.getSourceStatusLabel(sourceLifecycle.sourceStatus);
  const sourceStatusSummary = labels.getSourceStatusSummary({
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

export function useSourceStatus(
  draft: AssistantDraft,
  labels: Pick<
    CreationAssistantLabels,
    "getSourceStatusLabel" | "getSourceStatusSummary"
  > = defaultLabels,
) {
  const sourceStatusState = useMemo(
    () => resolveSourceStatusState(draft, labels),
    [draft, labels],
  );

  return {
    sourceLifecycle: sourceStatusState.sourceLifecycle,
    sourceStatusLabel: sourceStatusState.sourceStatusLabel,
    sourceStatusSummary: sourceStatusState.sourceStatusSummary,
    isConnectLaterSelected: sourceStatusState.isConnectLaterSelected,
  };
}
