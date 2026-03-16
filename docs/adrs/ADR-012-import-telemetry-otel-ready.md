# ADR-012: Fase 4D - Telemetria interna estruturada e OTel-ready no pipeline de importacao

- Status: Aceito
- Data: 2026-02-24

## Contexto

A Fase 4C.3 endureceu o pipeline de importacao (`parse -> validate -> normalize -> parse -> validate`) com:

- `ExternalRef` deterministico para nodes/edges importados
- normalizacao canonica do snapshot importado
- boundary hygiene (sem vazar `schemaText` e `externalRefContext`)
- forte cobertura de determinismo/idempotencia/nao-mutacao

O proximo passo (4D) exige observabilidade de nivel enterprise para o pipeline de importacao:

- eventos/diagnosticos estruturados e tipados
- metricas derivadas (contagens, warnings, duracoes)
- summary consolidado ao final da importacao
- testabilidade deterministica (ordem/codigos/summary)
- preparo explicito para integracao futura com OpenTelemetry, sem acoplamento prematuro

## Decisao

Foi adotada uma infraestrutura de telemetria interna no modulo `importing/domain`, com contrato forte e collector por porta:

- `ImportTelemetryCollector` (porta)
- `NoopImportTelemetryCollector` (default)
- `BufferedImportTelemetryCollector` (captura em memoria para testes/uso interno)
- `createImportTelemetrySession(...)` (helper de sessao com sequencia deterministica e clock injetavel)

### Atualizacao incremental 4D.1 (hardening do contrato interno)

A 4D.1 endureceu o contrato interno de telemetria sem alterar o contrato publico das rotas/use-cases:

- codigos de telemetria extraidos para modulo dedicado:
  - `import-telemetry-codes.ts`
  - `IMPORT_TELEMETRY_CODES`
  - `ImportTelemetryCode` (union derivada)
- `sourceKind` tipado como union estavel:
  - `prisma-schema-inline`
  - `prisma-schema-file`
  - `postgres-live`
- `ImportTelemetryEvent.code` e inputs internos de `event(...)` passaram a usar `ImportTelemetryCode`
- sanitizacao ganhou limites defensivos deterministicos (anti-explosao de payload)
- `durationMs` de step foi endurecido para nunca negativo (clock nao monotônico nao derruba telemetria)

### Atualizacao incremental 4D.2 (governanca do contrato de telemetria)

A 4D.2 adicionou governanca explicita do contrato interno para reduzir drift antes da 4E:

- `eventName` centralizado em modulo dedicado (`import-telemetry-contract.ts`)
  - `IMPORT_TELEMETRY_EVENT_NAMES`
  - `ImportTelemetryEventName` (union derivada)
- `stepName` centralizado em modulo dedicado (`import-telemetry-contract.ts`)
  - `IMPORT_TELEMETRY_STEP_NAMES`
  - `ImportTelemetryStepName` (union derivada)
- `ImportTelemetryEvent` / `ImportTelemetryStep` / inputs internos passaram a usar unions tipadas
- importer deixou de usar strings soltas para `eventName` / `stepName`
- catalogo opcional de contrato de eventos (`IMPORT_TELEMETRY_EVENT_CONTRACT`) com metadados:
  - `code` (e `possibleCodes` quando o mesmo `eventName` pode variar por outcome)
  - `phase`
  - `defaultSeverity`
  - `description`
- testes de governanca anti-drift foram adicionados para listas completas de:
  - `codes`
  - `eventNames`
  - `stepNames`
  - consistencia do catalogo

### 1) Contrato tipado de evento interno

Cada evento usa contrato estruturado com foco em estabilidade e mapeamento futuro:

- `eventName` (string canonica)
- `sequence` deterministica (ordem estavel)
- `timestampMs?` opcional (somente quando habilitado)
- `phase`
- `severity`
- `code` (estavel/versionavel)
- `message`
- `attributes` (payload serializavel + sanitizado)
- `correlation` (`namespace`, `importRunId`, `projectId`, `sourceKind`, `sourceLabel?`)
- `durationMs?`
- `outcome?`

### 2) Contrato de step timing (span-like interno)

Foi introduzido `ImportTelemetryStep` para representar passos do pipeline de forma mapeavel para spans:

- `stepName`
- `phase`
- `startedSequence` / `endedSequence`
- `startedAtMs?` / `endedAtMs?`
- `durationMs`
- `status` (`success | partial | failure`)
- `attributes`
- erro associado (quando houver)

### 3) Summary consolidado de importacao

Ao final do pipeline (sucesso, parcial ou falha), a sessao emite `ImportTelemetrySummary` com:

- `namespace: importing.telemetry.v1`
- `correlation`
- `outcome`
- contagens:
  - nodes/edges/campos escalares gerados
  - candidatos de relacao
  - relacoes deduplicadas
  - `externalRefs` geradas (nodes/edges/total)
  - fallbacks de provenance (`nodeMiss`, `edgeMiss`)
  - `warningsByCategory`
- fases executadas + status + duracao
- flags:
  - `normalizationApplied`
  - `revalidatedAfterNormalize`
  - `hasPartialProvenance`
