# Editor Kernel + Diagram Modes

## Kernel

O `EditorShell` permanece como orquestrador do editor, concentrando o kernel compartilhado:

- estado base do shell, seleção, viewport e foco
- autosave, pending commands e sincronização com serviços remotos
- clipboard, quick find, versionamento e painéis compartilhados
- composição do canvas React Flow e integração com inspeção/semântica

## Diagram Mode

Um `diagram mode` representa o comportamento específico de um tipo de diagrama. Cada modo expõe contrato explícito para:

- renderer
- presentation labels/defaults
- capabilities
- contextual actions
- quick add
- layout/reflow
- inspector strategy
- semantic strategy
- selection/HUD behavior

Os modos ativos nesta fase são `flow`, `graph` e `erd`. Os modos `tree`, `sitemap`, `mindmap` e `timeline` já existem no registry com contratos válidos e fallbacks preparados.

## Registry

O registry central fica em `src/components/editor/diagram-modes/registry.ts`.

Ele resolve o modo por:

1. `diagramType` explícito
2. alias legado, como `flowchart -> graph`
3. fallback por `template`
4. fallback final para `graph`

O shell agora consome o modo resolvido para buscar renderer, layout, quick add, inspector e contextual actions, em vez de espalhar branches de resolução por tipo.

## Como adicionar um novo modo

1. Criar um módulo em `src/components/editor/diagram-modes/modes/`.
2. Declarar capabilities, maturity e aliases/template fallbacks.
3. Conectar strategies de renderer, layout, quick add, contextual actions, inspector, semantic e selection.
4. Registrar o módulo no `registry.ts`.
5. Adicionar testes de contrato do modo no `registry.test.ts`.

## Próximas fases

- decompor trechos restantes do `EditorShell` em componentes/adapters menores
- migrar mais branches residuais de renderização/inspector para strategies
- aprofundar módulos preparados (`tree`, `sitemap`, `mindmap`, `timeline`) sem reentupir o shell

## Fase 2.2

Na fase `Editor Shell Composition Split`, a base de `diagram modes` foi preservada e o shell passou a atuar mais claramente como compositor:

- controllers especializados agora separam `persistence`, `command guard`, `clipboard`, `selection`, `canvas ui`, `inspector`, `semantic`, `versions` e `erd`
- painéis grandes foram extraídos para componentes apresentacionais em `src/components/editor/shell/`
- o shell continua resolvendo `diagramMode` uma vez e compõe top bar, HUD, inspector e side panels em cima desse contrato

### Controllers atuais

- `useEditorPersistenceController`: autosave, revisão, pending commands e flush
- `useEditorCommandController`: guard de direct-write e sincronização com a fila pendente
- `useEditorClipboardController`: leitura/escrita do fragmento MapIA no clipboard e fallback para texto
- `useEditorSelectionController`: seleção base de node/edge e resolução do item selecionado
- `useEditorCanvasUiController`: painéis, quick find e focus mode
- `useEditorInspectorController`: modo do inspector, sections e drafts técnico/operacional
- `useEditorSemanticController`: audit, repair, override e state semântico
- `useEditorVersionsController`: create/refresh/compare/restore e nomes locais de versão
- `useEditorErdController`: import/export, quick relate, drafts de campos e materialização

### Painéis extraídos

- `EditorShellTopBar`
- `EditorMetadataPanel`
- `EditorPrismaImportPanel`
- `EditorVersionsPanel`
- `EditorSelectionHudSurface`
- `EditorInspectorFrame`
- `EditorSemanticAuditPanel`

### O que permaneceu no shell

Permaneceu no `EditorShell` o que ainda é orquestração central entre múltiplos eixos ao mesmo tempo:

- composição do canvas React Flow
- fluxos de mutação que ainda cruzam semântica, revisão, seleção e persistência
- branches residuais dos inspectors mais profundos de `flow`, `graph` e `erd`

