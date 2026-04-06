# Runtime, Envs e Migrations

Data de referencia: `2026-04-06`

## Objetivo

Este documento registra o baseline operacional minimo para subir o backend do MapIA com menos ambiguidade entre ambiente local e ambiente compartilhado/producao.

## Modos de autenticacao

- `AUTH_MODE=development`
  - permitido apenas em `development/test`
  - habilita login por credenciais locais com `DEV_LOGIN_EMAIL` e `DEV_LOGIN_PASSWORD`
  - nao e valido como auth de producao
- `AUTH_MODE=oidc`
  - caminho de producao-capable
  - exige `NEXTAUTH_URL` publico/valido, `AUTH_OIDC_ISSUER_URL` HTTPS valido, `AUTH_OIDC_CLIENT_ID`, `AUTH_OIDC_CLIENT_SECRET`, `AUTH_OIDC_SCOPE` com `openid` e `NEXTAUTH_SECRET` nao-default
- configuracao invalida
  - em `production`, `AUTH_MODE=development` ou ausencia das envs OIDC exigidas faz o backend falhar em modo `fail-closed`
  - `/api/auth/[...nextauth]` responde `AUTH_CONFIGURATION_INVALID`
  - paginas protegidas redirecionam para login sem expor fallback dev-only

## Envs por tipo

Obrigatorias em qualquer ambiente que execute o backend:

- `DATABASE_URL`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `AUTH_MODE`
- `APP_RELEASE_VERSION`
- `APP_SERVICE_NAME`

Obrigatorias apenas para desenvolvimento local com login por credenciais:

- `DEV_LOGIN_EMAIL`
- `DEV_LOGIN_PASSWORD`

Obrigatorias para auth OIDC em ambiente compartilhado/producao:

- `AUTH_OIDC_ISSUER_URL`
- `AUTH_OIDC_CLIENT_ID`
- `AUTH_OIDC_CLIENT_SECRET`

Opcionais, mas parte do contrato de auth OIDC:

- `AUTH_OIDC_PROVIDER_NAME`
- `AUTH_OIDC_SCOPE`

Obrigatorias quando a telemetria de criacao estiver ativa:

- `CREATION_TRANSITION_TELEMETRY_ENABLED`
- `TELEMETRY_SINK_TIMEOUT_MS`
- `TELEMETRY_SINK_FALLBACK_COOLDOWN_MS`
- `TELEMETRY_GATE_EVALUATION_INTERVAL_MS`
- `CREATION_TRANSITION_TELEMETRY_LOG_THROTTLE_MS`

Obrigatorias para governanca minima das rotas internas:

- `INTERNAL_OBSERVABILITY_ALLOWED_IDENTITIES`

Sensivel e recomendada para ambientes compartilhados:

- `TELEMETRY_HASH_SALT`

## Regras operacionais

- O provider de credenciais do repositorio existe apenas em `AUTH_MODE=development` e fora de `production`.
- Em `production`, o backend so deve subir em modo `AUTH_MODE=oidc` com env completa.
- `NEXTAUTH_SECRET` nao deve reutilizar valor de exemplo em ambiente compartilhado.
- `NEXTAUTH_URL` nao pode permanecer com valor local/default em `production`; a rota `/api/auth/[...nextauth]` falha fechada nesse caso.
- `AUTH_OIDC_ISSUER_URL` deve apontar para issuer HTTPS compartilhado; `localhost`/`127.0.0.1` nao sao aceitos no baseline de staging/producao.
- `AUTH_OIDC_SCOPE` deve conter `openid`; sem isso o runtime OIDC fica em modo invalido.
- `DEV_LOGIN_EMAIL` e `DEV_LOGIN_PASSWORD` nao devem ser tratados como credenciais de producao.
- `INTERNAL_OBSERVABILITY_ALLOWED_IDENTITIES` deve listar apenas identidades internas reais; o bypass por `DEV_LOGIN_EMAIL` vale apenas em `development/test`.
- O backend agora persiste usuarios internos, identidades autenticadas e memberships de workspace. Seed/migrations precisam refletir esse modelo, nao apenas `ownerIdentity`.
- Sessao/JWT do backend devem carregar `user.id`, `user.email`, `authProvider` e `authMode`; claims ausentes ou inconsistentes fazem a leitura de sessao falhar em modo fechado.

