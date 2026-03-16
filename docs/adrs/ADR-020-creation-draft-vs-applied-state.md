# ADR-020: Separacao de Estado entre Creation Draft e Applied Settings

- Status: Accepted
- Data: 2026-03-12
- Dono: Time MapIA

## Contexto

O assistente misturava persistencia de rascunho com configuracao aplicada.
Isso causava ambiguidade: salvar rascunho alterava a fonte efetiva do projeto.

## Decisao

1. Separar persistencia de rascunho e configuracao aplicada:
   - `project_creation_drafts`: estado editavel, versionado para concorrencia otimista.
   - `project_creation_settings`: estado aplicado, versionado e auditavel (`appliedAt`, `appliedByIdentity`).
2. Aplicacao passa a ser acao explicita via endpoint dedicado (`creation-apply`).
3. Compatibilidade temporaria:
   - `PUT /api/projects/:id/creation-settings` permanece como alias para salvar draft.
   - `GET /api/projects/:id/creation-settings` retorna applied settings + metadados do draft.

## Janela de Transicao (datas e versoes)

1. Freeze de novos usos de alias:
   - Data: 2026-03-29
   - Regra: novos consumidores internos nao podem usar `PUT /creation-settings`.
2. Aviso de deprecacao em runtime:
   - Data: 2026-04-05
   - Regra: alias permanece funcional, mas gera log estruturado de deprecacao.
3. Remocao do alias de escrita:
   - Data alvo: 2026-06-07
   - Versao alvo: `2026.06`
   - Impacto: `PUT /creation-settings` deixa de aceitar escrita e retorna erro orientativo.
4. Colunas/paths transitorios:
   - `project_creation_settings.draftPayload`, `draftVersion`, `draftUpdatedAt`:
     - freeze de escrita: 2026-05-03
     - remocao fisica (migracao): 2026-07-05 (janela de rollback de 2 releases).
5. `project.template`:
   - fallback legado permitido ate 2026-07-19
   - remocao como fonte de runtime: 2026-08-16 (apos backfill e cobertura validada).

## Contratos

- `GET /api/projects/:id/creation-draft`
- `PUT /api/projects/:id/creation-draft`
- `POST /api/projects/:id/creation-apply`
- `GET /api/projects/:id/creation-settings` (applied + meta)
- `PUT /api/projects/:id/creation-settings` (alias legado para draft)

## Observabilidade e Metricas de Saida

Eventos estruturados obrigatorios:

1. `creation_settings_alias_put`
   - conta chamadas ao alias de escrita por projeto/identidade.
2. `creation_settings_alias_payload_settings`
   - conta usos do payload legado (`settings`) no alias.
3. `project_template_fallback_dependency`
   - conta projetos que ainda dependem de `project.template` como fallback.
4. `creation_legacy_template_fallback`
   - evento auditavel com fallback parcial/total e campos herdados por template.
5. `creation_transition_gate_warning`
   - alerta automatico quando o gate de dependencia de template e violado apos data de corte.

Metricas operacionais ativas:

1. `% de projetos observados com dependencia real de template`.
2. `Top 3 fallbackReason` para dependencia legado.
3. `Campos mais herdados do template` (`profile`, `initialView`, `layout`, `contextDefaults`).
4. Endpoint interno de snapshot operacional:
   - `GET /api/internal/observability/creation-transition`

Critérios de avanço para remoção:

1. alias de escrita abaixo de 5% das chamadas totais por 14 dias.
2. dependencia de `project.template` abaixo de 2% dos projetos ativos por 14 dias.
3. sem regressao em criacao/aplicacao nas suites e2e do assistente.

## Trilha Operacional (execucao do plano)

Backlog rastreavel em:

- `docs/operations/creation-assistant-transition-backlog.md`

Cada marco possui:

1. owner nomeado.
2. gate de saida com metrica.
3. data alvo alinhada com as versoes de transicao.

## Consequencias

- Beneficio: semantica previsivel e auditavel (draft nao aplica automaticamente).
- Beneficio: menor risco de regressao em UX de autosave.
- Risco: consumidores legados de `PUT /creation-settings` precisam migrar gradualmente.
- Mitigacao: alias compativel + comunicacao de deprecacao em roadmap.
