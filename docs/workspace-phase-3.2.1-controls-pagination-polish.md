# Fase 3.2.1 - Workspace Controls & Pagination Polish

## Filtros adicionados

- O painel secundario de refinamento ganhou filtro de recencia por atualizacao: hoje, ultimos 7 dias e ultimos 30 dias.
- Modelo, diagrama e status de snapshot continuam no mesmo painel e passam a funcionar junto com o filtro temporal sem voltar a poluir a superficie principal.
- A busca permanece como controle primario do workspace; filtros avancados continuam recolhidos por padrao.

## Como a paginacao evoluiu

- A navegacao deixou de depender apenas de anterior/proxima.
- O footer agora mostra paginas numeradas com ellipsis para colecoes maiores.
- O usuario tambem pode ir direto para uma pagina especifica por um seletor de jump.
- A base da 3.1 foi preservada: a colecao continua paginada no cliente sobre o resultado filtrado e ordenado.

## Como o page size funciona

- A lista usa opcoes de 25, 50 e 100 itens por pagina.
- A preferencia fica persistida por workspace no navegador.
- Quando o page size muda, a pagina atual volta para 1 para manter previsibilidade com busca e filtros.

## Como o rail de acoes foi refinado

- O rail lateral ganhou mais separacao visual do corpo da row.
- O CTA principal de abrir no editor continua dominante e recebeu mais presenca visual.
- O trigger de acoes secundarias ficou mais leve, com melhor espacamento e abertura mais coerente do popover.

## O que continua para a fase do grid

- Redesign visual proprio do grid.
- Reavaliacao do papel do grid em cenarios de volume alto.
- Tratamento de interacoes e linguagem visual especificas do grid, sem puxar a lista de volta para um compromisso mediocre.

## Legados ainda fora do escopo

- Limpeza total do legado do wizard fora do workspace.
- Revisao ampla do design system global.
- Qualquer redesign do editor ou da arquitetura de colecao alem do polish desta fase.
