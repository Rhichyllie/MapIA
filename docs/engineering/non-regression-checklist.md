# Checklist de Nao-Regressao

Versao operacional: `2026-04-02`

## Como usar

- Copie este checklist para a descricao do PR ou use-o como roteiro de self-review.
- Marque cada item como `ok`, `nao aplicavel` ou `nao executado`.
- Se algo nao puder ser validado, registre a lacuna. Nao troque ausencia de evidencia por certeza.
- Use `pnpm validate` como baseline minima local e da CI.

Documentos de apoio:

- `docs/testing-e2e-editor.md`
- `docs/testing-importing.md`
- `docs/engineering/branching-and-prs.md`
- `docs/operations/runtime-env-and-migrations.md`

## Baseline por PR

- Comando canonico de baseline: `pnpm validate`
- O comando agrega `lint`, `typecheck`, `test` e `build`.
- Para PRs que tocam rotas ou contratos de API, complemente com `pnpm test:routes:critical`.

### 1. Install

- Item: dependencias instalam sem erro.
- Comando base: `pnpm install --frozen-lockfile`
- Quando e obrigatorio: mudanca em `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, Playwright, Prisma, TypeScript, ESLint, Prettier ou scripts de setup.
- Se o PR tocar `prisma/` ou `.env.example`, registre tambem qual comando Prisma foi validado (`pnpm prisma:migrate:dev` no local ou `pnpm prisma:migrate:deploy` em ambiente compartilhado).
- Pode ficar `nao aplicavel`: PR estritamente documental sem impacto de setup.

### 2. Build

- Item: aplicacao compila em modo de producao.
- Comando base: `pnpm build`
- Quando e obrigatorio: mudanca em `app/`, `src/`, `prisma/`, `next.config.ts`, `instrumentation*.ts`, `proxy.ts` ou configuracao de runtime.

### 3. Lint

- Item: lint do repositorio passa sem erro novo.
- Comando base: `pnpm lint`
- Quando e obrigatorio: qualquer mudanca fora de docs puros.

### 4. Typecheck

- Item: tipagem do repositorio continua consistente.
- Comando base: `pnpm typecheck`
- Quando e obrigatorio: qualquer mudanca em TypeScript, Next, Prisma, scripts `tsx` ou contratos de dados.

### 5. Testes automatizados disponiveis

- Item: rode `pnpm test` para cobertura geral de unit/integration quando o PR tocar codigo.
- Comando base: `pnpm test`
- Quando e obrigatorio: qualquer mudanca de codigo de produto, servidor, dominio, infra ou scripts operacionais tipados.

## Suites direcionadas por area

### Auth e rotas principais

- Comando E2E alvo:
  - `pnpm exec playwright test tests/e2e/i18n-login-locale.spec.ts tests/e2e/i18n-language-switcher.spec.ts --project=chromium`
- Rodar quando:
  - `app/[locale]/login`
  - protecao de rotas
  - locale routing
  - `src/server/auth/*`
  - `src/i18n/*`

### Dashboard e Create Flow

- Comando E2E alvo:
  - `pnpm exec playwright test tests/e2e/create-assistant-source-status.spec.ts tests/e2e/create-assistant-profiles.spec.ts tests/e2e/create-assistant-flow-direction.spec.ts --project=chromium`
- Comando de contrato de rota:
  - `pnpm test:routes:critical`
- Rodar quando:
  - dashboard
  - create flow
  - creation assistant
  - `app/api/projects/*creation-*`

### Editor, canvas, persistencia e versoes

- Comandos automatizados alvo:
  - `pnpm test:routes:critical`
  - `pnpm exec playwright test tests/e2e/editor-mode-smoke.spec.ts tests/e2e/editor-flow.spec.ts --project=chromium`
- Rodar quando:
  - `app/[locale]/(protected)/editor`
  - `src/components/editor/*`
  - `src/modules/editor/*`
  - `src/modules/graph/*`
  - `app/api/projects/[projectId]/editor-*`
  - `app/api/projects/[projectId]/working-snapshot`
  - `app/api/projects/[projectId]/snapshot-versions*`

### Imports, semantica e APIs de backend

- Comandos automatizados alvo:
  - `pnpm test:routes:critical`
  - `pnpm exec vitest run src/modules/importing/application/use-cases.test.ts src/modules/semantics/application/use-cases.test.ts`
- Rodar quando:
  - `app/api/projects/[projectId]/imports/*`
  - `app/api/projects/[projectId]/semantic/*`
  - `src/modules/importing/*`
  - `src/modules/semantics/*`

### Observability e guardrails internos

- Comandos automatizados alvo:
  - `pnpm exec vitest run src/server/app/routes/internal-creation-transition-route.test.ts src/server/app/routes/internal-creation-transition-evaluate-route.test.ts src/server/app/routes/creation-assistant-telemetry-guardrail.test.ts`
  - `pnpm observability:validate`
- Rodar quando:
  - `src/server/observability/*`
  - `infra/observability/*`
  - rotas internas de telemetria

## Smoke manual das areas criticas

Rode quando a mudanca tocar a area correspondente. Registre no PR o que foi validado.

### Autenticacao

- abrir `/login`
- autenticar com `DEV_LOGIN_EMAIL` e `DEV_LOGIN_PASSWORD` em `NODE_ENV=development`
- confirmar redirect para `/dashboard`
- tentar abrir uma rota protegida sem sessao quando a mudanca tocar guard de auth

Referencia real do repositorio:

- `.env.example`
- `tests/e2e/fixtures.ts`
- `src/server/auth/options.ts`

### Rotas principais

- validar carregamento sem erro visivel de:
  - `/login`
  - `/dashboard`
  - `/create?fromProjectId=<projectId>`
  - `/editor?projectId=<projectId>`
- se a mudanca tocar locale, validar tambem o prefixo locale (`/pt-BR/...` e/ou `/en-US/...`)
- nao introduzir uso novo do alias legado `/wizard`

Referencia real do repositorio:

- `src/lib/routes.ts`
- `app/[locale]/(protected)/*`

### Editor e canvas

- abrir um projeto no editor
- confirmar `editor-canvas`, `inspector-panel` e toolbar visiveis
- selecionar um node ou criar um novo node
- confirmar que nao ha erro de renderizacao ou perda obvia de interacao

Referencia real do repositorio:

- `tests/e2e/editor-flow.spec.ts`
- `tests/e2e/editor-mode-smoke.spec.ts`

### Persistencia e salvamento

- provocar uma mudanca no diagrama
- confirmar transicao do `save-status-badge` para `saved`
- fazer reload
- confirmar que node/edge/label alterado continua presente
- se a mudanca tocar versoes, validar criacao, diff e restore

Referencia real do repositorio:

- `app/api/projects/[projectId]/editor-commands/route.ts`
- `app/api/projects/[projectId]/working-snapshot/route.ts`
- `app/api/projects/[projectId]/editor-snapshot/route.ts`
- `app/api/projects/[projectId]/snapshot-versions/*`

### APIs principais

Valide por teste automatizado, fluxo E2E ou chamada manual, conforme o escopo:

- `POST /api/projects`
- `PUT /api/projects/[projectId]/creation-draft`
- `POST /api/projects/[projectId]/creation-apply`
- `POST /api/projects/[projectId]/editor-commands`
- `PUT /api/projects/[projectId]/working-snapshot`
- `GET /api/projects/[projectId]/editor-snapshot`
- `GET|POST /api/projects/[projectId]/snapshot-versions*`
- `POST /api/projects/[projectId]/imports/*` quando importar fizer parte da mudanca
- `POST /api/projects/[projectId]/semantic/*` quando semantica fizer parte da mudanca

## Documentacao

- Se a mudanca alterar fluxo, contrato, checklist, env, migration, seed, roteiro de teste ou runbook, atualize a documentacao no mesmo PR.
- Se a mudanca for estrutural, avalie tambem `docs/architecture.md`, ADR relevante e docs especificos da area.

## Lacunas atuais do repositorio

- A baseline minima agora esta consolidada em `pnpm validate` e roda tambem na CI em `.github/workflows/baseline.yml`.
- Existe guardrail direcionado para contratos criticos de rota em `pnpm test:routes:critical`.
- Ainda faltam route tests dedicados para algumas rotas menos centrais ou de compatibilidade, especialmente aliases e partes de `creation-settings*`.
- Os E2E dependem de Postgres local, browser do Playwright instalado e credenciais dev validas em `.env`.
- O login por credenciais deste repositorio existe apenas em `development`; smoke de auth fora desse modo exige outra estrategia.
- `pnpm prisma:migrate` deixou de ser alias executavel; use o comando explicito correto para o ambiente.

## Fechamento minimo antes de merge

Antes de merge, o PR deve deixar explicito:

- comandos executados
- resultado de cada comando
- smoke manual executado ou motivo para `nao aplicavel`
- riscos residuais
- documentacao atualizada quando houve mudanca estrutural
