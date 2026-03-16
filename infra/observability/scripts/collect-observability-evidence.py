from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _env_file import CRITICAL_ENV_KEYS, EnvFileError, add_env_file_args, apply_env_file  # noqa: E402
from _obs_common import (  # noqa: E402
    OBS_ROOT,
    http_json_query,
    load_naming_profile,
    load_yaml_file,
    resolve_calibration_file,
    utc_now_iso,
    write_json_file,
)


DASHBOARD_UIDS = [
    "mapia-importing-health",
    "mapia-importing-performance",
    "mapia-otel-runtime-warnings",
    "mapia-http-platform-overview",
]

WINDOWS = {
    "alert_15m": "15m",
    "operational_7d": "7d",
    "trend_30d": "30d",
}

ENVIRONMENT_SCOPE_STAGING_PROD = "staging_prod"
ENVIRONMENT_SCOPE_DEV_LOCAL = "dev_local"
VALID_ENVIRONMENT_SCOPES = {ENVIRONMENT_SCOPE_STAGING_PROD, ENVIRONMENT_SCOPE_DEV_LOCAL}
DEV_LOCAL_ENV_LABEL_REGEX = "development|dev|dev_local|local"

SIGNAL_KEYS = [
    "importing_failure_rate",
    "importing_run_duration_p95",
    "importing_adapter_warning_rate",
    "importing_adapter_late_drops",
    "prisma_error_rate",
    "prisma_slow_query_rate",
    "prisma_query_duration_p95",
    "http_spanmetrics_volume",
    "runtime_warnings_recurrence",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Coleta evidencias agregadas de observabilidade (4E.9)")
    parser.add_argument(
        "--output",
        default=str(OBS_ROOT / "evidence" / "observability-evidence.4e9.capture.json"),
        help="Arquivo JSON de saida",
    )
    parser.add_argument("--profile", help="Profile de naming para queries Prometheus")
    parser.add_argument("--template-only", action="store_true", help="Gera template sem acesso remoto")
    parser.add_argument("--prometheus-url", help="URL base do Prometheus")
    parser.add_argument("--loki-url", help="URL base do Loki")
    parser.add_argument("--grafana-url", help="URL base do Grafana")
    parser.add_argument("--grafana-token-env", default="GRAFANA_API_TOKEN", help="Env var com token Grafana")
    parser.add_argument("--timeout-seconds", type=int, default=15, help="Timeout HTTP por requisicao")
    parser.add_argument(
        "--environment-scope",
        choices=sorted(VALID_ENVIRONMENT_SCOPES),
        default=ENVIRONMENT_SCOPE_STAGING_PROD,
        help=(
            "Escopo de ambientes para coleta real: "
            "`staging_prod` (default) ou `dev_local` (localhost/dev sem fingir producao)."
        ),
    )
    add_env_file_args(parser)
    return parser.parse_args()


def _environments_for_scope(environment_scope: str) -> list[str]:
    if environment_scope == ENVIRONMENT_SCOPE_DEV_LOCAL:
        return ["dev_local"]
    return ["staging", "production"]


def _template_payload(
    profile_name: str | None,
    timeout_seconds: int,
    environment_scope: str,
    environments: list[str],
    env_file_summary: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "version": 1,
        "phase": "4E.9",
        "environment_scope": environment_scope,
        "status": "template_no_real_evidence",
        "collected_at": None,
        "collector": {
            "script": "infra/observability/scripts/collect-observability-evidence.py",
            "profile_requested": profile_name,
            "environment_scope": environment_scope,
            "environments": environments,
            "http_timeout_seconds": timeout_seconds,
            "windows": {"alert": "15m", "operational": "7d", "trend": "30d"},
            "env_file": env_file_summary or {"enabled": False},
        },
        "environment_access": {
            "grafana": {"available": False, "reason": "endpoint nao informado"},
            "prometheus": {"available": False, "reason": "endpoint nao informado"},
            "loki": {"available": False, "reason": "endpoint nao informado"},
        },
        "remote_smoke": {"grafana": {"executed": False}, "prometheus": {"executed": False}, "loki": {"executed": False}},
        "naming_observed": {
            "status": "not_collected",
            "profile_candidates": {},
            "final_profile": None,
            "prometheus": {"labels_present": [], "metrics_present": {}},
            "loki": {"labels_present": []},
        },
        "signals": {env: {} for env in environments},
        "threshold_decisions": {env: {} for env in environments},
        "notes": [
            "Preencher via coleta automatizada ou export agregado seguro.",
            "Thresholds finais nao devem ser promovidos sem evidencias reais 15m/7d/30d.",
            (
                "Escopo dev_local coleta apenas localhost/dev e nao representa staging/producao."
                if environment_scope == ENVIRONMENT_SCOPE_DEV_LOCAL
                else "Escopo staging_prod exige matriz real por ambiente (staging/producao)."
            ),
        ],
    }


def _parse_vector_or_scalar_value(payload: dict[str, Any]) -> tuple[str, Any, int]:
    if payload.get("status") != "success":
        return ("api_error", None, 0)
    data = payload.get("data") or {}
    result_type = data.get("resultType")
    if result_type == "scalar":
        value = data.get("result", [None, None])
        return ("ok", _to_float(value[1]) if isinstance(value, list) and len(value) > 1 else None, 1)
    if result_type == "vector":
        result = data.get("result") or []
        if not result:
            return ("empty", None, 0)
        if len(result) == 1 and isinstance(result[0], dict):
            value = (result[0].get("value") or [None, None])[1]
            return ("ok", _to_float(value), 1)
        # multi-series: return list of {metric,value} sem payload sensivel alem de labels de baixa cardinalidade
        rows = []
        for row in result:
            if not isinstance(row, dict):
                continue
            rows.append(
                {
                    "metric": row.get("metric", {}),
                    "value": _to_float(((row.get("value") or [None, None])[1])),
                }
            )
        return ("ok_multi", rows, len(rows))
    return ("unsupported_result_type", None, 0)


def _to_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _safe_http_call(
    base_url: str,
    path: str,
    params: dict[str, str] | None = None,
    headers: dict[str, str] | None = None,
    timeout_seconds: int = 10,
):
    try:
        return {
            "ok": True,
            "payload": http_json_query(
                base_url,
                path,
                params=params,
                headers=headers,
                timeout_seconds=timeout_seconds,
            ),
        }
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}


