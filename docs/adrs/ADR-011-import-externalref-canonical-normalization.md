# ADR-011: Fase 4C - rastreabilidade por ExternalRef e normalizacao canonica do snapshot importado

- Status: Aceito
- Data: 2026-02-24

## Contexto

As fases 4A e 4B entregaram:

- importacao de schema Prisma texto para `GraphSnapshot`
- fontes reais de importacao (`prisma-schema-file` e `postgres-live`)
- orquestracao backend unificada com contratos consistentes

O proximo incremento (4C.1 -> 4C.3) precisava endurecer o resultado da importacao sem mexer em UI/Wizard:

- rastrear origem dos elementos importados (nodes/edges)
- manter determinismo para reimport/diff/debug
- estabilizar shape e ordenacao do snapshot importado (canonicidade)
- evitar vazamento de contexto interno (`schemaText`, `externalRefContext`)

## Decisao

### 1) ExternalRef de importacao (4C.1)

Foi adotado um wrapper canonicamente serializavel usando o `ExternalRef` ja existente do grafo, com `locator` especializado por origem de importacao:

- `prisma-schema-file`
  - `filePath`, `modelName?`, `fieldName?`, `relationName?`
- `postgres-live`
  - `schema`, `table`, `column?`, `constraint?`

O `externalId` e deterministico (`import:<sourceKind>?...`) e o `id` do `ExternalRef` e derivado deterministicamente a partir de `system + externalId`.

### 2) Helpers/guards de consumo (4C.2)

Foram adicionados helpers puros no dominio de `importing` para uso futuro por diff/highlight/debug/reconciliacao, sem acoplar UI:

- `isImportedExternalRef(...)`
- `isImportedExternalRefFromSystem(...)`
- `findPrimaryImportedExternalRef(...)`

Esses helpers validam shape de locator e coerencia `system <-> sourceKind`.

### 3) Normalizacao canonica do snapshot importado (4C.3)

Foi criada uma normalizacao explicita no dominio de `importing` para `GraphSnapshot` gerado pela importacao:

- normalizacao de node importado
- normalizacao de edge importada
- `externalRefs` sempre array e ordenados de forma estavel
- `data.fields` sempre array para nodes importados
- remocao de chaves `undefined` em `data` (ex.: `relationName` unnamed fica omitido)
- ordenacao canonica e deterministica de `nodes` e `edges`

### 4) Revalidacao pos-normalizacao (hardening final)

O fluxo final do importer foi padronizado para robustez maxima:

`parse -> validate -> normalize -> parse -> validate`

Isso garante que qualquer transformacao final ainda retorna snapshot estruturalmente valido e semanticamente consistente.

## Racional

- Mantem compatibilidade com o grafo canonico global (`ExternalRef` nao foi alterado globalmente)
- Prepara base para fases futuras (reimport, diff de importacao, highlight de origem) sem antecipar UI
- Reduz variacao estrutural do snapshot importado, melhorando:
  - persistencia
  - comparacao por deep-equal
  - diffs
  - debug
- Aumenta resiliencia contra refactors do normalizer com:
  - idempotencia
  - nao-mutacao
  - revalidacao pos-transformacao

## Consequencias

### Positivas

- Snapshot importado sai com shape mais previsivel e canonicamente ordenado
- `ExternalRef` fica util de fato para consumo interno e debug
- Hardening forte de testes protege regressao silenciosa em determinismo/canonicidade

### Negativas / tradeoffs

- Fluxo do importer faz validacao adicional (custo pequeno e aceitavel)
- Comparators canonicos passam a influenciar deep-equality e diffs; mudancas futuras neles exigem cuidado e testes

## Nao objetivos desta etapa

- UI de highlight/inspecao de `ExternalRef`
- endpoint novo para consultar `ExternalRef`
- telemetria/observabilidade (fica para fase posterior)
- alterar contrato publico das rotas de importacao

