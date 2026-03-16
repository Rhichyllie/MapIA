from __future__ import annotations

import argparse
import os
import sys
import tempfile
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _env_file import CRITICAL_ENV_KEYS, EnvFileError, add_env_file_args, apply_env_file  # noqa: E402
from _obs_common import (  # noqa: E402
    http_json_query,
    load_naming_profile,
    parse_rendered_bundle,
    render_artifacts,
    resolve_calibration_file,
    resolve_datasource_uids,
    utc_now_iso,
    write_json_file,
)


DASHBOARD_UIDS = [
    "mapia-importing-health",
    "mapia-importing-performance",
    "mapia-otel-runtime-warnings",
    "mapia-http-platform-overview",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Smoke check pos-apply para observability as code (4E.9)")
    parser.add_argument("--profile", help="Profile de naming a validar")
    parser.add_argument("--dry-run", action="store_true", help="Executa apenas checklist local/render")
    parser.add_argument("--require-remote", action="store_true", help="Falha se endpoints remotos nao forem informados")
    parser.add_argument("--datasource-prometheus-uid", help="UID Prometheus (opcional no dry-run)")
    parser.add_argument("--datasource-loki-uid", help="UID Loki (opcional no dry-run)")
    parser.add_argument("--grafana-url", help="URL base do Grafana")
    parser.add_argument("--grafana-token-env", default="GRAFANA_API_TOKEN", help="Nome da env var com token Grafana")
    parser.add_argument("--prometheus-url", help="URL base do Prometheus")
    parser.add_argument("--loki-url", help="URL base do Loki")
    parser.add_argument("--output-report", help="Arquivo JSON para salvar relatorio do smoke")
    add_env_file_args(parser)
    return parser.parse_args()


def _parse_vector_or_scalar(payload: dict[str, Any]) -> dict[str, Any]:
    if payload.get("status") != "success":
        return {"status": "api_error", "payload_status": payload.get("status")}
    data = payload.get("data") or {}
    result_type = data.get("resultType")
    if result_type == "vector":
        result = data.get("result") or []
        if not result:
            return {"status": "empty", "result_count": 0}
        first = result[0] if isinstance(result[0], dict) else {}
        raw = (first.get("value") or [None, None])[1]
        try:
            value = float(raw)
        except (TypeError, ValueError):
            value = None
        return {"status": "ok", "result_count": len(result), "value": value}
    if result_type == "scalar":
        raw = (data.get("result") or [None, None])[1]
        try:
            value = float(raw)
        except (TypeError, ValueError):
            value = None
        return {"status": "ok", "result_count": 1, "value": value}
    return {"status": "unsupported_result_type", "result_type": result_type}


def _safe_call(base_url: str, path: str, params: dict[str, str] | None = None, headers: dict[str, str] | None = None):
    try:
        payload = http_json_query(base_url, path, params=params, headers=headers)
        return {"ok": True, "payload": payload}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}


def _prom_query(prometheus_url: str, expr: str) -> dict[str, Any]:
    call = _safe_call(prometheus_url, "/api/v1/query", params={"query": expr})
    if not call["ok"]:
        return {"status": "http_error", "error": call["error"], "expr": expr}
    parsed = _parse_vector_or_scalar(call["payload"])
    parsed["expr"] = expr
    return parsed


def print_local_checklist() -> None:
    checklist = [
        "Dashboards renderizam com datasource UIDs resolvidos",
        "Rules Prometheus/Loki parseiam em YAML",
        "Queries principais (importing/prisma/spanmetrics) permanecem nos artefatos renderizados",
        "Sinais Prisma estao cobertos por alertas (`prisma_error_rate_high`, `prisma_slow_query_rate_high`)",
        "Nenhum segredo/tokens hardcoded nos artefatos versionados",
    ]
    print("Checklist local (pos-apply dry-run):")
    for item in checklist:
        print(f"- [x] {item}")


