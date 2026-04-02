# Contratos nao quebraveis

## Como usar este documento

Os contratos abaixo sao os pontos que futuras fases nao devem quebrar sem migracao explicita, testes e plano de compatibilidade. Cada item foi extraido do codigo atual, nao de intencao futura.

## 1. Snapshot canonico do grafo

- Nome: `GraphSnapshot`
- Local no codigo: `src/domain/canonical-graph.ts`
- Por que e critico: e o payload comum entre editor, importadores, versionamento, semantica e persistencia.
- Risco de quebra: alto. Qualquer mudanca estrutural reverbera em quase todo o produto.
- Como validar integridade: parse em `GraphSnapshotSchema`, carga/salvamento via repositorios e testes de `graph`, `editor`, `versioning` e `importing`.
- Impacto em caso de regressao: snapshots antigos deixam de abrir, APIs de editor quebram e importadores passam a gerar payload invalido.

## 2. Invariantes do grafo

- Nome: `validateGraphSnapshotInvariants`
- Local no codigo: `src/modules/graph/domain/graph-invariants.ts`
- Por que e critico: garante labels validos, viewport finito, IDs unicos, edges sem orfaos e ausencia de duplicidade exata de relacao.
- Risco de quebra: alto. E a ultima barreira antes da persistencia real.
- Como validar integridade: salvar working snapshot, aplicar comandos do editor, criar/restaurar versoes e importar snapshots.
- Impacto em caso de regressao: banco passa a aceitar estado estruturalmente inconsistente e a UI fica sujeita a erro dificil de diagnosticar.

## 3. Persistencia do working snapshot com revisao otimista

- Nome: working snapshot em `GraphVersion` v1 + `revision`
- Local no codigo: `src/modules/graph/infrastructure/prisma-working-snapshot-repository.ts`, `prisma/schema.prisma`
- Por que e critico: o editor atual depende de um unico snapshot de trabalho mutavel por projeto.
- Risco de quebra: alto. Mudancas aqui afetam autosave, save manual, restore, importacao e dashboard.
- Como validar integridade: `GET/PUT /api/projects/[projectId]/working-snapshot`, `GET /editor-snapshot`, conflito via `expectedRevision`.
- Impacto em caso de regressao: perda de dados, sobrescrita silenciosa entre saves concorrentes e restore inconsistente.

## 4. Contrato de comandos do editor

- Nome: `EditorCommandSchema` e inputs de aplicacao
- Local no codigo: `src/modules/editor/application/schemas.ts`
- Por que e critico: e o protocolo server-side para mutacoes incrementais do editor.
- Risco de quebra: alto. A UI, as rotas finas de node/edge e parte dos testes assumem exatamente esse union discriminado.
- Como validar integridade: `POST /api/projects/[projectId]/editor-commands`, rotas de node/edge e smoke do editor.
- Impacto em caso de regressao: o editor deixa de salvar incrementalmente, autosave quebra e wrappers de rotas ficam fora de contrato.

## 5. Contrato de override semantico

- Nome: `semanticMode`, `allowSemanticOverride`, `overrideReason`
- Local no codigo: `src/modules/editor/application/schemas.ts`, `src/modules/editor/application/use-cases.ts`, `src/modules/semantics/domain/*`
- Por que e critico: define quando o backend pode aceitar mutacao tecnicamente valida, mas semanticamente bloqueada.
- Risco de quebra: alto. Muda o comportamento de editor, importacao e restore.
- Como validar integridade: aplicar comandos/saves com e sem override, auditar snapshot e restaurar versoes.
- Impacto em caso de regressao: o sistema passa a bloquear demais ou permitir demais sem trilha confiavel.

## 6. Estado de criacao: draft, settings e estado aplicado

- Nome: `AssistantDraftSchema`, `AssistantCreationSettingsSchema` e fluxo de apply
- Local no codigo: `src/modules/creation-assistant/domain/creation-assistant.ts`, `src/modules/creation-assistant/application/use-cases.ts`, rotas `creation-draft`, `creation-apply`, `creation-settings`
- Por que e critico: o produto hoje diferencia rascunho editavel, configuracao aplicada e snapshot inicial gerado.
- Risco de quebra: alto. O fluxo oficial `/create` depende disso e os aliases legados tambem.
- Como validar integridade: salvar draft, aplicar criacao, reabrir `/create?fromProjectId=...` e verificar estado persistido.
- Impacto em caso de regressao: perda de configuracao, reabertura incoerente do assistant e falha na geracao inicial do mapa.

## 7. Resolucao do contexto de criacao

- Nome: `resolveProjectCreationContext`
- Local no codigo: `src/modules/projects/domain/resolve-project-creation-context.ts`
- Por que e critico: e a ponte entre dados novos (`draft`, `creation settings`, `diagramType`) e legado (`Project.template`).
- Risco de quebra: alto. E usado tanto em `/create` quanto em `/editor` e alimenta telemetria de fallback.
- Como validar integridade: abrir create/editor para projetos novos, antigos e com template legado; conferir `decisionTrace`.
- Impacto em caso de regressao: projeto abre no modo errado, layout e recipe errados, telemetria de migracao perde confiabilidade.

## 8. Envelope padrao de API

