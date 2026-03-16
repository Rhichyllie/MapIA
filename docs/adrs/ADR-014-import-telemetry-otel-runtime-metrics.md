# ADR-014: Fase 4E.2 - Runtime OpenTelemetry (bootstrap/exporter/metrics) para importing

- Status: Aceito
- Data: 2026-02-24

## Contexto

A Fase 4E.1 entregou a bridge desacoplada entre o contrato interno de telemetria (`ImportTelemetryEvent`, `ImportTelemetryStep`, `ImportTelemetrySummary`) e tracing OTel:

- `ImportTelemetryOtelAdapter` em `importing/infra/observability`
- strategy de lifecycle por `importRunId`
- mapeamento canonico de spans/events/attrs
- testes fortes com tracer fake

Faltava a infraestrutura de runtime OTel para uso real em ambiente Node (server-side), com:

- bootstrap de SDK/providers
- exporter OTLP configuravel por env
- `MeterProvider` + metricas basicas do adapter/pipeline
- wiring limpo no `container` sem contaminar o dominio
- degradacao segura quando OTel estiver desligado/mal configurado

## Decisao

Foi adotada uma infraestrutura de runtime OTel server-side em `src/server/observability` + wiring explicito no `container`:

- `src/server/observability/otel-runtime-config.ts`
  - parser leniente de env (defaults + warnings, sem derrubar a app por env invalido)
- `src/server/observability/otel-runtime.ts`
  - runtime idempotente para bootstrap/shutdown
  - `NodeSDK` com:
    - `BatchSpanProcessor`
    - exporter OTLP de traces (HTTP)
    - `PeriodicExportingMetricReader`
    - exporter OTLP de metrics (HTTP) quando habilitado/configurado
    - `AsyncLocalStorageContextManager`
    - propagator composto W3C Trace Context + Baggage
- `src/modules/importing/infra/observability/import-telemetry-collector-provider.ts`
  - provider que reutiliza `ImportTelemetryOtelAdapter` (4E.1)
  - injeta `tracer` + `meter` reais do runtime
  - fallback para `NoopImportTelemetryCollector` (ou collector custom em testes/debug)

O dominio de `importing` permanece desacoplado do SDK OTel.

## Wiring no importing (4E.2)

- `ImportPrismaSchemaToSnapshotUseCase` ganhou dependencia **interna opcional** `telemetryCollectorFactory`
- quando fornecida, o use-case passa `telemetry.collector` para o importer de dominio
- sem alterar contrato publico de input/output das rotas/use-cases
- `src/server/app/container.ts` faz o wiring:
  - obtém runtime OTel server-side
  - executa bootstrap explicito (`start()`, idempotente)
  - cria provider de collector do importing
  - injeta `telemetryCollectorFactory` no use-case `ImportPrismaSchemaToSnapshotUseCase`

## Configuracao por ambiente (4E.2)

Variaveis suportadas (parser leniente, com defaults/warnings):

- `OTEL_ENABLED`
- `OTEL_METRICS_ENABLED`
- `OTEL_SERVICE_NAME`
- `OTEL_SERVICE_VERSION`
- `OTEL_DEPLOYMENT_ENVIRONMENT`
- `OTEL_EXPORTER_OTLP_ENDPOINT`
- `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`
- `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`
- `OTEL_EXPORTER_OTLP_HEADERS`
- `OTEL_EXPORTER_OTLP_TRACES_HEADERS`
- `OTEL_EXPORTER_OTLP_METRICS_HEADERS`
- `OTEL_TRACES_SAMPLER`
- `OTEL_TRACES_SAMPLER_ARG`
- `OTEL_EXPORTER_OTLP_TRACES_TIMEOUT`
- `OTEL_EXPORTER_OTLP_METRICS_TIMEOUT`
- `OTEL_BSP_*` (tuning basico de batch span processor)
- `OTEL_METRIC_EXPORT_INTERVAL`
- `OTEL_METRIC_EXPORT_TIMEOUT`

Regras operacionais adotadas:

- env invalido gera warning e fallback (nao exception fatal)
- `OTEL_ENABLED=true` sem endpoint valido desabilita bootstrap de forma segura
- snapshots de config para log/warning nao incluem valores de headers (somente contagens/flags)

## Metricas adicionadas no adapter (4E.2)

