import {
  type AssistantDraft,
  type SourceConfigPreview,
} from "@/src/modules/creation-assistant/domain";
import type { CreationAssistantLabels } from "../creation-assistant-i18n";
import { isGenericSourceConfig } from "../shared";

type GenericSourceFormProps = {
  draft: AssistantDraft;
  setDraft: React.Dispatch<React.SetStateAction<AssistantDraft>>;
  sourcePreview: SourceConfigPreview | null;
  labels: CreationAssistantLabels;
};

export function GenericSourceForm({
  draft,
  setDraft,
  sourcePreview,
  labels,
}: GenericSourceFormProps) {
  if (!isGenericSourceConfig(draft.sourceConfig)) {
    return null;
  }

  return (
    <div className="dashboard-form">
      <div className="field">
        <label htmlFor="origin-generic-mode">{labels.sourceForms.generic.inputLabel}</label>
        <select
          id="origin-generic-mode"
          value={draft.sourceConfig.inputMode}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              sourceConfig:
                isGenericSourceConfig(current.sourceConfig)
                  ? {
                      ...current.sourceConfig,
                      inputMode: event.target.value as "upload" | "paste",
                    }
                  : current.sourceConfig,
            }))
          }
        >
          <option value="paste">{labels.sourceForms.generic.pasteOption}</option>
          <option value="upload">{labels.sourceForms.generic.uploadOption}</option>
        </select>
      </div>
      {draft.sourceConfig.kind === "csv" ? (
        <div className="field">
          <label htmlFor="origin-csv-delimiter">
            {labels.sourceForms.generic.delimiterLabel}
          </label>
          <select
            id="origin-csv-delimiter"
            value={draft.sourceConfig.delimiter ?? ","}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                sourceConfig:
                  isGenericSourceConfig(current.sourceConfig) &&
                  current.sourceConfig.kind === "csv"
                    ? {
                        ...current.sourceConfig,
                        delimiter: event.target.value as "," | ";" | "\t",
                      }
                    : current.sourceConfig,
              }))
            }
          >
            <option value=",">{labels.sourceForms.generic.delimiterComma}</option>
            <option value=";">{labels.sourceForms.generic.delimiterSemicolon}</option>
            <option value={"\t"}>{labels.sourceForms.generic.delimiterTab}</option>
          </select>
        </div>
      ) : null}
      {draft.sourceConfig.inputMode === "paste" ? (
        <div className="field">
          <label htmlFor="origin-generic-text">{labels.sourceForms.generic.contentLabel}</label>
          <textarea
            id="origin-generic-text"
            rows={6}
            value={draft.sourceConfig.text ?? ""}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                sourceConfig:
                  isGenericSourceConfig(current.sourceConfig)
                    ? {
                        ...current.sourceConfig,
                        text: event.target.value,
                      }
                    : current.sourceConfig,
              }))
            }
          />
        </div>
      ) : null}
      {sourcePreview ? (
        <div className="tile">
          <p className="helper">
            {sourcePreview.status === "ready"
              ? labels.sourceForms.generic.readyPreview
              : labels.sourceForms.generic.partialPreview}
          </p>
          <p>{sourcePreview.message}</p>
          {sourcePreview.fields && sourcePreview.fields.length > 0 ? (
            <div className="dashboard-form">
              <div className="field">
                <label htmlFor="origin-mapping-id">
                  {labels.sourceForms.generic.idFieldLabel}
                </label>
                <select
                  id="origin-mapping-id"
                  value={draft.sourceConfig.mapping?.idField ?? ""}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      sourceConfig:
                        isGenericSourceConfig(current.sourceConfig)
                          ? {
                              ...current.sourceConfig,
                              mapping: {
                                ...(current.sourceConfig.mapping ?? {}),
                                idField: event.target.value || undefined,
                              },
                            }
                          : current.sourceConfig,
                    }))
                  }
                >
                  <option value="">{labels.sourceForms.generic.noMapping}</option>
                  {sourcePreview.fields.map((field) => (
                    <option key={`id-${field}`} value={field}>
                      {field}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="origin-mapping-label">
                  {labels.sourceForms.generic.labelFieldLabel}
                </label>
                <select
                  id="origin-mapping-label"
                  value={draft.sourceConfig.mapping?.labelField ?? ""}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      sourceConfig:
                        isGenericSourceConfig(current.sourceConfig)
                          ? {
                              ...current.sourceConfig,
                              mapping: {
                                ...(current.sourceConfig.mapping ?? {}),
                                labelField: event.target.value || undefined,
                              },
                            }
                          : current.sourceConfig,
                    }))
                  }
                >
                  <option value="">{labels.sourceForms.generic.noMapping}</option>
                  {sourcePreview.fields.map((field) => (
                    <option key={`label-${field}`} value={field}>
                      {field}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="origin-mapping-parent">
                  {labels.sourceForms.generic.parentFieldLabel}
                </label>
                <select
                  id="origin-mapping-parent"
                  value={draft.sourceConfig.mapping?.parentField ?? ""}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      sourceConfig:
                        isGenericSourceConfig(current.sourceConfig)
                          ? {
                              ...current.sourceConfig,
                              mapping: {
                                ...(current.sourceConfig.mapping ?? {}),
                                parentField: event.target.value || undefined,
                              },
                            }
                          : current.sourceConfig,
                    }))
                  }
                >
                  <option value="">{labels.sourceForms.generic.noMapping}</option>
                  {sourcePreview.fields.map((field) => (
                    <option key={`parent-${field}`} value={field}>
                      {field}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}
          {sourcePreview.sample && sourcePreview.sample.length > 0 ? (
            <div className="stack-sm">
              <p className="helper">{labels.sourceForms.generic.sampleLabel}</p>
              <pre>{JSON.stringify(sourcePreview.sample.slice(0, 3), null, 2)}</pre>
            </div>
          ) : null}
        </div>
      ) : null}
      <p className="helper">{labels.sourceForms.generic.previewHint}</p>
    </div>
  );
}
