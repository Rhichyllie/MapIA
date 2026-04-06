# Estado atual da arquitetura

## Objetivo

Este documento registra o estado tecnico real do MapIA em `2026-04-02`, baseado no codigo atual do repositorio. Ele nao substitui ADRs nem roadmap. Ele serve para leitura de engenharia, analise de risco e preparo de fases futuras.

Para historico incremental de fases, ver `docs/architecture.md`.

## Visao geral

O MapIA hoje e uma aplicacao `Next.js App Router` com:

- paginas protegidas server-side em `app/[locale]/(protected)/*`;
- API routes em `app/api/**/*`;
- composicao central de dependencias em `src/server/app/container.ts`;
- contratos de dominio com `Zod` em `src/domain` e nos modulos em `src/modules/*`;
- persistencia principal em `Prisma/Postgres`;
- editor e fluxo de criacao apoiados no mesmo modelo canonico de `GraphSnapshot`.

Fluxo de alto nivel:

1. pagina ou API route resolve locale, sessao autenticada e ator interno (`userId` + email + provider);
2. route/page chama `createServerUseCases()`;
3. guards e use cases resolvem acesso por `workspace membership`/role e chamam repositorios/integracoes;
4. repositorios Prisma validam boundary com schemas e invariantes;
5. UI renderiza ou rota devolve envelope `{ data }` padronizado.

## Mapa atual por camada

| Camada              | Paths principais                          | Papel atual                                                                                                                  | Observacoes                                                                      |
| ------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| App                 | `app/`                                    | Paginas App Router, rotas de API, layouts protegidos e aliases legados                                                       | `create` e `editor` sao os entrypoints reais; `/wizard` e alias legado           |
| UI                  | `src/components/`                         | Shells de login, dashboard, creation assistant, editor e componentes base                                                    | `src/components/editor/editor-shell.tsx` concentra grande parte do comportamento |
| Dominio transversal | `src/domain/`                             | Modelo canonico de grafo e tipos compartilhados                                                                              | `GraphSnapshotSchema` e o contrato mais central do produto                       |
| Modulos de negocio  | `src/modules/*`                           | Regras e casos de uso por area (`projects`, `creation-assistant`, `editor`, `graph`, `versioning`, `importing`, `semantics`) | Ha modulos maduros e modulos finos/legados coexistindo                           |
| Runtime server      | `src/server/*`                            | Auth, container, DB singleton e observabilidade                                                                              | O wiring e centralizado e real, nao apenas scaffolding                           |
| Persistencia        | `prisma/`, `src/modules/*/infrastructure` | Tabelas Prisma e adaptadores de repositorio                                                                                  | Working snapshot ainda vive em `graph_versions` v1                               |
| Testes              | `src/**/*.test.ts`, `tests/e2e/*.spec.ts` | Unitarios/integracao com Vitest e E2E com Playwright                                                                         | Cobertura util, mas incompleta em partes criticas de API                         |

## Modulos principais e estado atual

### Projetos e workspaces

- `src/modules/workspaces` e `src/modules/projects` fazem ownership, listagem e criacao basica.
- O dashboard em `app/[locale]/(protected)/dashboard/page.tsx` carrega workspace principal, lista projetos e projeta metadados a partir de snapshot de trabalho e versoes.
- O backend agora usa memberships persistidas por workspace com roles `owner`, `admin`, `member` e `viewer`.
- `Workspace.ownerIdentity` continua existindo como campo legado/compatibilidade, mas o controle de acesso ativo saiu do email isolado e foi para `app_users`, `auth_identities` e `workspace_memberships`.
- O legado de `ownerIdentity` agora passa por boundary explicita em `src/modules/workspaces/domain/workspace-legacy-compat.ts`; novas regras de acesso nao devem ler esse campo diretamente.

### Dominio canonico do grafo

- `src/domain/canonical-graph.ts` define `Node`, `Edge`, `ExternalRef`, `ViewportState` e `GraphSnapshot`.
- `src/modules/graph/domain/graph-invariants.ts` e a barreira de integridade: trim de labels, numeros finitos, IDs unicos, edges sem orfaos e proibicao de relacao duplicada exata.
- Quase tudo converge neste contrato: editor, importadores, versionamento, semantica e persistencia.

### Creation Assistant e compatibilidade com fluxo legado