O `ImportTelemetryOtelAdapter` (4E.1) foi evoluido para aceitar `meter` opcional e registrar metricas de baixa cardinalidade:

- `importing.telemetry.runs.started` (counter)
- `importing.telemetry.runs.finalized` (counter, atributo `importing.outcome`)
- `importing.telemetry.adapter.warnings` (counter, atributo `importing.warning_code`)
- `importing.telemetry.adapter.late_drops` (counter, atributo `importing.drop_kind`)
- `importing.telemetry.run.duration` (histogram, unidade `ms`)
- `importing.telemetry.step.duration` (histogram, unidade `ms`)

Controles de cardinalidade:

- sem `importRunId` em metricas
- atributos limitados a enums/labels de baixa cardinalidade (`source_kind`, `phase`, `status`, `outcome`, `warning_code`, `drop_kind`, `step_name`)

## Hardening operacional (4E.2)

- bootstrap idempotente (`start()` repetido nao reinicializa SDK)
- shutdown idempotente (`shutdown()` repetido nao duplica trabalho)
- hooks de shutdown de processo registrados uma vez (quando runtime global e usado fora de `test`)
- falha de exporter/SDK/bootstrap nao derruba a importacao; runtime entra em estado `failed` e provider usa fallback
- falha de meter/instrumentos no adapter nao derruba pipeline; vira warning interno `METRICS_OPERATION_FAILED`
- callbacks de warning (runtime e adapter) continuam isolados por `try/catch`

## Complementos de hardening (4E.3 / 4E.6)

Evolucoes posteriores mantiveram esta decisao e endureceram a operacao:

- 4E.3:
  - state machine do runtime com `shutdown()` concorrente/idempotente mais previsivel
  - diagnostico adicional `shutdownInFlight` no `debugSnapshot()` do runtime
  - provider do importing com memoizacao terminal de `runtime.start()` + reuse de fallback collector
  - `debugSnapshot()` do provider com `collectorKind` e flags de memoizacao
- 4E.4:
  - bootstrap server-side padronizado via helper `ensureServerOpenTelemetryRuntimeStarted()`
  - memoizacao do bootstrap no entrypoint/container para evitar `start()` repetido
  - regra de memoizacao de `OpenTelemetryRuntimeStartResult` consolidada em helper reutilizavel
  - documentacao operacional/troubleshooting em `docs/observability/open-telemetry.md`
- 4E.5:
  - instrumentacao HTTP server-side opcional no runtime (`@opentelemetry/instrumentation-http`)
  - falha de instrumentacao nao derruba bootstrap (warning `INSTRUMENTATION_INIT_FAILED` + degradacao segura)
  - parser/config passa a expor flag de instrumentacao (`OTEL_INSTRUMENTATION_HTTP_ENABLED`) em snapshot seguro
  - guidance de tuning por ambiente (dev/staging/prod) e convencoes de naming documentadas no runbook
- 4E.6:
  - operacionalizacao vendor-agnostic da telemetria (SLIs/SLOs, dashboards minimos, alertas e incidentes)
  - runbook expandido em `docs/observability/open-telemetry.md` com triagem e recuperacao
  - sem alterar contrato publico / dominio; foco em consumo operacional dos sinais ja existentes

Regras mantidas:

- sem vazamento de headers/tokens em warnings/snapshots
- sem exception fatal por falha de OTel no bootstrap do servidor
- sem acoplamento do dominio/importing ao SDK OTel
- sem `importRunId` em metricas (cardinalidade controlada)

## Decisoes operacionais adicionais (4E.5)

- Instrumentacao adotada nesta fase:
  - HTTP server-side (entrada/saida) via runtime OTel
- Instrumentacoes nao adotadas nesta fase:
  - Prisma/DB auto-instrumentation
  - instrumentacoes amplas de framework/runtime (Next.js) com maior risco de ruido/cardinalidade

Racional:

- maximizar utilidade operacional com baixo risco
- manter rollout simples e reversivel
- preservar diagnosticos seguros (sem captura de headers/segredos em snapshots/warnings)

## Operacionalizacao vendor-agnostic (4E.6)

- SLIs/SLOs iniciais foram definidos de forma vendor-agnostic usando:
  - metricas `importing.telemetry.*`
  - spans (importing + HTTP) quando o backend suporta analytics/span metrics
  - warnings/logs/snapshots para saude do runtime OTel
