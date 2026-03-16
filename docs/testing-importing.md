# Estrategia de Testes do Modulo `importing` (Fases 4C.1-4E.2)

- Data de atualizacao: 2026-02-24
- Escopo: hardening de rastreabilidade (`ExternalRef`), normalizacao canonica, telemetria interna estruturada, adapter OpenTelemetry foundation e runtime/exporter/metricas OTel para o pipeline de importacao

## Objetivo

Garantir que o pipeline de importacao (`prisma-schema-file` / `postgres-live`) produza `GraphSnapshot`:

- deterministico
- canonico
- sem vazamento de boundary interno
- resiliente a provenance parcial/incompleta
- observavel por telemetria estruturada sem alterar contrato publico

## Camadas cobertas

### 1) `importing/domain/external-refs`

Cobertura atual:

- determinismo de `externalId` e `id`
- shape minimo estavel do wrapper `ExternalRef`
- normalizacao de path Prisma (`\\` -> `/`)
- guards/helpers de consumo:
  - `isImportedExternalRef(...)`
  - `isImportedExternalRefFromSystem(...)`
  - `findPrimaryImportedExternalRef(...)`
- rejeicao de refs malformadas (locator invalido ou mismatch `system/sourceKind`)
- convencao de nome de relacao Postgres:
  - `fk_${schema}_${table}_${constraint}`

### 2) `importing/domain/imported-snapshot-normalizer`

Cobertura atual:

- ordenacao canonica de `nodes` e `edges`
- ordenacao estavel de `externalRefs`
- remocao de chaves `undefined` em `data`
- `data.fields` sempre array para nodes importados
- idempotencia:
  - snapshot
  - node
  - edge
- nao-mutacao:
  - snapshot de entrada
  - node de entrada
  - edge de entrada
- comparators (desempate por `id`)
- schema-safe after normalize:
  - `GraphSnapshotSchema.parse(normalizedSnapshot)` continua aceitando o resultado

### 3) `importing/domain/prisma-schema-importer`

Cobertura atual (fim-a-fim de dominio):

- import Prisma texto basico (models/relations/layout)
- deduplicacao de relacoes espelhadas
- `ExternalRef` em nodes/edges para `prisma-schema-file`
- `ExternalRef` em nodes/edges para `postgres-live`
- fallbacks sem crash:
  - node sem match de provenance
  - edge sem match de provenance
  - provenance parcial (match de edge sem match de node)
- sem contexto:
  - `externalRefs: []`
- canonicidade/determinismo:
  - mesma entrada + mesmo contexto => snapshot identico
  - ordem diferente de `model` no schema => snapshot canonico equivalente
  - path `\\` vs `/` => snapshot equivalente
- shape final do snapshot importado:
  - `viewport` preservado
  - `externalRefs` arrays
  - `edge.data` sem `undefined` nas chaves criticas
  - `relationName` unnamed omitido

### 4) `importing/domain/import-telemetry`

Cobertura atual:

- contrato de collector:
  - `ImportTelemetryCollector`
  - `NoopImportTelemetryCollector`
  - `BufferedImportTelemetryCollector`
- `createImportTelemetrySession(...)` com:
  - sequencia deterministica
  - clock injetavel (quando necessario)
  - sanitizacao defensiva de atributos/summary metadata
  - redaction de chaves proibidas (`schemaText`, `externalRefContext`)
  - limites deterministicos de payload:
    - string (truncamento)
    - array (cap + marcador)
    - profundidade (marker)
    - chaves por objeto (cap + marcador)
  - `durationMs` de steps nunca negativo (clock fake nao monotônico)
- snapshot do collector buffered imutavel para assercoes de teste
- governanca de contrato (4D.2):
  - `eventName` e `stepName` centralizados e tipados (union derivada)
  - testes de drift para listas completas de `codes`, `eventNames`, `stepNames`
  - teste de consistencia do catalogo de eventos (`code/phase/defaultSeverity/description`)

