# Testing E2E do Editor (Playwright)

## Objetivo

Executar testes E2E reais do fluxo principal do editor (`Dashboard -> Wizard -> Editor`) com foco em:

- navegacao do fluxo MVP
- autosave/manual save
- persistencia de nodes/edges
- regressao de UX critica do inspector
- consistencia dos controles do wizard que influenciam o editor
- fluxo de versao com nome local e feedback claro no editor

## Pre-requisitos

- Node.js + `pnpm`
- Docker (Postgres local via `docker-compose.yml`)
- arquivo `.env` configurado (ou defaults locais)
- credenciais dev de login habilitadas (`NODE_ENV=development`)
- workspace root correto do projeto (onde estao `package.json`, `next.config.ts` e `playwright.config.ts`)

### Variaveis de ambiente esperadas (runtime do app / E2E)

- `DATABASE_URL`:
  - para este projeto local/E2E, usar Postgres direto (`postgresql://...` ou `postgres://...`)
  - exemplo local atual: `postgresql://mapia:mapia@localhost:55432/mapia?schema=public`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `DEV_LOGIN_EMAIL`
- `DEV_LOGIN_PASSWORD`

Obs.:

- O runtime do app (Next.js) carrega `.env` automaticamente.
- O CLI do Prisma neste repo usa `prisma.config.ts`, que carrega `.env` manualmente antes de `defineConfig(...)`.

## Observacao (workspace/monorepo)

- Este projeto usa App Router em `app/` (diretorio de rotas do Next), mas o root do app Next e o root do repositorio.
- Para evitar erro de inferencia de root do Turbopack em ambientes monorepo/workspace, o projeto agora define `turbopack.root` explicitamente em `next.config.ts`.
- O Playwright sobe o servidor pelo script `dev:e2e` (`next dev --webpack`) para nao depender do Turbopack no `webServer`.

## Setup local (primeira vez)

1. Subir Postgres:

```bash
pnpm db:up
```

2. Aplicar migrations:

```bash
pnpm prisma migrate deploy
```

3. Instalar browser do Playwright (Chromium):

```bash
pnpm test:e2e:install
```

Opcional (recomendado para desenvolvimento no dashboard/editor):

```bash
pnpm dev:with-db
```

Esse script faz um preflight de banco (`db:check:wait`) antes de subir o Next, falhando cedo com diagnostico de porta/TCP/Docker em vez de deixar o erro aparecer somente no SSR do `/dashboard`.

## Execucao

Comando recomendado para rodar o app no contexto E2E (manual):

```bash
pnpm dev:e2e
```

`pnpm dev:e2e` agora roda um preflight de banco (`pnpm db:check:wait`) e depois `pnpm prisma generate` antes de subir o Next (`next dev --webpack`), reduzindo falhas tardias por banco local offline e por Prisma Client desatualizado no fluxo E2E.

Depois, em outro terminal, rode o teste E2E (o `reuseExistingServer` vai reaproveitar o servidor).

Rodar somente os testes E2E do editor:

```bash
pnpm exec playwright test tests/e2e/editor-flow.spec.ts --project=chromium
```

Ou usar o script padrao:

```bash
pnpm test:e2e -- tests/e2e/editor-flow.spec.ts --project=chromium
```

Modos uteis:

- `pnpm test:e2e:headed`
- `pnpm test:e2e:ui`
- `pnpm test:e2e:editor`
- `pnpm test:e2e:editor:headed`

## O que esta coberto (Fase 3A)

Arquivo: `tests/e2e/editor-flow.spec.ts`

### 1) Fluxo principal (smoke + persistencia)

- login (fixture/helper com credenciais dev)
- abre `/dashboard`
- cria projeto no dashboard
- navega para wizard e gera snapshot inicial
- redireciona para `/editor`
- valida render do canvas + snapshot inicial
- adiciona node
- edita node pelo inspector (`label`, `kind`, `dataJson`) e aplica
- observa ciclo de save (`dirty -> saving -> saved`) no autosave
- move node por drag e valida persistencia
- cria edge (UI; com fallback controlado via API se o drag/connect falhar)
- save manual
- reload
- valida persistencia do diagrama (UI + query `editor-snapshot`)

### 2) Regressao UX critica (inspector)

- estado vazio (nenhum item selecionado)
- erro amigavel para JSON invalido
- sem payload bruto de Zod (`ZodError`, `issues`, etc.)

## O que esta coberto (Fase 3C.1)

