# Branching, Commits e PRs

## Objetivo

Estas regras existem para reduzir regressao e manter o historico do repositorio legivel. O foco e velocidade com disciplina, nao burocracia.

## Branches

Formato:

```text
<tipo>/<escopo-curto>
```

Tipos aceitos:

- `feat`
- `fix`
- `refactor`
- `docs`
- `test`
- `chore`
- `ops`

Regras:

- use apenas minusculas e `kebab-case`
- descreva um unico assunto por branch
- prefira nomes com 2 a 5 tokens uteis
- evite nomes genericos como `update`, `misc`, `temp`, `ajustes`, `final`, `wip`

Exemplos bons:

- `docs/fase0-governance-guardrails`
- `fix/editor-autosave-badge`
- `refactor/importing-route-contracts`
- `ops/observability-preflight`

Exemplos ruins:

- `nova-branch`
- `ajustes-gerais`
- `wip`
- `fix/tudo`

## Commits

Formato recomendado:

```text
tipo(escopo): resumo curto
```

O escopo e opcional, mas fortemente recomendado neste repositorio.

Tipos mais uteis:

- `feat`
- `fix`
- `refactor`
- `docs`
- `test`
- `chore`
- `ops`

Regras:

- escreva no imperativo
- resuma a intencao, nao a historia completa
- mantenha um commit por mudanca logica
- nao misture formatacao ampla com mudanca funcional sem necessidade
- evite commits `WIP` no historico final do PR

Exemplos:

- `docs(engineering): define branch and PR workflow`
- `fix(editor): preserve saved state after manual save`
- `test(auth): cover dev credentials guard`
- `ops(observability): document local validation flow`

## Titulos de PR

Use o mesmo padrao dos commits:

```text
tipo(escopo): resumo curto
```

Se o PR for apenas documental, use `docs(...)`. Se for de manutencao operacional, prefira `ops(...)` ou `chore(...)`.

## Escopo por PR

Regra principal:

- `1 PR = 1 problema ou 1 trilha de evolucao coerente`

Aplicacao pratica:

- nao misture editor, imports e observability no mesmo PR sem dependencia real
- nao combine mudanca de produto com reorganizacao ampla de docs ou tooling
- nao esconda refactor grande dentro de um fix pequeno
- se a mudanca exigir migration, env, seed ou docs estruturais, isso pode ir no mesmo PR desde que sirva ao mesmo objetivo

## Tamanho recomendado de PR

Preferencia:

- ate `~400` linhas alteradas de codigo de produto
- ate `~10` arquivos relevantes

Excecoes aceitaveis:

- migrations geradas
- snapshots/evidencias estritamente necessarias
- reorganizacao documental concentrada em um unico objetivo

Quando passar desse tamanho, o autor deve explicar por que o split nao vale a pena ou dividir o trabalho.

## Estrutura minima de PR

Todo PR deve conter estes blocos na descricao:

```md
## Objetivo

## O que mudou

## Risco e impacto

## Validacao

## Evidencias

## Fora do escopo
```

Blocos adicionais quando aplicavel:

- `## Migration e dados`
- `## Env e configuracao`
- `## Rollback`

## Risco, impacto e validacao

O autor deve registrar de forma objetiva:

- quais areas do produto foram tocadas
- se a mudanca afeta auth, rotas, editor/canvas, persistencia, APIs, imports, Prisma ou observability
- se existe risco de regressao manual ou dependencia de ambiente
- quais comandos e testes foram executados
- quais itens ficaram como `nao aplicavel` ou `nao executado`, com motivo

Nao escreva "testado" sem dizer como foi validado.

## Evidencias antes de merge

Antes de merge, o PR precisa trazer evidencia suficiente para o escopo tocado:

- resumo dos comandos executados e resultado
- `pnpm validate` quando houver mudanca de codigo
- `pnpm test:routes:critical` quando o PR tocar rotas, envelopes ou contratos de API
- referencia ao checklist em `docs/engineering/non-regression-checklist.md`
- screenshots, trace ou notas de smoke manual quando a validacao for visual ou depender de fluxo E2E
- registro explicito de lacunas quando o repositorio ainda nao cobre a area automaticamente

Para areas criticas, evidencia minima significa:

- `auth` e rotas protegidas: login/redirect ou teste equivalente
- `create` e `editor`: fluxo aberto com sucesso e sem erro visivel
- `persistencia`: save/autosave/manual save ou leitura posterior do snapshot
- `APIs principais`: resposta valida ou teste automatizado que cubra a rota/contrato tocado
- `Prisma`, `env` ou scripts: comando real executado e impacto documentado

## Regra de merge

Um PR esta pronto para merge quando:

- o escopo esta claro e fechado
- a descricao do PR registra risco, impacto e validacao
- os checks aplicaveis foram executados
- a documentacao necessaria foi atualizada
- nao ha TODO critico ou lacuna escondida no diff

Se houver outro mantenedor disponivel, areas criticas devem passar por revisao humana antes do merge. Se o merge for feito em modo solo, registre explicitamente no PR que foi feito self-review com base neste documento.

## Politica de baseline verde

- A baseline minima do repositorio e `pnpm validate`.
- PRs que tocam rotas, contratos de API, create flow, editor backend, imports ou versionamento tambem devem rodar `pnpm test:routes:critical`.
- A CI roda o mesmo gate minimo em `.github/workflows/baseline.yml`; se a CI falhar, o PR volta para correcao, nao para reinterpretacao do erro.
- Excecao temporaria so existe quando o PR registra comando afetado, falha exata, motivo, dono e criterio de remocao.
- Excecao sem dono claro e sem criterio de remocao nao conta como justificativa para merge.

## Regras especificas deste repositorio

- Para rotas da app, use `src/lib/routes.ts` como referencia; nao introduza uso novo do alias legado `/wizard`.
- Se alterar `data-testid` usados por Playwright, atualize a suite e a documentacao de teste no mesmo PR.
- Se alterar comportamento estrutural do editor, create flow, importacao, observability ou i18n, atualize tambem a documentacao da area no mesmo PR.
- Se alterar `package.json`, scripts, `.env.example`, `prisma/` ou `docker-compose.yml`, deixe o impacto operacional claro na descricao do PR.
