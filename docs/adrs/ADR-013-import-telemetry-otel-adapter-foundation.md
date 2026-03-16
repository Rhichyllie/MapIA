# ADR-013: Fase 4E.1 - Adapter OpenTelemetry foundation para telemetria de importacao

- Status: Aceito
- Data: 2026-02-24

## Contexto

A Fase 4D (incluindo 4D.1 e 4D.2) consolidou a telemetria interna do modulo `importing` com:

- contrato tipado e governado (`ImportTelemetryEvent`, `ImportTelemetryStep`, `ImportTelemetrySummary`)
- sanitizacao defensiva e limites de payload no dominio
- collector port (`ImportTelemetryCollector`) com implementacoes `noop` e `buffered`
- instrumentacao do pipeline de importacao sem acoplar o dominio a SDK/vendor

O proximo passo (4E.1) exige uma bridge real para tracing OpenTelemetry, preservando:

- dominio desacoplado do SDK OTel
- contrato interno como fonte de verdade
- lifecycle robusto por `importRunId`
- base pronta para evolucao (4E.2+: runtime/exporter/metricas) sem retrabalho estrutural

## Decisao

Foi adotado um adapter de infraestrutura dedicado:

- `src/modules/importing/infra/observability/import-telemetry-otel-adapter.ts`

Esse adapter:

- implementa `ImportTelemetryCollector`
- recebe `tracer` por injecao explicita (sem singleton global hardcoded)
- recebe `config` explicita (nomes/prefixos/flags/callbacks)
- aceita `clock` opcional para fallback de lifecycle/timestamps
- mapeia o contrato interno 4D diretamente para spans/events OTel

Tambem foi adicionada factory explicita:

- `createImportTelemetryOtelAdapter(...)`

## Estrategia de tracing adotada (4E.1)

### Span raiz por import run

- `1` span raiz por `importRunId`
- nome default: `importing.pipeline` (configuravel por `rootSpanName`)
- span raiz e criado de forma lazy no primeiro sinal observado do run:
  - `recordEvent(...)`
  - `recordStep(...)`
  - `recordSummary(...)`

### Child spans por step

- `1` child span por `ImportTelemetryStep`
- child span recebe atributos canonicos + atributos de step (`status`, `duration`, sequences, erro)
- child span e encerrado no `recordStep(...)` (span-like post-hoc, usando timestamps do contrato quando disponiveis)

### Eventos do contrato no tracing

- `ImportTelemetryEvent` e mapeado para `span.addEvent(...)` no span raiz por padrao
- opcionalmente pode ser duplicado no child span quando `recordEventsOnRootOnly=false`, usando correlacao deterministica por janela de `sequence` (`startedSequence < event.sequence < endedSequence`) e `phase`
- sem heuristica por texto/log

### Fechamento do ciclo (lifecycle)

- `recordSummary(...)` consolida atributos finais no root span
- `recordSummary(...)` define status OTel final do root span
- `recordSummary(...)` encerra o root span e finaliza o run
- finalize e idempotente na pratica via tombstone de run finalizado (bounded), bloqueando `summary` duplicado e eventos/steps tardios

## Mapeamento canonico de atributos (4E.1)

Prefixo default:

- `import.`

Chaves canonicas estaveis incluem:

- `import.namespace`
- `import.run_id`
- `import.project_id`
- `import.source_kind`
- `import.source_label`
- `import.phase`
- `import.event_name`
- `import.code`
- `import.severity`
- `import.outcome`

Mapeamentos adicionais:

- `ImportTelemetrySummary` -> atributos consolidados no root span:
  - contagens
  - flags
  - metadata de origem (ja sanitizada)
  - outcome final
- `ImportTelemetryStep` -> atributos no child span:
  - `step_name`
  - `phase`
  - `status`
  - `duration_ms`
  - sequences (`started_sequence`, `ended_sequence`)
  - erro (`error.name`, `error.message`, `error.code?`)

Observacao:

- O adapter NAO re-sanitiza payloads.
- O adapter apenas converte o payload interno ja sanitizado para atributos compativeis com OTel (flatten/serializacao para tipos aceitos).

## Convencao de status OTel (4E.1)

### Root span

- `OK` para `summary.outcome = success`
- `OK` para `summary.outcome = partial`
- `ERROR` para `summary.outcome = failure`

Racional para `partial => OK`:

- `partial` representa degradacao/resultado incompleto, nao necessariamente falha operacional do span de pipeline
- a degradacao continua explicitamente visivel em `import.outcome=partial` e demais atributos/contagens de warning/fallback

### Child spans (steps)

- `OK` para `step.status = success`
- `OK` para `step.status = partial`
- `ERROR` para `step.status = failure`

Erros de step:

- `recordException(...)` com mensagem serializada do erro (sem payload sensivel)
- atributos `import.error.*` no child span

## Lifecycle/state interno (registry + cleanup)

O adapter mantem estado interno em memoria por `importRunId`:

- registry de runs ativos (`Map`)
- root span + contexto parent para child spans
- buffer de eventos (para replay opcional em child spans)
- metadados de child spans gravados
- flags de `summaryReceived` / `finalized`
- ultimo evento de falha (para enriquecer status final do root)

Protecoes:

- cleanup de runs ativos apos finalize
- tombstones bounded de runs finalizados (evitam double-finalize e late writes)
- `maxFinalizedRunTombstones` e tratado de forma defensiva (normalizado para inteiro >= 0)
- warnings internos opcionais (`onInternalAdapterWarning`) para diagnostico

## Testabilidade (4E.1)

Foi adotada suite dedicada com tracer/span fake:

- `src/modules/importing/infra/observability/import-telemetry-otel-adapter.test.ts`

Cobertura inclui:

- root span por `importRunId`
- child spans por step
- mapeamento canonico de `recordEvent`
- consolidacao/finalize de `recordSummary`
- idempotencia de finalize
- status `OK/ERROR` em root/steps
- payload sanitizado/truncado mapeavel
- fallback fora de ordem
- cleanup de registry
- eviction de tombstones bounded
- degradacao segura quando operacoes do tracer falham (`startSpan/addEvent/setAttributes/setStatus/recordException/end`)
- replay opcional e deterministico de eventos em child span (`recordEventsOnRootOnly=false`)
- integracao leve com `importPrismaSchemaToGraphSnapshot(...)`

## Nao objetivos desta etapa (4E.1)

- exporter OTLP real
- bootstrap global de SDK OTel
- `MeterProvider` e metricas complexas
- integracoes Datadog/Tempo/Jaeger
- dashboards/SLOs externos

## Consequencias

### Positivas

- Base de tracing OTel real sem contaminar o dominio
- Lifecycle por run robusto e pronto para evolucao
- Mapeamento canonico estavel reduz drift para 4E.2+
- Testes fortes do adapter evitam regressao silenciosa

### Tradeoffs

- Adapter tem estado interno em memoria (intencional nesta fase)
- Tombstones bounded sao uma heuristica operacional para idempotencia pos-cleanup (aceitavel para foundation)
- Parte do payload e flatten/serializada para caber no tipo de atributos OTel (sem perder o contrato interno como fonte de verdade)
