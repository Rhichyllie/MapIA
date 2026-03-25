import type { AssistantDraft } from "@/src/modules/creation-assistant/domain";
import type { CreationAssistantLabels } from "../creation-assistant-i18n";

type ProjectStepProps = {
  draft: AssistantDraft;
  setDraft: React.Dispatch<React.SetStateAction<AssistantDraft>>;
  labels: CreationAssistantLabels;
};

export function ProjectStep({ draft, setDraft, labels }: ProjectStepProps) {
  return (
    <div className="dashboard-form">
      <div className="field">
        <label htmlFor="assistant-project-name">{labels.projectStep.projectNameLabel}</label>
        <input
          id="assistant-project-name"
          data-testid="creation-assistant-project-name-input"
          value={draft.projectName}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              projectName: event.target.value,
            }))
          }
        />
      </div>
      <div className="field">
        <label htmlFor="assistant-project-objective">
          {labels.projectStep.objectiveLabel}
        </label>
        <textarea
          id="assistant-project-objective"
          rows={3}
          data-testid="creation-assistant-project-objective-input"
          value={draft.projectObjective ?? ""}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              projectObjective: event.target.value,
            }))
          }
        />
      </div>
      <p className="helper">{labels.projectStep.helper}</p>
    </div>
  );
}
