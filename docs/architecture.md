# Arquitetura (historico de fases)

> Este arquivo continua como registro historico de fases e decisoes acumuladas.
> Para retrato tecnico do sistema atual, ver `docs/architecture-current-state.md`.
> Para contratos criticos que nao podem quebrar, ver `docs/architecture-non-breakable-contracts.md`.

## Objetivo

Estabelecer base modular para evolucao incremental do MapIA sem acoplar UI, importadores e persistencia ao formato bruto das fontes externas.

## Estado atual

- O fluxo oficial de criacao e o `Creation Assistant` em `/create`.
- Referencias a `Wizard` neste documento representam contexto historico de fases anteriores ou pontos que ainda precisam de arquivamento.

## Principios adotados

- Modelo canonico unico de grafo (`Node`, `Edge`, `ExternalRef`, `GraphSnapshot`, `ViewportState`) para todas as views.
- Separacao de camadas: `domain` (regras/contratos), `application` (casos de uso/orquestracao), `infrastructure` (Prisma, auth, importadores).
- UI (`Creation Assistant`/Editor) consome contratos de aplicacao e nunca payloads brutos de importadores.
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

## Fase 2A (hardening backend do Editor)

- Separacao explicita de leitura e mutacao no modulo `editor` (CQRS leve):
  - Query use-case: `GetWorkingSnapshotForEditorUseCase`
  - Command use-cases: `ApplyEditorCommandUseCase` (1 comando) e `ApplyEditorCommandsUseCase` (compatibilidade Fase 1)
- Rotas do editor continuam sem regra de negocio:
  - validam auth/sessao
  - validam payload/params com Zod
  - verificam ownership do projeto via use-case de `projects`
  - delegam para use-cases de `editor`
- Nova rota de query explicita: `GET /api/projects/[projectId]/editor-snapshot`
- Compatibilidade preservada:
  - `GET|PUT /api/projects/[projectId]/working-snapshot` continuam funcionando
  - `POST /api/projects/[projectId]/editor-commands` aceita payload novo (`command`) e legado (`commands`)

## Fase 2B (UX e estrutura do Editor no frontend)

- `EditorShell` passa a integrar com a camada CQRS leve da Fase 2A:
  - query inicial via `GET /api/projects/[projectId]/editor-snapshot`
  - mutacoes via `POST /api/projects/[projectId]/editor-commands` com payload `{ command }`
  - save manual mantido via `PUT /api/projects/[projectId]/working-snapshot`
- Inspector completo para node e edge com:
  - drafts locais (label, kind, data JSON)
  - validacao local com Zod antes de enviar command
  - aplicacao explicita por botao (evita salvar parcial por digito)
- Autosave com debounce no frontend (fila local de commands):
  - consolida mudancas rapidas em uma fila
  - envia comandos em sequencia para o backend
  - ignora respostas obsoletas para nao regredir o estado de save
- Estado de save separado do estado do grafo:
  - `saved | dirty | saving | error`
  - indicador visual + timestamp do ultimo salvamento
- Aviso de saida (`beforeunload`) quando houver alteracoes pendentes

## Fluxo de leitura do Editor (query)

1. Route valida sessao e ownership do projeto.
2. Route chama `GetWorkingSnapshotForEditorUseCase`.
3. Gateway/repositorio carrega `GraphVersion` v1.
4. Boundary Prisma valida JSON com `GraphSnapshotSchema.parse(...)`.
5. Invariantes semanticos do grafo sao validados (defensivo) antes de retornar para a UI.

## Fluxo de mutacao do Editor (command)

1. Route valida sessao, params e payload do comando com Zod.
2. Route verifica ownership do projeto.
3. Use-case carrega snapshot atual (v1) e revalida invariantes.
4. Command processor aplica mutacao no snapshot canonico.
5. Invariantes sao validados apos a mutacao.
6. Repositorio persiste snapshot validado (boundary Prisma + `GraphSnapshotSchema.parse(...)` + invariantes).
7. Snapshot atualizado retorna para o editor.

## Fluxo frontend do Editor (Fase 2B)

1. Pagina do editor renderiza com snapshot inicial (fallback server-side) e monta `EditorShell`.
2. `EditorShell` sincroniza snapshot via query service (`/editor-snapshot`) sem sobrescrever mudancas locais mais novas.
3. Interacoes de UI (add/update/move/remove node/edge) aplicam command localmente (mesmas regras do command processor compartilhado) e entram na fila de autosave.
4. Debounce dispara flush da fila para `POST /editor-commands` com payload `{ command }`.
5. Save state e atualizado conforme sucesso/erro (`dirty -> saving -> saved|error`).
6. Botao manual `Salvar` continua disponivel e persiste snapshot completo via `PUT /working-snapshot`.

## Autosave (debounce + race avoidance)

