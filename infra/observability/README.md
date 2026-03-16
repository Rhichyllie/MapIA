# Observability As Code (4E.9 + 4E.10 readiness)

Status da rodada (workspace atual)
- Pipeline 4E.9 de coleta/promocao foi entregue e versionado (evidências -> baseline/naming -> apply/smoke).
- `baseline-thresholds.4e9.yaml` e `naming-compatibility.4e9.yaml` foram gerados com status **parcial/bloqueado**, herdando thresholds da 4E.8.
- Bloqueio atual do workspace: sem endpoints/credenciais de Grafana/Prometheus/Loki configurados para coleta real e smoke remoto.
- 4E.10 adiciona um artefato de readiness/finalização compatível com este estado, marcando dependência explícita `pending_4e9r_real_evidence`.

Artefatos principais
- Baseline/calibração:
  - `calibration/provisional-baseline-thresholds.4e7.yaml`
  - `calibration/baseline-thresholds.4e8.yaml` (baseline parcial da 4E.8)
  - `calibration/baseline-thresholds.4e9.yaml` (promoção 4E.9 com status por ambiente/sinal)
  - `calibration/finalization-readiness.4e10.yaml` (gating/readiness para promoção final, compatível com baseline/naming provisórios)
- Naming:
  - `calibration/naming-compatibility.4e8.yaml`
  - `calibration/naming-compatibility.4e9.yaml` (metadados de validação/observação de naming)
- Evidências:
  - `evidence/observability-evidence.4e9.template.json`
  - `evidence/observability-evidence.4e9.capture.json` (captura atual; no workspace está bloqueada por falta de endpoints)
  - `evidence/README.md`
- Dashboards/alerts:
  - `grafana/dashboards/*.json` (tags/versionamento revisados na 4E.9)
  - `prometheus/alerts/mapia-observability.rules.yaml`
  - `loki/alerts/mapia-otel-runtime.rules.yaml`
- Tooling:
  - `scripts/validate-observability.py`
  - `scripts/check-4e9r-preconditions.py` (gate anti-loop / stop condition para 4E.9R REAL)
  - `scripts/apply-observability.py`
  - `scripts/post-apply-smoke.py` (4E.9: relatório + validação de profile/naming + queries de smoke)
  - `scripts/collect-observability-evidence.py` (4E.9)
  - `scripts/promote-baseline-4e9.py` (4E.9)

Resumo do que mudou na 4E.9
- Coleta de evidências agregadas (15m/7d/30d) por ambiente/sinal via script, sem segredos hardcoded.
- Promoção automatizada de baseline/naming para artefatos 4E.9 com status granular por ambiente/sinal.
- Smoke pós-apply fortalecido com:
  - relatório JSON opcional
  - validação de profile de naming (labels + métricas)
  - queries de smoke por família de sinais (importing / Prisma / spanmetrics / runtime Loki)
- `apply`/`render` continuam compatíveis e agora usam automaticamente o naming file mais recente (4E.9 > 4E.8).

Runbook 4E.9R REAL (anti-loop / stop condition)
- Regra obrigatória: se o gate de precondições falhar, **não** executar `collect/apply/smoke` e **não** gerar novos attempt artifacts timestampados. Corrija o ambiente primeiro.
- Checklist mínimo antes da 4E.9R REAL:
  - `GRAFANA_URL`, `PROMETHEUS_URL`, `LOKI_URL`
  - `GRAFANA_API_TOKEN`
  - `MAPIA_DS_PROMETHEUS_UID`, `MAPIA_DS_LOKI_UID`
  - destinos do apply filesystem:
    - `--grafana-dashboards-dir`
    - `--grafana-provisioning-dir`
    - `--prometheus-rules-dir`
    - `--loki-rules-dir`

0. Preparar env-file local (recomendado para eliminar dependencia da sessao shell)
- Crie `infra/observability/.env.4e9r.local` (arquivo local, nunca versionar).
- Formato: `KEY=VALUE` por linha, com suporte a comentários (`#`) e linhas vazias.
- Placeholders (`<...>`, `changeme`, `placeholder`, `replace_me`, etc.) bloqueiam gate/execucao.

Exemplo (placeholders intencionais para editar antes de executar):
```dotenv
# Nao commitar este arquivo
GRAFANA_URL=<grafana-url-real>
PROMETHEUS_URL=<prometheus-url-real>
LOKI_URL=<loki-url-real>
GRAFANA_API_TOKEN=<grafana-api-token-real>
MAPIA_DS_PROMETHEUS_UID=<grafana-prometheus-datasource-uid-real>
MAPIA_DS_LOKI_UID=<grafana-loki-datasource-uid-real>
```