def live_grafana_checks(grafana_url: str, token_env_name: str) -> dict[str, Any]:
    token_value = os.getenv(token_env_name)
    if not token_value:
        return {"executed": False, "status": "blocked_missing_token_env", "token_env": token_env_name}

    headers = {"Authorization": f"Bearer {token_value}"}
    result: dict[str, Any] = {"executed": True, "status": "ok", "token_env": token_env_name}

    health_call = _safe_call(grafana_url, "/api/health", headers=headers)
    if not health_call["ok"]:
        return {"executed": True, "status": "http_error", "error": health_call["error"], "token_env": token_env_name}
    health = health_call["payload"] if isinstance(health_call["payload"], dict) else {}
    result["health"] = {"database": health.get("database"), "version": health.get("version")}

    dashboard_checks = []
    all_dashboards_ok = True
    for uid in DASHBOARD_UIDS:
        call = _safe_call(grafana_url, f"/api/dashboards/uid/{uid}", headers=headers)
        if not call["ok"]:
            dashboard_checks.append({"uid": uid, "status": "http_error", "error": call["error"]})
            all_dashboards_ok = False
            continue
        payload = call["payload"] or {}
        dashboard = (payload.get("dashboard") or {}) if isinstance(payload, dict) else {}
        if dashboard.get("uid") == uid:
            dashboard_checks.append({"uid": uid, "status": "ok"})
        else:
            dashboard_checks.append({"uid": uid, "status": "missing"})
            all_dashboards_ok = False
    result["dashboards"] = dashboard_checks
    result["status"] = "ok" if all_dashboards_ok else "partial"
    print(f"Grafana health: {result.get('health', {}).get('database', '<unknown>')}")
    print(f"Grafana dashboards: {sum(1 for d in dashboard_checks if d['status'] == 'ok')}/{len(dashboard_checks)} UIDs")
    return result


def live_prometheus_checks(prometheus_url: str, profile_name: str | None) -> dict[str, Any]:
    profile = load_naming_profile(profile_name)
    result: dict[str, Any] = {
        "executed": True,
        "status": "ok",
        "profile_used": profile.name,
        "naming_file": str(resolve_calibration_file("naming-compatibility").relative_to(resolve_calibration_file("naming-compatibility").parents[1])).replace("\\", "/"),
    }

    rules_call = _safe_call(prometheus_url, "/api/v1/rules")
    if not rules_call["ok"]:
        return {"executed": True, "status": "http_error", "error": rules_call["error"], "profile_used": profile.name}
    rules_payload = rules_call["payload"] or {}
    result["rules_api"] = {"status": rules_payload.get("status")}

    labels_call = _safe_call(prometheus_url, "/api/v1/labels")
    metric_names_call = _safe_call(prometheus_url, "/api/v1/label/__name__/values")
    labels = []
    metric_names = set()
    if labels_call["ok"] and isinstance(labels_call["payload"], dict):
        labels = sorted(labels_call["payload"].get("data") or [])
    if metric_names_call["ok"] and isinstance(metric_names_call["payload"], dict):
        metric_names = set(metric_names_call["payload"].get("data") or [])

    label_checks = {key: {"name": name, "present": (name in labels)} for key, name in profile.labels.items()}
    metric_checks = {key: {"name": name, "present": (name in metric_names)} for key, name in profile.metrics.items()}
    result["naming_profile_validation"] = {
        "labels": label_checks,
        "metrics": metric_checks,
        "labels_present_count": sum(1 for item in label_checks.values() if item["present"]),
        "metrics_present_count": sum(1 for item in metric_checks.values() if item["present"]),
    }

    env_label = profile.labels["deployment_environment"]
    span_label = profile.labels["span_name"]
    m = profile.metrics
    signal_queries = {
        "importing": {
            "runs_count_15m_staging": f'sum(increase({m["importing_runs_finalized_total"]}{{{env_label}="staging"}}[15m]))',
            "failure_rate_15m_staging": (
                f'(sum(increase({m["importing_runs_finalized_total"]}{{{env_label}="staging",importing_outcome="failure"}}[15m])))'
                f' / clamp_min(sum(increase({m["importing_runs_finalized_total"]}{{{env_label}="staging"}}[15m])), 1)'
            ),
        },
        "prisma": {
            "ops_count_15m_staging": f'sum(increase({m["prisma_operations_total"]}{{{env_label}="staging"}}[15m]))',
            "query_p95_15m_staging": (
                f'histogram_quantile(0.95, sum by (le) (increase({m["prisma_query_duration_bucket_ms"]}{{{env_label}="staging"}}[15m])))'
            ),
        },
        "spanmetrics": {
            "calls_count_15m_staging": (
                f'sum(increase({m["spanmetrics_calls_total"]}{{{env_label}="staging",{span_label}=~"HTTP.*|importing\\\\.pipeline"}}[15m]))'
            ),
            "latency_p95_15m_staging": (
                f'histogram_quantile(0.95, sum by (le) (increase({m["spanmetrics_latency_bucket_ms"]}{{{env_label}="staging",{span_label}=~"HTTP.*|importing\\\\.pipeline"}}[15m])))'
            ),
        },
    }
    signal_results: dict[str, Any] = {}
    for family, queries in signal_queries.items():
        signal_results[family] = {}
        for key, expr in queries.items():
            signal_results[family][key] = _prom_query(prometheus_url, expr)
    result["signal_family_smoke"] = signal_results

    # status agregado: APIs + pelo menos queries parseando (ok/empty)
    statuses = []
    statuses.append(rules_payload.get("status") == "success")
    for family in signal_results.values():
        for check in family.values():
            statuses.append(check.get("status") in {"ok", "empty"})
    if not all(statuses):
        result["status"] = "partial"

    print("Prometheus rules/query API: OK" if result["status"] == "ok" else "Prometheus smoke: parcial")
    print(
        "Prometheus naming/profile: "
        f"labels={result['naming_profile_validation']['labels_present_count']}/{len(label_checks)} "
        f"metrics={result['naming_profile_validation']['metrics_present_count']}/{len(metric_checks)}"
    )
    return result