- metadados de origem sanitizados (`sourceKind`, `sourceLabel` sanitizado, contagens, flags)

### 4) Instrumentacao do pipeline (sem contaminar dominio com logger/vendor)

`prisma-schema-importer` foi instrumentado nos pontos principais:

1. input accepted / source identified
2. parse start/end
3. externalRefs mapping stats
4. provenance fallback warnings (node/edge miss)
5. validacao estrutural inicial start/end
6. validacao de invariantes inicial start/end
7. normalizacao start/end
8. re-parse start/end
9. revalidacao de invariantes start/end
10. finalize summary

Sem `console.log`, sem logger externo e sem dependencia de OpenTelemetry.

### 5) Sanitizacao e boundary hygiene na telemetria

A telemetria interna aplica sanitizacao defensiva de atributos/metadata:

- remove chaves proibidas:
  - `schemaText`
  - `externalRefContext`
- aceita somente payload serializavel (primitivos/arrays/objetos)
- nao despeja `externalRefs` completas em massa; usa contagens/flags/estatisticas
- nao serializa mapas brutos de provenance (`modelsByModelName`, `relationsByRelationName`)

### 5.1) Limites defensivos de payload (4D.1)

Para preparo de 4E (adapter OTel) e runtime enterprise, a sanitizacao passou a limitar payloads de forma deterministica:

- `maxStringLength = 512`
  - strings acima do limite recebem suffix estavel: `...[truncated]`
- `maxArrayItems = 50`
  - mantem os primeiros itens de forma deterministica
  - inclui marcador de truncamento no fim (ex.: `[ArrayTruncated:+N]`) preservando o cap final
- `maxObjectDepth = 4`
  - profundidade excedida vira marcador serializavel estavel: `[MaxDepthExceeded]`
- `maxObjectKeys = 50`
  - objetos muito largos preservam chaves iniciais e adicionam marcador `__telemetryTruncatedKeys`

Esses limites se aplicam a `event.attributes`, `step.attributes` e `summary.source.metadata`.

## Racional

- Mantem o contrato publico de importacao intacto (`snapshot + summary` atuais)
- Preserva separacao de camadas: observabilidade via porta interna, nao por logger/vendor
- Cria base forte para diagnostico, SLOs e tracing futuro sem retrabalho estrutural
- A sequencia deterministica reduz fragilidade de testes (relogio opcional/injetavel)
- O hardening 4D.1 reduz risco de explosao de atributos em exporter/collector futuro (OTel)
- O hardening 4D.2 reduz drift de nomes/contratos e torna mudancas internas explicitamente revisaveis antes da 4E

## Compatibilidade futura com OpenTelemetry

O design foi preparado para adapter futuro (ex.: `ImportTelemetryOtelAdapter`) com mapeamento direto:

- `ImportTelemetryStep` -> OTel Span
  - `stepName` -> span name
  - `phase/status/durationMs/attributes` -> span attributes/status/timing
- `ImportTelemetryEvent` -> OTel Event
  - `eventName`/`code`/`severity`/`message`/`attributes`
- `correlation` -> atributos padrao em spans/events
  - `importRunId`
  - `projectId`
  - `sourceKind`
  - `sourceLabel` (sanitizado, quando houver)
- `ImportTelemetrySummary` -> evento final/metrics derivadas/export batch

A Fase 4D NAO integra SDK/OTel real; apenas define contrato interno OTel-ready.

## Consequencias

### Positivas

- Observabilidade estruturada e testavel no pipeline de importacao
- Warnings de provenance ficam explicitamente codificados e contaveis
- Preparacao limpa para adapter OTel sem alterar dominio/importer depois
- `BufferedImportTelemetryCollector` facilita testes de forma deterministica
- Codigos e `sourceKind` centralizados/tipados reduzem drift e typos antes da 4E
- Limites de sanitizacao evitam payloads massivos em futuros exporters

### Negativas / tradeoffs

- Mais codigo no importer (instrumentacao de fases/erros)
- Overhead pequeno de alocacao/coleta (aceitavel para MVP/backend)
- Conjunto de `codes/eventName` vira contrato interno estavel e exige disciplina em mudancas
- Payloads truncados em telemetria sacrificam detalhe bruto em favor de seguranca/estabilidade (intencional)
- Nomes/catálogo de eventos/steps passam a exigir manutencao sincronizada com testes de governanca (intencional)

## Governanca do contrato interno (4D.2)

Mudancas em qualquer item abaixo devem ser tratadas como **breaking change interno** de telemetria:

- `IMPORT_TELEMETRY_CODES`
- `IMPORT_TELEMETRY_EVENT_NAMES`
- `IMPORT_TELEMETRY_STEP_NAMES`
- shape do `IMPORT_TELEMETRY_EVENT_CONTRACT`

Requisito de mudanca:

- atualizar testes de governanca anti-drift
- revisar impacto no futuro `ImportTelemetryOtelAdapter` (4E)
- atualizar documentacao (ADR + testing/architecture) quando houver alteracao semantica

## Nao objetivos desta etapa

- Integracao real com OpenTelemetry/Datadog/etc.
- Exportacao de telemetria por endpoint publico
- Logs soltos por `console`
- Alterar payload das rotas de importacao