Opcional (reduzir atrito no `dev_local`): autodiscovery de datasource UIDs no Grafana
```powershell
pnpm observability:datasources:discover -- `
  --grafana-url http://127.0.0.1:3000 `
  --grafana-token-env GRAFANA_API_TOKEN
```
- O script lista datasources por `uid/type/name` e identifica Prometheus/Loki por `type` e/ou `name`.
- O gate 4E.9R também tenta autodiscovery quando UIDs estiverem ausentes (somente em memória, sem gravar arquivo).

Comando unico recomendado (4E.9R REAL, com stop condition):
```powershell
pnpm observability:4e9r:run -- `
  --env-file infra/observability/.env.4e9r.local `
  --env-file-mode merge `
  --env-file-priority envfile `
  --grafana-dashboards-dir C:\observability\grafana\dashboards `
  --grafana-provisioning-dir C:\observability\grafana\provisioning\dashboards `
  --prometheus-rules-dir C:\observability\prometheus\rules `
  --loki-rules-dir C:\observability\loki\rules
```

Modo alternativo `dev_local` (localhost real, sem afirmar staging/producao):
- Coleta evidencias somente em `dev_local`.
- Baseline/naming/readiness marcam status explicito de escopo local (`dev_local_real_evidence`).
- Recomendado quando staging/producao nao existem no ambiente atual.
- O stack `infra/observability/dev_local/docker-compose.yml` sobe `grafana`, `prometheus`, `loki`, `otel-collector`, `mapia-metrics-seed`, `mapia-logs-seed` e `promtail`.
- O seed serve para aquecer o catalogo do Prometheus com series zeradas e compativeis com os dashboards 4E.9, sem depender do app rodando.
- O seed de logs escreve linhas deterministicas em arquivo compartilhado e o `promtail` envia esse arquivo para o Loki, garantindo ao menos um stream consultavel e labels estaveis (`deployment_environment=dev_local`, `service_name=mapia-dev-local-seed`, `service_version=0.0.0-dev`).
- Para telemetria real, rode o MapIA enviando OTLP para `http://127.0.0.1:4318` (HTTP) ou `127.0.0.1:4317` (gRPC).

```powershell
pnpm observability:4e9r:run:dev-local -- `
  --env-file infra/observability/.env.4e9r.local `
  --env-file-mode merge `
  --env-file-priority envfile `
  --grafana-dashboards-dir C:\observability\grafana\dashboards `
  --grafana-provisioning-dir C:\observability\grafana\provisioning\dashboards `
  --prometheus-rules-dir C:\observability\prometheus\rules `
  --loki-rules-dir C:\observability\loki\rules
