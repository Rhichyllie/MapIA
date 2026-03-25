import { CardOption } from "@/src/components/ui/card-option";
import {
  type AssistantDraft,
  type InitialView,
} from "@/src/modules/creation-assistant/domain";
import type { CreationAssistantLabels } from "../creation-assistant-i18n";

type InitialViewStepProps = {
  draft: AssistantDraft;
  recommendedViews: {
    recommended: InitialView[];
    other: InitialView[];
    incompatible: InitialView[];
  };
  selectInitialView: (view: InitialView) => void;
  labels: CreationAssistantLabels;
};

export function InitialViewStep({
  draft,
  labels,
  recommendedViews,
  selectInitialView,
}: InitialViewStepProps) {
  return (
    <div className="stack-sm">
      <div className="field">
        <label>{labels.initialViewStep.recommendedLabel}</label>
        <div className="grid-tiles">
          {recommendedViews.recommended.map((view) => (
            <CardOption
              key={view}
              title={labels.getInitialView(view).label}
              description={labels.getInitialView(view).description}
              selected={draft.initialView === view}
              dataTestId={`creation-assistant-view-${view}`}
              onSelect={() => selectInitialView(view)}
            />
          ))}
        </div>
      </div>
      <div className="field">
        <label>{labels.initialViewStep.otherViewsLabel}</label>
        <div className="grid-tiles">
          {recommendedViews.other.map((view) => (
            <CardOption
              key={view}
              title={`${labels.getInitialView(view).label} (${labels.getRankLabel(draft.profile, view)})`}
              description={labels.getInitialView(view).description}
              selected={draft.initialView === view}
              dataTestId={`creation-assistant-view-${view}`}
              onSelect={() => selectInitialView(view)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
