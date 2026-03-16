import type { AssistantDraft } from "@/src/modules/creation-assistant/domain";

type OpenApiSourceFormProps = {
  draft: AssistantDraft;
  setDraft: React.Dispatch<React.SetStateAction<AssistantDraft>>;
  sourcePreview: { message: string } | null;
};

export function OpenApiSourceForm({
  draft,
  setDraft,
  sourcePreview,
}: OpenApiSourceFormProps) {
  if (draft.sourceConfig?.kind !== "openapi") {
    return null;
  }

  return (
    <div className="dashboard-form">
      <div className="field">
        <label htmlFor="origin-openapi-mode">Entrada OpenAPI</label>
        <select
          id="origin-openapi-mode"
          value={draft.sourceConfig.inputMode}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              sourceConfig:
                current.sourceConfig?.kind === "openapi"
                  ? {
                      ...current.sourceConfig,
                      inputMode: event.target.value as "url" | "upload" | "paste",
                    }
                  : current.sourceConfig,
            }))
          }
        >
          <option value="url">URL</option>
          <option value="paste">Colar</option>
          <option value="upload">Upload (em breve)</option>
        </select>
      </div>
      {draft.sourceConfig.inputMode === "url" ? (
        <div className="field">
          <label htmlFor="origin-openapi-url">URL</label>
          <input
            id="origin-openapi-url"
            placeholder="https://api.exemplo.com/openapi.json"
            value={draft.sourceConfig.url ?? ""}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                sourceConfig:
                  current.sourceConfig?.kind === "openapi"
                    ? {
                        ...current.sourceConfig,
                        url: event.target.value,
                      }
                    : current.sourceConfig,
              }))
            }
          />
        </div>
      ) : (
        <div className="field">
          <label htmlFor="origin-openapi-text">Especificacao</label>
          <textarea
            id="origin-openapi-text"
            rows={6}
            placeholder="Cole JSON/YAML OpenAPI aqui"
            value={draft.sourceConfig.specText ?? ""}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                sourceConfig:
                  current.sourceConfig?.kind === "openapi"
                    ? {
                        ...current.sourceConfig,
                        specText: event.target.value,
                      }
                    : current.sourceConfig,
              }))
            }
          />
        </div>
      )}
      {sourcePreview ? <p className="helper">{sourcePreview.message}</p> : null}
      <p className="helper">
        Verificacao online sera habilitada quando o conector remoto estiver disponivel.
      </p>
    </div>
  );
}
