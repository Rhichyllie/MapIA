# OpenTelemetry (runtime + importing)

## Visao geral

O projeto usa OpenTelemetry server-side (Node) para traces e metricas de importing e sinais de plataforma (HTTP/Prisma) na camada de observabilidade.

- Runtime/config: `src/server/observability/otel-runtime.ts` + `src/server/observability/otel-runtime-config.ts`
- Bridge do importing (4E.1): `ImportTelemetryOtelAdapter`
- Provider do importing (4E.2+): `src/modules/importing/infra/observability/import-telemetry-collector-provider.ts`

Principios operacionais:

- dominio/importing continua desacoplado do SDK/vendor OTel
- parser de env e leniente (warnings + fallback, sem derrubar a app)
- bootstrap/shutdown sao idempotentes
- diagnosticos (`warnings`, `debugSnapshot`) nao vazam headers/tokens

## O que existe hoje

- traces OTLP HTTP (`NodeSDK` + `BatchSpanProcessor`)
- metricas OTLP HTTP (quando habilitadas/configuradas)
- instrumentacao de plataforma HTTP (entrada/saida Node) opcional e habilitada por env
- instrumentacao Prisma manual na camada de servidor (middleware do `PrismaClient`) com spans + metricas de baixa cardinalidade
- metric views OTel (histogram buckets explicitos) para duracoes de importing e Prisma, reversiveis por env
- span raiz + child spans no importing (via adapter 4E.1)
- metricas basicas do importing/adapter (`importing.telemetry.*`)

## Instrumentacoes habilitadas (server-side)

Atualmente (4E.7), as instrumentacoes de plataforma/infra habilitadas no servidor sao:

- `HTTP` (`@opentelemetry/instrumentation-http`)
  - cobre trafego HTTP de entrada/saida no runtime Node
  - falha na inicializacao nao derruba a app (warning + runtime continua)
  - pode ser desligada por env
- `Prisma` (middleware manual OTel em `src/server/observability/prisma-otel-instrumentation.ts`)
  - cobre operacoes Prisma no `PrismaClient` singleton server-side
  - gera spans + metricas agregadas por `prisma.action` / `prisma.model` / `prisma.outcome`
  - nao captura payloads/params/SQL bruto; pode ser desligada por env

Instrumentacoes deliberadamente nao habilitadas nesta fase:

- instrumentacoes amplas de Next.js/runtime web
- vendor-specific instrumentations

Motivo:

- reduzir risco/ruido/cardinalidade e manter controle de atributos sensiveis
- manter rollout reversivel e previsivel

Audit 4E.7 (Next runtime):

- cobertura atual de API handlers/server-side permanece adequada com instrumentacao HTTP + spans de importing
- nenhuma auto-instrumentacao ampla de Next foi adicionada nesta fase (custo/ruido/cardinalidade > beneficio no estado atual)

## Variaveis de ambiente (resumo)

Flags e identidade:

- `OTEL_ENABLED`
- `OTEL_METRICS_ENABLED`
- `OTEL_SERVICE_NAME`
- `OTEL_SERVICE_VERSION`
- `OTEL_DEPLOYMENT_ENVIRONMENT`

OTLP endpoints/headers:

- `OTEL_EXPORTER_OTLP_ENDPOINT`
- `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`
- `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`
- `OTEL_EXPORTER_OTLP_HEADERS`
- `OTEL_EXPORTER_OTLP_TRACES_HEADERS`
- `OTEL_EXPORTER_OTLP_METRICS_HEADERS`

Sampler/tuning:

- `OTEL_TRACES_SAMPLER`
- `OTEL_TRACES_SAMPLER_ARG`
- `OTEL_INSTRUMENTATION_HTTP_ENABLED`
- `OTEL_INSTRUMENTATION_PRISMA_ENABLED`
- `OTEL_INSTRUMENTATION_PRISMA_SLOW_QUERY_THRESHOLD_MS`
- `OTEL_METRIC_VIEWS_ENABLED`
- `OTEL_BSP_*`
- `OTEL_EXPORTER_OTLP_TRACES_TIMEOUT`
- `OTEL_EXPORTER_OTLP_METRICS_TIMEOUT`
- `OTEL_METRIC_EXPORT_INTERVAL`
- `OTEL_METRIC_EXPORT_TIMEOUT`

## Tuning recomendado por ambiente

Os valores abaixo sao guidance operacional (nao defaults obrigatorios do parser).

### Development

- `OTEL_ENABLED=true` somente quando estiver validando telemetria
- sampler: `always_on` (facilita debug local)
- intervalos/timeouts menores sao aceitaveis para feedback rapido
- `OTEL_INSTRUMENTATION_HTTP_ENABLED=true` para validar spans de plataforma
- `OTEL_INSTRUMENTATION_PRISMA_ENABLED=true` para validar spans/metricas Prisma sem payloads
- `OTEL_METRIC_VIEWS_ENABLED=true` (default recomendado) para buckets previsiveis em histogramas

### Staging

- `OTEL_ENABLED=true`
- sampler recomendado:
  - `traceidratio` (ex.: `0.1` a `0.5`) para validar volume sem custo maximo
- manter metrics habilitadas se houver backend observability disponivel
- `OTEL_INSTRUMENTATION_PRISMA_ENABLED=true` se Prisma estiver no fluxo da app
- ajustar `OTEL_INSTRUMENTATION_PRISMA_SLOW_QUERY_THRESHOLD_MS` ao baseline provisoriamente (4E.7: `250ms`)
- revisar warnings de clamp/ajustes (`CLAMPED_NUMBER`, `BATCH_SIZE_ADJUSTED`)

### Production

- habilitar por rollout gradual (feature flag / env)
- sampler recomendado:
  - `traceidratio` com ratio conservador (ex.: `0.05` a `0.2`), ajustando por volume
- manter `OTEL_METRIC_VIEWS_ENABLED=true` para histogramas de latencia com buckets estaveis
- habilitar Prisma instrumentation por rollout se o backend/collector suportar volume adicional esperado
- evitar `always_on` em alto volume sem capacidade de collector/backend validada
- validar queue/batch/timeouts com carga real antes de elevar sampling

## Convencoes de naming (spans / metricas / atributos)

### Tracing (importing)

- span raiz por run: `importing.pipeline`
- child spans por step: derivados do contrato interno (`ImportTelemetryStep`)
- atributos canonicos do adapter usam prefixo `import.` (ex.: `import.run_id`, `import.phase`, `import.outcome`)

### Metricas (importing)

- prefixo canônico: `importing.telemetry.*`
- exemplos:
  - `importing.telemetry.runs.started`
  - `importing.telemetry.runs.finalized`
  - `importing.telemetry.adapter.warnings`
  - `importing.telemetry.adapter.late_drops`
  - `importing.telemetry.run.duration`
  - `importing.telemetry.step.duration`

### Tracing / metricas (Prisma, 4E.7)

- spans por operacao:
  - `prisma.<model|raw>.<action>` (ex.: `prisma.Project.findMany`)
- metricas:
  - `prisma.telemetry.operations`
  - `prisma.telemetry.errors`
  - `prisma.telemetry.slow_queries`
  - `prisma.telemetry.query.duration`
- atributos de baixa cardinalidade:
  - `prisma.action`
  - `prisma.model` (quando disponivel)
  - `prisma.outcome` (`success|error`)
  - `prisma.slow_query`
  - `prisma.in_transaction`

### Cardinalidade / seguranca

- nao usar `importRunId` em metricas
- usar apenas enums/labels de baixa cardinalidade em atributos metricos
- nao capturar headers/tokens/segredos em snapshots/warnings
- nao capturar SQL bruto/params/args do Prisma em spans/metricas
- nao usar `query string`/URL bruta em filtros de dashboards/alertas

## Fallback e degradacao segura

Quando OTel nao pode subir, a app continua operando:

- `OTEL_ENABLED=false` => runtime desabilitado (import pipeline segue com fallback)
- endpoint de traces invalido/ausente => runtime nao inicia (provider usa fallback collector)
- endpoint de metrics invalido/ausente com metrics habilitadas => traces podem subir; metrics ficam desabilitadas com warning
- falha de exporter/SDK/bootstrap => runtime entra em `failed`, provider usa fallback

No importing:

- provider reutiliza adapter OTel quando runtime esta ativo
- provider memoiza estados terminais de `runtime.start()` para reduzir ruido
- provider reutiliza fallback collector (`Noop` ou custom) para evitar churn

## Troubleshooting (warnings comuns)

Formato dos warnings:

- `code`
- `message`
- `details` (sem valores sensiveis)

Observacao operacional:

- warnings do parser/config (`otel-runtime-config.ts`) sao emitidos pelo runtime como `CONFIG_WARNING`
- `BOOTSTRAP_DISABLED` indica runtime desligado por flag ou por pre-condicao ausente (ex.: endpoint de traces invalido/ausente)

