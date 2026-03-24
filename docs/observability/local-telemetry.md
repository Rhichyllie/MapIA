# Telemetria local do MapIA

## Ativacao local

Use estas env vars no `.env`:

- `OTEL_RUNTIME_ENABLED=true`
- `OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318`
- `OTEL_METRICS_ENABLED=false` (pode subir para `true` depois, mas nao e necessario para este smoke)
- `CREATION_TRANSITION_TELEMETRY_ENABLED=true`
- `TELEMETRY_SINK_TIMEOUT_MS=150` (ou menor para debug)
- `TELEMETRY_SINK_FALLBACK_COOLDOWN_MS=30000`

O runtime OTel agora sobe de forma explicita em `instrumentation.ts` e registra o motivo da decisao de bootstrap nos logs estruturados.

## Estados operacionais

- `active`: bootstrap OTel iniciado e sink principal disponivel.
- `disabled`: telemetria desligada por env (`OTEL_RUNTIME_ENABLED=false` ou `CREATION_TRANSITION_TELEMETRY_ENABLED=false`).
- `fallback-noop`: sink entrou em protecao temporaria apos timeout/erro/tabela ausente; os exports seguintes sao pulados sem bloquear request critica.

## Logs esperados

Procure por estes eventos:

- `telemetry_bootstrap_enabled`
- `telemetry_bootstrap_disabled`
- `telemetry_sink_ready`
- `telemetry_sink_timeout`
- `telemetry_sink_fallback_active`
- `telemetry_export_success`
- `telemetry_export_skipped`

Todos saem como linha estruturada com prefixo `[telemetry]` e incluem `mode` e `reason`.

## Validacao local

1. Suba o collector local e confirme a porta `4318` aberta.
2. Rode `pnpm telemetry:local:smoke`.
3. Rode os testes-alvo:
   `pnpm exec vitest run src/server/observability/otel-runtime.test.ts src/server/observability/creation-assistant-transition-telemetry.test.ts src/modules/creation-assistant/application/api-contracts.test.ts`

## Como reconhecer fallback/no-op

Sinais concretos:

- o primeiro export lento retorna `timeout`
- logo depois aparece `telemetry_sink_fallback_active`
- os exports seguintes passam a retornar `skipped`
- os logs mostram `mode: "fallback-noop"`

## O que mudou no app

- bootstrap OTel deixou de depender apenas do caminho de importing e passa a iniciar no boot do servidor Node.
- `creation-transition-telemetry` agora aplica fallback temporario em timeout/erro e evita insistir no sink em loop.
- `runCreationTelemetryFanout` e os pontos criticos de creation/apply passaram a emitir em background.
- editor page, leitura de session, leitura de snapshot, `editor-commands` e leitura de semantic policy agora geram spans server-side minimos.
