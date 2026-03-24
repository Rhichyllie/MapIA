# ADR-021: i18n fase 1 com next-intl no App Router

## Status

Aceito

## Contexto

O MapIA precisava sair do estado monolocale em `pt-BR` sem degradar App Router, auth, editor, shell protegido ou tipagem. A base exigia:

- locale padrao `pt-BR`
- primeiro locale adicional `en-US`
- URLs do locale base sem prefixo
- URLs do locale adicional com prefixo
- separacao entre texto de UI e valores canonicos de dominio
- catálogos centralizados, sem copy nova espalhada por componentes

## Decisao

Adotamos `next-intl` como fundacao de internacionalizacao para o App Router, com:

- plugin em `next.config.ts`
- configuracao de routing em `src/i18n/routing.ts`
- request config em `src/i18n/request.ts`
- proxy em `proxy.ts`
- helpers puros do proxy em `src/i18n/proxy-helpers.ts`
- wrappers de navegacao em `src/i18n/navigation.ts`
- layouts e paginas locale-aware em `app/[locale]`
- catalogos oficiais unificados em `messages/pt-BR.json` e `messages/en-US.json`, incluindo o namespace completo do editor

Na Fase 1.1, a excecao anterior do editor foi removida:

- nao existe mais dicionario TS paralelo para mensagens do editor
- `pt-BR` continua sendo a base semantica obrigatoria
- `en-US` agora tem paridade estrutural explicita com `pt-BR`
- fallback de runtime do editor deriva do catalogo oficial base, nao de strings dispersas em arquivos TS

## Racional

### Por que `next-intl`

- Tem suporte maduro para App Router, Server Components e `NextIntlClientProvider`.
- Resolve locale negotiation, metadata, `getTranslations`, `useTranslations` e navigation wrappers no padrao esperado do Next.
- Permite tipagem consistente via `AppConfig` sem forcar migracao do app inteiro para client components.
- Funciona bem com fallback por catalogo, importante para introduzir novos idiomas sem quebrar UX.

### Por que `localePrefix: 'as-needed'`

- Preserva compatibilidade das URLs atuais do locale base.
- Minimiza ruptura em auth, deep-links e navegacao ja existente.
- Mantem `pt-BR` em `/login`, `/dashboard`, `/create`, `/editor`.
- Expande `en-US` em `/en-US/login`, `/en-US/dashboard`, `/en-US/create`, `/en-US/editor`.

### Separacao entre UI e dominio

- Apenas labels, placeholders, toasts, titulos, badges e mensagens de erro entram em catalogo.
- Valores canonicos de dominio continuam inalterados:
  - enums
  - ids
  - chaves tecnicas
  - payloads persistidos
  - contratos de API
- O idioma muda a camada de apresentacao, nao a camada canonica.
- Recipes e personas do editor mantem apenas defaults tecnicos; a copy do quick add vive no catalogo `Editor.shell.quickAdd.copy.*`.
- O create assistant resolve motivos de recomendacao e avisos de normalizacao por codigos canonicos do dominio; o texto final vive no catalogo `Create.labels.*`.
- A validacao estrita do create assistant expõe codigos canonicos de bloqueio/aviso; a mensagem final ao usuario e resolvida pela camada `Create.labels.strictValidationIssues`.
- Respostas de runtime do create assistant expõem apenas codigos canonicos como `sourceStatus.statusCode`; labels e summaries ficam na camada de i18n/apresentacao.
- Preview, precheck e validacoes de schema/refinement do create assistant tambem expõem apenas descritores canonicos (`summaryCode`, `summaryValues`, `details[]`, issue codes); a UI resolve o texto final via `Create.labels.sourcePreview*`, `Create.labels.sourceLifecycleSummary` e `Create.labels.validationIssues`.

### Estrategia de catalogo

- `pt-BR` e a base semantica completa e obrigatoria.
- `en-US` continua sendo carregado por override sobre `pt-BR`, mas com paridade estrutural validada em teste.
- O editor usa apenas o namespace `Editor` dentro dos JSON oficiais.
- Fallback de runtime do editor consulta o catalogo base oficial `pt-BR` quando a mensagem nao e resolvida pelo provider atual.
- Quando uma chave nao existe nem no catalogo base, o app nao quebra a UI, mas a ausencia fica explicita em dev/test com marcador de mensagem faltante.

### Fallback e quality gates

- Runtime:
  - `next-intl` continua seguro para nao quebrar a UI.
  - o fallback global da aplicacao fica centralizado em `src/i18n/request.ts` e `src/i18n/error-handling.ts`
  - o editor faz fallback para a mensagem oficial base em `pt-BR` via `src/components/editor/editor-i18n.ts`
  - chaves realmente ausentes aparecem de forma explicita em dev/test
- Teste e CI:
  - existe validacao automatica de paridade estrutural entre catalogos
  - chaves faltantes, extras e type mismatches falham a suite
  - namespaces esperados (`Metadata`, `Common`, `Auth`, `Shell`, `Dashboard`, `Create`, `Editor`) sao obrigatorios
  - paths obrigatorios do create assistant (`Create.defaults.hierarchyRootName`, `Create.labels.strictValidationIssues`, `Create.labels.sourceStatusSummary`, `Create.labels.sourcePreviewSummary`, `Create.labels.sourcePreviewDetails`, `Create.labels.sourceLifecycleSummary`, `Create.labels.validationIssues`) precisam existir em todos os idiomas
  - paths obrigatorios do editor (`Editor.shell`, `Editor.presentation`, `Editor.process.*`, `Editor.graph`, `Editor.renderers`) precisam existir em todos os idiomas
  - existe uma suite de convergencia que falha se `src/i18n/messages.ts` voltar a depender de catalogo paralelo, se o proxy voltar a ter branch por locale especifico ou se quick add do editor voltar a puxar copy de personas/recipes

