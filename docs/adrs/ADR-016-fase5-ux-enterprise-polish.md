# ADR-016: Fase 5.2 - polimento UX/UI enterprise em Workspace, Wizard e Editor

- Status: Aceito
- Data: 2026-03-05

## Contexto

O fluxo principal (`Dashboard/Workspace -> Wizard -> Editor`) ja estava funcional, com persistencia real de projeto, wizard draft, snapshot inicial, autosave e versoes.

Apesar disso, a percepcao de produto ainda era de prototipo:

- linguagem inconsistente (mistura de termos tecnicos/ingles)
- leitura operacional fraca no dashboard e no editor
- controles importantes sem contexto de decisao para usuario executivo
- elementos visuais com baixa coesao (hardcodes e estilos inline repetidos)

## Problema

Como elevar a experiencia para padrao enterprise sem alterar o core de dominio/layout engine e sem introduzir novas dependencias?

Em especial:

- reduzir friccao na criacao/listagem de projetos
- tornar o wizard claramente orientado a decisao
- tornar o editor mais "operacional" (status, politica, versoes, inspetor)
- manter compatibilidade com legado e contratos existentes

## Decisao

Aplicar polimento UX/UI focado no fluxo de trabalho diario, preservando modelo de dominio e contratos de API:

1. Dashboard/Workspace

- formulario enxuto (`nome` obrigatorio, `finalidade` opcional)
- `slug` removido da entrada principal; exibido apenas como `ID tecnico` read-only em area avancada
- `tipo inicial` em cards (Hierarquia/Processo/Mapa mental/Decidir no Wizard), mantendo valores internos `tree/flow/mindmap/wizard`
- bloco `Proximos passos` apos criacao com CTAs claros
- lista de projetos enriquecida com tipo selecionado (quando existe), status de snapshot e contagem de versoes

2. Wizard

- stepper com titulos orientados a decisao:
  - Tipo de diagrama
  - Origem dos dados
  - Configuracao
  - Revisao
  - Gerar e abrir editor
- configuracao com contexto explicito para:
  - no raiz (titulo principal)
  - politica de reaplicacao de layout
- revisao executiva em bullets + aviso para fluxo de importacao
- campos numericos com unidade `px` na UI

3. Editor

- header/toolbar com leitura operacional (status de salvamento, no/aresta, tipo, politica de layout)
- reforco da politica de layout bloqueado:
  - botao desabilitado com explicacao clara
  - badge `Layout bloqueado`
  - CTA `Ajustar no Wizard`
- versoes com hierarquia visual e naming local explicito (persistido apenas em `localStorage`)
- inspetor com terminologia padronizada (`No`, `Aresta`, `Rotulo`, `Tipo`, `Dados (JSON)`) e empty-state orientado a acao

4. Sistema UI/CSS

- consolidacao de estilos compartilhados e remocao de inline styles repetidos
- limpeza visual com paleta neutra temporaria e sem hardcodes verde-teal

## Alternativas consideradas

1. Rebuild visual completo com novo design system

- rejeitado nesta fase por escopo/custo e risco de regressao funcional.

2. Manter UI atual e atuar apenas em microcopy

- rejeitado por nao resolver leitura operacional, hierarquia visual e percepcao de produto.

3. Persistir nomes de versao no backend nesta fase

- rejeitado por ampliar escopo de dominio/API sem necessidade imediata; naming local atende o objetivo de UX de curto prazo.

## Consequencias

### Positivas

- fluxo principal passa a comunicar melhor decisao e estado operacional
- menos friccao na criacao de projeto e no handoff para wizard/editor
- maior clareza sobre politica de layout e versoes
- consistencia visual/terminologica melhor sem romper legado

### Custos e riscos

- mais chamadas de leitura no dashboard para enriquecer cards de projeto (snapshot + versoes)
- naming local de versao pode gerar expectativa de persistencia global (mitigado por copy explicita "nome local")
- ajustes de copy podem exigir manutencao de seletores E2E quando houver mudanca de texto

## Plano futuro (Fase 5.3 - paleta e branding)

- introduzir paleta oficial MapIA e tokens de marca
- definir tipografia e componentes com assinatura visual consistente
- evoluir identidade visual sem alterar contratos funcionais de Workspace/Wizard/Editor
- manter cobertura E2E para proteger fluxo principal durante a evolucao de branding
