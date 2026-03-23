import type { AssistantDraft } from "@/src/modules/creation-assistant/domain";
import type { CreationAssistantLabels } from "../creation-assistant-i18n";

type PostgresSourceFormProps = {
  draft: AssistantDraft;
  setDraft: React.Dispatch<React.SetStateAction<AssistantDraft>>;
  sourcePreview: { message: string } | null;
  labels: CreationAssistantLabels;
};

export function PostgresSourceForm({
  draft,
  setDraft,
  sourcePreview,
  labels,
}: PostgresSourceFormProps) {
  if (
    !draft.sourceConfig ||
    (draft.sourceConfig.kind !== "postgres" &&
      draft.sourceConfig.kind !== "mysql" &&
      draft.sourceConfig.kind !== "sqlserver")
  ) {
    return null;
  }

  return (
    <div className="dashboard-form">
      <div className="field">
        <label htmlFor="origin-db-mode">
          {labels.sourceForms.postgres.connectionModeLabel}
        </label>
        <select
          id="origin-db-mode"
          value={draft.sourceConfig.connectionMode}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              sourceConfig:
                current.sourceConfig &&
                (current.sourceConfig.kind === "postgres" ||
                  current.sourceConfig.kind === "mysql" ||
                  current.sourceConfig.kind === "sqlserver")
                  ? {
                      ...current.sourceConfig,
                      connectionMode: event.target.value as "string" | "fields",
                    }
                  : current.sourceConfig,
            }))
          }
        >
          <option value="string">{labels.sourceForms.postgres.connectionStringOption}</option>
          <option value="fields">{labels.sourceForms.postgres.separateFieldsOption}</option>
        </select>
      </div>
      {draft.sourceConfig.connectionMode === "string" ? (
        <div className="field">
          <label htmlFor="origin-db-connection-string">
            {labels.sourceForms.postgres.connectionStringLabel}
          </label>
          <input
            id="origin-db-connection-string"
            placeholder={labels.sourceForms.postgres.connectionStringPlaceholder}
            value={draft.sourceConfig.connectionString ?? ""}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                sourceConfig:
                  current.sourceConfig &&
                  (current.sourceConfig.kind === "postgres" ||
                    current.sourceConfig.kind === "mysql" ||
                    current.sourceConfig.kind === "sqlserver")
                    ? {
                        ...current.sourceConfig,
                        connectionString: event.target.value,
                      }
                    : current.sourceConfig,
              }))
            }
          />
        </div>
      ) : (
        <>
          <div className="field">
            <label htmlFor="origin-db-host">{labels.sourceForms.postgres.hostLabel}</label>
            <input
              id="origin-db-host"
              placeholder={labels.sourceForms.postgres.hostPlaceholder}
              value={draft.sourceConfig.host ?? ""}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  sourceConfig:
                    current.sourceConfig &&
                    (current.sourceConfig.kind === "postgres" ||
                      current.sourceConfig.kind === "mysql" ||
                      current.sourceConfig.kind === "sqlserver")
                      ? {
                          ...current.sourceConfig,
                          host: event.target.value,
                        }
                      : current.sourceConfig,
                }))
              }
            />
          </div>
          <div className="field">
            <label htmlFor="origin-db-port">{labels.sourceForms.postgres.portLabel}</label>
            <input
              id="origin-db-port"
              type="number"
              min={1}
              max={65535}
              placeholder={labels.sourceForms.postgres.portPlaceholder}
              value={draft.sourceConfig.port ?? ""}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  sourceConfig:
                    current.sourceConfig &&
                    (current.sourceConfig.kind === "postgres" ||
                      current.sourceConfig.kind === "mysql" ||
                      current.sourceConfig.kind === "sqlserver")
                      ? {
                          ...current.sourceConfig,
                          port: event.target.value
                            ? Number(event.target.value)
                            : undefined,
                        }
                      : current.sourceConfig,
                }))
              }
            />
          </div>
          <div className="field">
            <label htmlFor="origin-db-name">
              {labels.sourceForms.postgres.databaseLabel}
            </label>
            <input
              id="origin-db-name"
              placeholder={labels.sourceForms.postgres.databasePlaceholder}
              value={draft.sourceConfig.database ?? ""}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  sourceConfig:
                    current.sourceConfig &&
                    (current.sourceConfig.kind === "postgres" ||
                      current.sourceConfig.kind === "mysql" ||
                      current.sourceConfig.kind === "sqlserver")
                      ? {
                          ...current.sourceConfig,
                          database: event.target.value,
                        }
                      : current.sourceConfig,
                }))
              }
            />
          </div>
          <div className="field">
            <label htmlFor="origin-db-schema">
              {labels.sourceForms.postgres.schemaLabel}
            </label>
            <input
              id="origin-db-schema"
              placeholder={labels.sourceForms.postgres.schemaPlaceholder}
              value={draft.sourceConfig.schema ?? ""}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  sourceConfig:
                    current.sourceConfig &&
                    (current.sourceConfig.kind === "postgres" ||
                      current.sourceConfig.kind === "mysql" ||
                      current.sourceConfig.kind === "sqlserver")
                      ? {
                          ...current.sourceConfig,
                          schema: event.target.value,
                        }
                      : current.sourceConfig,
                }))
              }
            />
          </div>
        </>
      )}
      <div className="field">
        <label htmlFor="origin-db-auth-mode">
          {labels.sourceForms.postgres.authModeLabel}
        </label>
        <select
          id="origin-db-auth-mode"
          value={draft.sourceConfig.authMode}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              sourceConfig:
                current.sourceConfig &&
                (current.sourceConfig.kind === "postgres" ||
                  current.sourceConfig.kind === "mysql" ||
                  current.sourceConfig.kind === "sqlserver")
                  ? {
                      ...current.sourceConfig,
                      authMode: event.target.value as "userpass" | "iam",
                    }
                  : current.sourceConfig,
            }))
          }
        >
          <option value="userpass">{labels.sourceForms.postgres.userPassOption}</option>
          <option value="iam">{labels.sourceForms.postgres.iamOption}</option>
        </select>
      </div>
      {draft.sourceConfig.authMode === "userpass" ? (
        <>
          <div className="field">
            <label htmlFor="origin-db-username">
              {labels.sourceForms.postgres.usernameLabel}
            </label>
            <input
              id="origin-db-username"
              placeholder={labels.sourceForms.postgres.usernamePlaceholder}
              value={draft.sourceConfig.username ?? ""}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  sourceConfig:
                    current.sourceConfig &&
                    (current.sourceConfig.kind === "postgres" ||
                      current.sourceConfig.kind === "mysql" ||
                      current.sourceConfig.kind === "sqlserver")
                      ? {
                          ...current.sourceConfig,
                          username: event.target.value,
                        }
                      : current.sourceConfig,
                }))
              }
            />
          </div>
          <div className="field">
            <label htmlFor="origin-db-password">
              {labels.sourceForms.postgres.passwordLabel}
            </label>
            <input
              id="origin-db-password"
              type="password"
              placeholder={labels.sourceForms.postgres.passwordPlaceholder}
              value={draft.sourceConfig.password ?? ""}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  sourceConfig:
                    current.sourceConfig &&
                    (current.sourceConfig.kind === "postgres" ||
                      current.sourceConfig.kind === "mysql" ||
                      current.sourceConfig.kind === "sqlserver")
                      ? {
                          ...current.sourceConfig,
                          password: event.target.value,
                        }
                      : current.sourceConfig,
                }))
              }
            />
          </div>
        </>
      ) : null}

      {sourcePreview ? <p className="helper">{sourcePreview.message}</p> : null}
      <p className="helper">{labels.sourceForms.postgres.draftSafetyHint}</p>
      <p className="helper">{labels.sourceForms.postgres.securityHint}</p>
    </div>
  );
}