- Nome: `apiSuccessResponse`, `apiErrorResponse`, `unauthorizedResponse`, `forbiddenResponse`
- Local no codigo: `src/server/app/api-response.ts`
- Por que e critico: clientes atuais assumem `data` em sucesso e `error/code/message` em falha.
- Risco de quebra: medio-alto. E contrato espalhado por todas as rotas.
- Como validar integridade: route tests existentes e chamadas manuais para rotas representativas.
- Impacto em caso de regressao: clientes quebram parsing, mensagens deixam de ser previsiveis e ferramentas operacionais perdem consistencia.

## 9. Sessao, identidade e ownership

- Nome: sessao `NextAuth` + ownership por identidade
- Local no codigo: `src/server/auth/options.ts`, `src/server/auth/session.ts`, `src/server/auth/api-session.ts`, `src/server/app/api-route-guards.ts`, casos de uso de `projects` e `workspaces`
- Por que e critico: quase toda protecao hoje depende de `ownerIdentity` e da sessao JWT.
- Risco de quebra: alto. Nao existe outro modelo de autorizacao pronto no repo.
- Como validar integridade: login, acesso a paginas protegidas, chamadas autenticadas de API e ownership de projeto.
- Impacto em caso de regressao: vazamento de acesso entre projetos, quebra de login ou protecao insuficiente em rotas.

## 10. Acesso a observabilidade interna

- Nome: allowlist/dev bypass de observabilidade interna
- Local no codigo: `src/server/auth/internal-observability-access.ts`, rotas `app/api/internal/observability/creation-transition*`
- Por que e critico: expor telemetria interna sem esse gate e risco operacional e de seguranca.
- Risco de quebra: alto.
- Como validar integridade: chamadas autenticadas e nao autenticadas para os endpoints internos, em `development` e fora dele.
- Impacto em caso de regressao: acesso indevido a dados internos ou bloqueio indevido da operacao de observabilidade.

## 11. Versionamento imutavel e diff/restore

- Nome: `EditorSnapshotVersion`, diff estrutural e restore sobre working snapshot
- Local no codigo: `src/modules/versioning/domain/snapshot-version.ts`, `src/modules/versioning/domain/graph-snapshot-diff.ts`, `src/modules/versioning/application/use-cases.ts`
- Por que e critico: checkpoint imutavel e working snapshot mutavel sao dois conceitos distintos na base atual.
- Risco de quebra: medio-alto.
- Como validar integridade: criar versao, listar, obter diff e restaurar; conferir que a versao continua imutavel.
- Impacto em caso de regressao: historico deixa de ser confiavel e restore pode corromper o estado atual do projeto.

## 12. Provenance de importacao, external refs e shape ERD importado

- Nome: `ExternalRef` importado, `ImportExternalRefContext` e shape de `node.data.fields` gerado pelo importador Prisma/Postgres
- Local no codigo: `src/modules/importing/domain/external-refs.ts`, `src/domain/canonical-graph.ts`, `src/modules/importing/domain/prisma-schema-importer.ts`
- Por que e critico: a rastreabilidade de importacao e a leitura ERD no editor dependem de IDs deterministicos e de um payload estavel para campos e relacoes.
- Risco de quebra: alto para integracoes e depuracao.
- Como validar integridade: importar Prisma inline, Prisma file e Postgres; conferir `externalRefs`, `externalId`, `node.data.fields[].flags`, `node.data.fields[].references` e provenance/cardinality nas edges resultantes.
- Impacto em caso de regressao: perde-se rastreabilidade do que veio de fonte externa, relacoes ERD deixam de apontar para os campos corretos e a normalizacao deixa de ser deterministica.

## 13. Contrato de telemetria de transicao do creation flow

- Nome: `CREATION_TRANSITION_EVENT_CONTRACT` e `CreationTransitionEnvelopeSchema`
- Local no codigo: `src/server/observability/creation-transition-contract.ts`
- Por que e critico: hoje ja existe contrato tipado de evento, classificacao, retencao e payload por evento.
- Risco de quebra: medio-alto.
- Como validar integridade: testes de observabilidade existentes e chamadas aos eventos disparados por `creation-draft`, `creation-apply` e aliases.
- Impacto em caso de regressao: dashboards, auditoria e analise de migracao perdem consistencia historica.

## 14. Compatibilidade de rotas legadas

- Nome: aliases de `/wizard` e rotas de transicao do creation flow
- Local no codigo: `src/lib/routes.ts`, `app/[locale]/(protected)/wizard/page.tsx`, `app/api/projects/[projectId]/wizard-draft/route.ts`, `app/api/projects/[projectId]/wizard-generate/route.ts`, `app/api/projects/[projectId]/creation-settings/route.ts`
- Por que e critico: ainda ha codigo e possiveis clientes internos antigos dependendo desses aliases.
- Risco de quebra: medio-alto ate haver plano de retirada.
- Como validar integridade: abrir `/wizard?projectId=...`, salvar por alias e aplicar via alias; comparar com rotas oficiais.
- Impacto em caso de regressao: links antigos e clientes de compatibilidade deixam de funcionar sem migracao.

## O que nao deve acontecer sem migracao explicita

- Mudar o shape de `GraphSnapshot` ou de `EditorCommand` sem adaptar UI, rotas, testes e snapshots existentes.
- Remover `expectedRevision` ou mudar seu significado sem rever autosave e restore.
- Mexer em `resolveProjectCreationContext()` sem validar projetos legados e telemetria de fallback.
- Alterar envelopes de API sem revisar todos os consumidores.
- Remover aliases legados antes de medir uso e definir janela de retirada.
