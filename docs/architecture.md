# Arquitetura (Fase 0)

## Objetivo

Estabelecer base modular para evolucao incremental do MapIA sem acoplar UI, importadores e persistencia ao formato bruto das fontes externas.

## Principios adotados

- Modelo canonico unico de grafo (`Node`, `Edge`, `ExternalRef`, `GraphSnapshot`, `ViewportState`) para todas as views.
- Separacao de camadas: `domain` (regras/contratos), `application` (casos de uso/orquestracao), `infrastructure` (Prisma, auth, importadores).
- UI (Wizard/Editor) consome contratos de aplicacao e nunca payloads brutos de importadores.
- Validacao com Zod em contratos de dominio e inputs de auth (Fase 0).
- Leitura/escrita de snapshot no boundary do Prisma passa por `GraphSnapshotSchema.parse(...)`.

## Estrutura de pastas

- `app/`: rotas Next.js App Router e layouts.
- `src/domain/*`: contratos canonicos transversais (grafo, snapshots, refs).
- `src/modules/*`: modulos de negocio com `domain/application/infrastructure`.
- `src/server/*`: composicao de auth e acesso a banco (Prisma singleton).
- `src/components/*`: componentes de UI.
- `src/lib/*`: utilitarios compartilhados e env validation.
- `prisma/`: schema e migrations.
- `docs/`: arquitetura, dominio, backlog e ADRs.

## Fluxo UX (MVP)

- Camada 1: `Wizard` (coleta minima + progressive disclosure).
- Camada 2: `Editor` (canvas nodal + inspector + futuras views).
- Dashboard funciona como ponto de entrada para projetos e tarefas.

## Fase 0 (o que existe)

- Shell de login com NextAuth (credentials de desenvolvimento).
- Rotas protegidas: `/dashboard`, `/wizard`, `/editor` (layout + proxy/middleware).
- Editor com React Flow (minimap, controls, background).
- Contratos de dominio iniciais com Zod.
- Schema Prisma inicial para entidades core do MVP.
- Seed Prisma simples para bootstrap local.

## Fase 1 (incremento atual)

- Dashboard com criacao/listagem de projetos reais (Prisma + casos de uso).
- Wizard com formulario real, steps, persistencia de rascunho e validacao.
- Geracao de snapshot inicial canonico em `GraphVersion` v1.
- Editor conectado ao snapshot persistido com CRUD basico de nodes/edges e salvar manual.
- Testes unitarios de schema/casos de uso/boundary (mockados).

## Auth atual (dev only)

- O provider de credentials de desenvolvimento e somente para bootstrap local.
- Ele so e habilitado quando `NODE_ENV=development`.
- Em `production`, o provider fica desabilitado e tentativas de uso falham de forma segura.

## Seed path

- Seed Prisma padrao: `prisma/seed.ts`.
- Script mantido em `package.json`: `tsx prisma/seed.ts`.

## Limites intencionais da Fase 0

- Sem persistencia real no wizard/editor.
- Sem importadores (apenas estrutura preparada).
- Sem version diff/restaure implementados (apenas modelo/snapshot).
- Sem adapter Prisma para NextAuth (auth dev em JWT para reduzir acoplamento inicial).

## Limites intencionais da Fase 1

- Politica temporaria: `GraphVersion` v1 funciona como snapshot de trabalho mutavel (ver ADR-003).
- Sem commits/diff/restaure completos (Fase 3).
- Sem importadores reais (Fase 4).
