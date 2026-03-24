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