Warnings de config/runtime:

- `CONFIG_WARNING`
  - wrapper de warnings de parse/config (ex.: `INVALID_URL`, `MISSING_OTLP_ENDPOINT`, `BATCH_SIZE_ADJUSTED`).
- `BOOTSTRAP_DISABLED`
  - runtime ficou `disabled` por flag (`OTEL_ENABLED=false`) ou pre-condicao ausente (`missing_traces_endpoint`).
- `MISSING_OTLP_ENDPOINT`
  - `OTEL_ENABLED=true`, mas nao ha endpoint valido de traces.
- `MISSING_OTLP_METRICS_ENDPOINT`
  - metrics habilitadas, mas endpoint de metrics nao foi configurado/derivado.
- `INVALID_URL`
  - URL de endpoint invalida; parser ignora a configuracao e segue com fallback.
- `CLAMPED_NUMBER`
  - valor numerico foi normalizado (min/max/truncamento).
- `BATCH_SIZE_ADJUSTED`
  - `OTEL_BSP_MAX_EXPORT_BATCH_SIZE` foi ajustado para nao exceder `OTEL_BSP_MAX_QUEUE_SIZE`.
- `BOOTSTRAP_FAILED`
  - runtime OTel falhou ao criar exporter/SDK; app continua sem OTel.
- `SHUTDOWN_FAILED`
  - erro no shutdown do runtime OTel (nao deve quebrar o encerramento da app).
- `INSTRUMENTATION_INIT_FAILED`
  - falha ao inicializar instrumentacao de plataforma (ex.: HTTP); runtime segue sem essa instrumentacao.

Warnings do adapter/provider (importing):

- `METRICS_OPERATION_FAILED`
  - falha em meter/instrumentos do adapter; tracing/pipeline continuam.

## Troubleshooting rapido (sintoma -> causa provavel -> acao)

- Sintoma: traces nao aparecem no backend
  - Causa provavel: `OTEL_ENABLED=false` ou endpoint de traces ausente/invalido (`MISSING_OTLP_ENDPOINT`, `INVALID_URL`)
  - Acao: validar `OTEL_ENABLED=true` e `OTEL_EXPORTER_OTLP_ENDPOINT`/`OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`

- Sintoma: metricas habilitadas mas nao exportam
  - Causa provavel: endpoint de metrics ausente/invalido (`MISSING_OTLP_METRICS_ENDPOINT`) ou backend sem suporte
  - Acao: validar `OTEL_METRICS_ENABLED=true` e endpoint de metrics (explicito ou derivado)

- Sintoma: volume de traces alto demais / custo elevado
  - Causa provavel: sampler `always_on` em ambiente de alto volume
  - Acao: usar `traceidratio` e ajustar `OTEL_TRACES_SAMPLER_ARG` progressivamente

- Sintoma: spans/metrics aparecem com atraso
  - Causa provavel: tuning de batch/intervalo conservador (`OTEL_BSP_*`, `OTEL_METRIC_EXPORT_INTERVAL`)
  - Acao: reduzir delays/intervalos em staging e revalidar impacto operacional

- Sintoma: warning de clamp/ajuste de batch
  - Causa provavel: `OTEL_BSP_MAX_EXPORT_BATCH_SIZE > OTEL_BSP_MAX_QUEUE_SIZE`
  - Acao: alinhar configs para evitar ajuste automatico e facilitar previsibilidade

- Sintoma: app sobe normalmente, mas OTel fica desligado
  - Causa provavel: falha de bootstrap/exporter/instrumentacao (`BOOTSTRAP_FAILED`, `INSTRUMENTATION_INIT_FAILED`)
  - Acao: inspecionar warnings do runtime; corrigir endpoint/lib/config sem depender de rollback da app

## Diagnosticos rapidos (debug snapshots)

`otel-runtime.ts` (`runtime.debugSnapshot()`):

- `state`
- `startCallCount`
- `shutdownCallCount`
- `shutdownInFlight`
- `shutdownHooksRegistered`
- `config` (flags/contagens, sem headers)
  - inclui flags de instrumentacao (ex.: `instrumentation.httpEnabled`, `instrumentation.prismaEnabled`)
  - inclui `instrumentation.prismaSlowQueryThresholdMs` e `metrics.viewsEnabled` (sem valores sensiveis)

`import-telemetry-collector-provider.ts` (`provider.debugSnapshot()`):

- `otelCollectorInitialized`
- `fallbackCollectorInitialized`
- `collectorKind` (`none | otel | fallback-noop | fallback-custom`)
- `runtimeStartMemoized`
- `memoizedRuntimeStartState` / `memoizedRuntimeStartReason`

## Matriz de SLIs / SLOs iniciais (4E.6-final, vendor-agnostic)

Observacoes gerais:

- os SLIs abaixo usam apenas sinais que ja existem hoje (metricas do importing, spans e warnings/logs/snapshots)
- saude do runtime OTel continua observada indiretamente (sem metrica propria dedicada nesta fase)
- thresholds operacionais 4E.7 (provisorios) foram versionados em `infra/observability/calibration/provisional-baseline-thresholds.4e7.yaml`
- alertas/thresholds devem aplicar gates de volume minimo para reduzir falso positivo (ex.: runs/importing e span volume)
- SLOs/thresholds abaixo devem ser recalibrados com baseline real estavel de `staging`/`prod` (ciclo 4E.8+)
- nas queries genericas abaixo, usar atributos reais (`importing.outcome`, `importing.warning_code`, `importing.drop_kind`, `importing.step_name`)

### Importing pipeline

#### `importing_success_rate`

- Nome: taxa de runs finalizadas com sucesso
- Sinal usado: metrica `importing.telemetry.runs.finalized` (counter)
- Query generica (vendor-agnostic): `count(importing.telemetry.runs.finalized where importing.outcome=success) / count(importing.telemetry.runs.finalized)`
- SLO inicial sugerido: `>= 99%` (prod) e `>= 95%` (staging)
- Janela: `30d` (prod), `7d` (staging)
- Severidade operacional quando violado: `warning` se degradacao moderada; `critical` se persistente ou com aumento simultaneo de `failure`
- Limitacoes / observacoes: acompanhar `partial` separadamente para nao mascarar degradacao funcional

#### `importing_failure_rate`

- Nome: taxa de falha de runs
- Sinal usado: metrica `importing.telemetry.runs.finalized` (counter)
- Query generica (vendor-agnostic): `count(importing.telemetry.runs.finalized where importing.outcome=failure) / count(importing.telemetry.runs.finalized)`
- SLO inicial sugerido: `< 1%` (prod) e `< 5%` (staging)
- Janela: `30d` (prod), `7d` (staging)
- Severidade operacional quando violado: `warning` acima do baseline curto; `critical` se `> 5%` em janela curta (ex.: `15m`)
- Limitacoes / observacoes: leituras em baixo volume exigem janela minima e comparacao com throughput

#### `importing_run_duration_percentiles`

- Nome: duracao de run (p50/p95/p99)
- Sinal usado: metrica `importing.telemetry.run.duration` (histogram)
- Query generica (vendor-agnostic): `p50,p95,p99(importing.telemetry.run.duration)`
- SLO inicial sugerido: `p95 <= 10s` (ajustar por ambiente/tamanho medio), `p99` monitorado como guardrail, `p50` como baseline de regressao
- Janela: `7d` (tuning operacional) e `30d` (capacidade)
- Severidade operacional quando violado: `warning` quando `p95` degrada; `critical` se `p99` degrada junto com falhas/timeouts
- Limitacoes / observacoes: sem segmentacao por tamanho de input; comparar por `deployment_environment`, `service_version` e volume

#### `importing_step_duration_p95_by_step`

- Nome: duracao p95 por step
- Sinal usado: metrica `importing.telemetry.step.duration` (histogram)
- Query generica (vendor-agnostic): `p95(importing.telemetry.step.duration) grouped by importing.step_name`
- SLO inicial sugerido: baseline por `importing.step_name` (sem limite global unico)
- Janela: `7d`
- Severidade operacional quando violado: `warning` (degradacao localizada); `critical` apenas se correlacionar com falhas de run
- Limitacoes / observacoes: steps raros geram amostras insuficientes; analisar apenas steps recorrentes

#### `importing_adapter_warning_rate`

- Nome: taxa de warnings do adapter
- Sinal usado: metricas `importing.telemetry.adapter.warnings` (counter) e `importing.telemetry.runs.finalized` (counter)
- Query generica (vendor-agnostic): `count(importing.telemetry.adapter.warnings) / max(1, count(importing.telemetry.runs.finalized))`
- SLO inicial sugerido: `~0` em steady-state (qualquer aumento persistente deve ser investigado)
- Janela: `7d` (baseline) e `15m` (detecao de burst)
- Severidade operacional quando violado: `warning`; `critical` se combinado com `METRICS_OPERATION_FAILED` recorrente e perda de sinais
- Limitacoes / observacoes: usar breakdown por `importing.warning_code`; nem todo warning afeta dado funcional