- Debounce atual: `1000ms` (ajustavel).
- Fila local de commands permite consolidar alteracoes rapidas sem flood imediato.
- As respostas do backend nao sobrescrevem o grafo local (UI usa estado local como fonte de render).
- `requestId` local protege o estado de save contra respostas obsoletas.
- Em falha:
  - estado vira `error`
  - pendencias continuam na fila
  - usuario pode tentar novamente pelo botao `Salvar`

## Validacao (Zod + invariantes)

- Zod continua como fonte de verdade para:
  - payloads de API
  - comandos do editor (discriminated union por `type`)
  - boundary estrutural do snapshot canonico
- Invariantes de dominio complementam Zod para consistencia semantica:
  - IDs unicos
  - edges referenciando nodes existentes
  - numeros finitos em posicoes/viewport
  - normalizacao de labels
  - politica de duplicidade de edge e remocao de edges orfas

## Boundary de persistencia (normalizacao de nullables)

- Campos nullable do banco podem ser normalizados no boundary de repositorio antes do parse de dominio.
- Exemplo atual: `Project.description` pode estar `NULL` no Prisma/Postgres, mas o repositorio de `projects` normaliza para `""` antes de `ProjectSchema.parse(...)`.

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

## Limites atuais apos Fase 2A

- CQRS do editor e leve (sem event store, projections separadas ou fila).
- Persistencia continua em `GraphVersion` v1 mutavel (temporario ate Fase 3).
- Endpoint legado de snapshot completo foi mantido por compatibilidade/manual save.

## Limites atuais apos Fase 2B

- Autosave cobre mutacoes de grafo via commands; persistencia de viewport continua garantida pelo save manual (ate existir command dedicado de viewport).
- Sem E2E de editor ainda (cobertura atual focada em helpers/services e backend unitario).
- Sem versionamento real/diff/restore (Fase 3).

## Fase 2C (hardening + limpeza tecnica)

- `EditorShell` recebeu limpeza de residuos locais (tipos compartilhados do inspector, estado/ref morto removido e ajustes de consistencia de acoes durante `saving`).
- Fluxo de save/autosave foi endurecido sem mudar UX:
  - respostas obsoletas continuam protegidas por `requestId`
  - o save manual por snapshot nao limpa mais commands adicionados localmente durante o request (eles permanecem `dirty` e reentram no autosave)
  - erros globais de save sao limpos apos sucesso
- Boundary Prisma de `projects` permanece responsavel por normalizar nullable (`description: null -> ""`) antes do parse de dominio, mantendo `ProjectSchema` estrito.

## Fase 2D (polimento final de UX/visual do Editor)

- Mensagens do Inspector foram padronizadas para UX amigavel:
  - erros de JSON invalidos agora mostram texto curto e claro (sem payload bruto do Zod)
  - erros por campo (`label`, `kind`, `dataJson`) sao traduzidos de forma consistente entre node e edge
  - fallback generico de validacao evita serializacao de objetos/arrays na UI
- Refinos visuais incrementais no `EditorShell`/styles:
  - melhor contraste para textos auxiliares, labels e badges/status
  - feedback visual mais claro para rascunho nao aplicado, erros e estados desabilitados
  - microajustes de espacamento/alinhamento no toolbar e no inspector, sem mudar layout estrutural

## Fase 3A (E2E do Editor + estabilizacao de testabilidade)

- Cobertura E2E real do fluxo `Dashboard -> Wizard -> Editor` adicionada com Playwright (`tests/e2e/editor-flow.spec.ts`).
- Configuracao Playwright local:
  - `playwright.config.ts` com `baseURL`, `webServer`, `retries`, `trace`, `screenshot` e `video` em falha
  - scripts `test:e2e*` em `package.json`
- Estabilizacao de seletores:
  - `data-testid` nos controles criticos do editor (toolbar, canvas, inspector, save/global error)
  - `data-testid` dinamico em nodes/edges do React Flow via `domAttributes` nos mappers
  - `data-testid` minimo em login/dashboard/wizard para reduzir dependencia de texto em E2E
- Regressao descoberta e corrigida pelo E2E:
  - `POST /api/projects` agora aceita `slug`/`description` vazios (`""`) como a UI envia nos campos opcionais
- Cobertura UX critica do inspector:
  - estado vazio (nenhum item selecionado)
  - feedback amigavel para JSON invalido (sem payload bruto de Zod)

## Fase 3A.1 (hardening de ambiente E2E/monorepo)

- `next.config.ts` agora define `turbopack.root` explicitamente para o root real do repositorio/app Next.
- Objetivo: evitar inferencia incorreta de workspace root em setups locais/monorepo que quebra `next dev` com Turbopack (`Next.js package not found`).
- `playwright.config.ts` foi endurecido para subir o app via script `dev:e2e` em webpack (`next dev --webpack`) usando `webServer.cwd` explicito.
- E2E continua preservando `baseURL`, `reuseExistingServer`, `trace`, `screenshot` e `video` em falha.

## Fase 3A.2 (refino final da suite E2E)