- O fluxo oficial de criacao e `app/[locale]/(protected)/create/page.tsx`.
- `src/modules/creation-assistant` concentra draft, settings aplicadas, geracao de snapshot inicial e validacao estrita por receita.
- Ha coexistencia de estado em duas formas:
  - `project_creation_drafts`
  - `project_creation_settings`
- `src/modules/projects/domain/resolve-project-creation-context.ts` ainda faz ponte entre `creation settings`, `snapshot.diagramType` e `Project.template`.
- O alias legado `/wizard` continua ativo apenas como redirect para `/create`.
- As rotas `wizard-draft`, `wizard-generate` e `creation-settings` continuam de pe por compatibilidade e traduzem payload antigo para o modelo atual.

### Editor

- O editor real fica em `app/[locale]/(protected)/editor/page.tsx`.
- A pagina carrega projeto, working snapshot e creation settings antes de montar o `EditorShell`.
- `src/modules/editor/application/schemas.ts` define o protocolo de comandos:
  - `addNode`
  - `updateNode`
  - `moveNode`
  - `removeNode`
  - `addEdge`
  - `updateEdge`
  - `removeEdge`
- O backend do editor suporta:
  - leitura do snapshot de trabalho;
  - aplicacao de um comando;
  - aplicacao em lote;
  - salvamento do snapshot completo.
- O frontend ainda e fortemente concentrado em `src/components/editor/editor-shell.tsx`, que mistura canvas, autosave, versoes, importacao, semantica, i18n e UI de painel.

### Diagramas e modos visuais

- O layout engine de dominio em `src/modules/graph/domain/diagram-types.ts` considera como suportados `tree`, `flow` e `mindmap`.
- O editor, por compatibilidade, ainda resolve modos e renderers para tipos legados como `graph`, `sitemap`, `flowchart`, `erd` e `timeline`.
- Hoje existem fontes de verdade sobrepostas:
  - `snapshot.diagramType`
  - `Project.template`
  - aliases de modo no editor
  - registry de renderer
- Isso funciona, mas e uma fronteira fragil para futuras evolucoes.

### Persistencia e versionamento

- `prisma/schema.prisma` hoje mistura estado operacional atual e legados de transicao.
- Entidades centrais:
  - `AppUser`
  - `AuthIdentity`
  - `Workspace`
  - `WorkspaceMembership`
  - `Project`
  - `ProjectCreationSettings`
  - `ProjectCreationDraft`
  - `GraphVersion`
  - `EditorSnapshotVersion`
  - `SemanticPolicy`
  - `SemanticEventLog`
  - `CreationTelemetryEvent`
  - `AuditEvent`
- O working snapshot continua salvo em `GraphVersion` com `versionNumber = 1`.
- `EditorSnapshotVersion` guarda checkpoints imutaveis separados do working snapshot.
- O contrato de concorrencia otimista usa `revision` e `expectedRevision`.
- Provenance de importacao nao e modelada em tabela propria; ela fica dentro do snapshot via `externalRefs`.

### Semantica

- `src/modules/semantics` aplica politica, validacao de draft e auditoria do grafo.
- O enforcement roda no backend do editor e tambem no restore de versoes.
- A politica pode ser criada automaticamente a partir do snapshot atual.
- O acoplamento entre editor, politica semantica e log de eventos e real e importante: mudar regra semantica afeta salvamento, importacao e restore.

### Importacao

- `src/modules/importing` suporta hoje:
  - texto Prisma inline;
  - arquivo `.prisma`;
  - introspeccao `postgres-live`.
- O pipeline gera `GraphSnapshot` canonico, adiciona `externalRefs`, normaliza a saida e envia o resultado para persistencia do editor.
- Existe rastreabilidade deterministica de `externalRef.id` e `externalId`; o contrato critico de shape/provenance do importador Prisma/Postgres agora esta travado por testes, mas ainda faltam guardrails equivalentes para todas as rotas de importacao.

### Observabilidade

- `src/server/observability/otel-runtime.ts` sobe runtime OTel server-side e e usado de verdade pelo container.
- O fluxo de criacao possui contrato explicito em `src/server/observability/creation-transition-contract.ts`.
- Ha rotas internas de observabilidade sob `app/api/internal/observability/creation-transition*`, protegidas por allowlist/dev bypass.
- O pipeline de importacao tambem ja esta instrumentado para OTel, com provider injetado no container.

### Autenticacao e autorizacao