def _prom_query(prom_url: str, expr: str, timeout_seconds: int) -> dict[str, Any]:
    call = _safe_http_call(prom_url, "/api/v1/query", params={"query": expr}, timeout_seconds=timeout_seconds)
    if not call["ok"]:
        return {"status": "http_error", "error": call["error"], "expr": expr}
    status, value, result_count = _parse_vector_or_scalar_value(call["payload"])
    return {"status": status, "expr": expr, "value": value, "result_count": result_count}


def _loki_query(loki_url: str, expr: str, timeout_seconds: int) -> dict[str, Any]:
    call = _safe_http_call(loki_url, "/loki/api/v1/query", params={"query": expr}, timeout_seconds=timeout_seconds)
    if not call["ok"]:
        return {"status": "http_error", "error": call["error"], "expr": expr}
    payload = call["payload"]
    if payload.get("status") != "success":
        return {"status": "api_error", "expr": expr, "payload_status": payload.get("status")}
    data = payload.get("data") or {}
    result = data.get("result") or []
    if not result:
        return {"status": "empty", "expr": expr, "value": 0.0, "result_count": 0}
    row = result[0] if isinstance(result[0], dict) else {}
    raw_value = (row.get("value") or [None, None])[1]
    return {"status": "ok", "expr": expr, "value": _to_float(raw_value), "result_count": len(result)}