- Suite E2E do editor recebeu refino anti-flake incremental sem mudar regra de negocio:
  - waits por responses relevantes (`/api/projects`, `/wizard-draft`, `/wizard-generate`, saves do editor)
  - assercoes de save state padronizadas por `data-save-status`
  - captura de historico do badge de save para validar transicoes rapidas (`saving`) sem depender de timing visual
- Fixtures/helpers de E2E foram refinados para debug local:
  - mensagens de erro de login dev mais claras (incluindo dica de `.env/.env.local`)
- Ergonomia de execucao:
  - script dedicado `test:e2e:editor:headed`
- Mantido um unico `waitForTimeout` intencional (curto) para hidratação do formulario do dashboard em `next dev`, documentado no spec e no guia E2E.

## Fase 5.1.2 (consistencia UX do wizard)

- `WizardDraft.payload.config` passou a persistir:
  - `rootNodeName?: string`
  - `allowReapplyLayout?: boolean`
- Regra de validacao no `WizardReadyPayloadSchema`:
  - quando `generateRootNode=true`, `rootNodeName` deve existir com `trim` nao vazio
- Geracao de snapshot inicial:
  - no raiz opcional usa `rootNodeName` como label
  - snapshot passa a carregar metadados opcionais:
    - `rootNodeName?: string`
    - `allowReapplyLayout?: boolean`
- Editor:
  - `Reaplicar layout` agora respeita politica do snapshot (`allowReapplyLayout !== false`)
  - snapshots legados sem esse campo mantem comportamento anterior (habilita por tipo suportado)
- Cobertura:
  - unit tests de schema/invariantes para novos campos opcionais
  - E2E dedicado para persistencia no wizard + bloqueio de reaplicacao no editor

## Fase 5.2 (polimento UX/UI enterprise: Workspace, Wizard e Editor)

- Dashboard/Workspace:
  - formulario de criacao mantido enxuto (`nome` obrigatorio + `finalidade` opcional)
  - `slug` removido do fluxo principal e exposto somente como `ID tecnico` em area avancada read-only
  - `tipo inicial` migrou de `select` para cards (`Hierarquia`, `Processo`, `Mapa mental`, `Decidir no Wizard`) preservando valores internos (`tree/flow/mindmap/wizard`)
  - bloco de continuidade apos criacao (`Proximos passos`) com CTAs:
    - `Configurar no Wizard` (primario)
    - `Abrir Editor` (secundario)
  - lista de projetos enriquecida com leitura operacional:
    - tipo selecionado (quando ja existe no snapshot)
    - status de snapshot inicial
    - contagem de versoes
    - acao opcional `Ver versoes`
  - pagina server-side do dashboard passou a projetar metadados por projeto a partir de:
    - `graph.loadWorkingSnapshot`
    - `versioning.listSnapshotVersions`

- Wizard:
  - stepper com linguagem orientada a decisao:
    1. `Tipo de diagrama`
    2. `Origem dos dados`
    3. `Configuracao`
    4. `Revisao`
    5. `Gerar e abrir editor`
  - refinamento da etapa de configuracao:
    - `No raiz (titulo principal)` com explicacao do papel no diagrama
    - politica `Permitir reaplicar layout no editor` com contexto de uso
    - campos numericos de layout com unidade `px` na UI
  - revisao executiva em bullets com:
    - tipo
    - layout
    - origem
    - titulo principal
    - politica de layout
    - contagem prevista
  - aviso explicito quando origem = `Importacao`

- Editor:
  - header/toolbar com leitura operacional continua:
    - status de salvamento
    - contagem de nos/arestas
    - tipo de diagrama
    - politica de layout
  - `Reaplicar layout`:
    - mantido desabilitado quando `allowReapplyLayout=false`
    - feedback reforcado com badge `Layout bloqueado`
    - CTA direto `Ajustar no Wizard`
  - bloco de versoes com hierarquia mais clara e naming local explicito:
    - nome da versao tratado como metadado local (`localStorage`)
    - mensagens de feedback ajustadas para sucesso/erro sem ambiguidade
  - inspector padronizado para termos de produto (`No`, `Aresta`, `Rotulo`, `Tipo`, `Dados (JSON)`) e empty-state com orientacao pratica

- Sistema UI/CSS:
  - consolidacao de estilos compartilhados (remocao de inline repetido em `CardOption`, toolbar/listas)
  - paleta temporaria neutra (sem hardcodes verde-teal), mantendo foco em consistencia visual enterprise

## Fase 5.3 (identidade oficial MapIA + canvas diagram-aware)

- Brand/tokens:
  - adocao de tokens semanticos oficiais (`--color-*`, `--focus-ring`, `--shadow`, `--radius-*`)
  - paleta oficial MapIA aplicada na base visual (roxo profundo, magenta, laranja, base escura)
  - consolidacao de variaveis globais para reduzir duplicacao e hardcode
