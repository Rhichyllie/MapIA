# Fase 3.1 — Workspace Collection Navigation Foundation

## O que mudou

- O workspace deixou de renderizar a colecao inteira por padrao.
- A lista virou o modo principal/default da colecao.
- Busca e criacao de projeto passaram a liderar a toolbar.
- Filtros avancados e preferencias ficaram em camadas secundarias.
- O CTA principal de criacao foi consolidado em `/create`.
- O drawer legado de criacao saiu do workspace.

## Estrategia de navegacao adotada

- A fase adotou **paginacao no cliente sobre a colecao filtrada/ordenada**.
- A pagina inicial renderiza uma janela limitada da colecao:
  - lista: 24 projetos por pagina
  - grid: 12 projetos por pagina
- Busca, filtros e ordenacao continuam fluidos no cliente e a pagina atual e reajustada quando a colecao muda.

## Por que a lista virou principal

- A lista entrega melhor leitura para nomes, descricoes, status e datas.
- O grid ainda nao sustenta bem operacao real em volume alto.
- A fase precisava reforcar legibilidade e navegacao antes do overhaul visual final da lista e do grid.

## Como a criacao foi consolidada

- O CTA principal do workspace agora aponta diretamente para `/create`.
- O workspace nao carrega mais estados, handlers ou UI do drawer legado.
- A linguagem visivel no workspace passa a privilegiar **Assistente de criacao**.

## Como o grid ficou nesta fase

- O grid foi mantido, mas rebaixado para **visualizacao secundaria**.
- O acesso ao grid foi movido para preferencias, junto com densidade e modo tecnico/operacional.
- Nao houve redesign profundo do grid nesta fase.

## Divida residual para fases seguintes

- Evoluir de paginacao no cliente para slicing/batching server-side quando a colecao e os metadados do projeto crescerem mais.
- Redesign visual profundo da lista.
- Fase propria de overhaul do grid.
- Limpeza mais ampla do legado do wizard fora da superficie do workspace.