- `src/server/auth/options.ts` usa `NextAuth` com JWT e dois modos reais de runtime:
  - `development_credentials` em `development/test`
  - `oidc` em ambiente compartilhado/producao com env valida
- `src/server/auth/auth-runtime.ts` e o gate central de configuracao; em `production` mal configurado o backend falha em modo `fail-closed`.
- `src/server/auth/auth-runtime-readiness.ts` e `scripts/auth-runtime-preflight.ts` agora oferecem preflight operacional de staging, incluindo validacao do discovery document do issuer sem depender de `client_secret` embutido no repositorio.
- A sessao backend agora carrega `user.id`, `authProvider` e `authMode`, e `src/server/auth/session.ts` resolve o ator interno validando `app_users`.
- `src/server/app/api-route-guards.ts` centraliza auth backend, acesso por projeto/workspace e auditoria de acesso negado.
- A autorizacao principal deixou de ser apenas `ownerIdentity`: hoje passa por membership persistida e role minima requerida por rota/use case.
- Existem rotas dedicadas para operar memberships em `app/api/workspaces/[workspaceId]/memberships/route.ts` (`GET` para `admin+`, `PUT` para `owner`) e `app/api/workspaces/[workspaceId]/memberships/[memberUserId]/route.ts` (`DELETE` para `owner`).
- O lifecycle de membership agora protege o ultimo `owner` tanto em downgrade quanto em remocao.
- O hardening atual grava auditoria minima de `denied`, `created`, `updated`, `imported` e `restored` para operacoes sensiveis do backend em `audit_events`, com `actorUserId` e persistencia best-effort.

### Seguranca operacional e runtime

- `next.config.ts` agora aplica um baseline conservador de headers de seguranca e `no-store` para respostas de API.
- `proxy.ts` reaplica esses headers tambem em respostas geradas pelo middleware, incluindo redirects de auth/locale.
- `.env.example` passou a refletir variaveis reais de release, service name, observabilidade interna, telemetria e auth OIDC.
- `docs/operations/runtime-env-and-migrations.md` formaliza o baseline operacional para envs, modos de auth, seed e comandos Prisma.
- `pnpm prisma:migrate` agora falha de forma explicita; o fluxo correto ficou separado entre `pnpm prisma:migrate:dev` e `pnpm prisma:migrate:deploy`.

### APIs

- O envelope padrao de sucesso e `{ data: ... }` em `src/server/app/api-response.ts`.
- Erros de validacao, auth, forbidden, dominio e erro interno agora seguem `error/code/message`, com `issues` ou `details` quando aplicavel.
- Grupos de rotas ativas hoje:
  - autenticacao: `app/api/auth/[...nextauth]/route.ts`
  - workspaces e acesso: `app/api/workspaces/[workspaceId]/memberships/route.ts`, `app/api/workspaces/[workspaceId]/memberships/[memberUserId]/route.ts`
  - projetos: `app/api/projects/route.ts`, `app/api/projects/create-with-assistant/route.ts`
  - creation assistant: `creation-draft`, `creation-apply`, `creation-settings`, `creation-settings/draft`, `creation-settings/apply-initial-map`
  - editor/grafo: `editor-snapshot`, `editor-commands`, `working-snapshot`, `nodes/*`, `edges/*`
  - versionamento: `snapshot-versions/*`
  - semantica: `semantic/policy`, `semantic/validate`, `semantic/audit`
  - importadores: `imports/prisma-schema`, `imports/prisma-file`, `imports/postgres`
  - ERD: `erd/export-preview`
  - observabilidade interna: `internal/observability/creation-transition*`
- As rotas de node/edge sao wrappers finos sobre o mesmo backend de comandos do editor.

## Estado dos testes

- Suite unit/integracao: `src/**/*.test.ts` (`vitest.config.mts`).
- Suite E2E: `10` specs em `tests/e2e` (`playwright.config.ts`).
- Route tests dedicados em `src/server/app/routes`.
- A cobertura atual e melhor em:
  - helpers de editor;
  - importacao;
  - auth runtime/session e guards de API;
  - observabilidade;
  - contratos de rota mais centrais do editor, criacao, importacao e versionamento.
