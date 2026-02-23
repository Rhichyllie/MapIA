# Modelo de Dominio Inicial (Fase 0)

## Entidades principais

### Workspace

- Agrupa projetos.
- Campos basicos: `id`, `slug`, `name`, `ownerIdentity`, timestamps.

### Project

- Unidade de trabalho principal.
- Pertence a `Workspace`.
- Define `template` inicial (ex.: `sitemap`, `flowchart`, `erd`, `graph`).

### Node (canonico)

- Representa elemento de informacao, entidade, pagina, passo de fluxo etc.
- Sempre pertence a um `Project`.
- Mantem `position`, `data` e `externalRefs`.

### Edge (canonico)

- Relaciona `Node -> Node`.
- Sempre pertence a um `Project`.
- Mantem `kind`, `label`, `data` e `externalRefs`.

### ExternalRef

- Referencia um elemento externo (manual/Postgres/Prisma inicialmente).
- Nao expor payload bruto de importador para a UI.
- Usado para rastreabilidade e futuras sincronizacoes.

### GraphVersion

- Snapshot imutavel do grafo + viewport.
- Base para versionamento, diff e restore.
- Fase 1 usa `versionNumber = 1` como snapshot de trabalho mutavel (temporario).

### ViewportState

- Estado de viewport do editor (`x`, `y`, `zoom`).
- Persistido junto ao snapshot e reutilizado em restauracao de versoes.

### AuditEvent

- Registro minimo de eventos relevantes (acao, entidade, ator, payload).

### WizardDraft

- Rascunho persistido do wizard por projeto.
- Guarda `status`, `currentStep`, `payload` e `lastError`.
- Payload e validado por Zod antes de persistir/retornar.

## Regra central

Todas as views (arvore, grafo, sitemap, fluxograma, ERD, timeline) devem projetar o mesmo grafo canonico, sem modelos paralelos.

## Relacoes (persistencia)

- `Workspace 1:N Project`
- `Project 1:N Node`
- `Project 1:N Edge`
- `Project 1:N GraphVersion`
- `Project 1:1 WizardDraft (opcional)`
- `Project 1:N ExternalRef`
- `Project/Workspace 1:N AuditEvent`
- `Edge N:1 Node(source)` e `Edge N:1 Node(target)`

## Snapshot (MVP)

- `GraphVersion.snapshot`: JSON com `nodes`, `edges`, `viewport`
- `GraphVersion.viewport`: JSON separado com `ViewportState` para facilitar restauracao e diffs futuros
- Boundary Prisma valida snapshot com `GraphSnapshotSchema.parse(...)` na leitura e na escrita