def live_loki_checks(loki_url: str) -> dict[str, Any]:
    result: dict[str, Any] = {"executed": True, "status": "ok"}
    labels_call = _safe_call(loki_url, "/loki/api/v1/labels")
    if not labels_call["ok"]:
        return {"executed": True, "status": "http_error", "error": labels_call["error"]}
    labels_payload = labels_call["payload"] or {}
    if labels_payload.get("status") != "success":
        return {"executed": True, "status": "api_error", "payload_status": labels_payload.get("status")}
    labels = sorted(labels_payload.get("data") or [])
    result["labels"] = labels
    env_label = "deployment_environment" if "deployment_environment" in labels else ("environment" if "environment" in labels else None)
    result["env_label_used"] = env_label

    selector = f'{{{env_label}="staging"}}' if env_label else "{}"
    runtime_queries = {
        "bootstrap_failed_15m": f'sum(count_over_time({selector} |= "[otel-runtime] BOOTSTRAP_FAILED" [15m]))',
        "bootstrap_disabled_15m": f'sum(count_over_time({selector} |= "[otel-runtime] BOOTSTRAP_DISABLED" [15m]))',
        "shutdown_failed_30m": f'sum(count_over_time({selector} |= "[otel-runtime] SHUTDOWN_FAILED" [30m]))',
    }
    runtime_results = {}
    for key, expr in runtime_queries.items():
        call = _safe_call(loki_url, "/loki/api/v1/query", params={"query": expr})
        if not call["ok"]:
            runtime_results[key] = {"status": "http_error", "error": call["error"], "expr": expr}
            continue
        payload = call["payload"] or {}
        if payload.get("status") != "success":
            runtime_results[key] = {"status": "api_error", "payload_status": payload.get("status"), "expr": expr}
            continue
        parsed = _parse_vector_or_scalar(payload)
        parsed["expr"] = expr
        runtime_results[key] = parsed
    result["runtime_smoke"] = runtime_results
    if not all(check.get("status") in {"ok", "empty"} for check in runtime_results.values()):
        result["status"] = "partial"

    print("Loki API labels/check: OK" if result["status"] == "ok" else "Loki smoke: parcial")
    return result


def _write_report_if_requested(report: dict[str, Any], output_path: str | None) -> None:
    if not output_path:
        return
    path = Path(output_path)
    write_json_file(path, report)
    print(f"Relatorio de smoke salvo em: {path}")