### Proxy generico

- o `proxy.ts` nao tem mais logica especial para `en-US`
- a resolucao de locale deriva de `src/i18n/routing.ts`
- redirects para login preservam:
  - locale base sem prefixo
  - locale alternativo com prefixo
  - `callbackUrl` original
- a adicao de um novo idioma nao exige `if` novo no proxy

### UX visivel e preferencia

- o locale agora tambem pode ser trocado pela interface via `LocaleSwitcher`, exposto no login e no top bar do shell protegido, cobrindo dashboard, create assistant e editor sem duplicar controles.
- a preferencia do usuario e persistida pelo cookie oficial `NEXT_LOCALE`, configurado centralmente em `src/i18n/routing.ts`.
- a troca de idioma preserva a rota atual e os query params; no login, `callbackUrl` interno e relocalizado para o idioma escolhido para evitar saltos inconsistentes apos autenticar.
- metadata principal agora e resolvida por locale no proprio segmento `app/[locale]`, com titulos e descricoes dedicados para login, dashboard, create e editor.
- para adicionar um novo idioma na UX, basta incluir o locale em `routing.ts`, completar o catalogo oficial e deixar o switcher reutilizar `routing.locales`; o componente nao depende mais de aliases visuais fixos como `ptBR` ou `enUS`.

### Fonte oficial unica

- A unica fonte oficial de mensagens sao os JSONs em `messages/`.
- Helpers TS de i18n existem apenas para carregar, compor fallback e consumir o catalogo oficial.
- Nao existe dicionario paralelo do editor, nem camada legada de compatibilidade.
- O dominio nao carrega mais texto oficial para quick add do editor, motivos de recomendacao do create assistant ou avisos de layout; ele expõe apenas codigos e defaults tecnicos.
- O pipeline de preview/precheck/configuracao de fonte do create assistant nao devolve mais copy oficial pronta; ele devolve apenas codigos canonicos e metadados estruturados, com compatibilidade de leitura para drafts legados.
- `legacy_runtime_text` ficou restrito ao boundary de compatibilidade de leitura: drafts/settings legados ainda sao aceitos, mas o runtime novo nao volta a emitir `summary`/`details` textuais nem `legacy_runtime_text` em respostas canonicas.

## Consequencias

Positivas:

- Locale negotiation, redirects e navegacao agora preservam locale.
- Copy do app ficou centralizada por namespace.
- Adicionar novos idiomas virou tarefa de catalogo e configuracao, nao de refactor em componentes.
- O editor passou a usar um catalogo oficial unico em JSON, sem camada paralela de mensagens.
- Divergencia estrutural entre catalogos virou falha de teste, nao debt silenciosa.
- Metadata e copy principal das rotas mais visiveis agora acompanham o locale ativo e usam a mesma fonte oficial de mensagens.

Trade-off:

- `en-US` foi modelado como override incremental sobre `pt-BR`. Isso permite rollout seguro e evita quebra de cobertura enquanto o catalogo evolui.

## Como adicionar um novo idioma

1. Adicionar o locale em `src/i18n/routing.ts`.
2. Criar o catalogo oficial em `messages/<locale>.json`, incluindo todos os namespaces esperados, especialmente `Editor`.
3. Se o locale nao for o default, manter a mesma estrutura de chaves de `pt-BR`.
4. Garantir que `src/i18n/catalog-integrity.test.ts` continue passando, inclusive os paths obrigatorios do editor.
5. Validar `loadMessages`, renderizacao e navegacao locale-aware com testes.
6. Nao criar branch especial no `proxy.ts`; a resolucao deve continuar derivando apenas da config central de locale.

## Boundary final desta trilha

- A copy oficial de UI e metadata vive apenas nos catalogos em `messages/`.
- A UI resolve texto visivel, metadata, labels de switcher e feedbacks a partir do catalogo oficial.
- O dominio pode manter apenas valores tecnicos, ids, enums, payloads canonicos e codigos semanticos.
- A preferencia de idioma e persistida pelo cookie `NEXT_LOCALE`.
- O locale padrao continua sem prefixo; locais adicionais continuam com prefixo.
- A trilha de i18n desta fase pode ser considerada fechada enquanto esses contratos continuarem protegidos pelos testes de catalogo, metadata, convergencia e superfícies visiveis.

## Fora do escopo desta trilha

- adicionar um terceiro idioma
- redesenhar o switcher ou o shell protegido
- refatorar amplamente o editor shell
- revisar o design system de forma geral
- reabrir contratos de dominio fora do i18n
- transformar problemas de infraestrutura local de E2E em trabalho de i18n

## Checklist manual

- Acessar `/login` e confirmar `pt-BR` sem prefixo.
- Acessar `/en-US/login` e confirmar copy em locale alternativo.
- Fazer login em `/en-US/login` e validar redirect para `/en-US/dashboard`.
- Navegar de dashboard para create/editor e confirmar preservacao do locale.
- Acessar `/dashboard`, `/create` e `/editor?projectId=...` no locale base e validar copy via catalogo.
- Abrir o shell protegido e validar labels de navegacao, tema, sign-out e badges.
- Abrir o editor e validar toolbar, inspector, dialogs, estados vazios e feedbacks principais em `pt-BR` e `en-US`.
- Confirmar que enums, ids tecnicos e payloads persistidos nao mudam com o idioma.
- Confirmar que auth/redirect continuam funcionais com e sem prefixo.