- Desenho operacional desta fase (SLOs, dashboards, alertas e runbook de incidentes) foi consolidado em:
  - `docs/observability/open-telemetry.md`
- Nao foi adicionada metrica propria do runtime nesta fase.
  - Limitacao documentada: saude do runtime ainda e observada principalmente por warnings (`BOOTSTRAP_FAILED`, `SHUTDOWN_FAILED`, `INSTRUMENTATION_INIT_FAILED`)
- Dashboards e alertas foram documentados como desenho operacional (nao provisionados em vendor especifico nesta fase).

### 4E.6-final (fechamento documental operacional)

- A documentacao operacional foi consolidada com formato padronizado para:
  - matriz de SLIs/SLOs vendor-agnostic (importing + runtime health indireto + HTTP quando suportado)
  - dashboards minimos (`Dashboard 1/2/3/4`) com estrutura fixa (objetivo, paineis, filtros, queries, sinais de atencao, cuidados)
  - alertas recomendados com naming consistente e runbook-driven
  - runbook de incidentes com checklist de triagem/correcao/encerramento
- Limitacao mantida (explicitamente documentada):
  - saude do runtime OTel continua indireta (warnings/logs/snapshot), sem metrica propria dedicada nesta fase
- Cleanup documental desta rodada:
  - remocao de duplicacoes de headings/blocos de alertas/queries redundantes
  - alinhamento de nomenclatura entre 4E.5 / 4E.6 / 4E.7+
- Proximos passos (na epoca do fechamento da 4E.6-final) foram planejados para 4E.7+:
  - calibracao de thresholds/SLOs com baseline real
  - instrumentacoes adicionais (Prisma/Next e outras)
  - integracoes vendor-specific
  - dashboards as code e alerting gerenciado

### 4E.7 (calibracao realista + instrumentacoes adicionais + operacionalizacao gerenciada)

- Calibracao/SLOs:
  - como ainda nao ha baseline historico confiavel no ambiente atual, foi adotada baseline operacional provisoria versionada no repo
  - thresholds e gates de volume minimo ficaram em artefato operacional (`infra/observability/calibration/*`), nao no dominio/app
- Instrumentacao Prisma:
  - adotada instrumentacao manual via middleware do `PrismaClient` em camada de observabilidade (`src/server/observability`)
  - spans + metricas de baixa cardinalidade por `prisma.action` / `prisma.model` / `prisma.outcome`
  - sem captura de args, payloads ou SQL bruto (seguranca/cardinalidade)
  - disable por env (`OTEL_INSTRUMENTATION_PRISMA_ENABLED`)
- Instrumentacao Next runtime:
  - auditada nesta fase; sem adicao de auto-instrumentacao ampla
  - racional: cobertura HTTP server-side atual suficiente + risco de ruido/cardinalidade sem baseline maduro
- Tuning OTel:
  - metric views (histogram buckets explicitos) para latencias de importing e Prisma
  - reversivel por env (`OTEL_METRIC_VIEWS_ENABLED`)
  - retry/backoff mantidos fora do runtime da app (delegados a collector/backend) para preservar simplicidade e reversibilidade
- Operacionalizacao gerenciada:
  - dashboards/alerts as code versionados em `infra/observability/*` (Grafana + Prometheus + Loki)
  - acoplamento vendor fica restrito a artefatos operacionais/infra; dominio/importing/use-cases permanecem desacoplados

### 4E.8 (recalibracao operacional, alert precision e automacao de apply)

- Recalibracao / baseline:
  - a rodada 4E.8 introduz um artefato operacional dedicado para baseline/calibracao em `infra/observability/calibration/baseline-thresholds.4e8.yaml`
  - janelas operacionais permanecem padronizadas (`15m`, `7d`, `30d`) e separadas por ambiente (`staging`/`production`)
  - nesta rodada especifica (2026-02-25), nao havia exportacoes reais `7d`/`30d` de `staging`/`production` no workspace; portanto a baseline 4E.8 foi registrada como **parcial**
  - thresholds por sinal permanecem provisoriamente herdados da 4E.7 ate coleta real disponivel, com status explicito por sinal/ambiente
