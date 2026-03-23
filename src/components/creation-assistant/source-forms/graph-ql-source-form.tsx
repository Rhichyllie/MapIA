import type { AssistantDraft } from "@/src/modules/creation-assistant/domain";
import type { CreationAssistantLabels } from "../creation-assistant-i18n";

type GraphQlSourceFormProps = {
  draft: AssistantDraft;
  setDraft: React.Dispatch<React.SetStateAction<AssistantDraft>>;
  sourcePreview: { message: string } | null;
  labels: CreationAssistantLabels;
};

export function GraphQlSourceForm({
  draft,
  setDraft,
  sourcePreview,
  labels,
}: GraphQlSourceFormProps) {
  if (draft.sourceConfig?.kind !== "graphql") {
    return null;
  }

  return (
    <div className="dashboard-form">
      <div className="field">
        <label htmlFor="origin-graphql-endpoint">
          {labels.sourceForms.graphQl.endpointLabel}
        </label>
        <input
          id="origin-graphql-endpoint"
          placeholder={labels.sourceForms.graphQl.endpointPlaceholder}
          value={draft.sourceConfig.endpointUrl ?? ""}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              sourceConfig:
                current.sourceConfig?.kind === "graphql"
                  ? {
                      ...current.sourceConfig,
                      endpointUrl: event.target.value,
                    }
                  : current.sourceConfig,
            }))
          }
        />
      </div>
      <div className="field">
        <label htmlFor="origin-graphql-schema">
          {labels.sourceForms.graphQl.schemaLabel}
        </label>
        <textarea
          id="origin-graphql-schema"
          rows={6}
          placeholder={labels.sourceForms.graphQl.schemaPlaceholder}
          value={draft.sourceConfig.schemaText ?? ""}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              sourceConfig:
                current.sourceConfig?.kind === "graphql"
                  ? {
                      ...current.sourceConfig,
                      schemaText: event.target.value,
                    }
                  : current.sourceConfig,
            }))
          }
        />
      </div>
      {sourcePreview ? <p className="helper">{sourcePreview.message}</p> : null}
      <p className="helper">{labels.sourceForms.graphQl.verificationHint}</p>
    </div>
  );
}
