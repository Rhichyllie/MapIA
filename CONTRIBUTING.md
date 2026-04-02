# Contributing

## Objetivo

Este repositorio ja tem arquitetura, ADRs, scripts operacionais e suites de teste relevantes. Este arquivo define o fluxo minimo para contribuir sem abrir regressao silenciosa nem espalhar convencoes paralelas.

Documentos complementares:

- `docs/engineering/branching-and-prs.md`
- `docs/engineering/non-regression-checklist.md`
- `docs/operations/runtime-env-and-migrations.md`
- `docs/testing-e2e-editor.md`
- `docs/testing-importing.md`
- `docs/architecture.md`

## Fluxo minimo de contribuicao

1. Entenda o escopo real da mudanca antes de abrir a branch.
2. Crie uma branch com nome objetivo e um unico assunto.
3. Mantenha commits pequenos e legiveis.
4. Rode `pnpm validate` como baseline minima e complemente com os checks direcionados do checklist quando o escopo exigir.
5. Atualize documentacao estrutural no mesmo PR quando a mudanca alterar fluxo, convencao, risco operacional, env, migration ou comportamento esperado de teste.
6. Abra um PR com risco, impacto, validacao e evidencias explicitas.

## Regras de contribuicao deste repositorio

- Preserve a separacao atual entre `app/`, `src/modules/`, `src/server/`, `prisma/`, `scripts/`, `tests/` e `docs/`.
- Nao introduza feature nova, refactor paralelo ou cleanup amplo no mesmo PR de uma correcao localizada.
- Nao expanda alias legado sem necessidade. Para rotas de app, use `src/lib/routes.ts`; o alias `/wizard` existe apenas por compatibilidade.
- Se uma mudanca tocar superficies cobertas por Playwright, preserve ou atualize os `data-testid` no mesmo PR.
- Se uma mudanca tocar editor, create flow, persistencia, imports, auth, Prisma ou observability, trate isso como area critica e registre risco de regressao no PR.
- Se `package.json`, `pnpm-lock.yaml`, `prisma/`, `.env.example` ou scripts operacionais mudarem, a validacao precisa refletir esse impacto.
- Se a mudanca tocar env, auth ou Prisma, use comandos explicitos de migration: `pnpm prisma:migrate:dev` apenas no local e `pnpm prisma:migrate:deploy` em ambiente compartilhado.
- Nao inclua artefatos locais ou temporarios no PR, como `.next/`, `test-results/`, logs locais ou arquivos de evidencia gerados apenas para execucao manual.
- Se a mudanca tocar rotas, envelopes de API ou contratos entre cliente e servidor, rode tambem `pnpm test:routes:critical`.
- Baseline verde significa `pnpm validate` passando; nao reabra excecao silenciosa de lint/test/typecheck/build.

## Padrao minimo de review

Todo PR precisa passar por review humano ou, se isso nao for possivel, por self-review explicito usando os mesmos criterios:

- O PR tem um unico objetivo claro e escopo controlado.
- O titulo, a descricao e os commits deixam claro o que mudou e o que ficou fora do escopo.
- O risco operacional foi descrito para auth, rotas, editor/canvas, persistencia, APIs, migrations, env e observability quando relevante.
- A validacao executada cobre o impacto real da mudanca, nao apenas checks genericos.
- A documentacao estrutural foi atualizada quando a mudanca alterou contrato, fluxo ou convencao.
- Nao houve regressao acidental em rotas protegidas, `data-testid`, aliases legados, seeds, migrations ou scripts usados pelo time.

## Quando atualizar documentacao no mesmo PR

Atualize documentacao junto com o codigo quando houver:

- mudanca de fluxo em dashboard, create flow, editor ou importacao
- mudanca de contrato de API, payload, env ou migration
- mudanca de checklist operacional
- mudanca de convencao de branch, commit, PR ou validacao
- mudanca estrutural relevante em arquitetura ou decisao registrada em ADR

Se a mudanca for estrutural e a documentacao nao puder ser atualizada no mesmo PR, registre isso como risco aberto e trate como excecao, nao como padrao.

## Politica de baseline verde

- Baseline minima do repositorio: `pnpm validate`.
- Guardrail adicional para rotas e contratos de API: `pnpm test:routes:critical`.
- A mesma baseline minima roda na CI em `.github/workflows/baseline.yml`.
- Se a baseline quebrar, a regra padrao e corrigir antes do merge.
- Excecao temporaria so e aceitavel se o PR registrar comando afetado, falha exata, motivo, dono e criterio de remocao. Sem isso, a quebra nao deve ser normalizada.