#### `importing_adapter_late_drops`

- Nome: late drops do adapter
- Sinal usado: metrica `importing.telemetry.adapter.late_drops` (counter)
- Query generica (vendor-agnostic): `count(importing.telemetry.adapter.late_drops)` (opcional: `/ max(1, count(importing.telemetry.runs.finalized))`)
- SLO inicial sugerido: `0` em condicao normal
- Janela: `30m` (detecao) e `7d` (tendencia)
- Severidade operacional quando violado: `warning`; `critical` se persistente apos rollout ou com impacto em completude de telemetria
- Limitacoes / observacoes: pode haver ocorrencias pontuais em cenarios anormais/duplicados; correlacionar com `importing.drop_kind`

### Runtime OTel / Telemetry health (indireto)

#### `otel_runtime_critical_warnings_absent`

- Nome: ausencia de warnings criticos de runtime
- Sinal usado: warnings/logs de runtime (`BOOTSTRAP_FAILED`, `SHUTDOWN_FAILED`, `INSTRUMENTATION_INIT_FAILED`)
- Query generica (vendor-agnostic): `count(runtime warnings where code in [BOOTSTRAP_FAILED, SHUTDOWN_FAILED, INSTRUMENTATION_INIT_FAILED])`
- SLO inicial sugerido: `BOOTSTRAP_FAILED = 0` por deploy; `SHUTDOWN_FAILED = 0` por encerramento controlado; `INSTRUMENTATION_INIT_FAILED = 0` em steady-state quando HTTP instrumentation deveria estar habilitada
- Janela: por deploy/restart + `7d`
- Severidade operacional quando violado: `critical` para `BOOTSTRAP_FAILED`; `warning` para `INSTRUMENTATION_INIT_FAILED`; `warning`/`critical` para `SHUTDOWN_FAILED` conforme recorrencia
- Limitacoes / observacoes: depende de coleta de warnings/logs; nao existe counter de runtime dedicado nesta fase

#### `otel_runtime_unexpectedly_disabled_absent`

- Nome: ausencia de `BOOTSTRAP_DISABLED` inesperado em `staging`/`prod`
- Sinal usado: warnings/logs de runtime (`BOOTSTRAP_DISABLED`) + contexto de ambiente
- Query generica (vendor-agnostic): `count(runtime warnings where code=BOOTSTRAP_DISABLED and deployment_environment in [staging, production])`
- SLO inicial sugerido: `0` quando o ambiente deveria exportar telemetria
- Janela: por deploy/restart + `7d`
- Severidade operacional quando violado: `warning`; `critical` se persistente em producao fora de janela de manutencao
- Limitacoes / observacoes: distinguir desabilitacao intencional (`OTEL_ENABLED=false`) de misconfig (`missing_traces_endpoint`, endpoint invalido)

#### `otel_runtime_startup_expected_state`

- Nome: startup com estado esperado do runtime
- Sinal usado: `runtime.debugSnapshot()` e logs de bootstrap (check operacional)
- Query generica (vendor-agnostic): `count(process boots with runtime state in [started, disabled_intentional]) / count(process boots)`
- SLO inicial sugerido: `100%` dos boots em estado esperado
- Janela: por deploy/restart + `30d`
- Severidade operacional quando violado: `warning`; `critical` se houver `failed` em producao
- Limitacoes / observacoes: `debugSnapshot()` e local ao processo; precisa ser combinado com logs/telemetria centralizada

### HTTP platform (4E.5, quando habilitado)

#### `http_platform_span_volume_sanity`

- Nome: volume esperado de spans HTTP (sanity check)
- Sinal usado: spans HTTP (server/client) no backend OTel
- Query generica (vendor-agnostic): `count(http spans) grouped by deployment_environment, service.name`
- SLO inicial sugerido: faixa esperada por ambiente (sem alvo unico); detectar volume zerado ou explosao anomala
- Janela: `15m` (detecao) e `7d` (baseline)
- Severidade operacional quando violado: `warning`; `critical` se span volume cai a zero junto com perda de spans de importing em ambiente com OTel esperado
- Limitacoes / observacoes: requer backend com consulta/analytics de spans ou span metrics

#### `http_platform_error_rate`

- Nome: taxa de erro HTTP por spans (se suportado pelo backend)
- Sinal usado: spans HTTP com status de erro
- Query generica (vendor-agnostic): `count(http spans where span.status=error) / count(http spans)`
- SLO inicial sugerido: alinhar ao SLO da API/plataforma (quando definido); usar baseline por rota/grupo
- Janela: `15m` (alerta) e `30d` (tendencia)
- Severidade operacional quando violado: `warning`/`critical` alinhado a SLO da API
- Limitacoes / observacoes: sem metricas HTTP dedicadas no projeto; depende de analytics/span metrics no backend

#### `http_platform_latency_p95`

- Nome: latencia HTTP p95 (por rota/grupo)
- Sinal usado: duracao de spans HTTP
- Query generica (vendor-agnostic): `p95(duration of http spans) grouped by normalized_route`
- SLO inicial sugerido: baseline por rota/grupo (nao global)
- Janela: `15m` (alerta) e `7d` (baseline)
- Severidade operacional quando violado: `warning`; `critical` se combinado com erro HTTP alto
- Limitacoes / observacoes: cardinalidade depende de rota normalizada; evitar URL bruta/query string

### Prisma access telemetry (4E.7, quando Prisma estiver no fluxo ativo)

#### `prisma_query_duration_p95`

- Nome: latencia Prisma p95 por operacao/modelo
- Sinal usado: metrica `prisma.telemetry.query.duration` (histogram)
- Query generica (vendor-agnostic): `p95(prisma.telemetry.query.duration) grouped by prisma.action, prisma.model`
- SLO inicial sugerido: `p95 <= 300ms` (prod) / `<= 500ms` (staging) para operacoes comuns; recalibrar por modelo/operacao
- Janela: `15m` (alerta) e `7d` (baseline)
- Severidade operacional quando violado: `warning`; `critical` se combinado com erro Prisma alto
- Limitacoes / observacoes: thresholds variam por operacao/modelo; usar gates de volume (`prisma_ops_15m`) antes de alertar

#### `prisma_error_rate`

- Nome: taxa de erro de operacoes Prisma
- Sinal usado: metricas `prisma.telemetry.operations` / `prisma.telemetry.errors` (counters)
- Query generica (vendor-agnostic): `count(prisma.telemetry.errors) / max(1, count(prisma.telemetry.operations))`
- SLO inicial sugerido: `< 1%` (prod) / `< 2%` (staging), com baseline por operacao/modelo
- Janela: `15m` (alerta) e `30d` (tendencia)
- Severidade operacional quando violado: `warning`/`critical` conforme impacto e recorrencia
- Limitacoes / observacoes: usar breakdown por `prisma.action` / `prisma.model`; erros de integridade podem ser esperados em alguns fluxos

#### `prisma_slow_query_rate`

- Nome: taxa de slow queries Prisma
- Sinal usado: metricas `prisma.telemetry.slow_queries` / `prisma.telemetry.operations` (counters)
- Query generica (vendor-agnostic): `count(prisma.telemetry.slow_queries) / max(1, count(prisma.telemetry.operations))`
- SLO inicial sugerido: `< 2%` (prod) / `< 5%` (staging) usando threshold de lentidao configurado por env
- Janela: `15m` (alerta) e `7d` (baseline)
- Severidade operacional quando violado: `warning`
- Limitacoes / observacoes: threshold depende de `OTEL_INSTRUMENTATION_PRISMA_SLOW_QUERY_THRESHOLD_MS`; sem SQL bruto/payloads por desenho de seguranca

## Dashboards minimos (4E.6)

### Dashboard 1: Health do Importing

1. Objetivo
   acompanhar confiabilidade do pipeline de importacao e detectar degradacao funcional rapidamente
2. Paineis recomendados (lista)
   - runs finalizadas por `importing.outcome` (`success` / `partial` / `failure`)
   - taxa de `importing_failure_rate` (janela curta e longa)
   - taxa de `importing_success_rate` (7d/30d)
   - warnings do adapter por `importing.warning_code`
   - late drops por `importing.drop_kind`
3. Filtros recomendados (env/service/version/etc.)
   - `service.name`
   - `deployment_environment`
   - `service.version`
   - `importing.source_kind`
4. Queries genericas (exemplos)
   - `count(importing.telemetry.runs.finalized) grouped by importing.outcome`
   - `count(importing.telemetry.runs.finalized where importing.outcome=failure) / count(importing.telemetry.runs.finalized)`
   - `count(importing.telemetry.adapter.warnings) grouped by importing.warning_code`
   - `count(importing.telemetry.adapter.late_drops) grouped by importing.drop_kind`