### 5) `importing/domain/prisma-schema-importer` (telemetria 4D)

Cobertura atual adicional (instrumentacao do pipeline):

- ordem de eventos estavel e codigos de telemetria estaveis
- determinismo da sequencia de eventos/steps/summary para mesma entrada + mesmo clock fake
- metricas derivadas no summary:
  - contagens de nodes/edges/campos/relacoes
  - `externalRefs` geradas
  - fallbacks de provenance
  - `warningsByCategory`
- warnings de provenance com codigos estaveis:
  - `IMPORT_PROVENANCE_NODE_MISS`
  - `IMPORT_PROVENANCE_EDGE_MISS`
- flags de hardening 4C.3 refletidas no summary:
  - `normalizationApplied`
  - `revalidatedAfterNormalize`
  - `hasPartialProvenance`
- nao regressao do snapshot importado ao habilitar telemetria:
  - sem collector (default)
  - `NoopImportTelemetryCollector`
  - `BufferedImportTelemetryCollector`
- sanitizacao/boundary hygiene da telemetria:
  - sem `schemaText`
  - sem `externalRefContext`
  - sem maps brutos de provenance (`modelsByModelName`, `relationsByRelationName`)
  - sem dump massivo de `externalRefs`
- falhas instrumentadas e consistencia de finalize:
  - falha de parse emite `PARSE_FAILED` + `PIPELINE_FAILED` + `FINALIZE_SUMMARY`
  - falha de revalidacao (induzida por mock controlado) emite `PIPELINE_FAILED` + `FINALIZE_SUMMARY`
  - `recordSummary(...)` chamado uma unica vez por execucao com falha
  - protecao de finalize sem duplicacao coberta por assercoes de contagem

### 6) `importing/application` + rotas (boundary hygiene)

Cobertura atual:

- `schemaText` nao vaza para `result.source`
- `externalRefContext` nao vaza para `result.source`
- rotas de importacao (`prisma-file` / `postgres`) nao retornam `schemaText`
- rotas de importacao (`prisma-file` / `postgres`) nao retornam `externalRefContext`

### 7) `importing/infra/observability/import-telemetry-otel-adapter` (4E.1)

Cobertura atual adicional (adapter OTel foundation, sem exporter real):

- cria `1` span raiz por `importRunId`
- cria `1` child span por `ImportTelemetryStep`
- mapeia `ImportTelemetryEvent` para `span events` com atributos canonicos (`import.*`)
- mapeia `ImportTelemetrySummary` para atributos consolidados no root + fechamento de lifecycle
- status OTel coerente:
  - root `OK` em `success|partial`
  - root `ERROR` em `failure`
  - child `ERROR` em `step.status=failure`
- idempotencia de finalize:
  - summary duplicado nao duplica `span.end()`
  - run finalizado entra em tombstone (bounded) para bloquear eventos/steps tardios
- tombstones bounded:
  - exceder `maxFinalizedRunTombstones` remove os runs finalizados mais antigos
- fallback seguro fora de ordem:
  - `summary` antes de eventos/steps nao quebra runtime
  - eventos/steps apos finalize sao descartados com warning interno opcional
- degradacao segura em falhas do tracer:
  - `startSpan`
  - `addEvent`
  - `setAttributes`
  - `setStatus`
  - `recordException`
  - `end`
  - falhas viram warning interno `TRACER_OPERATION_FAILED` sem quebrar o pipeline
- replay opcional de eventos no child span:
  - `recordEventsOnRootOnly=false`
  - correlacao deterministica por `phase` + janela de `sequence`
- cleanup de registry:
  - nenhum run ativo permanece apos `recordSummary(...)`
- payload interno ja sanitizado/truncado continua mapeavel para OTel sem re-sanitizacao
- teste de integracao leve com `importPrismaSchemaToGraphSnapshot(...)` + tracer fake:
  - root span criado
  - child spans emitidos
  - eventos-chave (`input.accepted`, `parse.start`, `finalize.summary`) presentes
  - summary finaliza root span