def _prom_labels(prom_url: str, timeout_seconds: int) -> list[str]:
    payload = http_json_query(prom_url, "/api/v1/labels", timeout_seconds=timeout_seconds)
    if payload.get("status") != "success":
        return []
    data = payload.get("data")
    return sorted(data) if isinstance(data, list) else []


def _prom_label_values(prom_url: str, label: str, timeout_seconds: int) -> list[str]:
    payload = http_json_query(prom_url, f"/api/v1/label/{label}/values", timeout_seconds=timeout_seconds)
    if payload.get("status") != "success":
        return []
    data = payload.get("data")
    return sorted(data) if isinstance(data, list) else []


def _prom_metric_names(prom_url: str, timeout_seconds: int) -> set[str]:
    values = _prom_label_values(prom_url, "__name__", timeout_seconds)
    return set(values)


def _build_signal_queries(
    profile_name: str | None,
    *,
    environments: list[str],
    use_env_label_matcher: bool,
) -> dict[str, dict[str, dict[str, str]]]:
    profile = load_naming_profile(profile_name)
    m = profile.metrics
    l = profile.labels
    env_label = l["deployment_environment"]
    span_name_label = l["span_name"]

    def env_filter(env: str) -> str | None:
        if not use_env_label_matcher:
            return None
        if env == "dev_local":
            return f'{env_label}=~"{DEV_LOCAL_ENV_LABEL_REGEX}"'
        return f'{env_label}="{env}"'

    def selector(*matchers: str | None) -> str:
        parts = [item for item in matchers if isinstance(item, str) and item]
        if not parts:
            return ""
        return "{" + ",".join(parts) + "}"

    def ratio(num: str, den: str) -> str:
        return f"({num}) / clamp_min(({den}), 1)"

    queries: dict[str, dict[str, dict[str, str]]] = {env: {} for env in environments}
    for env in environments:
        by_window: dict[str, dict[str, str]] = {}
        env_matcher = env_filter(env)
        for window_key, window in WINDOWS.items():
            span_name_matcher = f'{span_name_label}=~"HTTP.*|importing\\\\.pipeline"'
            failure_matcher = 'importing_outcome="failure"'
            run_total = f"sum(increase({m['importing_runs_finalized_total']}{selector(env_matcher)}[{window}]))"
            run_fail = (
                f"sum(increase({m['importing_runs_finalized_total']}{selector(env_matcher, failure_matcher)}[{window}]))"
            )
            warn_total = f"sum(increase({m['importing_adapter_warnings_total']}{selector(env_matcher)}[{window}]))"
            late_drops = f"sum(increase({m['importing_adapter_late_drops_total']}{selector(env_matcher)}[{window}]))"
            prisma_ops = f"sum(increase({m['prisma_operations_total']}{selector(env_matcher)}[{window}]))"
            prisma_err = f"sum(increase({m['prisma_errors_total']}{selector(env_matcher)}[{window}]))"
            prisma_slow = f"sum(increase({m['prisma_slow_queries_total']}{selector(env_matcher)}[{window}]))"
            span_calls = (
                f"sum(increase({m['spanmetrics_calls_total']}{selector(env_matcher, span_name_matcher)}[{window}]))"
            )
            run_p95 = (
                f"histogram_quantile(0.95, sum by (le) (increase({m['importing_run_duration_bucket_ms']}{selector(env_matcher)}[{window}])))"
            )
            prisma_p95 = (
                f"histogram_quantile(0.95, sum by (le) (increase({m['prisma_query_duration_bucket_ms']}{selector(env_matcher)}[{window}])))"
            )

            by_window[window_key] = {
                "importing_failure_rate": ratio(run_fail, run_total),
                "importing_failure_rate_volume_runs": run_total,
                "importing_run_duration_p95": run_p95,
                "importing_adapter_warning_rate": ratio(warn_total, run_total),
                "importing_adapter_warning_rate_volume_warnings": warn_total,
                "importing_adapter_late_drops": late_drops,
                "prisma_error_rate": ratio(prisma_err, prisma_ops),
                "prisma_error_rate_volume_ops": prisma_ops,
                "prisma_slow_query_rate": ratio(prisma_slow, prisma_ops),
                "prisma_slow_query_rate_volume_slow": prisma_slow,
                "prisma_query_duration_p95": prisma_p95,
                "http_spanmetrics_volume": span_calls,
            }
        queries[env] = by_window
    return queries


