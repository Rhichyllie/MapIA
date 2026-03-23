import type { AssistantDraft } from "@/src/modules/creation-assistant/domain";
import type { CreationAssistantLabels } from "../creation-assistant-i18n";

type OpenApiSourceFormProps = {
  draft: AssistantDraft;
  setDraft: React.Dispatch<React.SetStateAction<AssistantDraft>>;
  sourcePreview: { message: string } | null;
  labels: CreationAssistantLabels;
};

export function OpenApiSourceForm({
  draft,
  setDraft,
  sourcePreview,
  labels,
}: OpenApiSourceFormProps) {
  if (draft.sourceConfig?.kind !== "openapi") {
    return null;
  }

  return (
    <div className="dashboard-form">
      <div className="field">
        <label htmlFor="origin-openapi-mode">{labels.sourceForms.openApi.inputLabel}</label>
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
          <option value="url">{labels.sourceForms.openApi.urlOption}</option>
          <option value="paste">{labels.sourceForms.openApi.pasteOption}</option>
          <option value="upload">{labels.sourceForms.openApi.uploadOption}</option>
        </select>
      </div>
      {draft.sourceConfig.inputMode === "url" ? (
        <div className="field">
          <label htmlFor="origin-openapi-url">{labels.sourceForms.openApi.urlLabel}</label>
          <input
            id="origin-openapi-url"
            placeholder={labels.sourceForms.openApi.urlPlaceholder}
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
          <label htmlFor="origin-openapi-text">{labels.sourceForms.openApi.specLabel}</label>
          <textarea
            id="origin-openapi-text"
            rows={6}
            placeholder={labels.sourceForms.openApi.specPlaceholder}
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
      <p className="helper">{labels.sourceForms.openApi.verificationHint}</p>
    </div>
  );
}
