# Modelo de Dominio Inicial (Fase 0)

## Entidades principais

### Workspace

- Agrupa projetos.
- Campos basicos: `id`, `slug`, `name`, `ownerIdentity`, timestamps.
- `ownerIdentity` permanece apenas como compatibilidade historica; autorizacao ativa ja depende de `workspace_memberships` + role.

### Project

- Unidade de trabalho principal.
- Pertence a `Workspace`.
- Define `template` inicial (ex.: `sitemap`, `flowchart`, `erd`, `graph`).
- `slug` continua obrigatorio tecnicamente no backend, mas na UX da Fase 5.2 e tratado como `ID tecnico` (somente leitura em area avancada).

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
- Em `payload.config`, os campos de UX/politica relevantes incluem:
  - `generateRootNode?: boolean`
  - `rootNodeName?: string`
  - `allowReapplyLayout?: boolean`

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
- Metadados opcionais de UX/politica no snapshot canonico:
  - `rootNodeName?: string`
  - `allowReapplyLayout?: boolean`
- `GraphVersion.viewport`: JSON separado com `ViewportState` para facilitar restauracao e diffs futuros
- Boundary Prisma valida snapshot com `GraphSnapshotSchema.parse(...)` na leitura e na escrita

## Projecoes de UX (Fase 5.2)

- Dashboard lista cada projeto com metadados derivados (read model de UI):
  - `selectedDiagramType?: "tree" | "flow" | "mindmap"` (derivado do snapshot quando existir)
  - `hasInitialSnapshot: boolean`
  - `snapshotVersionCount: number`
- Esses campos nao alteram o modelo canonico; sao composicoes de consulta para leitura.
- O Editor permite nomear versoes localmente para consulta rapida:
  - nome local nao altera entidade `EditorSnapshotVersion`
  - persistencia apenas no `localStorage` do navegador por `projectId`

## Distincao canônica (Fase 5.3)

### diagramType (produto) vs template (legado)

- `diagramType` e metadado de produto no snapshot (`tree`, `flow`, `mindmap`) e orienta layout e renderer visual.
- `template` permanece no `Project` como compatibilidade de fluxos legados (`graph`, `sitemap`, `flowchart`, `erd`).
- Regra de compatibilidade no frontend:
  - usar `diagramType` quando suportado
  - usar fallback por `template` quando `diagramType` estiver ausente/legado

### Layout de dominio vs renderer de UI

- O dominio persiste somente snapshot canonico (nos/arestas/viewport + metadados de layout).
- A renderizacao do canvas (nodeTypes/edgeTypes/background/minimap) fica no frontend via renderer registry.
- Consequencia: evolucao visual nao altera contrato de API nem schema de dominio.

## Invariantes do grafo (Fase 2A)

As invariantes abaixo complementam o schema estrutural (Zod) e sao aplicadas:

- apos leitura do snapshot (defensivo)
- apos aplicar command no editor
- antes de persistir snapshot (obrigatorio)

### Regras minimas

- `node.id` deve ser unico no snapshot.
- `edge.id` deve ser unico no snapshot.
- Toda edge deve ter `sourceNodeId` e `targetNodeId` nao vazios.
- Toda edge deve referenciar nodes existentes no snapshot.
- `node.position.x` e `node.position.y` devem ser numeros finitos.
- `viewport.x`, `viewport.y` e `viewport.zoom` devem ser numeros finitos.
- Labels de nodes/edges sao normalizadas com `trim`.
- Label de node nao pode ficar vazia apos `trim`.

### Politica de remocao de node (edges orfas)

- Ao remover um node no editor, as edges conectadas sao removidas automaticamente (cascade local no snapshot em memoria).
- Essa politica evita persistir edges orfas e reduz carga de validacao na UI.

### Politica de duplicidade de edge

- Edge duplicada exata (`sourceNodeId + targetNodeId + kind`) nao e permitida.
- Quando detectada, o backend retorna erro de dominio claro (`GRAPH_DUPLICATE_EDGE_RELATION`).