Isso é intencional nesta fase: a 2.2 troca a composição-base do shell sem tentar concluir toda a migração profunda dos workflows.

### Helpers

`src/components/editor/diagram-modes/helpers.ts` continua restrito a montagem de strategies e defaults por modo. A pressão de utilitários de shell foi desviada para controllers e componentes em `src/components/editor/shell/`, evitando transformar `helpers.ts` no novo shell.

### Próxima etapa

- extrair fluxos restantes de command orchestration e clipboard semânticos para adapters menores
- quebrar os inspectors residuais em módulos por modo
- ampliar smoke/integration da página inteira do editor em cima da nova composição

## Fase 2.3

Na fase `Diagram Workflow Extraction & Mode Adapters`, o foco saiu da composição geral e foi para os workflows profundos que ainda pesavam no `EditorShell`.

### O que saiu do shell

- command orchestration de direct-write para `useEditorCommandController`
- clipboard workflow do editor para `useEditorClipboardController`
- resolução e renderização dos inspectors profundos para adapters por modo

Isso reduz o papel do shell como executor direto de mutações. O `EditorShell` continua resolvendo `diagramMode` uma vez, mas passa a delegar command boundary, clipboard semantic workflow e inspector rendering para camadas específicas.

### Command orchestration

`useEditorCommandController` deixou de ser só um guard de queue flush e passou a concentrar:

- decisão de bypass ou flush antes de mutações diretas
- boundary única para `direct write`
- aplicação consistente do resultado remoto no snapshot e na revisão
- helpers específicos para `createEdge`, `updateNode` e `updateEdge`

O shell agora consome `createEdgeDirect`, `updateNodeDirect` e `updateEdgeDirect`, em vez de coordenar esse fluxo localmente.

### Clipboard workflow

`useEditorClipboardController` agora cobre o fluxo completo do editor:

- copy/cut/paste/duplicate
- leitura e escrita do fragmento MapIA
- fallback para texto
- projeção local de comandos antes da validação
- validação semântica de paste no backend
- filtragem de edges inválidas quando a política permite paste parcial

Os helpers puros de fragmento, draft de comandos e aplicação local continuam testáveis isoladamente, mas o workflow principal não vive mais no shell.

### Inspectors por modo

Os inspectors residuais foram quebrados em adapters plugáveis alinhados à arquitetura de `diagram modes`:

- `FlowInspectorAdapter`
- `GraphInspectorAdapter`
- `ErdInspectorAdapter`

O registry de adapters fica em `src/components/editor/diagram-modes/inspector-adapters/registry.ts`.

O shell resolve o adapter a partir de `diagramMode.inspector.kind` e passa para ele o estado já orquestrado. Com isso, os modos ativos `flow`, `graph` e `erd` deixam de depender de blocos grandes de JSX inline no `EditorShell`.

### Smoke e integração

Foi adicionado um smoke em `tests/e2e/editor-mode-smoke.spec.ts` para cobrir:

- carregamento do editor em `graph`, `flow` e `erd`
- chrome principal do shell
- composição do inspector por modo ativo
- um fluxo mínimo relevante por modo

No ambiente desta execução, o Playwright ficou bloqueado antes de iniciar porque `config.webServer` não conseguiu subir o stack local: o `db:check` falhou por indisponibilidade do Postgres/Docker. Os testes existem e estão prontos para rodar assim que o ambiente local estiver operacional.

### O que ainda permanece no shell

Permanece no `EditorShell` o que ainda cruza muitos eixos ao mesmo tempo:

- composição final do React Flow e viewport
- handlers de mutação ainda compartilhados entre seleção, semântica, persistência e layout
- parte dos fluxos semânticos de repair/override
- coordenação geral entre controllers

Essa sobra já é bem menor e deixa a base pronta para a próxima trilha: refinamento visual e aprofundamento dos módulos por modo sem regressar para branches no shell.
