# Creation Assistant - Telemetria Enterprise

## Escopo

Telemetria operacional do Creation Assistant com fonte durável para gates de deprecação.

## Definicao formal das taxas

- `alias_write_rate_percent`:
  - numerador: total de `creation_settings_alias_put` na janela
  - denominador: total de `creation_draft_saved` na janela
- `template_dependency_rate_percent`:
  - numerador: projetos unicos com dependencia real (`dependencyReal=true`) em `creation_legacy_template_fallback`
  - denominador: projetos unicos observados na janela (qualquer evento com `projectId`)
- `strict_block_rate_percent`:
  - numerador: total de `creation_apply_blocked_strict_validation`
  - denominador: total de `creation_apply_attempted`
- `runtime_fallback_rate_percent`:
  - numerador: total de `creation_recipe_runtime_fallback`
  - denominador: total de `creation_recipe_runtime_resolved`

## Tipos de sinal

1. Eventos: persistidos em `creation_telemetry_events`.
2. Métricas: `telemetry_emit_*`, `telemetry_sink_latency_ms`, `telemetry_snapshot_staleness_seconds`.
3. Logs: somente sanitizados via camada central.
4. Traces: `traceId` propagado no envelope quando disponível.

## Semantica de timeout no request path

- Emissao de telemetria no produto e best-effort e bounded por timeout.
- `timeout` significa apenas "o request observou timeout no sink".
- `timeout` nao garante cancelamento fisico do insert no sink.
- Em persistencia tardia do sink, o evento pode ser gravado apos o timeout observado pelo request.

## Eventos versionados (v1)

- `creation_settings_alias_put`
- `creation_settings_alias_payload_settings`
- `creation_legacy_template_fallback`
- `creation_transition_gate_warning`
- `creation_transition_gate_evaluation_tick`
- `creation_recipe_runtime_fallback`
- `creation_recipe_runtime_resolved`
- `creation_apply_attempted`
- `creation_apply_blocked_strict_validation`
- `creation_apply_succeeded`
- `creation_source_status_changed`
- `creation_draft_saved`
- `creation_transition_snapshot_accessed`
- `creation_transition_snapshot_access_denied`

## Politica de dedupe por evento

- `dedupe_forbidden`: eventos operacionais/rates contam todas as ocorrencias reais.
- `dedupe_alerts_only`: permitido apenas para warnings/alerts de gate.
- aplicacao atual:
  - `creation_transition_gate_warning` -> `dedupe_alerts_only`
  - `creation_transition_gate_evaluation_tick` -> `dedupe_allowed` (lease leve multi-instancia por bucket)
  - demais eventos principais -> `dedupe_forbidden`

## Política de cardinalidade

| Campo | Evento | Log | Trace | Label de métrica | Regra |
|---|---|---|---|---|---|
| `ownerIdentity` bruto | nao | nao | nao | nao | sempre hash |
| `actorIdentityHash` | sim | sim | sim | nao | permitido |
| `projectId` | sim | sim | sim | nao | nao virar label |
| `fallbackReason` | sim | sim | sim | sim | cardinalidade controlada |
| `eventName` | sim | sim | sim | sim | cardinalidade baixa |
| `environment`/`releaseVersion` | sim | sim | sim | sim | obrigatório |

## Gates operacionais (janela rolling 14d)

1. `alias_write_rate_percent` (threshold 5%)
2. `template_dependency_rate_percent` (threshold 2%)
3. `strict_block_rate_percent` (threshold 15%)
4. `runtime_fallback_rate_percent` (threshold 5%)

## Endpoint interno

- `GET /api/internal/observability/creation-transition`
- `GET` e estritamente read-only (sem emissao de gate warning).
- `POST /api/internal/observability/creation-transition/evaluate` (execucao explicita de avaliacao de gate para scheduler/ops)
- Acesso: allowlist de identidades internas (`INTERNAL_OBSERVABILITY_ALLOWED_IDENTITIES`)
- Em producao nao existe bypass implicito por `DEV_LOGIN_EMAIL`.
- Auditoria: eventos `creation_transition_snapshot_accessed`/`denied`

## Semantica do evaluator

- `creation_transition_gate_evaluation_tick`: tentativa de avaliacao (lease/tick).
- `creation_transition_gate_warning`: gate breached emitido de fato.
- `GET` do snapshot nunca dispara avaliacao.
- `POST .../evaluate` e o entrypoint manual explicito.

## Semantica do emitter bounded

- `stored`: evento persistido.
- `deduped`: evento descartado por dedupe policy.
- `timeout`: timeout observado pelo request (nao garante cancelamento fisico do sink).
- `error`: falha no sink/pipeline de emissao.

## Hash de identidade em telemetria

- usar `TELEMETRY_HASH_SALT` dedicado.
- fallback para `NEXTAUTH_SECRET` apenas em `development/test`.
- em `production`, sem `TELEMETRY_HASH_SALT`, `actorIdentityHash` nao eh emitido.
- rotacao: gerar novo salt em janela planejada, validar impacto em correlacao historica e atualizar baseline analitico.

## Separacao entre metricas principais e breakdowns auxiliares

- metricas principais (rates e unique project counts) usam agregacao no store/query.
- breakdowns auxiliares prioritarios (top reasons e campos herdados) usam agregacao no store/query.
- leitura por scan fica apenas como fallback de baixo risco quando agregacao dedicada nao estiver disponivel.

## Retencao operacional

- classes:
  - `short_30d`
  - `standard_90d`
  - `long_365d`
- comando de limpeza:
  - `pnpm telemetry:retention:cleanup` (dry-run)
  - `pnpm telemetry:retention:cleanup:execute` (execucao real, exige `--confirm=execute`)
  - filtros opcionais: `--retention-class`, `--before`, `--days-override`

## Dashboards mínimos

### Executivo

- taxa de alias legado
- taxa de dependência de template
- gates breached vs healthy
- readiness para corte do legado

### Técnico

- strict validation blocked por profile:view
- runtime fallback por profile:view
- source status changed distribution
- draft saved por rota

### Segurança

- denied access no endpoint interno
- volume de eventos com redaction aplicada
- falhas de emissão (`telemetry_emit_failure_total`)

## Alertas mínimos

1. Gate breached após `effectiveFrom`.
2. `strict_block_rate_percent` acima do threshold.
3. `runtime_fallback_rate_percent` acima do threshold.
4. `telemetry_snapshot_staleness_seconds` acima do limite.
5. `telemetry_emit_failure_total` com tendência de alta.
6. `creation_transition_snapshot_access_denied` acima do baseline.
