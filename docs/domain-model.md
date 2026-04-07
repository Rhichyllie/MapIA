# Modelo de Dominio Inicial (Fase 0)

## Entidades principais

### Workspace

- Agrupa projetos.
- Campos basicos: `id`, `slug`, `name`, `ownerIdentity`, timestamps.
- `ownerIdentity` permanece apenas como compatibilidade historica; autorizacao ativa ja depende de `workspace_memberships` + role.

### Project

- Unidade de trabalho principal.
- Pertence a `Workspace`.
- `template` continua existindo apenas como compatibilidade legada (`sitemap`, `flowchart`, `erd`, `graph`).
- A identidade canonica do diagrama nao fica mais em `Project.template`; ela vive no snapshot.
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
- Metadados canonicos de identidade:
  - `diagramType?: "graph" | "tree" | "flow" | "mindmap"`
  - `diagramView?: "graph" | "erd" | "timeline" | "tree" | "sitemap" | "flow" | "mindmap"`
- Metadados opcionais de UX/politica no snapshot canonico:
  - `rootNodeName?: string`
  - `allowReapplyLayout?: boolean`
- `GraphVersion.viewport`: JSON separado com `ViewportState` para facilitar restauracao e diffs futuros
- Boundary Prisma valida snapshot com `GraphSnapshotSchema.parse(...)` na leitura e na escrita

## Projecoes de UX (Fase 5.2)

- Dashboard lista cada projeto com metadados derivados (read model de UI):
  - `selectedDiagramType?: "graph" | "tree" | "flow" | "mindmap"` (derivado do snapshot quando existir)
  - `hasInitialSnapshot: boolean`
  - `snapshotVersionCount: number`
- Esses campos nao alteram o modelo canonico; sao composicoes de consulta para leitura.
- O Editor permite nomear versoes localmente para consulta rapida:
  - nome local nao altera entidade `EditorSnapshotVersion`
  - persistencia apenas no `localStorage` do navegador por `projectId`

## Identidade canonica do diagrama (Fase 2A)

### Fonte de verdade

- `snapshot.diagramType` e a identidade estrutural canonica do diagrama.
- `snapshot.diagramView` e a projecao visual/experiencia usada para abrir o mesmo grafo.
- `Project.template` permanece no `Project` apenas como compatibilidade de fluxos legados.

### Regras de compatibilidade

- Pares validos atualmente:
  - `graph` -> `graph | erd | timeline`
  - `tree` -> `tree | sitemap`
  - `flow` -> `flow`
  - `mindmap` -> `mindmap`
- Snapshots legados ainda podem chegar sem `diagramView` ou com `diagramType` legado; o schema normaliza isso para o par canonico.
- `flowchart` nao e tipo canonico. Ele e normalizado para `diagramType=flow` e `diagramView=flow`.

### Boundary de criacao e view

- `initialView`, `layout`, `profile`, `startStrategy` e similares pertencem ao create flow.
- Essas escolhas podem influenciar o snapshot inicial, mas nao substituem a identidade canonica persistida.
- Renderers, modos de editor e aliases legados devem consumir `diagramView`/compatibilidade de boundary, nao disputar o papel de fonte de verdade.

### Layout de dominio vs renderer de UI

- O dominio persiste somente snapshot canonico (nos/arestas/viewport + identidade estrutural + metadados de layout).
- A renderizacao do canvas (nodeTypes/edgeTypes/background/minimap) fica no frontend via renderer registry e segue `diagramView`.
- Consequencia: evolucao visual nao altera o contrato estrutural do grafo.

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