- Lacunas visiveis:
  - as rotas mais criticas e os aliases ativos de criacao agora tem guardrails dedicados em `/api/projects`, `creation-draft`, `creation-apply`, `creation-settings*`, `wizard-*`, `editor-commands`, `working-snapshot`, `editor-snapshot`, `snapshot-versions`, `semantic/policy|validate` e importacao principal;
  - E2E dependem de Postgres local, `next dev`, credenciais dev e browser do Playwright instalado.
  - a baseline minima agora pode ser reproduzida com `pnpm validate` e tambem roda na CI.
  - o modelo novo de memberships/roles ja domina o backend; o que sobra na frente de criacao sao aliases de compatibilidade de payload/URL, nao mais fallback central de ownership.

Baseline revalidada em `2026-04-02`:

- `pnpm lint` esta verde;
- `pnpm test` esta verde;
- `pnpm test:routes:critical` esta verde;
- `pnpm typecheck` esta verde;
- `pnpm build` esta verde.

Correcoes que fecharam a baseline critica:

- lint:
  - ajuste seguro em `src/components/editor/editor-i18n-render.test.ts`
  - limpeza pontual em `src/components/editor/shell/editor-shell-controllers.test.ts` e `src/components/editor/use-editor-translations.ts`
- semantica:
  - a auditoria de ERD voltou a reportar `NODE_KIND_OUT_OF_PROFILE` e `EDGE_CONNECTION_NOT_ALLOWED` quando o snapshot sai do perfil esperado
- importacao:
  - o teste de `src/modules/importing/domain/prisma-schema-importer.test.ts` agora trava o shape atual de `node.data.fields`, `flags`, `references` e provenance relacional

Os logs de timeout/fallback da suite de observabilidade continuam aparecendo em cenarios que exercitam degradacao controlada, mas a suite fecha verde.

## Dividas tecnicas e gargalos de manutencao

### Hotspots de tamanho e responsabilidade

| Arquivo                                                               | Tamanho aproximado       | Por que e gargalo                                                |
| --------------------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------- |
| `src/components/editor/editor-shell.tsx`                              | `5641` linhas / `189 KB` | Concentra comportamento demais no frontend do editor             |
| `src/modules/creation-assistant/domain/creation-assistant.ts`         | `1937` linhas / `55 KB`  | Dominio, validacao, receitas e compatibilidades no mesmo arquivo |
| `src/modules/semantics/domain/semantic-engine.ts`                     | `1487` linhas / `49 KB`  | Regra semantica com alto custo de manutencao e leitura           |
| `src/modules/importing/domain/prisma-schema-importer.ts`              | `1385` linhas / `48 KB`  | Parser, mapper, normalizacao e telemetria muito proximos         |
| `src/server/observability/creation-assistant-transition-telemetry.ts` | `1335` linhas / `42 KB`  | Contrato, sink, fanout, governanca e avaliacao no mesmo modulo   |

### Fragilidades estruturais

- `Project.template` ainda influencia comportamento do editor e do contexto de criacao, apesar de o snapshot ja carregar `diagramType`.
- O fluxo de criacao convive com contratos oficiais e aliases legados ao mesmo tempo.
- Working snapshot e versionamento imutavel vivem em tabelas diferentes e com semanticas diferentes.
- Semantica esta no caminho critico de salvar, importar e restaurar snapshots.
- O contrato critico do importador Prisma/Postgres esta mais rigido, mas ainda faltam guardrails equivalentes para outras entradas de importacao e para `erd/export-preview`.
- Parte importante da protecao operacional esta em convencoes implicitas, nao em gates automatizados.

## Pontos frageis para as proximas fases

- Nao quebrar o `GraphSnapshot` e suas invariantes deve ser prioridade absoluta; quase toda regressao estrutural nasce aqui.
- Qualquer mudanca em `resolveProjectCreationContext()` mexe em `create`, `editor`, telemetria e fallback de template legado.
- Mexer em semantica sem revalidar a matriz por modo de diagrama tende a reabrir drift entre editor, auditoria, save e restore.
- Mexer em importacao sem formalizar o shape final do payload tende a gerar regressao silenciosa em consumidores do editor.
- Qualquer iniciativa de enterprise readiness vai bater primeiro em auth, ownership e aliases legados de API.
- O backend protegido de projeto/workspace agora passa por `getProjectAccess`/`getWorkspaceAccess` sem shim central de ownership; os aliases que restam usam o mesmo modelo de membership/role.

## Leitura recomendada junto com este documento

- `docs/architecture-non-breakable-contracts.md`
- `docs/planning/phase-backlog.md`
- `docs/domain-model.md`
- `docs/engineering/non-regression-checklist.md`
- `docs/operations/runtime-env-and-migrations.md`