5. Sinais de atencao (o que observar)
   - aumento de `failure` sem aumento proporcional de throughput
   - crescimento de `partial` mascarando queda de `success`
   - burst de `METRICS_OPERATION_FAILED` ou late drops apos deploy
6. Cuidados de cardinalidade/seguranca
   - nao usar `importRunId` em series/filtros agregados
   - limitar breakdowns a enums de baixa cardinalidade (`importing.*`)
   - nao registrar/expor headers/tokens em paines ou tickets

### Dashboard 2: Performance do Importing

1. Objetivo
   acompanhar latencia de runs e steps para tuning, capacidade e regressao por release
2. Paineis recomendados (lista)
   - p50/p95/p99 de `importing.telemetry.run.duration`
   - histograma de `importing.telemetry.run.duration`
   - p95 de `importing.telemetry.step.duration` por `importing.step_name`
   - throughput de runs finalizadas por minuto
   - tabela de top steps por p95 e volume
3. Filtros recomendados (env/service/version/etc.)
   - `service.name`
   - `deployment_environment`
   - `service.version`
   - `importing.source_kind`
4. Queries genericas (exemplos)
   - `p50,p95,p99(importing.telemetry.run.duration)`
   - `histogram(importing.telemetry.run.duration)`
   - `p95(importing.telemetry.step.duration) grouped by importing.step_name`
   - `rate(count(importing.telemetry.runs.finalized))`
5. Sinais de atencao (o que observar)
   - `p95` sobe antes de `failure_rate` subir
   - `p99` explode em poucos steps especificos
   - throughput cai enquanto latencia aumenta (sinal de saturacao)
6. Cuidados de cardinalidade/seguranca
   - comparar baseline por ambiente; nao comparar `development` com `production`
   - priorizar agrupamentos por `importing.step_name`, nao por identificadores dinamicos
   - nao incluir payloads/importRunId em labels de metricas

### Dashboard 3: Runtime OTel / Warnings

1. Objetivo
   detectar problemas do runtime OTel (bootstrap/exporter/instrumentacao/configuracao) e confirmar saude indireta da telemetria
2. Paineis recomendados (lista)
   - contagem de warnings criticos (`BOOTSTRAP_FAILED`, `SHUTDOWN_FAILED`, `INSTRUMENTATION_INIT_FAILED`)
   - contagem de `BOOTSTRAP_DISABLED` por ambiente
   - contagem de warnings de config (`MISSING_OTLP_ENDPOINT`, `MISSING_OTLP_METRICS_ENDPOINT`, `INVALID_URL`, `CLAMPED_NUMBER`, `BATCH_SIZE_ADJUSTED`)
   - painel/checklist de estado esperado de bootstrap por deploy (`started` vs `disabled` intencional)
3. Filtros recomendados (env/service/version/etc.)
   - `service.name`
   - `deployment_environment`
   - `service.version`
   - `warning.code`
4. Queries genericas (exemplos)
   - `count(runtime warnings where code in [BOOTSTRAP_FAILED, SHUTDOWN_FAILED, INSTRUMENTATION_INIT_FAILED])`
   - `count(runtime warnings where code=BOOTSTRAP_DISABLED and deployment_environment in [staging, production])`
   - `count(runtime warnings where code in [MISSING_OTLP_ENDPOINT, MISSING_OTLP_METRICS_ENDPOINT, INVALID_URL, CLAMPED_NUMBER, BATCH_SIZE_ADJUSTED])`
5. Sinais de atencao (o que observar)
   - `BOOTSTRAP_FAILED` apos deploy (telemetria indisponivel mesmo com app no ar)
   - `BOOTSTRAP_DISABLED` inesperado em `staging`/`prod`
   - `INSTRUMENTATION_INIT_FAILED` recorrente quando HTTP instrumentation deveria estar ativa
6. Cuidados de cardinalidade/seguranca
   - runtime health nesta fase e indireta (warnings/logs/snapshot), nao metrica propria
   - usar apenas codigos/flags/contagens de warnings (sem valores de headers)
   - evitar copiar snapshots completos em tickets; extrair somente campos necessarios

### Dashboard 4: HTTP Platform Overview

1. Objetivo
   acompanhar sanity check de volume, erro e latencia de spans HTTP quando `OTEL_INSTRUMENTATION_HTTP_ENABLED=true`
2. Paineis recomendados (lista)
   - volume de spans HTTP por minuto
   - taxa de erro HTTP por classe/status (se suportado)
   - p95 de latencia HTTP por rota/grupo (se suportado)
   - top endpoints normalizados por volume/latencia
3. Filtros recomendados (env/service/version/etc.)
   - `service.name`
   - `deployment_environment`
   - `service.version`
   - metodo HTTP
   - rota normalizada (quando suportado)
4. Queries genericas (exemplos)
   - `count(http spans)`
   - `count(http spans where span.status=error) / count(http spans)`
   - `p95(duration of http spans) grouped by normalized_route`
5. Sinais de atencao (o que observar)
   - volume zerado ou muito abaixo do baseline em ambiente com OTel esperado
   - explosao de volume/custo apos mudanca de sampler ou carga
   - latencia p95 e erro subindo juntos em rotas especificas
6. Cuidados de cardinalidade/seguranca
   - depende de backend com analytics/span metrics; documentar limitacao se nao suportado
   - nao agrupar por URL bruta, query string, headers ou payloads
   - preferir rota normalizada + metodo + status para agregacao estavel

## Alertas recomendados (4E.6, vendor-agnostic)

### `otel_bootstrap_failed`

1. Nome do alerta
   `otel_bootstrap_failed`
2. Condicao/regra (generica)
   detectar warning/log `BOOTSTRAP_FAILED` apos startup/deploy
3. Severidade
   `critical`
4. Impacto provavel
   app continua operando, mas runtime OTel nao sobe (traces/metricas podem sumir)
5. Acao imediata (triagem)
   validar endpoints OTLP, conectividade, warnings de config e erro de exporter/SDK no bootstrap
6. Proximas acoes
   corrigir env/config/rede e reiniciar rollout controlado
7. Como validar recuperacao
   ausencia de novo `BOOTSTRAP_FAILED` no proximo boot + spans/metricas voltando na janela esperada

### `otel_runtime_unexpectedly_disabled`

1. Nome do alerta
   `otel_runtime_unexpectedly_disabled`
2. Condicao/regra (generica)
   warning/log `BOOTSTRAP_DISABLED` em `staging`/`prod` fora de janela de manutencao ou runtime em estado `disabled` quando deveria estar `started`
3. Severidade
   `warning` (elevar para `critical` se persistente em producao)
4. Impacto provavel
   observabilidade OTel fica parcial/ausente por flag ou pre-condicao de bootstrap nao atendida
5. Acao imediata (triagem)
   diferenciar desabilitacao intencional (`OTEL_ENABLED=false`) de misconfig (`missing_traces_endpoint`, endpoint invalido)
6. Proximas acoes
   corrigir flags/endpoints/headers/conectividade e documentar excecao se a desabilitacao for intencional
7. Como validar recuperacao
   runtime volta para `started` (ou excecao registrada) e sinais reaparecem no backend

### `importing_failure_rate_high`

1. Nome do alerta
   `importing_failure_rate_high`
2. Condicao/regra (generica)
   `count(importing.telemetry.runs.finalized where importing.outcome=failure) / count(importing.telemetry.runs.finalized)` acima do baseline/limite (ex.: `> 5%` por `15m`)
3. Severidade
   `warning` (moderado) / `critical` (muito alto ou persistente)
4. Impacto provavel
   importacoes falhando para usuarios; possivel regressao de parser/source/infra
5. Acao imediata (triagem)
   abrir Dashboard 1 e segmentar por `importing.source_kind`, `service.version`, warnings do adapter
6. Proximas acoes
   identificar regressao por release ou input; aplicar rollback/hotfix se necessario
7. Como validar recuperacao
   `failure_rate` retorna ao baseline e distribuicao de `importing.outcome` normaliza

### `importing_run_duration_p95_high`

1. Nome do alerta
   `importing_run_duration_p95_high`
2. Condicao/regra (generica)
   `p95(importing.telemetry.run.duration)` acima do baseline/limite por janela (ex.: `15m`)
3. Severidade
   `warning` (degradacao); `critical` se combinado com falhas/timeouts
4. Impacto provavel
   UX de importacao lenta, risco de timeout e saturacao
5. Acao imediata (triagem)
   abrir Dashboard 2 e comparar `p95(importing.telemetry.step.duration)` por `importing.step_name`
6. Proximas acoes
   investigar regressao de codigo/input/infra e ajustar tuning/capacidade
