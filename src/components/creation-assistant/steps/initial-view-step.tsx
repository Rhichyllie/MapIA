import { CardOption } from "@/src/components/ui/card-option";
import {
  getInitialViewLabel,
  type AssistantDraft,
  type InitialView,
} from "@/src/modules/creation-assistant/domain";
import { rankLabel, VIEW_DESCRIPTIONS } from "../shared";

type InitialViewStepProps = {
  draft: AssistantDraft;
  recommendedViews: {
    recommended: InitialView[];
    other: InitialView[];
    incompatible: InitialView[];
  };
  selectInitialView: (view: InitialView) => void;
};

export function InitialViewStep({
  draft,
  recommendedViews,
  selectInitialView,
}: InitialViewStepProps) {
  return (
    <div className="stack-sm">
      <div className="field">
        <label>Recomendado para este perfil</label>
        <div className="grid-tiles">
          {recommendedViews.recommended.map((view) => (
            <CardOption
              key={view}
              title={getInitialViewLabel(view)}
              description={VIEW_DESCRIPTIONS[view]}
              selected={draft.initialView === view}
              onSelect={() => selectInitialView(view)}
            />
          ))}
        </div>
      </div>
      <div className="field">
        <label>Outras visoes possiveis</label>
        <div className="grid-tiles">
          {recommendedViews.other.map((view) => (
            <CardOption
              key={view}
              title={`${getInitialViewLabel(view)} (${rankLabel(draft.profile, view)})`}
              description={VIEW_DESCRIPTIONS[view]}
              selected={draft.initialView === view}
              onSelect={() => selectInitialView(view)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
