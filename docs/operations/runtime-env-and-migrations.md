# Runtime, Envs e Migrations

Data de referencia: `2026-04-02`

## Objetivo

Este documento registra o baseline operacional minimo para subir o backend do MapIA com menos ambiguidade entre ambiente local e ambiente compartilhado/producao.

## Envs por tipo

Obrigatorias em qualquer ambiente que execute o backend:

- `DATABASE_URL`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `APP_RELEASE_VERSION`
- `APP_SERVICE_NAME`

Obrigatorias apenas para desenvolvimento local com login por credenciais:

- `DEV_LOGIN_EMAIL`
- `DEV_LOGIN_PASSWORD`

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

- O provider de credenciais do repositorio existe apenas em `NODE_ENV=development`.
- Em `production`, ausencia de outro provedor significa que a app nao deve depender do login dev-only.
- `NEXTAUTH_SECRET` nao deve reutilizar valor de exemplo em ambiente compartilhado.
- `DEV_LOGIN_EMAIL` e `DEV_LOGIN_PASSWORD` nao devem ser tratados como credenciais de producao.
- `INTERNAL_OBSERVABILITY_ALLOWED_IDENTITIES` deve listar apenas identidades internas reais; o bypass por `DEV_LOGIN_EMAIL` vale apenas em `development/test`.

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

Esta fase adiciona a migration `20260402120000_audit_event_denied_action`, que habilita o valor `denied` no enum `AuditAction`.

Aplicacao esperada:

1. atualizar codigo e lockfile
2. rodar `pnpm install --frozen-lockfile`
3. rodar `pnpm prisma:migrate:deploy` no ambiente compartilhado
4. rodar `pnpm validate`

## Relacao com a baseline

- `pnpm validate` continua sendo a baseline minima do repositorio.
- Se o PR tocar `auth`, `proxy.ts`, `next.config.ts`, `.env.example`, `prisma/` ou scripts de banco, registre no PR quais envs e qual comando Prisma foram validados.