- Renderer registry no frontend:
  - novo modulo de resolucao `resolveDiagramRenderer({ diagramType, template, layoutOptions })`
  - prioridade de resolucao:
    1. `diagramType` suportado (`tree | flow | mindmap`)
    2. modo legado via `diagramType` legado (quando existir)
    3. fallback por `template` legado (`erd`, `sitemap`, `graph`)
  - cada renderer declara:
    - `nodeTypes`, `edgeTypes`, `defaultEdgeOptions`
    - `backgroundConfig`, `minimapClassName`, `canvasClassName`
    - `data-diagram-renderer`
    - capacidades (`supportsPorts`, `supportsParallelEdges`)
- Multi-edge visual (enterprise):
  - `computeParallelEdgeMeta(edges)` calcula `parallelIndex/parallelTotal` por grupo `source -> target`
  - edge custom (`ParallelBezierEdge`) aplica offset/curvatura para evitar sobreposicao de arestas e labels
- Integracao no `EditorShell`:
  - `ReactFlow` passa a receber `nodeTypes/edgeTypes/defaultEdgeOptions` do renderer resolvido
  - canvas exibe `Modo visual: {label}` e atributo `data-diagram-renderer`
  - criacao de novo no passa a sugerir `label/kind` por renderer

## Distincao obrigatoria: layout engine vs renderer UI

- Layout engine (`src/modules/graph/domain/diagram-types.ts`):
  - calcula posicionamento e metadados de layout no snapshot canonico
  - nao define aspecto visual do canvas
- Renderer UI (`src/components/editor/diagram-renderers/*`):
  - define como o diagrama e desenhado no React Flow (nós, arestas, minimap, background, portas, multi-edge)
  - usa `diagramType/template` para escolher modo visual sem alterar contrato de dominio/backend

## Fase 3B (versionamento real de snapshots: working + versoes imutaveis)

- `working snapshot` do editor permanece mutavel e compativel com o fluxo atual:
  - autosave por commands (`POST /editor-commands`)
  - save manual do snapshot completo (`PUT /working-snapshot`)
  - query inicial (`GET /editor-snapshot`)
- Versoes imutaveis passaram a ter persistencia propria em `editor_snapshot_versions`:
  - snapshot JSON completo do checkpoint
  - `label` opcional
  - `origin` (atual: `manual`)
  - `createdAt`
- Criar versao nao altera o `working snapshot`; a operacao apenas copia o snapshot atual persistido para a tabela de versoes.
- Novo modulo `versioning` (camadas `domain/application/infrastructure`) centraliza:
  - criar versao a partir do `working snapshot`
  - listar versoes por projeto (mais recente primeiro)
  - obter detalhe de versao por `id`
- Novas APIs do editor para historico de versoes:
  - `POST /api/projects/[projectId]/snapshot-versions`
  - `GET /api/projects/[projectId]/snapshot-versions`
  - `GET /api/projects/[projectId]/snapshot-versions/[versionId]`
- UI minima da 3B:
  - botao `Criar versao` no toolbar do `EditorShell`
  - feedback amigavel de sucesso/erro
  - controles novos com `data-testid` (preparo para E2E/3C)

## Fluxo de criacao de versao (Fase 3B)

1. Route valida sessao, params/payload e ownership do projeto.
2. Use-case de `versioning` carrega o `working snapshot` atual pelo repositorio existente.
3. Se nao existir snapshot de trabalho, retorna erro amigavel (`WORKING_SNAPSHOT_NOT_FOUND`).
4. Repositorio de versoes valida boundary JSON + invariantes do grafo.
5. Repositorio cria checkpoint imutavel em `editor_snapshot_versions`.
6. API retorna metadados + snapshot da versao criada, sem alterar o `working snapshot`.

## Limites atuais apos Fase 3B

- O `working snapshot` mutavel ainda usa a tabela legada `graph_versions` (v1) por compatibilidade; a migracao completa desse armazenamento fica para evolucoes futuras.
- Versoes imutaveis suportam checkpoint manual (`origin=manual`) apenas neste momento.
- Sem diff/restore na UI/API ainda (planejado para Fase 3C).
- Nao ha versionamento por command/event store; checkpoints continuam explicitos e sob demanda.

## Fase 3C (diff + restore de versoes sobre working snapshot)

- Diff de versoes implementado no backend (MVP estrutural, sem diff visual):
  - `Base = versao imutavel`
  - `Target = working snapshot` atual
  - resultado inclui `hasChanges`, listas de `nodes/edges` adicionados/removidos/alterados, `viewportChanged` e `summary`
- Restore implementado como copia de uma versao imutavel para o `working snapshot`:
  - a versao em `editor_snapshot_versions` continua imutavel
  - o `working snapshot` mutavel e sobrescrito no backend (fonte de verdade)
  - autosave/manual save continuam operando sobre o `working snapshot` apos restore
- Novas APIs:
  - `GET /api/projects/[projectId]/snapshot-versions/[versionId]/diff`
  - `POST /api/projects/[projectId]/snapshot-versions/[versionId]/restore`
