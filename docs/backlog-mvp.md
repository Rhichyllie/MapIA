# Backlog MVP (alto nivel)

## Fase 0 - Bootstrap

- [x] Next.js App Router + TypeScript
- [x] Estrutura modular (`domain/application/infrastructure`)
- [x] Prisma schema inicial
- [x] Prisma migration inicial + seed simples
- [x] NextAuth base (credentials dev)
- [x] Proxy/middleware de rotas protegidas
- [x] Dashboard / Wizard / Editor shells
- [x] Docker Compose (Postgres)
- [x] Lint + typecheck + testes basicos

## Fase 1 - Projetos + Wizard persistente

- [x] Criar `Workspace`/`Project` via dashboard
- [x] Wizard com formularios validados por Zod
- [x] Persistencia de rascunho do wizard (`WizardDraft`)
- [x] Persistencia de projeto + grafo inicial
- [x] Editor conectado ao snapshot persistido (CRUD basico + save manual)
- [x] Testes de regras de criacao/geracao/boundary de snapshot (mockados)
- [ ] Testes de integracao com Postgres (proxima iteracao)

## Fase 2 - Editor + modelo canonico persistido

- [ ] CRUD de nodes/edges
- [ ] Inspector com detalhes e validacoes
- [ ] Sync UI <-> modelo canonico
- [ ] Testes de dominio e aplicacao

## Fase 3 - Versionamento (snapshots/diff/restore)

- [ ] Criar snapshot manual/automatico
- [ ] Diff legivel de nodes/edges
- [ ] Restore seguro
- [ ] Audit trail de versoes

## Fase 4 - Importadores iniciais (Postgres/Prisma)

- [ ] Adaptadores de importacao
- [ ] Mapeamento para `ExternalRef`
- [ ] Normalizacao para Node/Edge canonicos
- [ ] Tratamento de erros e observabilidade

## Fase 5 - Exportadores

- [ ] JSON canonico
- [ ] Mermaid / DOT
- [ ] SVG / PNG (server/client strategy)