def _collect_grafana(grafana_url: str | None, token_env_name: str, timeout_seconds: int) -> dict[str, Any]:
    if not grafana_url:
        return {"executed": False, "status": "not_configured"}
    token = os.getenv(token_env_name)
    if not token:
        return {"executed": False, "status": "blocked_missing_token_env", "token_env": token_env_name}
    headers = {"Authorization": f"Bearer {token}"}
    result: dict[str, Any] = {"executed": True, "token_env": token_env_name}
    health = _safe_http_call(grafana_url, "/api/health", headers=headers, timeout_seconds=timeout_seconds)
    result["health"] = health["payload"] if health["ok"] else {"error": health["error"]}
    dashboards: list[dict[str, Any]] = []
    all_ok = True
    for uid in DASHBOARD_UIDS:
        call = _safe_http_call(grafana_url, f"/api/dashboards/uid/{uid}", headers=headers, timeout_seconds=timeout_seconds)
        if not call["ok"]:
            dashboards.append({"uid": uid, "status": "http_error", "error": call["error"]})
            all_ok = False
            continue
        payload = call["payload"] or {}
        dashboard = (payload.get("dashboard") or {}) if isinstance(payload, dict) else {}
        if dashboard.get("uid") == uid:
            dashboards.append({"uid": uid, "status": "ok"})
        else:
            dashboards.append({"uid": uid, "status": "missing"})
            all_ok = False
    result["dashboards"] = dashboards
    result["status"] = "ok" if all_ok else "partial"
    return result


