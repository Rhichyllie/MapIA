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

- [x] CRUD de nodes/edges
- [x] Inspector com detalhes e validacoes
- [x] Sync UI <-> modelo canonico (commands/queries + autosave)
- [x] Fase 2C: hardening + limpeza tecnica (EditorShell/save flow + boundary nullable de projetos)
- [x] Fase 2D: polimento final de UX/visual (mensagens amigaveis do inspector + contraste/refinos visuais)
- [x] Testes de dominio e aplicacao (backend) + helpers/services (frontend)
- [x] E2E do fluxo completo do editor (concluido na Fase 3A com Playwright)

## Fase 3 - Versionamento (snapshots/diff/restore)

- [ ] Criar snapshot manual/automatico
- [ ] Diff legivel de nodes/edges
- [ ] Restore seguro
- [ ] Audit trail de versoes
- [ ] Migrar snapshot de trabalho v1 mutavel para versionamento real (sem concessao da Fase 1)
- [ ] Sincronizacao materializada em tabelas `Node`/`Edge` (alem do snapshot JSON)
- [x] Fase 3A: E2E do fluxo Dashboard -> Wizard -> Editor (autosave/manual save/erros)
- [x] Fase 3A.1: hardening de ambiente E2E/monorepo (Turbopack root + Playwright webServer)
- [x] Fase 3A.2: refino da suite E2E (anti-flake + ergonomia de execucao + docs)
- [x] Fase 3B: versionamento real de snapshots (working snapshot + versoes imutaveis + API + UI minima + ADR/docs)
- [x] Fase 3C: diff + restore de versoes (working snapshot, backend-first, UI minima + ADR/docs)

## Fase 4 - Importadores iniciais (Postgres/Prisma)

- [x] Fase 4A: Importador inicial de Prisma Schema (.prisma) para snapshot do editor (models/relations/layout simples + API/UI minima)
- [x] Fase 4A.DX: hardening de ambiente dev/E2E para DB offline (preflight `db:check:wait` + docs operacionais)
- [x] Fase 4B.0: contratos de portas de introspeccao (Prisma file / Postgres live) para reutilizar parser/mapper da 4A
- [x] Fase 4B.1: adaptador `PrismaSchemaFileImportSourcePort` (arquivo `.prisma` real -> texto)
- [x] Fase 4B.2: adaptador `PostgresImportIntrospectionPort` (DB live -> schema Prisma texto, sem acoplar UI)
- [x] Fase 4B.3: orquestracao backend unificada de importacoes reais (Prisma file + Postgres) com contratos consistentes e testes de rota
- [x] Fase 4C.1: mapeamento deterministico para `ExternalRef` (nodes/edges importados)
- [x] Fase 4C.2: helpers/guards de `ExternalRef` + hardening de consumo/utilidade interna
- [x] Fase 4C.3: normalizacao canonica de snapshot importado + hardening (idempotencia/imutabilidade/revalidacao pos-normalizacao)
- [x] Fase 4D: observabilidade/telemetria estruturada do pipeline de importacao (collector port + noop/buffered + eventos/steps/summary OTel-ready, sem vendor)
- [x] Fase 4D.1: hardening da telemetria interna OTel-ready (codes centralizados, `sourceKind`/`code` tipados, limites de sanitizacao, finalize/failure hardening)
- [x] Fase 4D.2: governanca do contrato de telemetria (eventName/stepName centralizados + tipados, catalogo de eventos, testes anti-drift)
- [x] Fase 4E.1: foundation do adapter OpenTelemetry (`ImportTelemetryOtelAdapter`) com tracing/lifecycle/mapeamento de contrato interno
- [ ] Fase 4E (macro): observabilidade externa (4E.1 foundation + 4E.2+ runtime/exporter/metricas)
- [x] Fase 4E.2: runtime/exporter/metricas OpenTelemetry (bootstrap Node, OTLP traces, MeterProvider, wiring seguro + testes)
- [x] Fase 4E.3: hardening de state machine/concurrency do runtime OTel + memoizacao/reuse do provider de telemetry
- [x] Fase 4E.4: hardening operacional de bootstrap/lifecycle/provider OTel + padronizacao de diagnosticos/docs
- [x] Fase 4E.5: instrumentacao HTTP server-side + tuning guidance operacional + naming/troubleshooting docs
- [x] Fase 4E.6: SLIs/SLOs iniciais + dashboards/alertas/runbook operacional vendor-agnostic + cleanup definitivo de docs
- [x] Fase 4E.7: calibracao operacional provisoria (baseline versionada + gates de volume) para SLOs/thresholds
- [x] Fase 4E.7: instrumentacao Prisma server-side (spans + metricas OTel, baixa cardinalidade, sem SQL/args)
- [x] Fase 4E.7: audit de instrumentacao Next runtime (sem mudanca necessaria nesta fase, com justificativa/ADR)
- [x] Fase 4E.7: tuning avancado OTel (metric views para latencia + guardrails por config)
- [x] Fase 4E.7: dashboards/alerting as code versionados (`infra/observability/*`) com apply dependente de ambiente
- [ ] Fase 4E.8: recalibracao com baseline real de staging/prod + thresholds finais por sinal (bloqueado por ausencia de series 7d/30d no workspace)
- [x] Fase 4E.8: ajuste fino de alertas (gates/janelas/severidade/Prisma/runtime/spanmetrics) + compatibilidade de naming por profile
- [x] Fase 4E.8: automacao de apply/dry-run/validacao (datasources/UIDs/rules pipeline) para observability as code
- [ ] Fase 4E.8: validar apply real em ambiente alvo + smoke remoto (Grafana/Prometheus/Loki) (replanejado/absorvido pela 4E.9/4E.10 com tooling pronto)
- [x] Fase 4E.9: pipeline de coleta/ingestao de evidencias agregadas (15m/7d/30d) + promocao automatizada de baseline/naming
- [x] Fase 4E.9: fortalecer smoke pos-apply remoto (Grafana/Prometheus/Loki + naming/profile + queries por familia de sinais + relatorio)
- [ ] Fase 4E.9: executar coleta real em staging/prod + promover baseline real (thresholds finais por sinal) (bloqueado por endpoints/credenciais ausentes no workspace)
- [ ] Fase 4E.9: validar/registrar naming final backend/collector observado em staging/prod e consolidar profile padrao (bloqueado por evidencia real ausente)
- [ ] Fase 4E.9: executar apply real do bundle + smoke remoto registrado no ambiente alvo (bloqueado por acesso ao ambiente)
- [x] Fase 4E.10: readiness/gating de finalizacao infra-only compativel com 4E.9 parcial (`finalization-readiness.4e10.yaml` + script gerador + validacao), com dependencia explicita `pending_4e9r_real_evidence`
- [ ] Fase 4E.10: promover thresholds finais por sinal/ambiente a partir de evidencias reais coletadas na 4E.9 (`pending_4e9r_real_evidence`)
- [ ] Fase 4E.10: consolidar profile default final de naming e remover perfis obsoletos (se aplicavel) (`pending_4e9r_real_evidence`)
- [ ] Fase 4E.10: reavaliar instrumentacoes adicionais de Next runtime conforme baseline/ruido/custo real (`pending_4e9r_real_evidence`)

## Fase 5 - Exportadores

- [ ] JSON canonico
- [ ] Mermaid / DOT
- [ ] SVG / PNG (server/client strategy)
