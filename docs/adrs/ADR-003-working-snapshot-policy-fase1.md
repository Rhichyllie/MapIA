# ADR-003: Politica de snapshot de trabalho na Fase 1

- Status: Aceito (temporario)
- Data: 2026-02-23

## Contexto

O editor precisa persistir alteracoes reais antes de existir sistema completo de commits/diff/restore (Fase 3).

## Decisao

Na Fase 1, usar `GraphVersion` com `versionNumber = 1` como snapshot de trabalho mutavel:

- Wizard gera/atualiza o snapshot inicial em v1
- Editor salva manualmente sobre esse registro
- Leitura/escrita passa por boundary validado com `GraphSnapshotSchema.parse(...)`

## Consequencias

- Positivas: entrega incremental rapida com persistencia real e baixo retrabalho.
- Negativas: sem historico de commits ainda; mutabilidade de v1 e concessao temporaria.