- Alert precision:
  - rules Prometheus/Loki foram refinadas para reduzir ruido sem acoplar app/dominio:
    - gates de volume minimo por sinal
    - persistencia (`for`) revisada
    - severidades separadas (`warning`/`critical`) em sinais criticos
    - cobertura adicional de Prisma (`error_rate`, `slow_query_rate`, `query_duration_p95`)
    - runtime warnings com alerta dedicado para `INSTRUMENTATION_INIT_FAILED` e recorrencia para `SHUTDOWN_FAILED`
  - dependencia de pipeline de spanmetrics foi mantida explicita em labels/annotations (`prerequisite: spanmetrics_enabled`)
- Compatibilidade de naming backend/collector:
  - naming de metricas/labels foi externalizado em profile versionado (`infra/observability/calibration/naming-compatibility.4e8.yaml`)
  - apply/render usa profile para compatibilizar divergencias de backend/collector sem editar regras/dashboards manualmente
  - ajuste de naming permanece restrito a `infra/observability/*` (sem tocar dominio/importing/use-cases)
- Automacao de apply/provisionamento:
  - scripts versionados para validar/renderizar/aplicar/smoke:
    - `infra/observability/scripts/validate-observability.py`
    - `infra/observability/scripts/apply-observability.py`
    - `infra/observability/scripts/post-apply-smoke.py`
  - modelo de apply suportado nesta rodada:
    - `dry-run` / CI-ready (render + parse + checks)
    - apply automatico via filesystem copy (dashboards/provisioning/rules)
    - checks remotos opcionais (Grafana/Prometheus/Loki) quando endpoints/credenciais estiverem disponiveis
- Naming OTel/Prometheus (compatibilidade):
  - dashboards/rules 4E.8 alinharam histogramas de metricas proprias para suffix de unidade (`*_milliseconds_bucket`) conforme naming Prometheus derivado de OTel
  - isso evita dashboards/rules quebrados por suposicao de nome sem unidade

Trade-offs explicitados:

- Sem acesso ao ambiente alvo nesta rodada, a 4E.8 fecha automacao/pipeline + baseline parcial, mas nao promove thresholds "finais" por sinal
- Foi preferido um mecanismo de profile de naming no apply (infra-only) em vez de introduzir logica vendor-specific na aplicacao
- Alertas foram endurecidos por gates/persistencia antes de reduzir thresholds, priorizando precisao operacional e menor ruido

### 4E.9 (coleta de evidencias reais, promocao de baseline/naming e smoke remoto reforcado)

- Coleta de evidencias reais (infra-only):
  - foi adicionado um fluxo versionado para coletar evidencias agregadas por ambiente/sinal/janela (`15m`, `7d`, `30d`) sem acoplar app/dominio:
    - `infra/observability/scripts/collect-observability-evidence.py`
    - `infra/observability/evidence/observability-evidence.4e9.template.json`
    - `infra/observability/evidence/README.md`
  - as evidencias registradas permanecem agregadas (sem headers/tokens/payloads/query strings/SQL bruto/IDs dinamicos)
- Promocao automatizada de baseline/naming:
  - foi adicionado `infra/observability/scripts/promote-baseline-4e9.py`
    - gera `baseline-thresholds.4e9.yaml` e `naming-compatibility.4e9.yaml`
    - nao promove thresholds automaticamente sem evidencias reais e/ou `threshold_decisions` explicitas
    - preserva thresholds herdados da 4E.8 com status/granularidade explicitos por ambiente/sinal quando a evidencia esta ausente/parcial
- Naming/backend/collector:
  - `naming-compatibility.4e9.yaml` passa a registrar metadados de validacao de profile default e observacao de labels/metricas
  - scripts de render/apply passam a preferir naming 4E.9 (fallback para 4E.8) sem alterar dominio/importing/use-cases
- Smoke remoto pos-apply:
  - `infra/observability/scripts/post-apply-smoke.py` foi expandido para:
    - validar Grafana API health + dashboards UIDs
    - validar Prometheus rules/query API
    - validar Loki labels/check basico
    - validar profile de naming (presenca de labels/metricas)
    - executar queries de smoke por familia de sinais (importing / Prisma / spanmetrics / runtime)
    - opcionalmente gravar relatorio JSON (`--output-report`)
