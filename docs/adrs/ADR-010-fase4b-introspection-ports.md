# ADR-010: Fase 4B - contratos de portas para introspecao real (Prisma file / Postgres)

- Status: Aceito
- Data: 2026-02-24

## Contexto

A Fase 4A entregou um importador MVP de texto Prisma (`schemaText`) para `GraphSnapshot`, com API/UI minima no editor.

O proximo incremento (4B) precisa habilitar fontes "reais" de importacao sem quebrar o fluxo atual:

- arquivo `.prisma` do usuario (filesystem/workspace)
- banco Postgres local/remoto (introspeccao)

Ao mesmo tempo, o ambiente local/E2E ainda pode falhar por infraestrutura offline (Docker/Postgres), entao a evolucao da 4B deve manter acoplamento baixo e diagnósticos claros.

## Decisao

Foi criada uma camada de contratos em `src/modules/importing/application/ports.ts` para representar fontes de introspeccao, sem implementar adaptadores reais nesta etapa.

Portas definidas:

- `PrismaSchemaFileImportSourcePort`
  - le um arquivo `.prisma` real e retorna artefato de importacao com `schemaText`
- `PostgresImportIntrospectionPort`
  - introspecta um banco Postgres e retorna `schemaText` Prisma para reaproveitar o parser/mapper da Fase 4A

Artefato comum:

- `ImportIntrospectionArtifact`
  - `sourceKind`, `sourceLabel`, `schemaText`, `warnings`, `metadata`

## Racional

- Reaproveita o parser/mapper da 4A (texto Prisma -> `GraphSnapshot`) como pipeline estavel
- Permite evoluir adapters reais (filesystem / Prisma CLI / SQL introspection) sem mexer na UI ou no caso de uso atual
- Mantem a Fase 4B incremental e testavel, com menor risco de regressao em Fase 3/4A

## Nao objetivos desta etapa

- executar `prisma db pull`
- conectar em Postgres real
- criar endpoint/UI novos para importacao por arquivo ou conexao
- alterar regra de negocio do importador MVP 4A

## Limitacao atual (4B.2 hardening)

Na introspeccao Postgres (adapter `information_schema`), quando existem multiplas FKs entre o mesmo par de tabelas (`source -> target`), o importador atual aplica dedupe com `warning`.

Motivo:

- o grafo canonico atual rejeita edges duplicadas com o mesmo `source + target + kind`

Importante:

- isso e uma limitacao temporaria da normalizacao/importacao para o grafo atual
- nao significa perda de leitura da FK no banco (a introspeccao detecta e reporta via warning/metadata)
- a evolucao para representacao mais rica fica preparada para 4B.3+ / fase posterior

## Consequencias / proximos passos

- 4B.1: implementar adapter de leitura de arquivo `.prisma` para `PrismaSchemaFileImportSourcePort`
- 4B.2: implementar adapter de introspeccao Postgres (preferencialmente produzindo schema Prisma texto)
- 4B.3: orquestrar novos use-cases/endpoints reutilizando `ImportPrismaSchemaToSnapshotUseCase`
