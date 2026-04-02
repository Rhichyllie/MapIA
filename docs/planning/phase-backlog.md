# Backlog inicial por fase futura

## Como ler

Este backlog foi montado a partir do estado atual do codigo. Nao e roadmap de marketing nem lista de desejos. Cada item tenta responder a uma necessidade tecnica observavel no repositorio hoje.

Legenda curta:

- risco: chance de regressao ou custo operacional se o item continuar como esta;
- impacto: ganho tecnico/produto ao tratar o item;
- urgencia: `imediata`, `curta`, `media`;
- fase recomendada: sugestao de sequencia, nao compromisso de entrega.

## Prioridades mais proximas

| ID      | Item                                                                               | Risco | Impacto | Area                  | Urgencia | Fase recomendada                 |
| ------- | ---------------------------------------------------------------------------------- | ----- | ------- | --------------------- | -------- | -------------------------------- |
| PLAT-02 | Fechar baseline vermelha atual e registrar dono/remocao para os fails de lint/test | alto  | alto    | plataforma/testes     | imediata | Fase 1 - hardening baseline      |
| SEM-01  | Corrigir drift de semantica antes de ampliar regras ou UX semantica                | alto  | alto    | semantica/editor      | imediata | Fase 1 - hardening baseline      |
| IMP-01  | Travar contrato do importador Prisma/Postgres com testes de shape e provenance     | alto  | alto    | importadores          | imediata | Fase 1 - contratos de integracao |
| DOM-01  | Consolidar fonte de verdade de diagrama (`template` x `diagramType` x aliases)     | alto  | alto    | dominio/editor/create | curta    | Fase 2 - consolidacao de dominio |
| EDT-01  | Quebrar o `EditorShell` em modulos testaveis                                       | alto  | alto    | editor                | curta    | Fase 3 - modularizacao do editor |

## Status apos Fase 1A

- `PLAT-02` concluido em `2026-03-31`: `pnpm lint`, `pnpm test`, `pnpm typecheck` e `pnpm build` fecharam verdes.
- `SEM-01` concluido em `2026-03-31`: a auditoria semantica de ERD voltou a sinalizar nodes e edges fora do perfil, e os testes foram alinhados ao contrato vigente.
- `IMP-01` concluido em `2026-03-31`: o contrato do importador Prisma/Postgres ficou travado por testes de shape de campos, flags, `references` e provenance relacional.
- `PLAT-03` concluido em `2026-04-02`: a baseline minima foi consolidada em `pnpm validate` e automatizada na CI com `.github/workflows/baseline.yml`.
- `PLAT-04` parcialmente concluido em `2026-04-02`: rotas criticas centrais ganharam coverage dedicada, mas ainda faltam aliases e algumas rotas secundarias.
- `PLAT-04` avancou novamente em `2026-04-02`: `semantic/policy` e `semantic/validate` agora tambem tem route tests dedicados, reduzindo dependencia de E2E para validar auth, ownership e envelope.
- `OBS-02` avancou em `2026-04-02`: as rotas internas de observabilidade passaram a usar o mesmo comportamento de sessao backend, `forbidden` padronizado e tratamento de erro das demais APIs protegidas.
- Fase `1B` de hardening de plataforma em `2026-04-02`: auth/session backend, ownership por projeto, headers conservadores, auditoria minima e runbook de env/migration ficaram mais centralizados e reutilizaveis.
- Proximos candidatos naturais apos esta fase: `DOM-01`, `OBS-01`, fechamento do restante de `PLAT-04` e expansao seletiva de route tests.

## Plataforma e seguranca

| ID      | Item                                                                                                | Risco | Impacto | Dependencias                                   | Area afetada                    | Urgencia | Fase recomendada                 |
| ------- | --------------------------------------------------------------------------------------------------- | ----- | ------- | ---------------------------------------------- | ------------------------------- | -------- | -------------------------------- |
| PLAT-01 | Substituir o login dev-only por estrategia de auth de producao com papeis explicitos                | alto  | alto    | decisao de provedor, segredos, modelo de papel | auth, pages protegidas, APIs    | curta    | Fase 2 - plataforma segura       |
| PLAT-02 | Fechar baseline vermelha atual e registrar oficialmente a excecao enquanto ela existir              | alto  | alto    | reproduzir e classificar os fails atuais       | lint, vitest, engenharia        | imediata | Fase 1 - hardening baseline      |
| PLAT-03 | Colocar gates automatizados de CI para `lint`, `typecheck`, `test`, `build` e smoke E2E selecionado | medio | alto    | baseline minimamente verde, pipeline CI        | repositorio inteiro             | curta    | Fase 2 - automacao de guardrails |
| PLAT-04 | Expandir route tests para rotas criticas ainda sem cobertura dedicada                               | medio | alto    | inventario de APIs e fixtures reutilizaveis    | API, editor, creation assistant | curta    | Fase 2 - contratos de API        |

