# Runbook - Creation Transition Telemetry

## Objetivo

Operar deprecação de legado com segurança, com gates confiáveis e reação rápida.

## Gates e ações

1. `alias_write_rate_percent` breached
   - Dono: `api-core`
   - Ação: identificar consumidores do alias e migrar para `/creation-draft`.
   - Evidência: queda da taxa por 14 dias.

2. `template_dependency_rate_percent` breached
   - Dono: `product-eng`
   - Ação: executar backfill de `creationSettings` e corrigir fallbacks de template.
   - Evidência: top fallback reasons reduzindo + taxa abaixo de threshold.

3. `strict_block_rate_percent` breached
   - Dono: `assistant-quality`
   - Ação: revisar strict rules por recipe e mensagens de guidance.
   - Evidência: queda de bloqueios sem regressão de qualidade.

4. `runtime_fallback_rate_percent` breached
   - Dono: `assistant-architecture`
   - Ação: completar registry de recipes para pares mais frequentes.
   - Evidência: queda de fallback runtime por 14 dias.

## Snapshot stale

- Sintoma: `telemetry_snapshot_staleness_seconds` acima do limite.
- Ação:
  1. checar saúde do banco e escrita em `creation_telemetry_events`;
  2. checar `telemetry_emit_failure_total`;
  3. checar `telemetry_emit_dropped_total` e `telemetry_sink_latency_ms`;
  4. executar `POST /api/internal/observability/creation-transition/evaluate` (ops/internal);
  5. validar acesso e resposta do endpoint interno.

## Avaliacao de gate sem depender de leitura

- O warning de gate eh avaliado no pipeline de emissao de eventos (nao depende de `GET`).
- `GET /api/internal/observability/creation-transition` e somente leitura.
- Para forcar avaliacao operacional:
  - chamar `POST /api/internal/observability/creation-transition/evaluate`.
- Agendamento recomendado:
  - cron a cada 1-5 minutos chamando o endpoint `POST .../evaluate` com identidade interna.
  - manter timeout curto e retry controlado.

## Validação de redaction

1. inspecionar eventos recentes e confirmar ausência de:
   - `password`, `token`, `authorization`, `connectionString`, `apiKey`.
2. validar logs de erro sanitizados.
3. confirmar responses de conflito/erro sem segredo.

## Quando pausar deprecação

Pausar rollout se qualquer condição:
1. gate crítico breached por 2 janelas seguidas;
2. snapshot stale recorrente;
3. aumento de falhas de emissão com impacto na confiabilidade dos gates.

## Cleanup de retencao

- Dry run:
  - `pnpm telemetry:retention:cleanup`
- Execucao real:
  - `pnpm telemetry:retention:cleanup:execute`
  - (equivale a `--dry-run=false --confirm=execute`)
- Filtros uteis:
  - `--retention-class=short_30d|standard_90d|long_365d|all`
  - `--before=<ISO_DATE>`
  - `--days-override=<N>`
- Saida estruturada:
  - `policies[].affectedCount` (candidatos)
  - `policies[].deletedCount` (removidos)
  - `totals.affectedCount` / `totals.deletedCount`

## Troubleshooting rapido

1. `timeout` alto no sink:
   - validar saude do banco;
   - revisar `TELEMETRY_SINK_TIMEOUT_MS`;
   - monitorar `telemetry_emit_dropped_total`.
   - lembrar: timeout observado no request nao implica cancelamento garantido do insert.
2. warning de gate nao aparece:
   - confirmar chamada do evaluator dedicado;
   - validar se ha eventos-base suficientes na janela;
   - verificar dedupe key por bucket de avaliacao.