- UI minima no `EditorShell`:
  - botao `Atualizar versoes`
  - lista simples de versoes com `Comparar` e `Restaurar`
  - feedback textual de diff/restore (preparado com `data-testid` para E2E futuro)

## Fluxo de diff de versao (Fase 3C)

1. Route valida sessao, params (`UUID`) e ownership do projeto.
2. Use-case de `versioning` carrega:
   - versao imutavel selecionada
   - `working snapshot` atual
3. Helper puro de dominio (`computeGraphSnapshotDiff`) calcula diff estrutural por `id` + comparacao normalizada de objeto.
4. API retorna `version` (summary) + `diff` em modo read-only (nenhuma alteracao em banco).

## Fluxo de restore de versao (Fase 3C)

1. Route valida sessao, params (`UUID`) e ownership do projeto.
2. Use-case de `versioning` carrega versao imutavel e `working snapshot` atual.
3. Se qualquer um nao existir, retorna erro amigavel (`SNAPSHOT_VERSION_NOT_FOUND` / `WORKING_SNAPSHOT_NOT_FOUND`).
4. Backend sobrescreve o `working snapshot` com o snapshot da versao selecionada.
5. API retorna mensagem amigavel + `workingSnapshot` atualizado + `restoredFromVersionId`.

## Limites atuais apos Fase 3C

- Diff atual e estrutural (por IDs + objetos normalizados), sem representacao visual/inline diff no canvas.
- Restore sobrescreve diretamente o `working snapshot` atual e nao cria checkpoint automatico pre-restore nesta fase.
- Comparacao/restore operam sobre o snapshot persistido no backend (nao sobre mutacoes locais ainda nao salvas).
- Nao ha audit trail detalhado de restore (quem/quando restaurou) alem dos metadados do `working snapshot` atualizado.

## Fase 4A (importador inicial de Prisma Schema `.prisma` -> snapshot do editor)

- Novo modulo `importing` (backend-first) implementa parser/mapper MVP para texto de schema Prisma:
  - entrada: conteudo textual `.prisma`
  - saida: `GraphSnapshot` canonico valido para o editor
- Mapeamento MVP:
  - `model` -> node `kind="entity"`
  - relacoes entre models -> edges (`kind="references"`) com deduplicacao basica de espelho
  - campos escalares -> metadata em `node.data.fields`
- Layout inicial e deterministico (grid simples) para visualizacao imediata no canvas.
- API autenticada com ownership check:
  - `POST /api/projects/[projectId]/imports/prisma-schema`
  - importa o schema no backend e salva o resultado no `working snapshot`
- UI minima no `EditorShell`:
  - painel com textarea + botao para colar/importar schema Prisma
  - feedback amigavel de sucesso/erro
  - snapshot importado e aplicado no canvas local com reset de selecao/fila/estado de save

## Fluxo de importacao de schema Prisma (Fase 4A)

1. Route valida sessao, params (`UUID`) e ownership do projeto.
2. Route recebe o texto `.prisma` e chama o use-case de importacao (`importing`).
3. Parser/mapper converte models/relations para `GraphSnapshot` canonico.
4. Snapshot resultante e validado por Zod + invariantes do grafo.
5. Route persiste o snapshot importado no `working snapshot` via use-case do `editor`.
6. API retorna mensagem amigavel + `workingSnapshot` atualizado + resumo da importacao.

## Limites atuais apos Fase 4A

- Parser Prisma e MVP textual (regex/linhas), focado em `model`/fields/relations; nao cobre 100% da linguagem Prisma.
- Deduplicacao de edges de relacao usa regra simples (par de models + nome de relacao quando existir); multiplas relacoes sem nome entre o mesmo par podem colapsar.
- Sem layout automatico sofisticado (usa grid deterministico).
- Sem conexao com banco real/inspecao de schema ao vivo (isso fica para fases seguintes).

## Fase 4B.3 (orquestracao unificada de importacoes reais)

- O modulo `importing` passou a aceitar fontes reais mantendo o parser/mapper da 4A:
  - `prisma-schema-file` (arquivo `.prisma` -> `schemaText`)
  - `postgres-live` (introspeccao SQL -> `schemaText` Prisma)
- A camada `application` orquestra:
  - leitura/introspeccao da fonte
  - reaproveitamento do importador Prisma texto -> snapshot
  - retorno de `source` sem vazar `schemaText`
- Contrato de boundary de resposta das importacoes composicionais:
  - `sourceKind`, `sourceLabel`, `warnings`, `metadata`
  - proibido vazar `schemaText`

## Fase 4C (4C.1 -> 4C.3: rastreabilidade + canonicidade do snapshot importado)

### Objetivo

- Tornar o resultado da importacao rastreavel e deterministico
- Tornar o snapshot importado canonicamente normalizado para diff/debug/persistencia
- Sem acoplar UI e sem alterar contrato publico das rotas

### Responsabilidades por modulo (importing/domain)

