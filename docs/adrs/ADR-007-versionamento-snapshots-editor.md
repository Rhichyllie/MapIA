# ADR-007: Versionamento real de snapshots no Editor (working snapshot + versoes imutaveis)

- Status: Aceito
- Data: 2026-02-23

## Contexto

A Fase 2/3A consolidou o fluxo de edicao do editor com:

- query inicial do snapshot
- autosave por commands
- save manual do snapshot completo

Esse fluxo funciona sobre um `working snapshot` mutavel (persistido hoje no armazenamento legado baseado em `GraphVersion` v1).

Para evoluir para diff/restore (Fase 3C) era necessario introduzir historico real de checkpoints sem quebrar:

- endpoints atuais do editor
- UX atual de autosave/manual save
- regra de negocio centralizada no backend

## Decisao

Separar explicitamente dois conceitos:

- `working snapshot` (mutavel): continua sendo a fonte operacional de edicao do editor
- `versoes` de snapshot (imutaveis): checkpoints historicos persistidos em tabela dedicada `editor_snapshot_versions`

Foi adicionado um modulo `versioning` com casos de uso para:

- criar versao a partir do `working snapshot` atual
- listar versoes por projeto (mais recente primeiro)
- buscar detalhe de versao por `id`

APIs adicionadas:

- `POST /api/projects/[projectId]/snapshot-versions`
- `GET /api/projects/[projectId]/snapshot-versions`
- `GET /api/projects/[projectId]/snapshot-versions/[versionId]`

Na UI (Fase 3B) foi adicionado apenas um checkpoint manual (`Criar versao`) com feedback amigavel.

## Por que separar `working snapshot` de `versoes`

- Preserva UX atual: autosave e save manual continuam operando sobre um estado mutavel simples.
- Mantem semantica clara:
  - `working snapshot` pode ser sobrescrito
  - `versao` nao pode ser alterada apos criada
- Evita conflitar responsabilidades (edicao vs historico/auditoria).
- Facilita evolucao incremental para diff/restore sem reescrever o editor inteiro.

## Trade-offs

- Positivos:
  - menor risco de regressao no fluxo existente do editor
  - API de historico clara e isolada
  - testes de boundary/use-case mais simples
- Negativos:
  - duplicacao de snapshot JSON entre `working snapshot` e versoes
  - armazenamento adicional por checkpoint
  - ainda existe uma divida tecnica de naming/armazenamento legado (`graph_versions` usado como working snapshot)

## Por que nao versionar por command neste momento

Nao foi adotado versionamento por command/event sourcing na 3B porque isso exigiria:

- redefinir modelo de persistencia do editor
- replay/compaction/projecoes
- regras de consistencia e observabilidade adicionais
- mudanca maior na estrategia de testes e na API

Para o MVP, checkpoints por snapshot completo sao suficientes para:

- criar historico manual confiavel
- preparar diff/restore
- manter simplicidade operacional e menor risco de flake/regressao

## Como isso prepara a Fase 3C (diff/restore)

- `GET /snapshot-versions` fornece lista ordenada de checkpoints para selecao.
- `GET /snapshot-versions/[id]` fornece snapshot completo para comparacao/diff.
- `POST /snapshot-versions` padroniza a criacao de baseline/checkpoint manual.
- A separacao `working snapshot` vs `versao` permite implementar restore como uma operacao explicita (copiar uma versao para o working snapshot) sem violar a imutabilidade do historico.