```

Semantica de prioridade (chaves criticas):
- `--env-file-priority envfile` (default): valores do env-file sobrescrevem env existente para evitar drift/sessao suja.
- `--env-file-priority env`: mantem valor ja presente no ambiente quando houver conflito.

Observacao de policy para artefatos:
- `infra/observability/.env*.local` deve permanecer ignorado no Git.
- `infra/observability/evidence/*preconditions*.json` pode ser ignorado para evitar ruido operacional.
- Se seu fluxo exigir versionar algum artefato de precondicoes, remova/ajuste a regra local de `.gitignore` antes do commit.

Como validar logs no Loki (dev_local):
- Readiness do Loki:
  `Invoke-RestMethod "http://127.0.0.1:3100/ready"`
- Verificar labels presentes:
  `Invoke-RestMethod "http://127.0.0.1:3100/loki/api/v1/labels"`
- Verificar streams do seed (janela ultimos 5 minutos):
  `$end = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() * 1000000000`
  `$start = ([DateTimeOffset]::UtcNow.AddMinutes(-5).ToUnixTimeSeconds()) * 1000000000`
  `$uri = "http://127.0.0.1:3100/loki/api/v1/query_range?query=%7Bservice_name%3D%22mapia-dev-local-seed%22%7D&limit=1&start=$start&end=$end"`
  `$result = Invoke-RestMethod $uri`
  `Write-Host ("streams=" + @($result.data.result).Count)`

Trilha B - Polimento enterprise (opcional):
- O compose `dev_local` define healthchecks para `grafana`, `prometheus`, `loki`, `otel-collector`, `mapia-metrics-seed`, `mapia-logs-seed` e `promtail`. O fluxo recomendado e verificar `docker compose ps` e esperar status `healthy` antes de rodar o pipeline.
- Readiness manual:
  `Invoke-RestMethod "http://127.0.0.1:9090/-/ready"`
  `Invoke-RestMethod "http://127.0.0.1:3100/ready"`
  `Invoke-RestMethod "http://127.0.0.1:3001/api/health" -Headers @{ Authorization = "Bearer $env:GRAFANA_API_TOKEN" }`
  `Invoke-RestMethod "http://127.0.0.1:13133/"`
- O `otel-collector` expõe `13133` no host para readiness manual. Como a imagem do collector e minimalista e nao inclui shell/wget/curl, o healthcheck interno usa `otelcol-contrib validate` como fallback seguro; a verificacao HTTP do endpoint continua disponivel externamente.
- Budgets de recursos estao documentados no `docker-compose.yml` via `deploy.resources.limits`:
  `grafana`, `prometheus`, `loki`: 512M / 1.0 CPU
  `otel-collector`: 256M / 0.5 CPU
  `promtail`: 128M / 0.25 CPU
  `mapia-metrics-seed`, `mapia-logs-seed`: 64M / 0.1 CPU
- Retencao explicita local:
  Prometheus continua em `7d` via `--storage.tsdb.retention.time=7d`
  Loki agora declara `retention_period: 168h` (7d) em `infra/observability/dev_local/loki/loki-config.yml`, com `compactor.retention_enabled: true`

Comandos de validacao rapida (Trilha B):
- `docker compose -f infra/observability/dev_local/docker-compose.yml up -d`
- `docker compose -f infra/observability/dev_local/docker-compose.yml ps`
- `Invoke-RestMethod "http://127.0.0.1:9090/-/ready"`
- `Invoke-RestMethod "http://127.0.0.1:3100/ready"`
- `Invoke-RestMethod "http://127.0.0.1:3001/api/health" -Headers @{ Authorization = "Bearer $env:GRAFANA_API_TOKEN" }`
- `Invoke-RestMethod "http://127.0.0.1:13133/"`

Fallback (quando optar por nao usar env-file):
```powershell
$env:GRAFANA_URL = 'https://grafana.<ambiente>.interna'
$env:PROMETHEUS_URL = 'https://prometheus.<ambiente>.interna'
$env:LOKI_URL = 'https://loki.<ambiente>.interna'
$env:GRAFANA_API_TOKEN = '<token-grafana>'
$env:MAPIA_DS_PROMETHEUS_UID = '<uid-prometheus>'
$env:MAPIA_DS_LOKI_UID = '<uid-loki>'
```

1. Gate de precondições 4E.9R REAL (STOP CONDITION)
```powershell
pnpm observability:4e9r:preconditions -- `
  --env-file infra/observability/.env.4e9r.local `
  --grafana-dashboards-dir C:\observability\grafana\dashboards `
  --grafana-provisioning-dir C:\observability\grafana\provisioning\dashboards `
  --prometheus-rules-dir C:\observability\prometheus\rules `
  --loki-rules-dir C:\observability\loki\rules `
  --output-report infra/observability/evidence/4e9r-preconditions.report.json
```
- Se retornar exit code `!= 0` / `blocked_preconditions_missing`:
  - pare aqui;
  - não rode coleta/apply/smoke;
  - corrija env vars/UIDs/destinos e rerode o gate.

2. Validar artefatos locais
```powershell
pnpm observability:validate
```

3. Coletar evidências reais (agregadas)
```powershell
python infra/observability/scripts/collect-observability-evidence.py `
  --env-file infra/observability/.env.4e9r.local `
  --grafana-url https://grafana.example.com `
  --prometheus-url https://prometheus.example.com `
  --loki-url https://loki.example.com `
  --profile otel_collector_prometheus_tempo_latency `
  --output infra/observability/evidence/observability-evidence.4e9.capture.json
```

3.b Coletar evidências em escopo dev-local (localhost)
```powershell
python infra/observability/scripts/collect-observability-evidence.py `
  --environment-scope dev_local `
  --env-file infra/observability/.env.4e9r.local `
  --grafana-url http://127.0.0.1:3000 `
  --prometheus-url http://127.0.0.1:9090 `
  --loki-url http://127.0.0.1:3100 `
  --output infra/observability/evidence/observability-evidence.4e9.capture.json
```

4. Promover baseline/naming 4E.9 (com evidências)
```powershell
python infra/observability/scripts/promote-baseline-4e9.py `
  --evidence infra/observability/evidence/observability-evidence.4e9.capture.json
```

5. Render/apply do bundle
```powershell
python infra/observability/scripts/apply-observability.py `
  --env-file infra/observability/.env.4e9r.local `
  --datasource-prometheus-uid <PROM_UID> `
  --datasource-loki-uid <LOKI_UID> `
  --profile otel_collector_prometheus_tempo_latency `
  --grafana-dashboards-dir <path-dashboard-files> `
  --grafana-provisioning-dir <path-provisioning-dashboards> `
  --prometheus-rules-dir <path-prometheus-rules> `
  --loki-rules-dir <path-loki-rules>
```

6. Smoke remoto pós-apply (com relatório)
```powershell
python infra/observability/scripts/post-apply-smoke.py `
  --env-file infra/observability/.env.4e9r.local `
  --grafana-url https://grafana.example.com `
  --prometheus-url https://prometheus.example.com `
  --loki-url https://loki.example.com `
  --profile otel_collector_prometheus_tempo_latency `
  --output-report infra/observability/evidence/post-apply-smoke.4e9.report.json
```

Fluxo sem acesso ao ambiente (estado deste workspace)
- Template de evidências:
```powershell
pnpm observability:evidence:collect:template
```
- Captura local bloqueada (registra ausência de endpoints):
```powershell
python infra/observability/scripts/collect-observability-evidence.py
```
- Promoção 4E.9 parcial (mantém thresholds herdados da 4E.8 com status explícito):
```powershell
pnpm observability:baseline:promote
```
- Smoke local (dry-run):
```powershell
pnpm observability:post-apply:smoke
```

Readiness 4E.10 (compatibilidade com 4E.9 parcial)
- Gera artefato operacional de readiness para absorver a conclusão da 4E.9R sem retrabalho:
```powershell
python infra/observability/scripts/generate-4e10-finalization-readiness.py
```
- Saída padrão:
  - `infra/observability/calibration/finalization-readiness.4e10.yaml`
- O artefato:
  - respeita `calibration_state` provisório da 4E.9 por ambiente
  - não promove thresholds finais sem evidência real
  - não consolida `default_profile` final sem naming observado real
  - marca bloqueios como `pending_4e9r_real_evidence` (thresholds / naming / apply+smoke real)
- Modo estrito (falha se ainda houver dependências reais pendentes):
```powershell
python infra/observability/scripts/generate-4e10-finalization-readiness.py --strict-ready
```

Observações de naming/profile (4E.9)
- `naming-compatibility.4e9.yaml` mantém profiles alternativos e adiciona metadados de validação.
- Sem evidência real, o `default_profile` permanece candidato (não validado no ambiente alvo).
- O profile final deve ser consolidado após coleta real + smoke remoto + verificação de métricas/labels observados.

Segurança e cardinalidade (guardrails)
- Não registrar headers/tokens/payloads/query strings/SQL bruto/IDs dinâmicos nas evidências.
- Evidências devem ser agregadas por janela e ambiente.
- Vendor lock-in continua restrito a `infra/observability/*` e tooling operacional.

Rollback operacional (apply filesystem)
- O `apply-observability.py` faz cópia por filesystem e não mantém histórico automaticamente.
- Antes de aplicar em ambiente real, faça backup timestampado dos diretórios de destino (dashboards/provisioning/rules) em um bundle local/compartilhado.
- Rollback curto/reproduzível:
  1. parar/restringir reload automático do componente afetado (Grafana/Prometheus/Loki) se necessário;
  2. restaurar o backup anterior para os mesmos diretórios de destino;
  3. recarregar provisioning/rules do serviço;
  4. executar `post-apply-smoke.py` para confirmar retorno ao estado anterior.
- Mantenha no registro operacional o caminho do bundle aplicado e do backup usado no rollback (sem segredos).

## Validação rápida (Prometheus targets UP)

Com o stack `dev_local` rodando, valide que os targets estão **UP**:

```powershell
$targets = Invoke-RestMethod "$env:PROMETHEUS_URL/api/v1/targets"
$targets.data.activeTargets |
  Select-Object job, scrapeUrl, health, lastScrape, lastScrapeDuration |
  Sort-Object job