7. Como validar recuperacao
   p95 (e p50) retornam ao baseline por ambiente

### `importing_adapter_warning_rate_high`

1. Nome do alerta
   `importing_adapter_warning_rate_high`
2. Condicao/regra (generica)
   `count(importing.telemetry.adapter.warnings) / max(1, count(importing.telemetry.runs.finalized))` acima do baseline ou burst por `importing.warning_code`
3. Severidade
   `warning` (elevar para `critical` se houver perda de sinais recorrente)
4. Impacto provavel
   degradacao de observabilidade do importing (telemetria parcial/incompleta)
5. Acao imediata (triagem)
   agrupar por `importing.warning_code` e verificar correlacao com `METRICS_OPERATION_FAILED` / late drops
6. Proximas acoes
   corrigir runtime OTel/meter ou fluxo de lifecycle do adapter
7. Como validar recuperacao
   warning rate retorna a ~0 em steady-state e sem bursts recorrentes

### `importing_adapter_late_drops_detected`

1. Nome do alerta
   `importing_adapter_late_drops_detected`
2. Condicao/regra (generica)
   `count(importing.telemetry.adapter.late_drops) > 0` em janela curta (ex.: `15m`)
3. Severidade
   `warning` (elevar para `critical` se persistente)
4. Impacto provavel
   sequenciamento/lifecycle anormal; observabilidade de runs/steps fica incompleta
5. Acao imediata (triagem)
   verificar `importing.drop_kind`, release recente e padrao de chamadas duplicadas/fora de ordem
6. Proximas acoes
   reproduzir fluxo e corrigir emissao/uso do collector
7. Como validar recuperacao
   late drops zeram em novas execucoes apos correcoes

### `otel_expected_span_volume_anomalous`

1. Nome do alerta
   `otel_expected_span_volume_anomalous`
2. Condicao/regra (generica)
   volume de spans esperados (`importing.pipeline` e/ou spans HTTP) fora da faixa esperada por ambiente (muito baixo ou muito alto)
3. Severidade
   `warning` (elevar para `critical` se combinado com perda de traces do importing em producao)
4. Impacto provavel
   runtime/instrumentacao desabilitada/quebrada, sampler inadequado ou ruido/custo excessivo
5. Acao imediata (triagem)
   validar `BOOTSTRAP_FAILED`/`BOOTSTRAP_DISABLED`/`INSTRUMENTATION_INIT_FAILED`, sampler e volume real de trafego/importacoes
6. Proximas acoes
   corrigir bootstrap/runtime, ajustar sampler ou reduzir temporariamente instrumentacao HTTP
7. Como validar recuperacao
   volume retorna ao baseline esperado sem explosao de cardinalidade/custo

### `otel_shutdown_failed_observed` (opcional)

1. Nome do alerta
   `otel_shutdown_failed_observed`
2. Condicao/regra (generica)
   detectar warning/log `SHUTDOWN_FAILED` apos restart/deploy encerrado de forma controlada
3. Severidade
   `warning` (elevar para `critical` se recorrente em producao)
4. Impacto provavel
   perda de flush final de spans/metricas no encerramento e diagnostico operacional incompleto
5. Acao imediata (triagem)
   verificar contexto de restart/deploy, timeouts e conectividade com collector no shutdown
6. Proximas acoes
   ajustar timeouts/comportamento de encerramento da plataforma e investigar exporter
7. Como validar recuperacao
   encerramentos subsequentes sem `SHUTDOWN_FAILED` recorrente

## Runbook de incidentes (4E.6)

Nota global de seguranca para triagem:

- usar apenas warnings/snapshots seguros (sem copiar valores de headers/tokens)
- compartilhar em tickets/incidentes somente codigos, contagens e flags relevantes

### Incidente: OTel nao subiu, app subiu

- Sintoma
  - app funcional, mas sinais OTel ausentes/parciais; warnings `BOOTSTRAP_FAILED` e/ou `MISSING_OTLP_ENDPOINT`
- Causas provaveis
  - endpoint OTLP invalido/ausente, collector indisponivel, erro de exporter/SDK, misconfig de env
- Verificacoes (checklist)
  - revisar warnings de startup (`CONFIG_WARNING`, `BOOTSTRAP_FAILED`, `MISSING_OTLP_ENDPOINT`, `INVALID_URL`)
  - validar `OTEL_ENABLED=true` e endpoints OTLP traces/metrics
  - validar conectividade do processo para collector/backend
  - confirmar se houve deploy recente com mudanca de env
- Acoes corretivas
  - corrigir env/endpoints/headers/rede
  - reiniciar rollout controlado
  - validar bootstrap apos restart
- Criterios de encerramento
  - runtime volta para estado `started`
  - spans/metricas reaparecem na janela esperada

### Incidente: Runtime OTel desabilitado inesperadamente

- Sintoma
  - warning `BOOTSTRAP_DISABLED` em `staging`/`prod` sem janela de manutencao planejada
- Causas provaveis
  - `OTEL_ENABLED=false` indevido, endpoint de traces ausente/invalido (`missing_traces_endpoint`), configuracao incompleta de rollout
- Verificacoes (checklist)
  - conferir se a desabilitacao era intencional
  - revisar `OTEL_ENABLED` e endpoint de traces
  - verificar warnings de config (`MISSING_OTLP_ENDPOINT`, `INVALID_URL`)
  - confirmar estado do runtime em `debugSnapshot()` se disponivel
- Acoes corretivas
  - corrigir flag/config de endpoint
  - registrar excecao operacional se a desabilitacao for intencional
  - reiniciar rollout controlado quando necessario
- Criterios de encerramento
  - `BOOTSTRAP_DISABLED` deixa de ocorrer de forma inesperada
  - runtime em `started` (ou `disabled` intencionalmente documentado)

### Incidente: Traces nao aparecem no backend

- Sintoma
  - pipeline/importacoes executam, mas traces do importing/HTTP nao aparecem no backend
- Causas provaveis
  - runtime OTel desabilitado/falho, endpoint invalido, sampler muito baixo, collector/backend indisponivel
- Verificacoes (checklist)
  - revisar warnings `BOOTSTRAP_FAILED`, `BOOTSTRAP_DISABLED`, `MISSING_OTLP_ENDPOINT`, `INVALID_URL`
  - validar sampler (`OTEL_TRACES_SAMPLER`, `OTEL_TRACES_SAMPLER_ARG`)
  - confirmar conectividade collector/backend e saude do backend
  - comparar volume esperado de spans (`importing.pipeline` e HTTP) por ambiente
- Acoes corretivas
  - corrigir bootstrap/runtime/endpoints
  - ajustar sampler de forma controlada (especialmente em `staging`)
  - validar collector/backend antes de aumentar volume
- Criterios de encerramento
  - traces reaparecem e queries de sanity check voltam ao baseline
  - alertas de volume anomalo deixam de disparar

### Incidente: Metricas nao aparecem

- Sintoma
  - traces aparecem, mas metricas `importing.telemetry.*` nao aparecem (ou ficam incompletas)
- Causas provaveis
  - `OTEL_METRICS_ENABLED=false`, endpoint de metrics invalido/ausente, collector/backend sem suporte a OTLP metrics
- Verificacoes (checklist)
  - revisar warnings `MISSING_OTLP_METRICS_ENDPOINT` e `INVALID_URL`
  - conferir `OTEL_METRICS_ENABLED` e endpoints OTLP metrics
  - validar suporte a metricas no collector/backend
  - checar se warnings do adapter (`METRICS_OPERATION_FAILED`) aumentaram
- Acoes corretivas
  - habilitar metrics e corrigir endpoint/pipeline de metrics
  - corrigir suporte/config do collector/backend para OTLP metrics
  - revalidar export interval/timeout se houver atraso
- Criterios de encerramento
  - metricas `importing.telemetry.*` visiveis em janela recente
  - warning rate do adapter volta ao baseline

### Incidente: Importing degradou (warnings altos / late drops)

- Sintoma
  - aumento de `importing.telemetry.adapter.warnings` e/ou `importing.telemetry.adapter.late_drops`
- Causas provaveis
  - lifecycle de telemetria fora de ordem, chamadas duplicadas, degradacao do meter/runtime, regressao recente
- Verificacoes (checklist)
  - agrupar warnings por `importing.warning_code`
  - revisar late drops por `importing.drop_kind`
  - correlacionar com `service.version`, deploy recente e throughput
  - verificar se ha aumento simultaneo de `failure_rate` ou latencia
- Acoes corretivas
  - corrigir fluxo de emissao/uso do collector
  - estabilizar runtime/meter OTel
  - aplicar rollback se regressao recente estiver clara
- Criterios de encerramento
  - warnings e late drops retornam ao baseline
  - runs finalizadas e latencias estabilizam