- `external-refs.ts`
  - contrato de `locator` por origem (`prisma-schema-file`, `postgres-live`)
  - geracao deterministica de `externalId` / `ExternalRef.id`
  - guards/helpers de consumo (`isImportedExternalRef*`, `findPrimaryImportedExternalRef`)
  - dedupe defensivo de refs geradas por elemento
- `imported-snapshot-normalizer.ts`
  - normalizacao canonica de node/edge/snapshot importados
  - ordenacao estavel de `nodes`, `edges` e `externalRefs`
  - remocao de `undefined` em `data` para shape previsivel
- `prisma-schema-importer.ts`
  - parser/mapper Prisma texto -> snapshot
  - aplica `ExternalRef` quando houver `externalRefContext`
  - aplica validacao + normalizacao + revalidacao final

### Contrato canonico esperado do snapshot importado

- `nodes` e `edges` sempre em ordem deterministica para a mesma entrada/contexto
- `externalRefs` sempre array (node e edge)
- `node.data.fields` sempre array para nodes importados (`kind="entity"` + `data.source="prisma-schema"`)
- `edge.data` sem chaves `undefined` apos normalizacao
  - `relationName` unnamed fica omitido (nao `undefined`)
- IDs deterministicos de nodes/edges e `ExternalRef` preservados

### Fluxo de importacao (4C.3 hardening final)

1. Adapter/route/use-case composicional obtem artefato de importacao (`schemaText` + metadados + contexto interno opcional).
2. `prisma-schema-importer` gera nodes/edges com IDs deterministicos e `externalRefs` (quando houver `externalRefContext`).
3. Snapshot bruto passa por validacao estrutural (`GraphSnapshotSchema.parse(...)`).
4. Snapshot passa por invariantes semanticos (`validateGraphSnapshotInvariants(...)`).
5. Snapshot validado passa pela normalizacao canonica (`normalizeImportedSnapshotCanonical(...)`).
6. Snapshot normalizado e revalidado:
   - `GraphSnapshotSchema.parse(...)`
   - `validateGraphSnapshotInvariants(...)`
7. Resultado final segue para persistencia/retorno do caso de uso.

### Boundary hygiene preservado

- `schemaText` nao e exposto na resposta das rotas/use-cases composicionais de importacao
- `externalRefContext` permanece interno ao pipeline de importacao
- UI/editor continuam recebendo somente snapshot canonico + resumo + `importSource` sanitizado

## Fase 4D (observabilidade e telemetria enterprise do pipeline de importacao)

- O modulo `importing/domain` ganhou infraestrutura de telemetria interna OTel-ready, sem acoplamento com SDK/vendor:
  - `ImportTelemetryCollector` (porta)
  - `NoopImportTelemetryCollector` (default)
  - `BufferedImportTelemetryCollector` (captura em memoria para testes/diagnostico interno)
  - `createImportTelemetrySession(...)` (sessao com `sequence` deterministica + clock injetavel)
- O contrato de telemetria e tipado e estruturado em:
  - `ImportTelemetryEvent` (eventos com `code`, `phase`, `severity`, `attributes`, `correlation`)
  - `ImportTelemetryStep` (step timing span-like com `durationMs`, `status`, erro associado)
  - `ImportTelemetrySummary` (contagens, warnings, fases, flags e source metadata sanitizada)
- Hardening 4D.1 do contrato interno:
  - `IMPORT_TELEMETRY_CODES` centralizado em modulo dedicado (`import-telemetry-codes.ts`)
  - `ImportTelemetryCode` (union derivada) para `event.code`
  - `ImportTelemetrySourceKind` tipado (`prisma-schema-inline | prisma-schema-file | postgres-live`)
  - pronto para reuso no futuro `ImportTelemetryOtelAdapter` (4E)
- Hardening 4D.2 (governanca do contrato):
  - `IMPORT_TELEMETRY_EVENT_NAMES` + `ImportTelemetryEventName` centralizados
  - `IMPORT_TELEMETRY_STEP_NAMES` + `ImportTelemetryStepName` centralizados
  - importer sem strings soltas para `eventName` / `stepName`
  - catalogo opcional `IMPORT_TELEMETRY_EVENT_CONTRACT` (metadados para governanca e preparo da 4E)
  - testes anti-drift para listas completas de codes/eventNames/stepNames

### Fluxo de importacao instrumentado (4D)

1. `input accepted / source identified`
2. `parse` (start/end)
3. `externalRefs mapping stats`
4. warnings de provenance (`node miss` / `edge miss`) quando houver
5. validacao estrutural inicial (`GraphSnapshotSchema.parse`)
6. validacao de invariantes inicial
7. normalizacao canonica
8. re-parse pos-normalizacao
9. revalidacao de invariantes pos-normalizacao
10. `finalize summary`

Observacao:

- A telemetria e opcional no importer (`telemetry.collector`), com comportamento default `noop`.
- O retorno publico do importer/use-cases/rotas continua inalterado (`snapshot + summary` + source sanitizado nos composicionais).