Arquivo: `tests/e2e/editor-flow.spec.ts`

### 3) Controles de versao no Editor (smoke 3C)

- cria checkpoint manual (`Criar versao`)
- atualiza lista de versoes (`Atualizar versoes`)
- compara versao com working snapshot (sem alteracoes)
- altera o grafo (add node + autosave) e compara novamente (diff com mudancas)
- restaura versao (`Restaurar`, com `window.confirm`)
- valida feedback de restore + efeito visivel no editor (contador de nodes volta ao estado anterior)
- valida fluxo ainda operacional apos restore (save manual)

## O que esta coberto (Fase 5.1.2)

Arquivo: `tests/e2e/editor-flow.spec.ts`

### 4) Consistencia UX do wizard (no raiz + politica de layout)

- configura wizard com:
  - `diagramType=tree`
  - `generateRootNode=true`
  - `rootNodeName=\"Arquitetura Geral\"`
  - `allowReapplyLayout=false`
- salva draft no passo de configuracao, recarrega a pagina e confirma persistencia dos campos
- gera snapshot inicial e abre o editor
- valida no backend (`editor-snapshot`) que o label `Arquitetura Geral` foi aplicado
- valida no editor que o botao `Reaplicar layout` fica desabilitado pela politica

## O que esta coberto (Fase 5.2)

Arquivo: `tests/e2e/editor-flow.spec.ts`

### 5) Versao com nome local (UX enterprise)

- cria projeto no dashboard
- percorre wizard com os passos atualizados:
  - `1. Tipo de diagrama`
  - `2. Origem dos dados`
  - `3. Configuracao`
  - `4. Revisao`
  - `5. Gerar e abrir editor`
- gera snapshot inicial e abre o editor
- cria versao com nome preenchido no campo da toolbar
- valida feedback de sucesso da criacao
- valida item da versao na lista
- salva/edita nome local da versao e valida feedback explicito de persistencia local

## Observacoes de estabilidade

- A suite usa `data-testid` nos pontos criticos do editor, dashboard, wizard e login.
- Nodes/edges do React Flow recebem `data-testid` dinamico via `domAttributes` nos mappers.
- O helper de login le credenciais de `process.env`, `.env.local` ou `.env` (fallback para defaults locais).
- O teste principal usa verificacao final de persistencia via `GET /api/projects/[projectId]/editor-snapshot` para evitar flake de clique quando o Minimap do React Flow sobrepoe um node apos `fitView`.
- `playwright.config.ts` usa `webServer.cwd` no root do repositorio + `dev:e2e` para hardening de execucao em workspace/monorepo.
- Acoes criticas do fluxo (criar projeto, passos do wizard, gerar snapshot e saves do editor) agora aguardam responses de API relevantes para reduzir flake.
- O teste 3C.1 tambem aguarda responses especificos de versionamento por metodo + path exato:
  - `POST /api/projects/[projectId]/snapshot-versions`
  - `GET /api/projects/[projectId]/snapshot-versions`
  - `GET /api/projects/[projectId]/snapshot-versions/[versionId]/diff`
  - `POST /api/projects/[projectId]/snapshot-versions/[versionId]/restore`
- Assercoes de save usam `data-save-status` e historico do badge para tolerar transicoes muito rapidas (`saving`).
- Existe um unico `waitForTimeout` intencional (curto) no dashboard para hidratação do formulario em `next dev`; ele esta documentado no spec para evitar proliferacao de delays fixos.

## Seletores/data-testid usados na 3C.1

- `create-version-button`
- `create-version-feedback`
- `version-list-refresh-button`
- `version-list`
- `version-item-{versionId}`
- `version-compare-button-{versionId}`
- `version-restore-button-{versionId}`
- `version-diff-feedback`
- `version-action-feedback`
- `save-button`
- `save-status-badge`
- `layout-policy-open-wizard-link` (quando politica de layout estiver bloqueada)

## Dicas anti-flake (3A.2)

- Prefira `pnpm dev:e2e` (webpack) ao rodar localmente com Playwright.
- Mantenha o Postgres local ativo antes de rodar a suite (`pnpm db:up`).
- Se um teste falhar por timeout, reabra o `trace` salvo em `test-results/` antes de mexer nos waits.
- Evite rodar duas instancias do app na mesma porta (`3000`) quando `reuseExistingServer` estiver ativo.
- Se alterar labels/textos de UI, preserve os `data-testid` usados pela suite.

## Troubleshooting rapido (Turbopack root)

