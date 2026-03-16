# ADR-004: CQRS leve no backend do Editor (Fase 2A)

- Status: Aceito
- Data: 2026-02-23

## Contexto

Na Fase 1, o editor ja persistia snapshot de trabalho real, mas o backend ainda precisava deixar mais explicita a separacao entre:

- leitura do snapshot para a UI
- mutacoes incrementais por comandos

Tambem era necessario manter compatibilidade com o fluxo existente (manual save de snapshot completo e endpoint legado usado pela UI da Fase 1).

## Decisao

Adotar CQRS leve no modulo `editor`, sem introduzir infraestrutura adicional (event store, projections dedicadas, filas etc.).

Implementacao:

- Query use-case dedicado: `GetWorkingSnapshotForEditorUseCase`
- Command use-case dedicado para 1 comando: `ApplyEditorCommandUseCase`
- Manutencao de `ApplyEditorCommandsUseCase` para compatibilidade com payload legado em lote
- Separacao explicita de port de leitura/escrita no modulo `editor` (`EditorSnapshotQueryPort` e `EditorSnapshotCommandPort`)
- Rotas HTTP separadas por intencao:
  - `GET /api/projects/[projectId]/editor-snapshot` (query explicita)
  - `POST /api/projects/[projectId]/editor-commands` (command)
- Endpoint legado `GET|PUT /working-snapshot` mantido por compatibilidade/manual save

## Consequencias

- Positivas:
  - backend do editor fica mais claro para evoluir autosave e auditoria na Fase 2B/3
  - rotas ficam finas, com regra de negocio concentrada em use-cases/modulos
  - melhor testabilidade de leitura vs mutacao
- Negativas:
  - pequena duplicacao/compatibilidade temporaria entre endpoint novo e endpoint legado
  - ainda existe use-case batch legado, o que adiciona superficie de manutencao (temporaria)

## Alternativas consideradas

- Migrar imediatamente para command unico e remover batch/endpoint legado:
  - rejeitada nesta fase para nao quebrar o fluxo da Fase 1.
- CQRS completo com persistencia de comandos/eventos:
  - rejeitada por overengineering para a fase atual.