### Boundary hygiene da telemetria (4D)

- `schemaText` nunca entra em `event.attributes` / `step.attributes` / `summary.source.metadata`
- `externalRefContext` bruto nunca e serializado na telemetria
- `externalRefs` completas nao sao despejadas em massa; apenas contagens/estatisticas/flags
- provenance de `postgres-live` entra somente como contagens sanitizadas (ex.: numero de modelos/relacoes no catalogo de provenance)
- `sourceLabel` (quando presente) e sanitizado para telemetria (ex.: path reduzido)
- Hardening 4D.1 (anti-explosao de payload):
  - limite de string (`512`)
  - limite de array (`50`, com marcador de truncamento)
  - limite de profundidade (`4`, marcador `[MaxDepthExceeded]`)
  - limite de chaves por objeto (`50`, marcador `__telemetryTruncatedKeys`)
  - `durationMs` de steps normalizado para nunca negativo (clock nao monotônico)

### Compatibilidade futura com OpenTelemetry (planejada)

- `ImportTelemetryStep` mapeia para spans OTel (`stepName`, `phase`, `status`, `durationMs`, `attributes`)
- `ImportTelemetryEvent` mapeia para OTel events (`eventName`, `code`, `severity`, `message`, `attributes`)
- `correlation` fornece atributos canonicos compartilhados:
  - `importRunId`
  - `projectId`
  - `sourceKind`
  - `sourceLabel` (sanitizado)
- `ImportTelemetrySummary` pode ser exportado por adapter como:
  - evento final de span raiz
  - metricas agregadas
  - diagnostico buffered em testes
- A 4D.2 reduz risco de drift no adapter 4E ao fixar nomes/codigos/steps em contratos centralizados com testes de governanca.

Fora de escopo da 4D:

- integrar SDK OpenTelemetry real
- exporter/vendor adapter (`ImportTelemetryOtelAdapter`) na runtime de producao

## Fase 4E.1 (adapter OpenTelemetry foundation para o pipeline de importacao)

- Novo adapter de infraestrutura em `src/modules/importing/infra/observability/import-telemetry-otel-adapter.ts` implementa `ImportTelemetryCollector` sem acoplar o dominio ao SDK OTel.
- Injeção explicita por factory `createImportTelemetryOtelAdapter(...)`:
  - `tracer`
  - `config` (nomes/prefixos/flags)
  - `clock` opcional (fallback de lifecycle/timestamps)
- A telemetria interna 4D/4D.1/4D.2 permanece a fonte de verdade; o adapter apenas faz bridge/mapeamento para tracing OTel.

### Estrategia de tracing (4E.1)

- `1` span raiz por `importRunId` (default `importing.pipeline`)
- `1` child span por `ImportTelemetryStep` (span encerrado no `recordStep(...)`)
- `ImportTelemetryEvent` mapeado para `span events` no root por padrao
  - opcionalmente duplicado no child span por correlacao deterministica (`sequence` dentro da janela `startedSequence/endedSequence`) quando `recordEventsOnRootOnly=false`
- `recordSummary(...)` consolida atributos finais no root span, define status OTel e fecha o lifecycle do run

### Lifecycle/state interno do adapter (4E.1)

- Registry em memoria de runs ativos por `importRunId` (`Map`)
- Tombstones de runs finalizados (bounded) para proteger contra double-finalize e eventos/steps tardios
- Cleanup do registry ativo apos finalize (sem manter run ativo apos `recordSummary`)
- Fallback seguro para chamadas fora de ordem:
  - `summary` antes de eventos/steps ainda cria/finaliza root span
  - eventos/steps apos finalize sao descartados com warning interno opcional (`onInternalAdapterWarning`)

### Mapeamento canonico para tracing OTel (4E.1)

- Prefixo default de atributos: `import.`
- Chaves canonicas estaveis incluem:
  - `import.namespace`
  - `import.run_id`
  - `import.project_id`
  - `import.source_kind`
  - `import.source_label`
  - `import.phase`
  - `import.event_name`
  - `import.code`
  - `import.severity`
  - `import.outcome`
- `summary` consolida contagens/flags/source metadata sanitizada no span raiz
- `step` mapeia status/duracao/erro no child span
- O adapter nao re-sanitiza payloads; ele apenas converte o payload interno sanitizado para attributes OTel (flatten/serializacao compativel com tipos OTel)

### Convencao de status OTel adotada (4E.1)

- Root span:
  - `OK` para `summary.outcome = success | partial`
  - `ERROR` para `summary.outcome = failure`
- Child spans:
  - `OK` para `status = success | partial`
  - `ERROR` para `status = failure`
- `partial` permanece explicitamente representado no tracing via atributo (`import.outcome` / `import.status`) sem forcar `ERROR`

Fora de escopo da 4E.1:

- OTLP exporter
- bootstrap global de `NodeSDK` / runtime OTel
- `MeterProvider` e metricas avancadas
- integracoes Datadog/Tempo/Jaeger