### Erro: `Turbopack Error: Next.js package not found`

Causa comum:

- Turbopack inferiu um workspace root incorreto (normalmente um diretorio pai), e falhou ao resolver `next/package.json`.

O que verificar:

1. Rode os comandos no root do repositorio (onde estao `package.json` e `next.config.ts`).
2. Confirme que `next.config.ts` contem `turbopack.root` apontando para o root do repo.
3. Para E2E/local dev de testes, prefira `pnpm dev:e2e` (webpack) em vez de `pnpm dev` se o ambiente continuar instavel com Turbopack.
4. Se estiver reaproveitando servidor antigo, finalize o processo e rode novamente.

## Troubleshooting rapido (timeouts / DB / login dev)

### Erro no dashboard SSR: `Can't reach database server at localhost:55432`

Sintoma observado:

- `/dashboard` quebra no SSR com `PrismaClientInitializationError`
- mensagem semelhante a:
  - `Can't reach database server at localhost:55432`

Causa:

- infraestrutura local (Postgres/Docker) offline ou ainda iniciando
- nao e bug da feature do editor/importador (Fase 4A)

Mitigacao aplicada no fluxo dev/E2E:

- `pnpm dev:e2e` e scripts `test:e2e*` agora executam `pnpm db:check:wait` (preflight com timeout)
- o `db:check` faz diagnostico de:
  - `DATABASE_URL`
  - conectividade TCP na porta do Postgres
  - status basico do container `mapia-postgres` via Docker CLI (quando disponivel)

Como validar/corrigir:

1. Abra o Docker Desktop (Windows) e aguarde o engine iniciar.
2. Rode `pnpm db:up`.
3. Rode `pnpm prisma migrate deploy`.
4. Rode `pnpm db:check` (ou `pnpm db:check:wait`).
5. Suba `pnpm dev:with-db` (dashboard/editor) ou `pnpm dev:e2e` (Playwright).

### Timeout em `wizard-generate` ou save do editor

- Confirme que o banco esta no ar (`pnpm db:check`).
- Verifique se nao ha outro processo pesado ocupando a porta/CPU local.
- Rode `pnpm test:e2e:editor:headed` para observar onde a UI ficou parada.

### Falha de login no E2E

- Confira `DEV_LOGIN_EMAIL` e `DEV_LOGIN_PASSWORD` em `.env` ou `.env.local`.
- Confirme `NODE_ENV=development` no app local.
- A fixture de login agora mostra mensagem de erro da UI (quando houver) para facilitar o debug.

### Erro de datasource Prisma no dashboard SSR (protocolo `prisma://` / `prisma+postgres://`)

Sintoma observado:

- erro no dashboard SSR antes do fluxo do editor, com mensagem similar a:
  - `Error validating datasource db: the URL must start with the protocol prisma:// or prisma+postgres://`

Causa raiz (3C.1):

- O `DATABASE_URL` local estava correto (`postgresql://...`), mas o Prisma Client gerado no `node_modules` estava inconsistente/desatualizado para o schema/runtime atual.
- Isso faz o app em runtime tentar validar a URL com expectativa de protocolo de Prisma Postgres/Data Proxy, falhando antes de chegar no fluxo do editor.

Solucao aplicada:

- O script `dev:e2e` passou a executar `pnpm prisma generate` antes de subir o servidor Next usado pelo Playwright.

Como validar/corrigir localmente:

1. Pare qualquer servidor E2E/dev que esteja reaproveitado na porta `3000` (o Playwright pode reutilizar um processo antigo).
2. Rode `pnpm prisma generate`.
3. Suba o banco local (`pnpm db:up`) e aplique migrations (`pnpm prisma migrate deploy`).
4. Rode `pnpm test:e2e:editor` (ou `pnpm dev:e2e` + Playwright em outro terminal).

Se ainda falhar:

- confirme que o erro mudou para conectividade (`Can't reach database server`) em vez de protocolo de datasource
- verifique se o Docker Desktop/daemon esta ativo
- confirme que `DATABASE_URL` aponta para a porta exposta pelo `docker-compose.yml` (`localhost:55432`)

### Falha por dados/banco sujo

- Reaplique migrations: `pnpm prisma migrate deploy`
- Se necessario, reset local completo: `pnpm db:reset-local`

## Artefatos em falha

Playwright salva automaticamente:

- `trace`
- `screenshot`
- `video`

Saida local:

- `test-results/`
- `playwright-report/`