## Dominio e modelagem

| ID     | Item                                                                                                                                             | Risco | Impacto | Dependencias                                        | Area afetada                         | Urgencia | Fase recomendada                  |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----- | ------- | --------------------------------------------------- | ------------------------------------ | -------- | --------------------------------- |
| DOM-01 | Consolidar a fonte de verdade de selecao de diagrama e reduzir sobreposicao entre `Project.template`, `snapshot.diagramType` e aliases do editor | alto  | alto    | mapear consumidores atuais e definir migracao       | create, editor, renderers, telemetry | curta    | Fase 2 - consolidacao de dominio  |
| DOM-02 | Revisar o uso de `GraphVersion` v1 como working snapshot operacional e deixar o contrato de armazenamento menos ambiguo                          | medio | alto    | entendimento de restore/versionamento atual         | graph, versioning, prisma            | media    | Fase 3 - evolucao de persistencia |
| DOM-03 | Reduzir o tamanho e a mistura de responsabilidades em `creation-assistant.ts` sem mudar contrato externo                                         | medio | medio   | separar validacao, recipe runtime e compatibilidade | creation assistant                   | media    | Fase 3 - modularizacao de dominio |

## Semantica

| ID     | Item                                                                                             | Risco | Impacto | Dependencias                                     | Area afetada                       | Urgencia | Fase recomendada               |
| ------ | ------------------------------------------------------------------------------------------------ | ----- | ------- | ------------------------------------------------ | ---------------------------------- | -------- | ------------------------------ |
| SEM-01 | Corrigir os fails atuais de semantica e revalidar a matriz de comportamento por modo de diagrama | alto  | alto    | reproduzir testes falhos, alinhar regra esperada | editor, semantic engine, restore   | imediata | Fase 1 - hardening baseline    |
| SEM-02 | Formalizar a matriz de regras semanticas por modo em contrato documentado e testado              | alto  | alto    | estabilizar SEM-01                               | semantic engine, editor, auditoria | curta    | Fase 2 - contratos semanticos  |
| SEM-03 | Reduzir acoplamento entre save do editor, politica semantica e log de eventos                    | medio | medio   | mapear pontos de acoplamento atuais              | editor backend, semantics          | media    | Fase 3 - modularizacao backend |

## Editor e UX

| ID     | Item                                                                                                     | Risco | Impacto | Dependencias                                             | Area afetada            | Urgencia | Fase recomendada                 |
| ------ | -------------------------------------------------------------------------------------------------------- | ----- | ------- | -------------------------------------------------------- | ----------------------- | -------- | -------------------------------- |
| EDT-01 | Dividir `src/components/editor/editor-shell.tsx` em modulos menores com fronteiras claras                | alto  | alto    | inventario de responsabilidades e contratos de subfluxos | editor frontend         | curta    | Fase 3 - modularizacao do editor |
| EDT-02 | Travar melhor o protocolo de conflito de revisao, autosave e save manual entre cliente e servidor        | medio | alto    | route tests e smoke E2E adicionais                       | editor frontend/backend | curta    | Fase 2 - robustez operacional    |
| EDT-03 | Diminuir contratos implicitos entre `data-testid`, renderers e E2E para reduzir risco de refactor visual | medio | medio   | catalogo de seletores criticos                           | editor, testes E2E      | media    | Fase 3 - testabilidade           |

## Design system e UI

