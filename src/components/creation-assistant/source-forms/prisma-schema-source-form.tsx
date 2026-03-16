import type { AssistantDraft } from "@/src/modules/creation-assistant/domain";

type PrismaSchemaSourceFormProps = {
  draft: AssistantDraft;
  setDraft: React.Dispatch<React.SetStateAction<AssistantDraft>>;
  sourcePreview: { message: string } | null;
  mode: "new" | "existing";
  fromProjectId?: string;
  validatePrismaSource: () => Promise<void>;
  isBusy: boolean;
};

export function PrismaSchemaSourceForm({
  draft,
  setDraft,
  sourcePreview,
  mode,
  fromProjectId,
  validatePrismaSource,
  isBusy,
}: PrismaSchemaSourceFormProps) {
  if (draft.sourceConfig?.kind !== "prisma-schema") {
    return null;
  }

  return (
    <div className="dashboard-form">
      <div className="field">
        <label htmlFor="origin-prisma-mode">Entrada</label>
        <select
          id="origin-prisma-mode"
          value={draft.sourceConfig.inputMode}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              sourceConfig:
                current.sourceConfig?.kind === "prisma-schema"
                  ? {
                      ...current.sourceConfig,
                      inputMode: event.target.value as "paste" | "upload",
                    }
                  : current.sourceConfig,
            }))
          }
        >
          <option value="paste">Colar schema</option>
          <option value="upload">Upload (em breve)</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="origin-prisma-text">Schema Prisma</label>
        <textarea
          id="origin-prisma-text"
          rows={6}
          placeholder="model User { id String @id }"
          value={draft.sourceConfig.schemaText ?? ""}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              sourceConfig:
                current.sourceConfig?.kind === "prisma-schema"
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
      {mode === "existing" && fromProjectId ? (
        <div className="row-actions">
          <button
            className="btn"
            type="button"
            onClick={validatePrismaSource}
            disabled={isBusy}
          >
            Verificacao inicial e importar agora
          </button>
        </div>
      ) : (
        <p className="helper">
          A verificacao inicial sera aplicada ao criar o mapa inicial.
        </p>
      )}
    </div>
  );
}
