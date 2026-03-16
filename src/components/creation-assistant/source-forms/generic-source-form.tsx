import {
  type AssistantDraft,
  type SourceConfigPreview,
} from "@/src/modules/creation-assistant/domain";
import { isGenericSourceConfig } from "../shared";

type GenericSourceFormProps = {
  draft: AssistantDraft;
  setDraft: React.Dispatch<React.SetStateAction<AssistantDraft>>;
  sourcePreview: SourceConfigPreview | null;
};

export function GenericSourceForm({
  draft,
  setDraft,
  sourcePreview,
}: GenericSourceFormProps) {
  if (!isGenericSourceConfig(draft.sourceConfig)) {
    return null;
  }

  return (
    <div className="dashboard-form">
      <div className="field">
        <label htmlFor="origin-generic-mode">Entrada</label>
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
          <option value="paste">Colar conteudo</option>
          <option value="upload">Upload (em breve)</option>
        </select>
      </div>
      {draft.sourceConfig.kind === "csv" ? (
        <div className="field">
          <label htmlFor="origin-csv-delimiter">Delimitador CSV</label>
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
            <option value=",">Virgula (,)</option>
            <option value=";">Ponto e virgula (;)</option>
            <option value={"\t"}>Tab</option>
          </select>
        </div>
      ) : null}
      {draft.sourceConfig.inputMode === "paste" ? (
        <div className="field">
          <label htmlFor="origin-generic-text">Conteudo da fonte</label>
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
              ? "Preview assistido da fonte pronto."
              : "Preview assistido parcial da fonte."}
          </p>
          <p>{sourcePreview.message}</p>
          {sourcePreview.fields && sourcePreview.fields.length > 0 ? (
            <div className="dashboard-form">
              <div className="field">
                <label htmlFor="origin-mapping-id">Campo ID (opcional)</label>
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
                  <option value="">Nao mapear</option>
                  {sourcePreview.fields.map((field) => (
                    <option key={`id-${field}`} value={field}>
                      {field}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="origin-mapping-label">Campo rotulo</label>
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
                  <option value="">Nao mapear</option>
                  {sourcePreview.fields.map((field) => (
                    <option key={`label-${field}`} value={field}>
                      {field}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="origin-mapping-parent">Campo pai/dependencia</label>
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
                  <option value="">Nao mapear</option>
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
              <p className="helper">Amostra</p>
              <pre>{JSON.stringify(sourcePreview.sample.slice(0, 3), null, 2)}</pre>
            </div>
          ) : null}
        </div>
      ) : null}
      <p className="helper">
        Esta fonte permite configuracao e preview inicial. Importacao automatica completa pode ser feita depois.
      </p>
    </div>
  );
}