### Incidente: Volume de spans anomalo (baixo/alto)

- Sintoma
  - volume de spans esperados (importing e/ou HTTP) muito abaixo ou acima do baseline do ambiente
- Causas provaveis
  - runtime/instrumentacao desabilitada, sampler agressivo, alteracao de carga real, ruido/cardinalidade elevada
- Verificacoes (checklist)
  - revisar `BOOTSTRAP_FAILED`, `BOOTSTRAP_DISABLED`, `INSTRUMENTATION_INIT_FAILED`
  - conferir `OTEL_INSTRUMENTATION_HTTP_ENABLED` e sampler
  - comparar volume de trafego/importacoes real vs spans
  - checar agregacao por rota normalizada no backend (sem URL bruta)
- Acoes corretivas
  - corrigir bootstrap/runtime/instrumentacao
  - ajustar sampler (`traceidratio`) e filtros de dashboard
  - desligar temporariamente HTTP instrumentation se custo/ruido estiver alto
- Criterios de encerramento
  - volume de spans volta a faixa esperada
  - sem explosao de cardinalidade/custo e sem perda de sinais criticos

### Incidente: Warning de shutdown (`SHUTDOWN_FAILED`)

- Sintoma
  - warning `SHUTDOWN_FAILED` em restart/deploy ou encerramento controlado
- Causas provaveis
  - timeout/falha do exporter, collector indisponivel no shutdown, encerramento abrupto da plataforma
- Verificacoes (checklist)
  - correlacionar com contexto de deploy/restart
  - validar conectividade com collector no momento do shutdown
  - verificar recorrencia (pontual vs frequente)
  - revisar timeouts de traces/metrics/export reader
- Acoes corretivas
  - ajustar timeouts e comportamento de encerramento da plataforma
  - investigar exporter/collector para flush final
  - acompanhar ocorrencias em encerramentos subsequentes
- Criterios de encerramento
  - `SHUTDOWN_FAILED` deixa de ocorrer de forma recorrente
  - encerramentos controlados seguintes completam sem warning

## Calibracao operacional de thresholds / SLOs (4E.7)

Status desta fase:

- baseline real completo de `staging`/`prod` ainda nao esta disponivel de forma confiavel no workspace/ambiente atual
- foi definida uma baseline operacional provisoria versionada em:
  - `infra/observability/calibration/provisional-baseline-thresholds.4e7.yaml`

Principios da calibracao 4E.7:

- usar janelas curtas/medias/longas (`15m` / `7d` / `30d`)
- separar thresholds por ambiente (`staging` vs `production`)
- aplicar gates de volume minimo para evitar falso positivo em baixo throughput
- manter thresholds como config operacional (revisaveis), nao como regra de dominio

Gates de volume minimo (baseline provisoria):

- importing:
  - `>= 20` runs em `15m` antes de alertar `failure_rate` / `run_duration_p95`
- Prisma:
  - `>= 100` operacoes em `15m` para leitura de p95/error rate com confianca minima
- HTTP/span metrics:
  - `>= 200` spans em `15m` para alerta de volume anomalo

Recalibracao futura (planejada na 4E.7):

- reavaliar mensalmente ou apos release/alteracao de carga relevante
- atualizar thresholds a partir de baseline real de `7d`/`30d` mantendo gates de volume
- revisar taxa de falso positivo / falso negativo de alertas e incidentes reais

## Calibracao / alert precision / apply (4E.8)

Status da rodada (2026-02-25):

- baseline 4E.8 foi promovida para artefato versionado de calibracao (`infra/observability/calibration/baseline-thresholds.4e8.yaml`)
- **baseline real completa ainda nao foi aplicada** nesta rodada por ausencia de exportacoes reais `7d`/`30d` de `staging`/`production` no workspace
- thresholds permanecem **provisorios por sinal** (herdados da 4E.7) onde faltam series reais, mas:
  - gates de volume e regras de persistencia foram refinados
  - severidades foram separadas (`warning`/`critical`) para sinais principais
  - cobertura minima de alertas foi ampliada (Prisma + runtime warnings)

Artefatos 4E.8:

- calibracao/baseline:
  - `infra/observability/calibration/baseline-thresholds.4e8.yaml` (status parcial + janelas `15m`/`7d`/`30d` + gates + thresholds revisados)
  - `infra/observability/calibration/naming-compatibility.4e8.yaml` (profiles de naming para backend/collector)
- alertas refinados:
  - `infra/observability/prometheus/alerts/mapia-observability.rules.yaml`
  - `infra/observability/loki/alerts/mapia-otel-runtime.rules.yaml`
- automacao/validacao:
  - `infra/observability/scripts/validate-observability.py`
  - `infra/observability/scripts/apply-observability.py`
  - `infra/observability/scripts/post-apply-smoke.py`

Thresholds/gates revisados (4E.8, ainda provisórios ate baseline real):

- importing:
  - `failure_rate`: warning/critical separados por ambiente (`staging` vs `production`)
  - `run_duration_p95`: regras usam histograma Prometheus com suffix de unidade (`*_milliseconds_bucket`)
  - `adapter_warning_rate`: gate extra por ocorrencias minimas de warning para reduzir ruído
  - `late_drops`: gate de volume antes de alertar
- Prisma:
  - alertas de `error_rate`, `slow_query_rate` e `query_duration_p95`
  - gates de volume (`>=100` warning / `>=300` critical em sinais mais sensiveis)
- spanmetrics (quando ativo):
  - anomalia de volume comparando janela curta vs baseline `7d` + gates de volume + `prerequisite: spanmetrics_enabled`
- runtime OTel (Loki):
  - `BOOTSTRAP_FAILED` continua `critical`
  - `BOOTSTRAP_DISABLED` em `production` ganhou regra de persistencia mais severa
  - `INSTRUMENTATION_INIT_FAILED` passou a ter alerta dedicado
  - `SHUTDOWN_FAILED` foi ajustado para recorrencia (reduz falso positivo em restart isolado)

Compatibilidade de naming real (backend/collector):

- dashboards/rules 4E.8 assumem naming canonico OTel/Prometheus para metricas proprias:
  - exemplos: `importing_telemetry_run_duration_milliseconds_bucket`, `prisma_telemetry_query_duration_milliseconds_bucket`
- divergencias de backend/collector (ex.: spanmetrics `latency` vs `duration_milliseconds`, labels curtos `service/environment/version`) sao tratadas via profile:
  - `infra/observability/calibration/naming-compatibility.4e8.yaml`
  - `infra/observability/scripts/apply-observability.py --profile <profile>`
- validacao do naming final no ambiente alvo deve ser feita antes do apply definitivo com:
  - `infra/observability/scripts/post-apply-smoke.py` (checks remotos opcionais)

Fluxo de apply/provisionamento (4E.8):

- `dry-run` / CI-ready:
  - renderiza bundle com datasource UIDs + profile de naming
  - valida parse de JSON/YAML do bundle renderizado
  - nao copia/aplica em ambiente
- apply filesystem (automatico):
  - copia dashboards/provisioning/rules renderizados para diretorios alvo (Grafana/Prometheus/Loki)
- status de ambiente nao acessivel nesta rodada:
  - scripts e dry-runs entregues; apply real depende de paths/endpoints/credenciais do ambiente alvo

Comandos de referencia (resumo):

- `pnpm observability:validate`
- `pnpm observability:apply:dry-run` (exige UIDs via args/env para render completo realista)
- `pnpm observability:post-apply:smoke` (dry-run local)
- `pnpm observability:evidence:collect:template`
- `pnpm observability:baseline:promote`

## Promocao de baseline / naming / smoke remoto (4E.9)

Status da rodada (2026-02-25, workspace atual):

- foi entregue pipeline de coleta/promocao 4E.9 para:
  - coletar evidencias reais agregadas (`15m` / `7d` / `30d`) por ambiente/sinal
  - promover baseline/naming para artefatos 4E.9 versionados
  - executar smoke pos-apply remoto com relatorio estruturado
- neste workspace, **nao ha endpoints/credenciais configurados** para Grafana/Prometheus/Loki
  - resultado: 4E.9 permanece **parcial** (bloqueio operacional de ambiente), sem promover thresholds finais por sinal

Artefatos 4E.9 adicionados/gerados:

- evidencias:
  - `infra/observability/evidence/README.md`
  - `infra/observability/evidence/observability-evidence.4e9.template.json`
  - `infra/observability/evidence/observability-evidence.4e9.capture.json` (captura local atual com status bloqueado por falta de endpoints)
- calibracao/naming:
  - `infra/observability/calibration/baseline-thresholds.4e9.yaml`
    - thresholds efetivos herdados da 4E.8 com `calibration_state` explicito (`provisional_4e9_inherited_from_4e8_pending_real_evidence`)
    - status granular por ambiente/sinal e janelas de evidencia em `evidence.environments.*.signal_status`
  - `infra/observability/calibration/naming-compatibility.4e9.yaml`
    - metadados de validacao do profile default e referencias de evidencia observada
