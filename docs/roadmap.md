# Roadmap Canônico MapIA

## Objetivo

Este documento é a fonte única para fases e subfases do produto MapIA.

## Macro fases (0..6)

1. Fase 0: arquitetura base, autenticação dev e contratos canônicos.
2. Fase 1: Workspace + Wizard + geração inicial de snapshot.
3. Fase 2: endurecimento do Editor (CQRS leve, autosave e UX do inspetor).
4. Fase 3: versionamento de snapshots (criar, listar, diff e restore).
5. Fase 4: importação real e observabilidade (4A..4E).
6. Fase 5: experiência enterprise de produto (5.1, 5.2, 5.3).
7. Fase 6: escala, colaboração e governança avançada.

## Subfases canônicas

- 4A: importador inicial de schema Prisma para snapshot canônico.
- 4B: introspecção e portas para fontes externas.
- 4C: normalização canônica e rastreabilidade de importação.
- 4D: telemetria interna tipada para o pipeline de importação.
- 4E: bridge e runtime OpenTelemetry (foundation + runtime + métricas).
- 5.1: políticas de layout e nó raiz no Wizard.
- 5.2: polimento UX/UI enterprise em Workspace, Wizard e Editor.
- 5.3: identidade visual oficial + canvas diagram-aware por renderer.

## ADRs de referência

- [ADR-016](/docs/adrs/ADR-016-fase5-ux-enterprise-polish.md): polimento UX/UI da Fase 5.2.
- [ADR-017](/docs/adrs/ADR-017-fase5-diagram-aware-rendering-and-brand-tokens.md): renderer registry diagram-aware e brand tokens da Fase 5.3.

## Definições obrigatórias

### diagramType (produto) vs template (legado)

- `diagramType`: escolha de produto para comportamento moderno do diagrama (`tree`, `flow`, `mindmap`), definida no Wizard e persistida no snapshot.
- `template`: sinal legado do projeto (`graph`, `sitemap`, `flowchart`, `erd`) usado como fallback de compatibilidade quando `diagramType` não existe ou não é suportado.

### layout engine vs renderer UI

- Layout engine: calcula posições (`x`, `y`) e metadados de layout no snapshot canônico.
- Renderer UI: define visualização no canvas (`nodeTypes`, `edgeTypes`, estilos de edge/background/minimap e capacidades como portas e multi-edge).
- Regra: layout e renderer evoluem desacoplados, com integração explícita no frontend via registry.
