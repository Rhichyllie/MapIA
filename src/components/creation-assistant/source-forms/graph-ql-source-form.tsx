import type { AssistantDraft } from "@/src/modules/creation-assistant/domain";

type GraphQlSourceFormProps = {
  draft: AssistantDraft;
  setDraft: React.Dispatch<React.SetStateAction<AssistantDraft>>;
  sourcePreview: { message: string } | null;
};

export function GraphQlSourceForm({
  draft,
  setDraft,
  sourcePreview,
}: GraphQlSourceFormProps) {
  if (draft.sourceConfig?.kind !== "graphql") {
    return null;
  }

  return (
    <div className="dashboard-form">
      <div className="field">
        <label htmlFor="origin-graphql-endpoint">Endpoint GraphQL (opcional)</label>
        <input
          id="origin-graphql-endpoint"
          placeholder="https://api.exemplo.com/graphql"
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
        <label htmlFor="origin-graphql-schema">SDL GraphQL (opcional)</label>
        <textarea
          id="origin-graphql-schema"
          rows={6}
          placeholder="type Query { ... }"
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
      <p className="helper">Informe endpoint ou SDL para verificacao inicial da fonte.</p>
    </div>
  );
}