## Preflight de auth para staging

Comando operacional:

- `pnpm auth:preflight:staging`

Opcoes uteis:

- `pnpm auth:preflight:staging -- --skip-discovery`
  - valida contrato de env/runtime sem consultar o issuer
- `pnpm auth:preflight:staging -- --json`
  - retorna o relatorio em JSON para log operacional/CI

O preflight:

- carrega `.env.local` e `.env` quando presentes;
- exige baseline de ambiente compartilhado (`AUTH_MODE=oidc`, URLs HTTPS, secret nao-default, `scope` com `openid`);
- consulta `/.well-known/openid-configuration` do issuer sem usar `client_secret`;
- falha com exit code `1` quando o runtime nao esta pronto.

## Runbook curto para staging auth OIDC

1. Definir `AUTH_MODE=oidc`.
2. Definir `NEXTAUTH_URL` com origem HTTPS publica do ambiente de staging.
3. Definir `AUTH_OIDC_ISSUER_URL`, `AUTH_OIDC_CLIENT_ID`, `AUTH_OIDC_CLIENT_SECRET`, `AUTH_OIDC_PROVIDER_NAME` e `AUTH_OIDC_SCOPE`.
4. Garantir `AUTH_OIDC_SCOPE` contendo `openid`.
5. Garantir `NEXTAUTH_SECRET` real e diferente do valor dev/example.
6. Rodar `pnpm auth:preflight:staging`.
7. Se o preflight falhar, corrigir a causa objetiva antes de validar login real com o IdP.
8. Em deploy compartilhado, aplicar `pnpm prisma:migrate:deploy` antes do smoke de auth.

## Comandos Prisma permitidos por ambiente

Ambiente local:

- gerar client: `pnpm prisma:generate`
- criar/aplicar migration de desenvolvimento: `pnpm prisma:migrate:dev`

Ambiente compartilhado, staging ou producao:

- aplicar migrations existentes: `pnpm prisma:migrate:deploy`

## Comandos bloqueados por convencao

- `pnpm prisma:migrate` falha de forma explicita para evitar ambiguidade.
- Nao use `prisma migrate dev` em staging/producao.
- Nao use `prisma db push` como substituto de migration versionada em ambiente compartilhado.
- Nao use `prisma migrate reset` ou rotinas destrutivas fora de ambiente local descartavel.

## Migrations desta fase

Esta fase adiciona:

- `20260402120000_audit_event_denied_action`
  - habilita o valor `denied` no enum `AuditAction`
- `20260402160000_auth_access_foundation`
  - cria `app_users`
  - cria `auth_identities`
  - cria `workspace_memberships`
  - adiciona `actorUserId` em `audit_events`
  - faz backfill de usuarios/memberships a partir de `workspaces.ownerIdentity`

Aplicacao esperada:

1. atualizar codigo e lockfile
2. rodar `pnpm install --frozen-lockfile`
3. rodar `pnpm prisma:migrate:deploy` no ambiente compartilhado
4. se o ambiente usar seed local, rodar `pnpm db:seed`
5. rodar `pnpm validate`

## Seed local

- `pnpm db:seed` agora provisiona:
  - usuario interno `admin@mapia.local`
  - identity `development_credentials` para o provider `credentials`
  - workspace demo com membership `owner`
  - projeto demo e working snapshot inicial
- o objetivo do seed e deixar o banco coerente com o modelo de acesso atual, nao apenas com o legado `ownerIdentity`

## Relacao com a baseline

- `pnpm validate` continua sendo a baseline minima do repositorio.
- Se o PR tocar `auth`, `proxy.ts`, `next.config.ts`, `.env.example`, `prisma/` ou scripts de banco, registre no PR quais envs e qual comando Prisma foram validados.
- Se o PR tocar `src/server/auth/*`, `app/api/auth/*` ou `app/api/workspaces/*/memberships`, rode tambem os testes direcionados de auth/rotas alem da baseline.
- Se o PR tocar readiness/contrato de OIDC, rode tambem `pnpm auth:preflight:staging` no ambiente configurado.