def _collect_prometheus(
    prom_url: str | None,
    profile_name: str | None,
    timeout_seconds: int,
    environment_scope: str,
) -> dict[str, Any]:
    if not prom_url:
        return {"executed": False, "status": "not_configured"}

    environments = _environments_for_scope(environment_scope)
    naming_file = resolve_calibration_file("naming-compatibility")
    naming_raw = load_yaml_file(naming_file) or {}
    profile_names = sorted((naming_raw.get("profiles") or {}).keys())

    result: dict[str, Any] = {
        "executed": True,
        "status": "ok",
        "environment_scope": environment_scope,
        "environments": environments,
        "naming_file": str(naming_file.relative_to(OBS_ROOT)).replace("\\", "/"),
    }
    rules_call = _safe_http_call(prom_url, "/api/v1/rules", timeout_seconds=timeout_seconds)
    result["rules_api"] = {"status": "ok"} if rules_call["ok"] else {"status": "http_error", "error": rules_call["error"]}

    try:
        labels_present = _prom_labels(prom_url, timeout_seconds)
        metric_names = _prom_metric_names(prom_url, timeout_seconds)
    except Exception as exc:  # noqa: BLE001
        result["status"] = "partial"
        result["labels"] = {"status": "http_error", "error": str(exc)}
        result["metrics_catalog"] = {"status": "http_error", "error": str(exc)}
        labels_present = []
        metric_names = set()
    else:
        result["labels"] = {"status": "ok", "values": labels_present}
        result["metrics_catalog"] = {"status": "ok", "count": len(metric_names)}

    profile_candidates: dict[str, Any] = {}
    for candidate in profile_names:
        profile = load_naming_profile(candidate, naming_path=naming_file)
        labels_hits = {label: (name in labels_present) for label, name in profile.labels.items()}
        metrics_hits = {metric: (name in metric_names) for metric, name in profile.metrics.items()}
        profile_candidates[candidate] = {
            "labels": labels_hits,
            "metrics": metrics_hits,
            "score": sum(1 for hit in labels_hits.values() if hit) + sum(1 for hit in metrics_hits.values() if hit),
        }

    best_profile: str | None = None
    profile_detection: dict[str, Any] = {"status": "no_profiles_declared", "best_score": 0, "tied_candidates": []}
    if profile_candidates:
        max_score = max(item["score"] for item in profile_candidates.values())
        winners = sorted([name for name, item in profile_candidates.items() if item["score"] == max_score])
        profile_detection = {
            "status": "unique_best_candidate" if max_score > 0 and len(winners) == 1 else (
                "ambiguous_tie" if max_score > 0 else "no_matches"
            ),
            "best_score": max_score,
            "tied_candidates": winners,
        }
        if profile_detection["status"] == "unique_best_candidate":
            best_profile = winners[0]
    result["profile_candidates"] = profile_candidates
    result["best_profile_by_presence_score"] = best_profile
    result["profile_detection"] = profile_detection

    active_profile_name = profile_name or best_profile
    result["profile_used_for_queries"] = active_profile_name
    if active_profile_name:
        profile = load_naming_profile(active_profile_name, naming_path=naming_file)
        env_label_name = profile.labels["deployment_environment"]
        use_env_label_matcher = not (environment_scope == ENVIRONMENT_SCOPE_DEV_LOCAL and env_label_name not in labels_present)
        env_label_values = (
            _prom_label_values(prom_url, env_label_name, timeout_seconds) if env_label_name in labels_present else []
        )
        result["env_label_probe"] = {
            "label": env_label_name,
            "present": env_label_name in labels_present,
            "matcher_mode": "by_label" if use_env_label_matcher else "unfiltered",
            "values_sample": env_label_values[:20],
        }

        signal_exprs = _build_signal_queries(
            active_profile_name,
            environments=environments,
            use_env_label_matcher=use_env_label_matcher,
        )
        signal_results: dict[str, Any] = {env: {} for env in environments}
        for env, windows in signal_exprs.items():
            for window_key, exprs in windows.items():
                signal_results[env].setdefault(window_key, {})
                for signal_key, expr in exprs.items():
                    signal_results[env][window_key][signal_key] = _prom_query(prom_url, expr, timeout_seconds)
        result["signals"] = signal_results
    else:
        result["status"] = "partial"
        result["signals"] = {env: {} for env in environments}

    return result


def _collect_loki(loki_url: str | None, timeout_seconds: int, environment_scope: str) -> dict[str, Any]:
    if not loki_url:
        return {"executed": False, "status": "not_configured"}

    environments = _environments_for_scope(environment_scope)
    result: dict[str, Any] = {"executed": True, "status": "ok", "environment_scope": environment_scope, "environments": environments}
    labels_call = _safe_http_call(loki_url, "/loki/api/v1/labels", timeout_seconds=timeout_seconds)
    if not labels_call["ok"]:
        return {
            "executed": True,
            "status": "http_error",
            "environment_scope": environment_scope,
            "environments": environments,
            "labels_api": {"status": "http_error", "error": labels_call["error"]},
        }
    payload = labels_call["payload"] or {}
    labels = payload.get("data", []) if isinstance(payload, dict) else []
    labels = sorted(labels) if isinstance(labels, list) else []
    result["labels_api"] = {"status": "ok", "labels": labels}

    env_label = "deployment_environment" if "deployment_environment" in labels else ("environment" if "environment" in labels else None)
    runtime_counts: dict[str, Any] = {"env_label_used": env_label, "by_environment": {}}
    for env in environments:
        runtime_counts["by_environment"][env] = {}
        if env_label:
            if env == "dev_local":
                selector = f'{{{env_label}=~"{DEV_LOCAL_ENV_LABEL_REGEX}"}}'
            else:
                selector = f'{{{env_label}="{env}"}}'
        else:
            selector = "{}"
        for window_key, window in WINDOWS.items():
            runtime_counts["by_environment"][env][window_key] = {}
            for code in ["BOOTSTRAP_FAILED", "BOOTSTRAP_DISABLED", "INSTRUMENTATION_INIT_FAILED", "SHUTDOWN_FAILED"]:
                expr = f'sum(count_over_time({selector} |= "[otel-runtime] {code}" [{window}]))'
                runtime_counts["by_environment"][env][window_key][code] = _loki_query(loki_url, expr, timeout_seconds)
    result["runtime_warning_counts"] = runtime_counts
    return result


