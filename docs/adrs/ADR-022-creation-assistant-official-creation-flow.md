# ADR-022: Creation Assistant como fluxo oficial e unico de criacao

## Status

Aceito

## Contexto

O MapIA evoluiu do fluxo inicial de `Wizard` para um `Creation Assistant` mais aderente ao produto: perfis de projeto, estrategia de origem, view inicial, ajustes de estrutura e aplicacao direta no mapa inicial.

Manter `wizard` como conceito ativo no codigo, nas rotas e na persistencia publica passou a criar:

- ambiguidade de produto entre dois fluxos concorrentes;
- acoplamento desnecessario a contratos e componentes legados;
- confusao arquitetural entre o nucleo canonico de criacao e aliases historicos.

## Decisao

O fluxo oficial e unico de criacao de projetos no MapIA passa a ser o `Creation Assistant`.

Com isso:

1. `/create` e a rota canonica de criacao.
2. O backend oficial usa apenas contratos e use cases de `creation-assistant`.
3. Componentes e suites principais deixam de validar o `wizard` como comportamento primario.
4. Rotas e estruturas com `wizard` ficam restritas a compatibilidade legada minima e explicitamente marcada.
5. Persistencia antiga de `wizard_drafts` deixa de representar uma entidade viva de produto e passa a ser tratada como legado transitorio.

## Consequencias

- Positivas:
  - narrativa unica de produto para criacao;
  - menor ambiguidade entre UX, contratos, rotas e persistencia;
  - base mais limpa para consolidar Flowchart/Processo nas proximas fases.
- Negativas:
  - aliases legados ainda precisam permanecer por um periodo para nao romper consumidores antigos;
  - existe custo temporario de traducao do payload legado para o draft canonico do assistente.