## Fase 4E.2 (runtime/exporter/metricas OpenTelemetry para importing)

- Novo runtime OTel server-side em `src/server/observability` com bootstrap explicito e idempotente:
  - parser de env leniente (`otel-runtime-config.ts`)
  - runtime `NodeSDK` (`otel-runtime.ts`)
  - getter singleton de runtime global server-side (`getOrCreateServerOpenTelemetryRuntime()`)
- Runtime usa componentes reais OTel (Node):
  - `BatchSpanProcessor`
  - exporter OTLP HTTP para traces
  - `PeriodicExportingMetricReader` + exporter OTLP HTTP para metrics (quando habilitado/configurado)
  - `AsyncLocalStorageContextManager`
  - propagator W3C (`TraceContext + Baggage`)
- Bootstrap seguro:
  - `OTEL_ENABLED=false` => runtime desabilitado sem quebrar app/importacao
  - endpoint invalido/ausente => runtime desabilitado com warning controlado
  - falha de exporter/SDK/bootstrap => fallback seguro (sem exception fatal para importacao)

### Wiring no modulo `importing` (4E.2)

- Novo provider de collector em `src/modules/importing/infra/observability/import-telemetry-collector-provider.ts`:
  - reutiliza `ImportTelemetryOtelAdapter` (4E.1)
  - injeta `tracer` + `meter` reais do runtime OTel
  - fallback para `NoopImportTelemetryCollector` (ou collector custom em testes/debug)
- `ImportPrismaSchemaToSnapshotUseCase` recebeu dependencia interna opcional `telemetryCollectorFactory`
  - nao altera contrato publico de input/output
  - apenas injeta `telemetry.collector` no importer de dominio quando disponivel
- `src/server/app/container.ts` faz o wiring explicito:
  - inicializa runtime OTel server-side via bootstrap helper (idempotente)
  - cria provider do collector de importacao
  - injeta a factory no use-case `ImportPrismaSchemaToSnapshotUseCase`

### Configuracao de ambiente (4E.2)

- Feature flags e identidade de servico:
  - `OTEL_ENABLED`
  - `OTEL_METRICS_ENABLED`
  - `OTEL_SERVICE_NAME`
  - `OTEL_SERVICE_VERSION`
  - `OTEL_DEPLOYMENT_ENVIRONMENT`
- OTLP endpoints/headers:
  - `OTEL_EXPORTER_OTLP_ENDPOINT`
  - `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`
  - `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`
  - `OTEL_EXPORTER_OTLP_HEADERS`
  - `OTEL_EXPORTER_OTLP_TRACES_HEADERS`
  - `OTEL_EXPORTER_OTLP_METRICS_HEADERS`
- Sampler e tuning basico:
  - `OTEL_TRACES_SAMPLER`
  - `OTEL_TRACES_SAMPLER_ARG`
  - `OTEL_BSP_*`
  - `OTEL_METRIC_EXPORT_INTERVAL`
  - `OTEL_METRIC_EXPORT_TIMEOUT`
  - `OTEL_EXPORTER_OTLP_TRACES_TIMEOUT`
  - `OTEL_EXPORTER_OTLP_METRICS_TIMEOUT`

Observacao:

- O parser e leniente: valores invalidos viram warnings + fallback.
- Logs/warnings de config nao vazam valores de headers/segredos (somente flags/contagens).
- O bootstrap server-side e memoizado para evitar `start()` repetido no container/entrypoint.

### Metricas do `ImportTelemetryOtelAdapter` (4E.2)

- O adapter 4E.1 foi evoluido para aceitar `meter` opcional e registrar metricas de baixa cardinalidade:
  - `importing.telemetry.runs.started`
  - `importing.telemetry.runs.finalized`
  - `importing.telemetry.adapter.warnings`
  - `importing.telemetry.adapter.late_drops`
  - `importing.telemetry.run.duration` (`ms`)
  - `importing.telemetry.step.duration` (`ms`)
- Sem `importRunId` em metricas (cardinalidade controlada).
- Falhas de meter/instrumentos nao quebram o pipeline; o adapter emite warning interno e segue processando.

Fora de escopo da 4E.2:

- auto-instrumentacao ampla da app (HTTP/Prisma/Next) com instrumentations OTel
- dashboards/SLOs externos
- tuning avancado vendor-specific

Fica para 4E.3+:

- instrumentations adicionais da plataforma/app
- tuning operacional mais avancado (views/temporality/sampling por ambiente)
- integracoes vendor-specific (Datadog/Tempo/Jaeger)

Notas de hardening posteriores (4E.3/4E.4):

- state machine/runtime endurecida para shutdown concorrente + diagnostico `shutdownInFlight`
- provider com memoizacao terminal de `runtime.start()` + reuse de fallback collector
- bootstrap server-side padronizado via helper reutilizavel
- runbook operacional/troubleshooting: `docs/observability/open-telemetry.md`
