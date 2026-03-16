# Evidências Operacionais (4E.9)

Objetivo
- Registrar evidências reais agregadas (seguras) de `staging`/`production` para promoção de baseline e validação de naming/backend/collector.
- Em modo alternativo, permitir escopo `dev_local` (localhost real) sem afirmar cobertura de `production`.
- Servir de entrada para `infra/observability/scripts/promote-baseline-4e9.py`.

Arquivos esperados
- `observability-evidence.4e9.template.json`
  - template versionado (sem dados reais)
- `observability-evidence.4e9.capture.json`
  - captura agregada gerada por script (não versionar se contiver contexto operacional sensível interno)
- `observability-evidence.4e9.sample.json` (opcional)
  - amostra sanitizada para testes de pipeline (sem valores reais se não autorizado)

Coleta automatizada (quando houver endpoints/credenciais)
```powershell
python infra/observability/scripts/collect-observability-evidence.py `
  --environment-scope staging_prod `
  --prometheus-url https://prometheus.example.com `
  --loki-url https://loki.example.com `
  --grafana-url https://grafana.example.com `
  --profile otel_collector_prometheus_tempo_latency `
  --output infra/observability/evidence/observability-evidence.4e9.capture.json
```

Coleta `dev_local` (localhost real, sem serviços remotos de staging/prod)
```powershell
python infra/observability/scripts/collect-observability-evidence.py `
  --environment-scope dev_local `
  --prometheus-url http://127.0.0.1:9090 `
  --loki-url http://127.0.0.1:3100 `
  --grafana-url http://127.0.0.1:3000 `
  --output infra/observability/evidence/observability-evidence.4e9.capture.json
```

Template (sem acesso a endpoints)
```powershell
python infra/observability/scripts/collect-observability-evidence.py `
  --template-only `
  --output infra/observability/evidence/observability-evidence.4e9.capture.json
```

Promoção de baseline/naming (com evidências)
```powershell
python infra/observability/scripts/promote-baseline-4e9.py `
  --environment-scope staging_prod `
  --evidence infra/observability/evidence/observability-evidence.4e9.capture.json
```

Regras de segurança (hard)
- Somente dados agregados (`15m`, `7d`, `30d`) por ambiente/sinal.
- Não registrar headers/tokens/payloads/query strings/SQL bruto/IDs dinâmicos.
- Não versionar tokens nem URLs privadas com credenciais embutidas.
- Para Loki, registrar contagens agregadas por código/janela, não linhas de log.

Matriz de completude (ambiente x sinal x janela)
- A matriz deve ser derivada de `signals.<ambiente>.<sinal>.windows` no JSON de evidências e consolidada em `calibration/baseline-thresholds.4e9.yaml` (`evidence.environments.*.signal_status`).
- Status esperado por sinal:
  - `evidence_present_all_windows` (15m/7d/30d presentes)
  - `evidence_partial` (algumas janelas presentes)
  - `no_data_or_query_error` / `not_collected` (ausente/bloqueado)
- Não inventar valores para completar matriz; registrar ausência/bloqueio explicitamente.
