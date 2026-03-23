import {
  type AssistantDraft,
  type StartStrategyRecommendation,
} from "@/src/modules/creation-assistant/domain";
import type { CreationAssistantLabels } from "../creation-assistant-i18n";

type ReviewStepProps = {
  draft: AssistantDraft;
  sourceStatusSummary: string;
  sourceStatusCode: AssistantDraft["sourceStatus"];
  recommendedStartStrategy: StartStrategyRecommendation;
  legacyLayoutWarning: string | null;
  enabledAutomationLabels: string[];
  labels: CreationAssistantLabels;
};

export function ReviewStep({
  draft,
  labels,
  sourceStatusSummary,
  sourceStatusCode,
  recommendedStartStrategy,
  legacyLayoutWarning,
  enabledAutomationLabels,
}: ReviewStepProps) {
  return (
    <div className="stack-sm">
      <section className="tile">
        <ul className="summary-list">
          <li>
            <strong>{labels.reviewStep.nameLabel}</strong> {draft.projectName}
          </li>
          <li>
            <strong>{labels.reviewStep.profileLabel}</strong>{" "}
            {labels.getProjectProfile(draft.profile).title}
          </li>
          <li>
            <strong>{labels.reviewStep.originLabel}</strong>{" "}
            {labels.getStartStrategy(draft.startStrategy).title}
          </li>
          <li>
            <strong>{labels.reviewStep.viewLabel}</strong>{" "}
            {labels.getInitialView(draft.initialView).label}
          </li>
          <li>
            <strong>{labels.reviewStep.layoutLabel}</strong>{" "}
            {labels.getLayoutChoiceLabel(draft.layout)}
          </li>
          <li>
            <strong>{labels.reviewStep.detailLabel}</strong>{" "}
            {labels.getDetailLevelLabel(draft.detailLevel)}
          </li>
          <li>
            <strong>{labels.reviewStep.suggestedBlocksLabel}</strong>{" "}
            {draft.context.setup?.suggestedBlockCount ?? 3}
          </li>
          <li>
            <strong>{labels.reviewStep.initialRootLabel}</strong>{" "}
            {draft.context.setup?.createInitialRoot
              ? (draft.context.setup.initialRootName ?? labels.reviewStep.rootEnabledFallback)
              : labels.reviewStep.rootDisabledFallback}
          </li>
          <li>
            <strong>{labels.reviewStep.enabledAutomationLabel}</strong>{" "}
            {enabledAutomationLabels.length > 0
              ? enabledAutomationLabels.join(", ")
              : labels.reviewStep.noAutomation}
          </li>
          <li>
            <strong>{labels.reviewStep.sourceLabel}</strong>{" "}
            {draft.startStrategy === "template"
              ? draft.templatePreset
                ? labels.getTemplatePresetLabel(draft.templatePreset)
                : labels.reviewStep.noTemplateSelected
              : draft.startSource
                ? labels.getStartSourceLabel(draft.startSource)
                : labels.reviewStep.noSourceSelected}
          </li>
          <li>
            <strong>{labels.reviewStep.sourceStatusLabel}</strong> {sourceStatusSummary}
          </li>
          <li>
            <strong>{labels.reviewStep.recommendedStrategyLabel}</strong>{" "}
            {labels.getStartStrategy(recommendedStartStrategy.strategy).title}
          </li>
        </ul>
        {legacyLayoutWarning ? <p className="helper">{legacyLayoutWarning}</p> : null}
        <p>
          {labels.buildWhatWillBeCreatedSummary({
            profile: draft.profile,
            initialView: draft.initialView,
            layout: draft.layout,
            automation: draft.automation,
            sourceStatus: sourceStatusCode,
          })}
        </p>
      </section>
    </div>
  );
}