- Resultado desta rodada (workspace atual):
  - nao havia endpoints/credenciais de Grafana/Prometheus/Loki no workspace
  - foi gerada captura 4E.9 com status bloqueado (`blocked_no_remote_endpoints`) e baseline/naming 4E.9 permanecem parciais
  - nenhum threshold final foi promovido sem evidencia real

Trade-offs da 4E.9:

- Preferimos automatizar coleta/promocao (reproduzivel por script) em vez de editar thresholds manualmente sem evidencia
- Sem ambiente alvo acessivel, o valor entregue foi maximizar prontidao operacional e rastreabilidade do bloqueio, nao “simular” baseline real
- O vendor lock-in continua restrito a artefatos operacionais/infra; o dominio/importing permaneceu inalterado

### 4E.10 (readiness/gating de finalizacao compativel com 4E.9 parcial)

- Foi adicionada uma camada infra-only de readiness para a promocao final (thresholds/naming/apply real), sem reabrir a 4E.9:
  - `infra/observability/scripts/generate-4e10-finalization-readiness.py`
  - `infra/observability/calibration/finalization-readiness.4e10.yaml`
- A 4E.10 desta rodada **nao** promove thresholds finais nem consolida o profile default final.
  - Em vez disso, consome os artefatos 4E.9 (`baseline/naming/evidence/smoke`) e expõe readiness por área:
    - finalizacao de thresholds por sinal/ambiente
    - finalizacao do `default_profile`
    - readiness de apply real + smoke remoto
- Dependencia operacional remanescente foi normalizada como marcador explícito:
  - `pending_4e9r_real_evidence`
- O artefato 4E.10 documenta pontos de acoplamento com a 4E.9R (campos exatos que dependem de dados reais), para evitar retrabalho e promover atualizacao deterministica quando endpoints/credenciais/UIDs estiverem disponiveis.

Trade-offs da 4E.10:

- Preferimos um artefato de readiness versionado e validado localmente a tentativas de “finalizar” baseline/naming sem evidencia real
- Mantivemos compatibilidade com baseline/naming provisórios da 4E.9 e comandos dry-run existentes, evitando fork de tooling
- O bloqueio operacional externo continua transparente e auditável (sem status silencioso)

## Testabilidade (4E.2)

Cobertura adicionada:

- parser de env/runtime config:
  - defaults
  - valores validos
  - valores invalidos
  - warning por endpoint ausente com `OTEL_ENABLED=true`
  - snapshot de log sem vazamento de headers
- runtime bootstrap:
  - enabled/disabled
  - start/shutdown idempotentes
  - bootstrap failure (exporter/SDK) sem exception fatal
  - isolamento de callback de warning
- provider de collector (`importing`):
  - wiring com tracer/meter reais do runtime
  - reuso de adapter
  - fallback `Noop`/custom
- metricas do adapter:
  - counters/histograms canonicos
  - cardinalidade controlada
  - degradacao segura quando meter falha
- 4E.7 (observability):
  - parser/runtime config com flags de Prisma instrumentation e metric views
  - runtime com metric views habilitadas/desabilitadas por env
  - instrumentacao Prisma (middleware) com spans/metricas e sem vazamento de args/SQL

## Nao objetivos da 4E.2

- auto-instrumentacao ampla da app Next.js (alem da instrumentacao HTTP basica adotada depois em 4E.5)
- dashboards/SLOs externos
- tuning avancado por ambiente/provedor (Datadog/Tempo/Jaeger)
- traces/log correlation completa na camada de aplicacao

## Fica para 4E.10+

- executar coleta real de evidencias 4E.9 em `staging`/`production` (Grafana/Prometheus/Loki) com janelas `15m`/`7d`/`30d` (`pending_4e9r_real_evidence`)
- promover thresholds finais por sinal/ambiente em `baseline-thresholds.4e9.yaml` (ou baseline 4E.10, se houver nova rodada) (`pending_4e9r_real_evidence`)
- validar e consolidar profile final de naming no backend/collector alvo e registrar mapeamento observado (`pending_4e9r_real_evidence`)
- executar apply real do bundle e anexar relatorio de `post-apply-smoke.py --output-report` (`pending_4e9r_real_evidence`)
- tuning adicional de temporality/views por backend, se necessario
- instrumentacoes adicionais de Next runtime (outras) somente se baseline/ruido/custo justificarem (`pending_4e9r_real_evidence`)
- politica de logs estruturados para warnings de observabilidade
