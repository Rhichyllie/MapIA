# ADR-009: Importador inicial de Prisma Schema (.prisma) para snapshot do editor (MVP)

- Status: Aceito
- Data: 2026-02-24

## Contexto

Após a Fase 3C, o editor já possui:

- snapshot de trabalho mutável
- versionamento de snapshots
- diff/restore de versões

Faltava iniciar a trilha de importadores (Fase 4) sem depender de banco real, entregando um primeiro caminho para converter estrutura técnica em grafo editável no canvas.

O objetivo da 4A é importar texto de um schema Prisma (`.prisma`) e gerar um `GraphSnapshot` compatível com o editor, mantendo:

- regra de negócio no backend
- baixo risco de regressão nas fases 3A/3B/3C
- implementação simples e testável

## Decisão

Foi adotado um importador MVP backend-first em novo módulo `importing`, com:

- parser textual simples (baseado em blocos `model { ... }` e parsing por linha)
- mapper para `GraphSnapshot` canonico
- layout determinístico em grid
- API autenticada para importar e salvar diretamente no `working snapshot`
- UI mínima no `EditorShell` (textarea + botão + feedback)

## Mapeamento MVP adotado

- `model` Prisma -> node `kind="entity"`
- campos escalares -> `node.data.fields` com metadados:
  - `name`, `type`, `isOptional`, `isList`, `isId`, `isUnique`
- campos de relação (tipo = nome de outro model) -> edges `kind="references"`
- `viewport` -> valor padrão válido (`{ x: 0, y: 0, zoom: 1 }`)

## Deduplicação de relações (regra simples)

Prisma normalmente expõe campos espelho de relação (ex.: `User.posts` e `Post.author`).

Para evitar duplicar edges visuais no MVP:

- usamos deduplicação por:
  - par de models (ordem canônica)
  - `relationName` quando houver `@relation(...)`
- quando há múltiplos candidatos para o mesmo par/chave, escolhemos um representante determinístico por ordenação lexical

## Por que parser textual simples (e não parser completo da linguagem Prisma)

- objetivo da 4A é habilitar fluxo funcional rapidamente, com baixo acoplamento
- o mapeamento necessário no MVP é limitado (`model`, fields e relations)
- abordagem textual reduz dependências e complexidade operacional
- facilita testes unitários determinísticos do parser/mapper

## Trade-offs

- Positivos:
  - implementação pequena e reutilizável
  - desacoplado da UI do editor
  - backend continua fonte de verdade da importação
  - fácil de evoluir para novos importadores (Fase 4B)
- Negativos:
  - parser não cobre a linguagem Prisma inteira
  - deduplicação pode colapsar múltiplas relações sem nome entre o mesmo par de models
  - layout visual inicial é básico (grid)

## Consequências para fases futuras

- 4B pode reaproveitar o contrato de saída (`GraphSnapshot`) para importação de Postgres/Prisma real
- Fase 5 pode substituir apenas a estratégia de layout sem mudar o parser/mapper
- futuras melhorias podem trocar o parser textual por parser AST mais completo sem alterar a API/UI mínima já entregue