| ID    | Item                                                                                                     | Risco | Impacto | Dependencias                            | Area afetada     | Urgencia | Fase recomendada               |
| ----- | -------------------------------------------------------------------------------------------------------- | ----- | ------- | --------------------------------------- | ---------------- | -------- | ------------------------------ |
| UI-01 | Consolidar componentes e estilos compartilhados entre dashboard, create e editor para reduzir duplicacao | baixo | medio   | estabilizar contratos funcionais atuais | UI compartilhada | media    | Fase 4 - consolidacao visual   |
| UI-02 | Extrair adaptadores de inspector e modos de diagrama em camadas mais previsiveis                         | medio | medio   | EDT-01 em andamento                     | editor UI        | media    | Fase 4 - design system tecnico |

## Integracoes e importadores

| ID     | Item                                                                                                                        | Risco | Impacto | Dependencias                                      | Area afetada                 | Urgencia | Fase recomendada                     |
| ------ | --------------------------------------------------------------------------------------------------------------------------- | ----- | ------- | ------------------------------------------------- | ---------------------------- | -------- | ------------------------------------ |
| IMP-01 | Corrigir o drift atual do importador e formalizar o shape de `node.data.fields`, `flags` e provenance                       | alto  | alto    | reproduzir testes falhos e definir shape canonico | importing, editor, snapshots | imediata | Fase 1 - contratos de integracao     |
| IMP-02 | Aumentar cobertura de testes para `imports/prisma-schema`, `imports/prisma-file`, `imports/postgres` e `erd/export-preview` | medio | alto    | fixtures reutilizaveis e baseline estavel         | APIs de importacao e ERD     | curta    | Fase 2 - contratos de API            |
| IMP-03 | Separar parser, mapper, normalizacao e telemetria no importador Prisma para reduzir custo de manutencao                     | medio | medio   | IMP-01 estabilizado                               | importing domain             | media    | Fase 3 - modularizacao de importacao |

## Observabilidade

| ID     | Item                                                                                                   | Risco | Impacto | Dependencias                         | Area afetada                  | Urgencia | Fase recomendada                     |
| ------ | ------------------------------------------------------------------------------------------------------ | ----- | ------- | ------------------------------------ | ----------------------------- | -------- | ------------------------------------ |
| OBS-01 | Diminuir o acoplamento em `creation-assistant-transition-telemetry.ts` e reforcar testes por fronteira | medio | alto    | mapear subresponsabilidades atuais   | observabilidade, create flow  | curta    | Fase 3 - modularizacao observability |
| OBS-02 | Endurecer governanca dos endpoints internos de observabilidade alem de allowlist/dev bypass            | alto  | medio   | estrategia de auth/roles de PLAT-01  | auth, observabilidade interna | curta    | Fase 2 - seguranca operacional       |
| OBS-03 | Definir checks operacionais simples para runtime OTel e collectors usados no container                 | medio | medio   | inventario dos modos de falha atuais | observabilidade server-side   | media    | Fase 4 - operacao monitoravel        |

## Enterprise readiness

| ID     | Item                                                                                                            | Risco | Impacto | Dependencias                               | Area afetada                     | Urgencia | Fase recomendada                    |
| ------ | --------------------------------------------------------------------------------------------------------------- | ----- | ------- | ------------------------------------------ | -------------------------------- | -------- | ----------------------------------- |
| ENT-01 | Sair do modelo de ownership por email unico e introduzir autorizacao real por membros/papeis                    | alto  | alto    | PLAT-01, revisao de modelo de workspace    | workspaces, projects, APIs       | media    | Fase 4 - autorizacao enterprise     |
| ENT-02 | Definir plano de retirada para aliases legados (`/wizard`, `creation-settings*`, `wizard-*`) com medicao de uso | medio | alto    | telemetria de uso e inventario de clientes | create flow, APIs, docs          | curta    | Fase 2 - limpeza de compatibilidade |
| ENT-03 | Criar catalogo operacional de APIs publicas/compatibilidade para reduzir risco de mudanca silenciosa            | medio | medio   | route inventory e contract docs            | engenharia, integracoes internas | media    | Fase 3 - governanca de API          |

## Itens que nao entram antes de estabilizar a base

- Nova feature grande de editor ou semantica antes de consolidar `PLAT-03`, `PLAT-04` e `DOM-01`.
- Retirada de aliases legados sem evidencias de uso e sem janela de migracao.
- Refactor estrutural profundo em editor ou importacao sem travar antes os contratos hoje implicitos.