def _compose_phase_status(payload: dict[str, Any], environment_scope: str) -> str:
    env_access = payload["environment_access"]
    if not any(env_access[key]["available"] for key in ["grafana", "prometheus", "loki"]):
        return "blocked_no_remote_endpoints"
    prom = payload["remote_smoke"]["prometheus"]
    loki = payload["remote_smoke"]["loki"]
    if prom.get("executed") and prom.get("status") == "ok" and loki.get("executed") and loki.get("status") == "ok":
        if environment_scope == ENVIRONMENT_SCOPE_DEV_LOCAL:
            return "dev_local_real_evidence"
        return "evidence_collected_partial_or_full"
    if environment_scope == ENVIRONMENT_SCOPE_DEV_LOCAL:
        return "dev_local_real_evidence_partial"
    return "evidence_collection_partial"


def _build_signal_summary(prometheus: dict[str, Any], loki: dict[str, Any], environments: list[str]) -> dict[str, Any]:
    summary: dict[str, Any] = {env: {} for env in environments}
    prom_signals = (prometheus or {}).get("signals", {})
    loki_runtime = ((loki or {}).get("runtime_warning_counts") or {}).get("by_environment", {})

    mapping = {
        "importing_failure_rate": "importing_failure_rate",
        "importing_run_duration_p95": "importing_run_duration_p95",
        "importing_adapter_warning_rate": "importing_adapter_warning_rate",
        "importing_adapter_late_drops": "importing_adapter_late_drops",
        "prisma_error_rate": "prisma_error_rate",
        "prisma_slow_query_rate": "prisma_slow_query_rate",
        "prisma_query_duration_p95": "prisma_query_duration_p95",
        "http_spanmetrics_volume": "http_spanmetrics_volume",
    }

    for env in environments:
        for signal in SIGNAL_KEYS:
            summary[env][signal] = {"windows": {}, "status": "not_collected"}
        for window_key, signals in (prom_signals.get(env) or {}).items():
            for signal_key, prom_signal_key in mapping.items():
                if prom_signal_key in signals:
                    summary[env][signal_key]["windows"][window_key] = signals[prom_signal_key]
        for window_key, counts in (loki_runtime.get(env) or {}).items():
            summary[env]["runtime_warnings_recurrence"]["windows"][window_key] = counts
        for signal in SIGNAL_KEYS:
            windows = summary[env][signal]["windows"]
            if not windows:
                continue
            if all(isinstance(v, dict) and v.get("status") in {"ok", "ok_multi"} for v in windows.values()):
                summary[env][signal]["status"] = "evidence_present_all_windows"
            elif any(isinstance(v, dict) and v.get("status") in {"ok", "ok_multi"} for v in windows.values()):
                summary[env][signal]["status"] = "evidence_partial"
            else:
                summary[env][signal]["status"] = "no_data_or_query_error"
    return summary