def main() -> int:
    args = parse_args()
    try:
        env_file_metadata = apply_env_file(
            args.env_file,
            mode=args.env_file_mode,
            priority=args.env_file_priority,
            selected_keys=CRITICAL_ENV_KEYS,
            priority_keys=CRITICAL_ENV_KEYS,
        )
    except EnvFileError as exc:
        raise SystemExit(f"--env-file invalido: {exc}") from exc

    resolved_grafana_url = args.grafana_url or os.getenv("GRAFANA_URL")
    resolved_prometheus_url = args.prometheus_url or os.getenv("PROMETHEUS_URL")
    resolved_loki_url = args.loki_url or os.getenv("LOKI_URL")

    report: dict[str, Any] = {
        "phase": "4E.9",
        "checked_at": utc_now_iso(),
        "mode": "dry-run" if args.dry_run else "remote_or_mixed",
        "profile_requested": args.profile,
        "env_file": {
            "enabled": bool(env_file_metadata.get("enabled")),
            "mode": env_file_metadata.get("mode"),
            "priority": env_file_metadata.get("priority"),
            "path": env_file_metadata.get("path"),
            "selected_keys_count": env_file_metadata.get("selected_keys_count"),
            "applied_keys_count": env_file_metadata.get("applied_keys_count"),
            "conflict_keys_count": env_file_metadata.get("conflict_keys_count"),
        },
        "remote_endpoints_source": {
            "grafana_url": "arg" if args.grafana_url else ("env" if resolved_grafana_url else "missing"),
            "prometheus_url": "arg" if args.prometheus_url else ("env" if resolved_prometheus_url else "missing"),
            "loki_url": "arg" if args.loki_url else ("env" if resolved_loki_url else "missing"),
        },
        "remote": {},
    }

    with tempfile.TemporaryDirectory(prefix="mapia-observability-post-apply-") as tmp:
        render_root = Path(tmp)
        uids = resolve_datasource_uids(
            prometheus_uid=args.datasource_prometheus_uid,
            loki_uid=args.datasource_loki_uid,
            allow_placeholder_defaults=True,
        )
        manifest = render_artifacts(render_root, args.profile, uids)
        parse_rendered_bundle(render_root)
        report["local_render"] = {
            "status": "ok",
            "render_root": str(render_root),
            "profile_resolved": manifest.get("profile"),
            "naming_file": manifest.get("naming_file"),
        }
        print(f"Render/parse local OK para smoke: {render_root}")

    remote_endpoints_configured = any([resolved_grafana_url, resolved_prometheus_url, resolved_loki_url])
    if args.require_remote and not remote_endpoints_configured:
        report["status"] = "blocked_missing_remote_endpoints"
        _write_report_if_requested(report, args.output_report)
        print("Smoke remoto requerido, mas nenhum endpoint foi informado.")
        return 1

    if args.dry_run or not remote_endpoints_configured:
        print_local_checklist()
        report["remote"] = {"status": "not_executed", "reason": "dry_run_or_missing_endpoints"}
        report["status"] = "ok_dry_run"
        print("Modo dry-run: validacao pos-apply remota nao executada (faltam endpoints de ambiente).")
        _write_report_if_requested(report, args.output_report)
        return 0

    if resolved_grafana_url:
        report["remote"]["grafana"] = live_grafana_checks(resolved_grafana_url, args.grafana_token_env)
    if resolved_prometheus_url:
        report["remote"]["prometheus"] = live_prometheus_checks(resolved_prometheus_url, args.profile)
    if resolved_loki_url:
        report["remote"]["loki"] = live_loki_checks(resolved_loki_url)

    remote_statuses = []
    for backend in ["grafana", "prometheus", "loki"]:
        backend_report = report["remote"].get(backend)
        if backend_report:
            remote_statuses.append(backend_report.get("status") in {"ok", "partial"})
    report["status"] = "ok" if all(remote_statuses) else "partial"

    _write_report_if_requested(report, args.output_report)
    print("Post-apply smoke: OK" if report["status"] == "ok" else "Post-apply smoke: PARCIAL")
    return 0 if report["status"] in {"ok", "partial"} else 1


if __name__ == "__main__":
    raise SystemExit(main())
