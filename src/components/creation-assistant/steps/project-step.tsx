import type { AssistantDraft } from "@/src/modules/creation-assistant/domain";

type ProjectStepProps = {
  draft: AssistantDraft;
  setDraft: React.Dispatch<React.SetStateAction<AssistantDraft>>;
};

export function ProjectStep({ draft, setDraft }: ProjectStepProps) {
  return (
    <div className="dashboard-form">
      <div className="field">
        <label htmlFor="assistant-project-name">Nome do projeto</label>
        <input
          id="assistant-project-name"
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
        <label htmlFor="assistant-project-objective">Objetivo do projeto (opcional)</label>
        <textarea
          id="assistant-project-objective"
          rows={3}
          value={draft.projectObjective ?? ""}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              projectObjective: event.target.value,
            }))
          }
        />
      </div>
      <p className="helper">
        Voce podera ajustar estrutura, origem e visualizacao nas proximas etapas.
      </p>
    </div>
  );
}