def main() -> int:
    args = parse_args()
    output_path = Path(args.output)
    if args.timeout_seconds <= 0:
        raise SystemExit("--timeout-seconds deve ser > 0")
    environments = _environments_for_scope(args.environment_scope)

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

    env_file_summary = {
        "enabled": bool(env_file_metadata.get("enabled")),
        "mode": env_file_metadata.get("mode"),
        "priority": env_file_metadata.get("priority"),
        "path": env_file_metadata.get("path"),
        "selected_keys_count": env_file_metadata.get("selected_keys_count"),
        "applied_keys_count": env_file_metadata.get("applied_keys_count"),
        "conflict_keys_count": env_file_metadata.get("conflict_keys_count"),
    }

    resolved_grafana_url = args.grafana_url or os.getenv("GRAFANA_URL")
    resolved_prometheus_url = args.prometheus_url or os.getenv("PROMETHEUS_URL")
    resolved_loki_url = args.loki_url or os.getenv("LOKI_URL")

    if args.template_only:
        payload = _template_payload(
            args.profile,
            args.timeout_seconds,
            args.environment_scope,
            environments,
            env_file_summary,
        )
        write_json_file(output_path, payload)
        print(f"Template de evidencias 4E.9 gerado: {output_path}")
        return 0

    payload = _template_payload(
        args.profile,
        args.timeout_seconds,
        args.environment_scope,
        environments,
        env_file_summary,
    )
    payload["collected_at"] = utc_now_iso()
    payload["collector"]["profile_requested"] = args.profile
    payload["collector"]["endpoints_source"] = {
        "grafana_url": "arg" if args.grafana_url else ("env" if resolved_grafana_url else "missing"),
        "prometheus_url": "arg" if args.prometheus_url else ("env" if resolved_prometheus_url else "missing"),
        "loki_url": "arg" if args.loki_url else ("env" if resolved_loki_url else "missing"),
    }
    payload["environment_access"] = {
        "grafana": {"available": bool(resolved_grafana_url), "reason": None if resolved_grafana_url else "endpoint nao informado"},
        "prometheus": {
            "available": bool(resolved_prometheus_url),
            "reason": None if resolved_prometheus_url else "endpoint nao informado",
        },
        "loki": {"available": bool(resolved_loki_url), "reason": None if resolved_loki_url else "endpoint nao informado"},
    }

    grafana = _collect_grafana(resolved_grafana_url, args.grafana_token_env, args.timeout_seconds)
    prometheus = _collect_prometheus(
        resolved_prometheus_url,
        args.profile,
        args.timeout_seconds,
        args.environment_scope,
    )
    loki = _collect_loki(resolved_loki_url, args.timeout_seconds, args.environment_scope)

    payload["remote_smoke"] = {
        "grafana": grafana,
        "prometheus": {"executed": prometheus.get("executed", False), "status": prometheus.get("status")},
        "loki": {"executed": loki.get("executed", False), "status": loki.get("status")},
    }
    payload["prometheus"] = prometheus
    payload["loki"] = loki
    payload["grafana"] = grafana

    payload["naming_observed"] = {
        "status": "collected" if prometheus.get("executed") else "not_collected",
        "profile_candidates": prometheus.get("profile_candidates", {}),
        "final_profile": prometheus.get("best_profile_by_presence_score"),
        "prometheus": {
            "labels_present": ((prometheus.get("labels") or {}).get("values") or [])[:200],
            "metrics_present": {
                k: v
                for k, v in (
                    (
                        prometheus.get("best_profile_by_presence_score") or "",
                        (prometheus.get("profile_candidates") or {}).get(prometheus.get("best_profile_by_presence_score") or "", {}),
                    ),
                )
                if k
            },
        },
        "loki": {"labels_present": (((loki.get("labels_api") or {}).get("labels")) or [])[:200]},
    }

    payload["signals"] = _build_signal_summary(prometheus, loki, environments)
    payload["status"] = _compose_phase_status(payload, args.environment_scope)

    write_json_file(output_path, payload)
    print(f"Evidencias 4E.9 registradas: {output_path}")
    print(f"Status: {payload['status']}")
    print(f"Environment scope: {args.environment_scope}")
    print(f"Prometheus: {prometheus.get('status')}, Loki: {loki.get('status')}, Grafana: {grafana.get('status')}")
    if prometheus.get("best_profile_by_presence_score"):
        print(f"Profile candidato por presenca de metricas/labels: {prometheus['best_profile_by_presence_score']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