- tooling:
  - `infra/observability/scripts/collect-observability-evidence.py`
  - `infra/observability/scripts/promote-baseline-4e9.py`
  - `infra/observability/scripts/post-apply-smoke.py` (expandido com validacao de naming/profile + queries de smoke + `--output-report`)

Evidencias reais esperadas (quando houver acesso ao ambiente):

- ambientes: `staging`, `production`
- modo alternativo: `dev_local` (localhost), sem representar `production`
- janelas: `15m` (alerta), `7d` (baseline operacional), `30d` (tendencia)
- sinais minimos:
  - importing: `failure_rate`, `run_duration_p95`, `adapter_warning_rate`, `adapter_late_drops`
  - Prisma: `error_rate`, `slow_query_rate`, `query_duration_p95`
  - spanmetrics: volume (se ativo)
  - runtime OTel (Loki): warnings recorrentes (`BOOTSTRAP_*`, `INSTRUMENTATION_INIT_FAILED`, `SHUTDOWN_FAILED`)
- naming observado:
  - nomes reais de metricas (`*_latency_bucket` vs `*_duration_milliseconds_bucket`)
  - labels de recurso (`deployment_environment` vs `environment`, `service_name` vs `service`)

Profile de naming (4E.9):

- `naming-compatibility.4e9.yaml` passa a ser o arquivo de naming preferido pelos scripts (`4e9` > `4e8`)
- sem evidencia real coletada nesta rodada, o `default_profile` permanece candidato (nao validado no ambiente alvo)
- consolidacao final do profile depende de:
  - coleta real (`collect-observability-evidence.py`)
  - smoke remoto (`post-apply-smoke.py`)
  - promocao do naming (`promote-baseline-4e9.py`)

Fluxo operacional 4E.9 (resumo):

1. Coletar evidencias (ou gerar template)
   - `python infra/observability/scripts/collect-observability-evidence.py --environment-scope staging_prod ...`
   - `python infra/observability/scripts/collect-observability-evidence.py --environment-scope dev_local --grafana-url http://127.0.0.1:3000 --prometheus-url http://127.0.0.1:9090 --loki-url http://127.0.0.1:3100 ...`
   - `pnpm observability:evidence:collect:template`
2. Promover baseline/naming 4E.9
   - `pnpm observability:baseline:promote`
   - opcional dev_local: `python infra/observability/scripts/promote-baseline-4e9.py --environment-scope dev_local --evidence <arquivo>`
3. Render/apply bundle
   - `python infra/observability/scripts/apply-observability.py ...`
4. Smoke remoto com relatorio
   - `python infra/observability/scripts/post-apply-smoke.py ... --output-report <arquivo.json>`

Trade-off 4E.9 (workspace atual):

- o pipeline 4E.9 foi fechado de forma reproduzivel, mas thresholds finais por sinal permanecem provisórios por ausencia de evidencias reais e smoke remoto executado
- nenhuma promocao de threshold foi feita sem evidencias reais e/ou `threshold_decisions` explicitas no arquivo de evidencias

## Readiness de finalizacao / compatibilidade com 4E.9 parcial (4E.10)

Status da rodada (workspace atual):

- a 4E.10 introduz um artefato de readiness/gating infra-only para absorver a conclusao da 4E.9R sem retrabalho:
  - `infra/observability/calibration/finalization-readiness.4e10.yaml`
  - gerado por `infra/observability/scripts/generate-4e10-finalization-readiness.py`
- o artefato **nao promove** thresholds finais nem consolida `default_profile` final sem evidencia real
- dependencias remotas/operacionais permanecem explicitas como `pending_4e9r_real_evidence`

Objetivo da 4E.10 nesta rodada:

- manter compatibilidade com baseline/naming 4E.9 provisórios
- expor estado operacional (thresholds / naming / apply+smoke real) de forma rastreavel
- documentar pontos de acoplamento com a 4E.9R (onde dados reais entram no fluxo)

O que o readiness 4E.10 valida/espelha:

- baseline 4E.9:
  - `evidence.environments.*.signal_status`
  - `thresholds.*.calibration_state`
- naming 4E.9:
  - `validation.status`
  - `validation.final_profile_detected`
  - `validation.final_profile_applied_as_default`
- estado operacional do workspace atual:
  - presenca de endpoints/credenciais/UIDs exigidos para apply/smoke real
  - relatorio de smoke disponivel (local `dry-run` vs remoto real)

Guardrails mantidos (4E.10):

- nao promover threshold final sem evidencia real `15m`/`7d`/`30d`
- nao consolidar `default_profile` final sem naming observado/validado
- quando faltar dado real, marcar `pending_4e9r_real_evidence` em vez de inferir/simular
- manter compatibilidade com `pnpm observability:validate`, `pnpm observability:apply:dry-run` e `pnpm observability:post-apply:smoke`

## Instrumentacao Prisma (4E.7)

Implementacao:

- modulo: `src/server/observability/prisma-otel-instrumentation.ts`
- wiring no singleton Prisma: `src/server/db/client.ts`
- estrategia:
  - middleware do `PrismaClient` (server-side)
  - spans e metricas de baixa cardinalidade por operacao/modelo/outcome
  - fail-safe (falha de observabilidade nao quebra operacao de DB)
  - idempotente no mesmo client (evita middleware duplicado em reload/dev)

Flags/config relevantes:

- `OTEL_INSTRUMENTATION_PRISMA_ENABLED` (default parser: `true`)
- `OTEL_INSTRUMENTATION_PRISMA_SLOW_QUERY_THRESHOLD_MS` (default parser: `250`)
- instrumentacao Prisma so e anexada quando OTel esta habilitado e endpoint de traces esta configurado

Sinais emitidos (4E.7):

- spans:
  - `prisma.<model|raw>.<action>`
- metricas:
  - `prisma.telemetry.operations`
  - `prisma.telemetry.errors`
  - `prisma.telemetry.slow_queries`
  - `prisma.telemetry.query.duration`

Seguranca / cardinalidade:

- sem captura de `args`, payloads, SQL bruto ou parametros de query
- atributos restritos a labels de baixa cardinalidade (`prisma.action`, `prisma.model`, `prisma.outcome`, `prisma.slow_query`)
- erros registrados com tipo/codigo (quando disponivel), sem serializar mensagem completa sensivel

Limitacoes:

- metricas/spans dependem do runtime OTel ativo + backend/collector configurado
- thresholds de latencia/slow query sao provisoriamente calibrados e devem ser revisados por modelo/operacao

## Audit da instrumentacao Next runtime (4E.7)

Resultado da auditoria:

- repo usa Next.js App Router com rotas server-side e runtime Node
- cobertura atual de plataforma com `@opentelemetry/instrumentation-http` + spans do importing ja atende o baseline operacional desta fase
- nao foi adicionada auto-instrumentacao ampla de Next.js nesta rodada

Racional (sem mudanca necessaria nesta fase):

- maior risco de ruido/cardinalidade/custo sem baseline maduro para filtrar spans
- necessidade de preservar naming estavel e evitar captura acidental de payloads/headers
- prioridade da 4E.7 foi instrumentar Prisma + operacionalizar dashboards/alertas as code

Reavaliacao futura:

- ver pendencias consolidadas de 4E.10+ no backlog/ADR (incluindo reavaliacao de instrumentacao adicional de Next runtime) (`pending_4e9r_real_evidence`)

## Tuning avancado OTel (4E.7)

Implementado nesta fase:

- metric views OTel (buckets explicitos de histogramas) para:
  - `importing.telemetry.run.duration`
  - `importing.telemetry.step.duration`
  - `prisma.telemetry.query.duration`
- flag reversivel por config:
  - `OTEL_METRIC_VIEWS_ENABLED` (default: `true`)

Objetivo do tuning:

- buckets de latencia mais previsiveis para p95/p99 e alertas
- comparabilidade entre ambientes e releases
- menor dependencia de defaults do backend/export pipeline

Sampler/tuning por ambiente (4E.7):

- manter sampler controlado por env (`OTEL_TRACES_SAMPLER`, `OTEL_TRACES_SAMPLER_ARG`)
- `development`: `always_on` para debug local
- `staging`/`production`: `traceidratio` com ajuste por volume/custo

Timeouts, retry e backoff:

- timeouts de traces/metrics e intervalos de export continuam configuraveis por env (`OTEL_EXPORTER_OTLP_*_TIMEOUT`, `OTEL_METRIC_EXPORT_*`, `OTEL_BSP_*`)
- retry/backoff de exportacao nao foi customizado no runtime nesta fase
  - racional: manter runtime simples e delegar retry/backoff ao collector/backend (camada operacional mais apropriada)

