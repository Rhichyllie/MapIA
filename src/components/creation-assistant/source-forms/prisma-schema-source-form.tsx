import type { AssistantDraft } from "@/src/modules/creation-assistant/domain";
import type { CreationAssistantLabels } from "../creation-assistant-i18n";

type PrismaSchemaSourceFormProps = {
  draft: AssistantDraft;
  setDraft: React.Dispatch<React.SetStateAction<AssistantDraft>>;
  sourcePreview: { message: string } | null;
  mode: "new" | "existing";
  fromProjectId?: string;
  validatePrismaSource: () => Promise<void>;
  isBusy: boolean;
  labels: CreationAssistantLabels;
};

export function PrismaSchemaSourceForm({
  draft,
  setDraft,
  sourcePreview,
  mode,
  fromProjectId,
  validatePrismaSource,
  isBusy,
  labels,
}: PrismaSchemaSourceFormProps) {
  if (draft.sourceConfig?.kind !== "prisma-schema") {
    return null;
  }

  return (
    <div className="dashboard-form">
      <div className="field">
        <label htmlFor="origin-prisma-mode">{labels.sourceForms.prisma.inputLabel}</label>
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
          <option value="paste">{labels.sourceForms.prisma.pasteOption}</option>
          <option value="upload">{labels.sourceForms.prisma.uploadOption}</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="origin-prisma-text">{labels.sourceForms.prisma.schemaLabel}</label>
        <textarea
          id="origin-prisma-text"
          rows={6}
          placeholder={labels.sourceForms.prisma.schemaPlaceholder}
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
            {labels.sourceForms.prisma.validateNowButton}
          </button>
        </div>
      ) : (
        <p className="helper">{labels.sourceForms.prisma.validateOnCreateHint}</p>
      )}
    </div>
  );
}
