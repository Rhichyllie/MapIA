# ADR-017: Fase 5.3 - diagram-aware rendering e brand tokens oficiais MapIA

- Status: Aceito
- Data: 2026-03-05

## Contexto

A Fase 5.2 consolidou UX de fluxo (`Workspace -> Wizard -> Editor`) e linguagem de produto, mas o canvas ainda não refletia de forma consistente a identidade visual MapIA nem o tipo de diagrama selecionado.

Problemas observados antes da 5.3:

- o `diagramType` influenciava layout, porém a renderização visual permanecia quase única;
- snapshots legados (`template`) não possuíam renderers dedicados no editor;
- múltiplas relações entre o mesmo par de nós tendiam à sobreposição visual de arestas e labels;
- CSS global ainda carregava acoplamentos visuais sem tokens semânticos oficiais.

## Decisão

Adotar três pilares na Fase 5.3:

1. Brand tokens oficiais MapIA

- introdução de tokens CSS semânticos (`--color-*`, `--focus-ring`, `--shadow`, `--radius-*`) a partir da paleta oficial;
- consolidação de variáveis globais para reduzir duplicação e evitar hardcode de cor nos componentes.

2. Renderer registry diagram-aware no frontend

- criação de `resolveDiagramRenderer({ diagramType, template, layoutOptions })`;
- `diagramType` tem prioridade de resolução;
- fallback legado por `template` quando `diagramType` não existe ou não é suportado;
- cada renderer define explicitamente:
  - `nodeTypes`, `edgeTypes`, `defaultEdgeOptions`
  - `backgroundConfig`, `minimapClassName`, `canvasClassName`
  - `data-diagram-renderer` para E2E
  - capacidades (`supportsPorts`, `supportsParallelEdges`)

3. Multi-edge visual com offset determinístico

- criação de `computeParallelEdgeMeta(edges)` para calcular `parallelIndex/parallelTotal`;
- edge renderer reutilizável (`ParallelBezierEdge`) aplica curvatura/offset por índice do grupo `source -> target`, reduzindo sobreposição de arestas e labels.

## Alternativas consideradas

1. Manter um renderer único para todos os diagramas

- rejeitado por não comunicar semântica visual de `tree/flow/mindmap` e por manter legado opaco.

2. Resolver variações com `if/else` diretamente no `EditorShell`

- rejeitado por baixa escalabilidade, menor testabilidade e maior risco de regressão.

3. Adotar bibliotecas externas de theming/rendering

- rejeitado na 5.3 por restrição de escopo e para preservar estabilidade operacional sem novas dependências.

## Consequências

### Positivas

- canvas passa a refletir explicitamente o modo visual ativo;
- snapshots legados ganham renderização coerente de compatibilidade;
- visual de multi-edge fica mais legível;
- melhor testabilidade com `data-diagram-renderer` e unit tests de resolução/meta paralela;
- base de tokens fortalece consistência visual e evolução incremental de branding.

### Custos e riscos

- mais código no frontend de renderização (node/edge renderers + registry);
- necessidade de disciplina para manter tokens e classes consistentes entre renderers;
- risco de drift visual entre renderers mitigado por registry central e cobertura de testes.
