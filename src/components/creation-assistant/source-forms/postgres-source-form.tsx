import type { AssistantDraft } from "@/src/modules/creation-assistant/domain";

type PostgresSourceFormProps = {
  draft: AssistantDraft;
  setDraft: React.Dispatch<React.SetStateAction<AssistantDraft>>;
  sourcePreview: { message: string } | null;
};

export function PostgresSourceForm({
  draft,
  setDraft,
  sourcePreview,
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
        <label htmlFor="origin-db-mode">Modo de conexao</label>
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
          <option value="string">Connection string</option>
          <option value="fields">Campos separados</option>
        </select>
      </div>
      {draft.sourceConfig.connectionMode === "string" ? (
        <div className="field">
          <label htmlFor="origin-db-connection-string">Connection string</label>
          <input
            id="origin-db-connection-string"
            placeholder="postgresql://usuario:***@host:5432/banco"
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
            <label htmlFor="origin-db-host">Host</label>
            <input
              id="origin-db-host"
              placeholder="db.exemplo.internal"
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
            <label htmlFor="origin-db-port">Porta</label>
            <input
              id="origin-db-port"
              type="number"
              min={1}
              max={65535}
              placeholder="5432"
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
            <label htmlFor="origin-db-name">Banco</label>
            <input
              id="origin-db-name"
              placeholder="mapia"
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
            <label htmlFor="origin-db-schema">Schema (opcional)</label>
            <input
              id="origin-db-schema"
              placeholder="public"
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
        <label htmlFor="origin-db-auth-mode">Autenticacao</label>
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
          <option value="userpass">Usuario e senha</option>
          <option value="iam">IAM/Token temporario</option>
        </select>
      </div>
      {draft.sourceConfig.authMode === "userpass" ? (
        <>
          <div className="field">
            <label htmlFor="origin-db-username">Usuario</label>
            <input
              id="origin-db-username"
              placeholder="readonly_user"
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
            <label htmlFor="origin-db-password">Senha (opcional)</label>
            <input
              id="origin-db-password"
              type="password"
              placeholder="Digite apenas para teste imediato"
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
      <p className="helper">
        Credenciais nao sao salvas no rascunho nem nas configuracoes aplicadas. Informe novamente quando executar importacao conectada.
      </p>
      <p className="helper">
        Seguranca: prefira usuario tecnico de leitura e conecte credenciais definitivas apenas no momento da integracao.
      </p>
    </div>
  );
}
