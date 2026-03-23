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

- plugin em [next.config.ts](/c:/Projetos/MapIA/next.config.ts)
- configuracao de routing em [routing.ts](/c:/Projetos/MapIA/src/i18n/routing.ts)
- request config em [request.ts](/c:/Projetos/MapIA/src/i18n/request.ts)
- proxy em [proxy.ts](/c:/Projetos/MapIA/proxy.ts)
- wrappers de navegacao em [navigation.ts](/c:/Projetos/MapIA/src/i18n/navigation.ts)
- layouts/paginas locale-aware em [app/[locale]/layout.tsx](/c:/Projetos/MapIA/app/[locale]/layout.tsx) e rotas filhas
- catalogos base em JSON para dominios gerais e catalogos do editor em TS modular sob [messages/editor](/c:/Projetos/MapIA/messages/editor)

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

### Estrategia de catalogo

- `pt-BR` e a base semantica completa.
- `en-US` funciona por override sobre `pt-BR`.
- Quando uma chave nao existe em `en-US`, o app faz fallback para o catalogo base de forma previsivel.
- O editor ganhou catalogo dedicado em TS porque o volume e a estrutura de copy seriam dificeis de manter em um unico JSON grande.

## Consequencias

Positivas:

- Locale negotiation, redirects e navegacao agora preservam locale.
- Copy do app ficou centralizada por namespace.
- Adicionar novos idiomas virou tarefa de catalogo e configuracao, nao de refactor em componentes.
- O editor passou a usar uma fonte unica de mensagens em vez de depender de strings inline como comportamento nominal.

Trade-off:

- `en-US` foi modelado como override incremental sobre `pt-BR`. Isso permite rollout seguro e evita quebra de cobertura enquanto o catalogo evolui.

## Como adicionar um novo idioma

1. Adicionar o locale em [routing.ts](/c:/Projetos/MapIA/src/i18n/routing.ts).
2. Criar o catalogo base em `messages/<locale>.json` para `Common`, `Auth`, `Shell`, `Dashboard`, `Create`.
3. Criar o catalogo do editor em `messages/editor/<locale>-core.ts` e `messages/editor/<locale>-shell.ts` se o idioma precisar de override especifico.
4. Registrar o merge em [messages.ts](/c:/Projetos/MapIA/src/i18n/messages.ts).
5. Validar `loadMessages`, renderizacao e navegacao locale-aware com testes.

## Checklist manual

- Acessar `/login` e confirmar `pt-BR` sem prefixo.
- Acessar `/en-US/login` e confirmar copy em locale alternativo.
- Fazer login em `/en-US/login` e validar redirect para `/en-US/dashboard`.
- Navegar de dashboard para create/editor e confirmar preservacao do locale.
- Acessar `/dashboard`, `/create` e `/editor?projectId=...` no locale base e validar copy via catalogo.
- Abrir o shell protegido e validar labels de navegacao, tema, sign-out e badges.
- Abrir o editor e validar toolbar, inspector, dialogs, estados vazios e feedbacks principais.
- Confirmar que enums, ids tecnicos e payloads persistidos nao mudam com o idioma.
- Confirmar que auth/redirect continuam funcionais com e sem prefixo.