### 8) `server/observability` + wiring 4E.2 (runtime/exporter/metrics)

Cobertura atual adicional (4E.2):

- parser de env/config OTel (`src/server/observability/otel-runtime-config.ts`)
  - defaults seguros
  - parsing valido de endpoint/headers/sampler/tuning
  - parsing defensivo de valores invalidos (warnings + fallback)
  - warning quando `OTEL_ENABLED=true` sem endpoint valido
  - snapshot de log sem vazamento de headers
- runtime OTel (`src/server/observability/otel-runtime.ts`)
  - bootstrap enabled/disabled
  - start idempotente
  - shutdown idempotente
  - degradacao segura em falha de exporter/SDK/bootstrap
  - isolamento de callback de warning
  - singleton global de runtime server-side (`getOrCreateServerOpenTelemetryRuntime`)
- provider de collector do importing (`import-telemetry-collector-provider.ts`)
  - entrega adapter OTel com tracer/meter reais do runtime
  - reusa adapter
  - fallback `Noop`/custom quando runtime indisponivel
- metricas do adapter (`ImportTelemetryOtelAdapter`)
  - counters/histograms canonicos (`importing.telemetry.*`)
  - attrs de baixa cardinalidade (sem `importRunId`)
  - degrada com seguranca quando meter/instrumentos falham
- wiring de use-case de importacao
  - `ImportPrismaSchemaToSnapshotUseCase` aceita `telemetryCollectorFactory` opcional (interno)
  - resultado publico (`snapshot + summary`) permanece inalterado

## Garantias de compatibilidade (4C.1 -> 4E.2)

- Nao houve mudanca no contrato publico das rotas de importacao.
- Nao houve mudanca nas convencoes de `ExternalRef`/`locator`.
- IDs deterministicos (nodes/edges/refs) foram preservados.
- A normalizacao canonica e interna ao dominio de `importing`.
- A telemetria 4D e interna/opt-in no importer e nao altera o payload publico de resposta.
- A 4E.1 nao altera `snapshot + summary` do importer; apenas consome a telemetria interna via `ImportTelemetryCollector`.
- A 4E.2 nao altera payload publico das rotas/use-cases; apenas adiciona wiring interno para runtime OTel + fallback seguro.

## Determinismo da telemetria (4D)

- A ordem principal dos eventos e validada por `code` (contrato interno estavel).
- A sequencia de steps/fases e validada por `stepName + phase + status`.
- Quando timestamps sao usados em teste, o clock e injetado (fake clock incremental), evitando dependencia de tempo real.
- O summary consolidado e comparado como objeto estruturado (nao por texto/log).
- Truncamentos/markers de sanitizacao tambem sao testados por valor exato (determinismo de payload sanitizado).
- Listas de contrato (`codes` / `eventNames` / `stepNames`) sao travadas por testes de governanca para detectar rename/add/remove involuntario.

## Observacoes para evolucao futura

- Mudancas nos comparators canonicamente usados pelo normalizer impactam:
  - deep-equality de snapshots
  - diffs persistidos/esperados
  - snapshots de teste
- Por isso, qualquer ajuste futuro de ordenacao deve vir acompanhado de:
  - teste de desempate
  - teste de idempotencia
  - revalidacao do snapshot normalizado
- Ajustes em `eventName`/`code`/`stepName` de telemetria devem ser tratados como mudanca de contrato interno:
  - atualizar testes de ordem/codigos
  - atualizar testes de governanca (listas + catalogo)
  - revisar mapeamento do adapter OTel (`importing/infra/observability`)
- Ajustes nos limites de sanitizacao (string/array/depth/keys) mudam shape de payload telemetrico e exigem:
  - atualizacao de testes de limites
  - revisao do impacto no futuro exporter OTel