Trade-off:

- runtime permanece conservador e reversivel por config
- tuning mais agressivo (temporality custom/retry/backoff no app) fica para iteracao futura se houver necessidade comprovada

## Dashboards / Alerting as Code (4E.7 -> 4E.9)

Artefatos versionados (apply-ready / apply-pendente de ambiente):

- baseline/calibracao:
  - `infra/observability/calibration/provisional-baseline-thresholds.4e7.yaml`
  - `infra/observability/calibration/baseline-thresholds.4e8.yaml` (status parcial / pendente de baseline real)
  - `infra/observability/calibration/naming-compatibility.4e8.yaml` (profiles de naming backend/collector)
  - `infra/observability/calibration/baseline-thresholds.4e9.yaml` (promocao 4E.9, parcial por bloqueio de evidencias reais no workspace)
  - `infra/observability/calibration/naming-compatibility.4e9.yaml` (metadados de validacao do naming/profile)
  - `infra/observability/evidence/observability-evidence.4e9.template.json`
  - `infra/observability/evidence/observability-evidence.4e9.capture.json`
- dashboards Grafana (equivalentes aos 4 da 4E.6):
  - `infra/observability/grafana/dashboards/mapia-dashboard-1-importing-health.json`
  - `infra/observability/grafana/dashboards/mapia-dashboard-2-importing-performance.json`
  - `infra/observability/grafana/dashboards/mapia-dashboard-3-otel-runtime-warnings.json`
  - `infra/observability/grafana/dashboards/mapia-dashboard-4-http-platform-overview.json`
- provisioning Grafana (filesystem dashboards):
  - `infra/observability/grafana/provisioning/dashboards/mapia-observability.yaml`
- alerting as code:
  - `infra/observability/prometheus/alerts/mapia-observability.rules.yaml` (metric/spanmetrics alerts)
  - `infra/observability/loki/alerts/mapia-otel-runtime.rules.yaml` (runtime warning alerts)
- instrucoes e prerequisitos:
  - `infra/observability/README.md`
- scripts de render/apply/validate/smoke/evidencias (4E.8 -> 4E.9):
  - `infra/observability/scripts/validate-observability.py`
  - `infra/observability/scripts/apply-observability.py`
  - `infra/observability/scripts/post-apply-smoke.py`
  - `infra/observability/scripts/collect-observability-evidence.py`
  - `infra/observability/scripts/promote-baseline-4e9.py`

Status de provisionamento:

- artefatos foram versionados e preparados para apply
- na 4E.8, rules foram refinadas para precisao operacional (gates/persistencia/severidade) e cobertura Prisma/runtime ampliada
- na 4E.9, pipeline de evidencias/promocao/smoke remoto foi versionado para fechar a promocao de baseline/naming quando o ambiente alvo estiver acessivel
- apply real depende de ambiente externo (Grafana/Prometheus/Loki + datasources/pipelines)
- compatibilidade de naming do collector/backend permanece parametrizada por profile versionado (4E.8) e ganhou metadados de validacao observada em `calibration/naming-compatibility.4e9.yaml`

## Notas de hardening (4E.2 -> 4E.9)

- 4E.2:
  - runtime OTel real (NodeSDK/OTLP traces+metrics) + parser leniente + provider do importing
- 4E.3:
  - hardening da state machine/runtime (`shutdown` concorrente + diagnostico `shutdownInFlight`)
  - memoizacao terminal e reuse de fallback no provider
- 4E.4:
  - bootstrap server-side padronizado (`ensureServerOpenTelemetryRuntimeStarted()`)
  - memoizacao de bootstrap para evitar `start()` repetido no entrypoint/container
  - padronizacao da regra de memoizacao de `runtime.start()` em helper reutilizavel
  - consolidacao de docs operacionais/troubleshooting
- 4E.5:
  - instrumentacao HTTP server-side opcional no runtime OTel (com fallback seguro)
  - guidance de tuning por ambiente (dev/staging/prod)
  - convencoes de naming (spans/metricas/atributos) documentadas
  - troubleshooting expandido por sintoma/causa/acao
- 4E.6:
  - SLIs/SLOs iniciais vendor-agnostic para importing/runtime/HTTP
  - dashboards minimos documentados (health/performance/runtime/http)
  - alertas recomendados com severidade e acao
  - runbook de incidentes expandido e orientado a triagem
- 4E.7:
  - calibracao operacional provisoria de thresholds/SLOs com baseline versionada e gates de volume
  - instrumentacao Prisma server-side (manual, fail-safe, baixa cardinalidade, sem SQL/args)
  - metric views OTel para histogramas de latencia (importing + Prisma) com flag de disable
  - dashboards/alerting as code versionados (Grafana + Prometheus + Loki), com apply pendente de ambiente
- 4E.8:
  - refinamento de alert precision (gates, persistencia, severidade, cobertura Prisma/runtime/spanmetrics)
  - compatibilidade de naming backend/collector via profiles operacionais (sem alterar dominio)
  - automacao versionada de render/apply/dry-run/validacao pos-apply em `infra/observability/scripts/*`
  - baseline 4E.8 consolidada como artefato operacional, com status parcial explicito por falta de dados reais no workspace
- 4E.9:
  - coleta/ingestao de evidencias reais agregadas (`15m`/`7d`/`30d`) por script versionado
  - promocao automatizada de baseline/naming 4E.9 a partir de evidencias (sem auto-promover threshold sem evidencias/decisao explicita)
  - smoke pos-apply remoto expandido (Grafana/Prometheus/Loki + validacao de profile/naming + queries por familia de sinais)
  - revisao de artefatos operacionais para fase 4E.9 sem alterar dominio/importing/use-cases
  - 4E.9R.2 (hardening operacional):
    - suporte a `--env-file` (`merge`/`override`) nos scripts de gate/coleta/apply/smoke
    - prioridade de conflito por chave critica via `--env-file-priority` (default `envfile` para execucao deterministica)
    - bloqueio explicito de placeholders no env-file
    - autodiscovery de datasource UIDs no Grafana (`discover-grafana-datasource-uids.py`) e uso em memoria no gate/orquestrador quando UIDs nao estiverem definidos
    - orquestrador unico `infra/observability/scripts/run-4e9r-real.py` com STOP CONDITION no gate
    - run report JSON sem serializacao de segredos

## Checklist de rollout (dev/prod)

Minimo para traces:

1. `OTEL_ENABLED=true`
2. `OTEL_EXPORTER_OTLP_ENDPOINT` **ou** `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`
3. `OTEL_SERVICE_NAME` definido para o servico (recomendado)

Minimo para metrics:

1. `OTEL_METRICS_ENABLED=true`
2. `OTEL_EXPORTER_OTLP_ENDPOINT` (derivacao) **ou** `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`

Boas praticas:

1. Ajustar `OTEL_DEPLOYMENT_ENVIRONMENT` (`development`, `staging`, `production`)
2. Validar warnings na subida (sem inspecionar valores de headers)
3. Confirmar se `OTEL_INSTRUMENTATION_HTTP_ENABLED` e `OTEL_INSTRUMENTATION_PRISMA_ENABLED` devem ficar ligados no ambiente alvo
4. Confirmar traces e metricas no collector/backend antes de aumentar sampling/tuning
5. Manter `OTEL_METRIC_VIEWS_ENABLED=true` salvo troubleshooting especifico de backend

## Checklist de validacao pos-deploy

1. Conferir warnings do runtime (sem valores sensiveis) e ausencia de `BOOTSTRAP_FAILED`
2. Confirmar spans do importing (`importing.pipeline` + child spans) no backend
3. Confirmar metricas `importing.telemetry.*` com cardinalidade esperada
4. Validar spans/metricas Prisma (se `OTEL_INSTRUMENTATION_PRISMA_ENABLED=true`) sem SQL/args sensiveis
5. Validar spans HTTP de plataforma (se `OTEL_INSTRUMENTATION_HTTP_ENABLED=true`)
6. Revisar volume de traces vs sampler configurado
7. Confirmar dashboards/alerts as code aplicados (ou status de apply pendente documentado)
8. Executar `infra/observability/scripts/post-apply-smoke.py` (dry-run ou remoto) e registrar resultado (`--output-report` quando remoto)
9. Coletar evidencias agregadas com `infra/observability/scripts/collect-observability-evidence.py` (`--environment-scope staging_prod` ou `--environment-scope dev_local`) e revisar status por ambiente/sinal (`15m`/`7d`/`30d`)
10. Promover baseline/naming com `infra/observability/scripts/promote-baseline-4e9.py` e confirmar se thresholds/profile foram promovidos ou mantidos provisórios com motivo
11. Confirmar profile de naming aplicado (`calibration/naming-compatibility.4e9.yaml` quando existir; fallback 4E.8) corresponde ao backend/collector real
