from __future__ import annotations

import argparse
import os
import re
import sys
import urllib.parse
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _obs_common import (  # noqa: E402
    OBS_ROOT,
    load_json_file,
    load_yaml_file,
    resolve_calibration_file,
    utc_now_iso,
    write_text,
)

import yaml  # noqa: E402


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

ENVIRONMENT_SCOPE_STAGING_PROD = "staging_prod"
ENVIRONMENT_SCOPE_DEV_LOCAL = "dev_local"
VALID_ENVIRONMENT_SCOPES = {ENVIRONMENT_SCOPE_STAGING_PROD, ENVIRONMENT_SCOPE_DEV_LOCAL}

REQUIRED_WORKSPACE_PRECONDITIONS = {
    "grafana_url_env": "GRAFANA_URL",
    "prometheus_url_env": "PROMETHEUS_URL",
    "loki_url_env": "LOKI_URL",
    "grafana_api_token_env": "GRAFANA_API_TOKEN",
    "grafana_prometheus_uid_env": "MAPIA_DS_PROMETHEUS_UID",
    "grafana_loki_uid_env": "MAPIA_DS_LOKI_UID",
}

PLACEHOLDER_EXACT_VALUES = {
    "",
    "changeme",
    "change_me",
    "change-me",
    "todo",
    "placeholder",
    "__placeholder__",
    "example",
    "replace_me",
    "replace-me",
    "dummy",
    "sample",
    "redacted",
    "null",
    "none",
    "undefined",
}
PLACEHOLDER_CONTAINS_TOKENS = [
    "changeme",
    "change_me",
    "change-me",
    "todo",
    "placeholder",
    "__placeholder__",
    "example",
    "replace_me",
    "replace-me",
]
UID_RE = re.compile(r"[A-Za-z0-9_-]{2,128}$")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Gera readiness/finalization gating 4E.10 compatível com baseline/naming provisórios da 4E.9"
    )
    parser.add_argument(
        "--baseline",
        default=str(OBS_ROOT / "calibration" / "baseline-thresholds.4e9.yaml"),
        help="Arquivo YAML de baseline 4E.9",
    )
    parser.add_argument(
        "--naming",
        default=str(OBS_ROOT / "calibration" / "naming-compatibility.4e9.yaml"),
        help="Arquivo YAML de naming 4E.9",
    )
    parser.add_argument(
        "--evidence",
        default=str(OBS_ROOT / "evidence" / "observability-evidence.4e9.capture.json"),
        help="Arquivo JSON de evidências 4E.9",
    )
    parser.add_argument(
        "--post-apply-smoke-report",
        default=str(OBS_ROOT / "evidence" / "post-apply-smoke.4e9.report.json"),
        help="Relatório JSON de smoke pós-apply 4E.9 (opcional)",
    )
    parser.add_argument(
        "--output",
        default=str(OBS_ROOT / "calibration" / "finalization-readiness.4e10.yaml"),
        help="Arquivo YAML de saída (4E.10)",
    )
    parser.add_argument(
        "--strict-ready",
        action="store_true",
        help="Falha com exit code 1 se ainda houver bloqueios `pending_4e9r_real_evidence`",
    )
    parser.add_argument(
        "--environment-scope",
        choices=["auto", "staging_prod", "dev_local"],
        default="auto",
        help="Escopo de ambientes (`auto` detecta de evidence/baseline).",
    )
    return parser.parse_args()


def _required_environments(environment_scope: str) -> list[str]:
    if environment_scope == ENVIRONMENT_SCOPE_DEV_LOCAL:
        return ["dev_local"]
    return ["staging", "production"]


def _resolve_environment_scope(
    explicit_scope: str,
    baseline: dict[str, Any],
    evidence: dict[str, Any] | None,
) -> str:
    if explicit_scope in VALID_ENVIRONMENT_SCOPES:
        return explicit_scope
    baseline_scope = baseline.get("environment_scope")
    if baseline_scope in VALID_ENVIRONMENT_SCOPES:
        return str(baseline_scope)
    if isinstance(evidence, dict):
        collector_scope = ((evidence.get("collector") or {}).get("environment_scope"))
        if collector_scope in VALID_ENVIRONMENT_SCOPES:
            return str(collector_scope)
        top_scope = evidence.get("environment_scope")
        if top_scope in VALID_ENVIRONMENT_SCOPES:
            return str(top_scope)
        signals = evidence.get("signals")
        if isinstance(signals, dict):
            keys = {str(key) for key in signals.keys()}
            if "dev_local" in keys and not ({"staging", "production"} & keys):
                return ENVIRONMENT_SCOPE_DEV_LOCAL
    return ENVIRONMENT_SCOPE_STAGING_PROD


def _yaml_dump(payload: dict[str, Any]) -> str:
    return yaml.safe_dump(payload, sort_keys=False, allow_unicode=False)


def _repo_relative(path: Path | None) -> str | None:
    if path is None:
        return None
    try:
        return str(path.resolve().relative_to(OBS_ROOT)).replace("\\", "/")
    except Exception:  # noqa: BLE001
        return str(path)


def _load_yaml_required(path: Path, expected_phase: str | None = None) -> dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(f"Arquivo nao encontrado: {path}")
    raw = load_yaml_file(path)
    if not isinstance(raw, dict):
        raise ValueError(f"YAML invalido (esperado objeto): {path}")
    if expected_phase and raw.get("phase") != expected_phase:
        raise ValueError(f"{path.name} com phase inesperada: {raw.get('phase')!r} (esperado {expected_phase!r})")
    return raw


def _load_json_optional(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    raw = load_json_file(path)
    if not isinstance(raw, dict):
        raise ValueError(f"JSON invalido (esperado objeto): {path}")
    return raw


def _normalize_string(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    return value.strip()


def _looks_like_placeholder(value: str | None) -> tuple[bool, str | None]:
    normalized = _normalize_string(value)
    if normalized is None:
        return (False, None)
    lowered = normalized.lower()
    if lowered in PLACEHOLDER_EXACT_VALUES:
        return (True, "placeholder_exact_match")
    if lowered.startswith("<") and lowered.endswith(">"):
        return (True, "placeholder_bracketed_token")
    for token in PLACEHOLDER_CONTAINS_TOKENS:
        if token in lowered:
            return (True, f"placeholder_contains_{token}")
    return (False, None)


def _validate_url_value(value: str | None) -> tuple[bool, str | None]:
    normalized = _normalize_string(value)
    if normalized is None or normalized == "":
        return (False, "missing_or_empty")
    is_placeholder, placeholder_reason = _looks_like_placeholder(normalized)
    if is_placeholder:
        return (False, placeholder_reason)
    parsed = urllib.parse.urlparse(normalized)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return (False, "invalid_url_format")
    return (True, None)


def _validate_uid_value(value: str | None) -> tuple[bool, str | None]:
    normalized = _normalize_string(value)
    if normalized is None or normalized == "":
        return (False, "missing_or_empty")
    is_placeholder, placeholder_reason = _looks_like_placeholder(normalized)
    if is_placeholder:
        return (False, placeholder_reason)
    if not UID_RE.fullmatch(normalized):
        return (False, "invalid_uid_format")
    return (True, None)


def _validate_secret_value(value: str | None) -> tuple[bool, str | None]:
    normalized = _normalize_string(value)
    if normalized is None or normalized == "":
        return (False, "missing_or_empty")
    is_placeholder, placeholder_reason = _looks_like_placeholder(normalized)
    if is_placeholder:
        return (False, placeholder_reason)
    return (True, None)


def _dig_dict(payload: Any, *path: str) -> Any:
    current = payload
    for key in path:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current


def _extract_profile_detection(evidence: dict[str, Any] | None) -> tuple[str | None, str | None]:
    if not isinstance(evidence, dict):
        return (None, None)

    candidate_paths = [
        ("prometheus", "profile_detection"),
        ("remote_smoke", "prometheus", "profile_detection"),
        ("naming_observed", "profile_detection"),
    ]
    for path in candidate_paths:
        node = _dig_dict(evidence, *path)
        if isinstance(node, dict):
            status = node.get("status")
            if isinstance(status, str):
                return (status, ".".join(path))
        if isinstance(node, str):
            return (node, ".".join(path))

    # Compat fallback: status achatado em vez de objeto profile_detection
    fallback_status_paths = [
        ("prometheus", "profile_detection_status"),
        ("remote_smoke", "prometheus", "profile_detection_status"),
    ]
    for path in fallback_status_paths:
        status = _dig_dict(evidence, *path)
        if isinstance(status, str):
            return (status, ".".join(path))

    return (None, None)


def _detect_signal_shape(env_signals: Any) -> tuple[str, str]:
    if not isinstance(env_signals, dict):
        return ("invalid", "signals.<env> nao e objeto")
    if not env_signals:
        return ("empty", "signals.<env> vazio")

    keys = set(env_signals.keys())
    signal_keys_found = keys & set(SIGNAL_KEYS)
    window_like_keys = [
        k
        for k in keys
        if isinstance(k, str) and any(token in k for token in ["15m", "7d", "30d", "alert", "operational", "trend"])
    ]
    nested_has_signal_keys = False
    nested_has_payload_shape = False
    nested_dict_count = 0
    for value in env_signals.values():
        if not isinstance(value, dict):
            continue
        nested_dict_count += 1
        value_keys = set(value.keys())
        if value_keys & set(SIGNAL_KEYS):
            nested_has_signal_keys = True
        if value_keys & {"status", "value", "result_count", "expr"}:
            nested_has_payload_shape = True
        if nested_has_signal_keys and nested_has_payload_shape:
            break

    few_keys = len(keys) <= 6
    mostly_window_like = len(window_like_keys) >= 1 and len(window_like_keys) >= max(1, len(keys) - 1)

    if signal_keys_found and nested_has_signal_keys:
        return ("mixed", "shape_misto_por_sinal_e_por_janela")
    if signal_keys_found:
        return ("by_signal", "shape_signals.<env>.<signal>.windows")
    if nested_has_signal_keys:
        return ("by_window", "shape_signals.<env>.<window>.<signal>")
    if mostly_window_like and few_keys and nested_dict_count > 0 and nested_has_payload_shape:
        return ("by_window", "shape_signals.<env>.<window> (payload_típico_sem_signal_keys)")
    if mostly_window_like and few_keys and nested_dict_count > 0:
        return ("unknown", "janelas_detectadas_sem_signal_keys_ou_payload_tipico")
    return ("unknown", "nao_foi_possivel_classificar_shape_de_signals")


def _summarize_env_signals(env_signals: Any) -> dict[str, Any]:
    shape, shape_reason = _detect_signal_shape(env_signals)
    result: dict[str, Any] = {
        "signal_shape_detected": shape,
        "signal_shape_reason": shape_reason,
        "signals_with_any_window": 0,
        "signals_declared": 0,
        "windows_detected": [],
    }
    if not isinstance(env_signals, dict) or not env_signals:
        return result

    windows_detected: set[str] = set()
    signals_with_windows: set[str] = set()
    signals_declared: set[str] = set()

    if shape in {"by_signal", "mixed"}:
        for signal_key in SIGNAL_KEYS:
            entry = env_signals.get(signal_key)
            if isinstance(entry, dict):
                signals_declared.add(signal_key)
                windows = entry.get("windows")
                if isinstance(windows, dict) and windows:
                    signals_with_windows.add(signal_key)
                    windows_detected.update(str(k) for k in windows.keys())

    if shape in {"by_window", "mixed"}:
        for window_key, window_payload in env_signals.items():
            if not isinstance(window_payload, dict):
                continue
            # Tratamos o nó como janela apenas se contiver sinais conhecidos.
            recognized = False
            for signal_key in SIGNAL_KEYS:
                if signal_key in window_payload:
                    recognized = True
                    signals_declared.add(signal_key)
                    signals_with_windows.add(signal_key)
            if recognized:
                windows_detected.add(str(window_key))

    result["signals_with_any_window"] = len(signals_with_windows)
    result["signals_declared"] = len(signals_declared)
    result["windows_detected"] = sorted(windows_detected)
    return result


def _signal_readiness_from_baseline(
    baseline: dict[str, Any],
    environment_scope: str,
) -> tuple[dict[str, Any], dict[str, int], bool, bool]:
    environments = _required_environments(environment_scope)
    evidence = baseline.get("evidence") or {}
    envs = (evidence.get("environments") or {}) if isinstance(evidence, dict) else {}
    thresholds = baseline.get("thresholds") or {}
    result: dict[str, Any] = {env: {} for env in environments}
    summary_counts = {
        "signals_total": len(SIGNAL_KEYS) * len(environments),
        "signals_ready": 0,
        "signals_partial": 0,
        "signals_pending_4e9r_real_evidence": 0,
    }

    any_ready = False
    any_observed = False
    for env in environments:
        env_signal_status = ((envs.get(env) or {}).get("signal_status") or {}) if isinstance(envs.get(env), dict) else {}
        env_threshold_state = ((thresholds.get(env) or {}).get("calibration_state")) if isinstance(thresholds, dict) else None
        env_entry: dict[str, Any] = {
            "environment_status_4e9": (envs.get(env) or {}).get("status") if isinstance(envs.get(env), dict) else None,
            "thresholds_calibration_state_4e9": env_threshold_state,
            "signals": {},
            "summary": {
                "signals_total": len(SIGNAL_KEYS),
                "signals_ready": 0,
                "signals_partial": 0,
                "signals_pending_4e9r_real_evidence": 0,
            },
        }
        for signal_key in SIGNAL_KEYS:
            signal_entry = env_signal_status.get(signal_key) if isinstance(env_signal_status, dict) else None
            if not isinstance(signal_entry, dict):
                evidence_status = "provisional_no_evidence"
                windows_present: list[str] = []
                reason = "sinal ausente em baseline.evidence.environments.*.signal_status"
            else:
                evidence_status = str(signal_entry.get("status") or "unknown")
                windows_present = list(signal_entry.get("windows_present") or [])
                reason = signal_entry.get("reason")

            if evidence_status == "evidence_present_all_windows":
                promotion_readiness = "ready_for_threshold_finalization"
                readiness_reason = "evidencia_real_15m_7d_30d_presente"
                env_entry["summary"]["signals_ready"] += 1
                summary_counts["signals_ready"] += 1
                any_ready = True
                any_observed = True
            elif evidence_status in {"evidence_partial", "no_data_or_query_error"}:
                promotion_readiness = "partial_evidence_pending_4e9r_real_evidence"
                readiness_reason = "evidencia_real_incompleta_ou_query_error"
                env_entry["summary"]["signals_partial"] += 1
                summary_counts["signals_partial"] += 1
                any_observed = True
            else:
                promotion_readiness = "pending_4e9r_real_evidence"
                readiness_reason = "sem_evidencia_real_15m_7d_30d"
                env_entry["summary"]["signals_pending_4e9r_real_evidence"] += 1
                summary_counts["signals_pending_4e9r_real_evidence"] += 1

            env_entry["signals"][signal_key] = {
                "evidence_status_4e9": evidence_status,
                "windows_present_4e9": windows_present,
                "promotion_readiness": promotion_readiness,
                "reason": readiness_reason,
                "reason_from_4e9": reason,
            }
        result[env] = env_entry

    fully_ready = summary_counts["signals_ready"] == summary_counts["signals_total"]
    return result, summary_counts, (fully_ready or any_ready), any_observed


def _naming_readiness(
    naming: dict[str, Any],
    evidence: dict[str, Any] | None,
    environment_scope: str,
) -> dict[str, Any]:
    validation = naming.get("validation") or {}
    profiles = naming.get("profiles") or {}
    validation_status = str(validation.get("status") or "unknown")
    final_profile_detected = validation.get("final_profile_detected")
    final_profile_applied = validation.get("final_profile_applied_as_default")

    profile_detection_status, profile_detection_source = _extract_profile_detection(evidence)

    if environment_scope == ENVIRONMENT_SCOPE_DEV_LOCAL:
        if validation_status == "dev_local_real_evidence":
            status = "dev_local_real_evidence"
            pending = False
            reason = "naming_validado_por_evidencia_real_dev_local"
        else:
            status = "pending_4e9r_real_evidence"
            pending = True
            reason = "naming_dev_local_sem_evidencia_real"
    elif (
        validation_status == "validated_from_real_evidence"
        and isinstance(final_profile_applied, str)
        and final_profile_applied in profiles
    ):
        status = "ready_for_default_profile_finalization"
        pending = False
        reason = "profile_validado_por_evidencia_real"
    else:
        status = "pending_4e9r_real_evidence"
        pending = True
        if profile_detection_status in {"ambiguous_tie", "no_matches"}:
            reason = f"prometheus_profile_detection_{profile_detection_status}"
        else:
            reason = "naming_real_nao_validado_na_4e9"

    return {
        "status": status,
        "pending_4e9r_real_evidence": pending,
        "current_default_profile": naming.get("default_profile"),
        "validation_status_4e9": validation_status,
        "final_profile_detected_4e9": final_profile_detected,
        "final_profile_applied_as_default_4e9": final_profile_applied,
        "profile_detection_status_from_evidence": profile_detection_status,
        "profile_detection_source_path_from_evidence": profile_detection_source,
        "environment_scope": environment_scope,
        "available_profiles": sorted(profiles.keys()) if isinstance(profiles, dict) else [],
        "reason": reason,
    }


def _workspace_preconditions() -> dict[str, Any]:
    checks: dict[str, Any] = {}
    missing = []
    invalid = []
    for key, env_name in REQUIRED_WORKSPACE_PRECONDITIONS.items():
        value = os.getenv(env_name)
        normalized = _normalize_string(value)
        present = isinstance(normalized, str) and normalized != ""
        kind = "secret"
        if "url" in key:
            kind = "url"
        elif "uid" in key:
            kind = "uid"

        if not present:
            valid = False
            invalid_reason = "missing_or_empty"
        elif kind == "url":
            valid, invalid_reason = _validate_url_value(normalized)
        elif kind == "uid":
            valid, invalid_reason = _validate_uid_value(normalized)
        else:
            valid, invalid_reason = _validate_secret_value(normalized)

        checks[key] = {
            "env": env_name,
            "kind": kind,
            "present": present,
            "valid": valid,
            "invalid_reason": invalid_reason,
            "value_length": len(value) if isinstance(value, str) else 0,
        }
        if not present:
            missing.append(env_name)
        elif not valid:
            invalid.append(env_name)

    status = "ready_current_workspace" if not missing and not invalid else "pending_4e9r_real_evidence"
    return {
        "status": status,
        "pending_4e9r_real_evidence": bool(missing or invalid),
        "checks": checks,
        "missing": missing,
        "invalid": invalid,
        "operator_runtime_args_still_required": [
            "--grafana-dashboards-dir",
            "--grafana-provisioning-dir",
            "--prometheus-rules-dir",
            "--loki-rules-dir",
        ],
        "reason": (
            None
            if not missing and not invalid
            else "workspace_missing_placeholder_or_invalid_preconditions_for_apply_smoke_real"
        ),
    }


def _smoke_report_summary(report: dict[str, Any] | None) -> dict[str, Any]:
    if report is None:
        return {"present": False, "status": "not_found"}
    return {
        "present": True,
        "status": report.get("status"),
        "mode": report.get("mode"),
        "local_render_status": ((report.get("local_render") or {}).get("status")),
        "remote_status": ((report.get("remote") or {}).get("status")) if isinstance(report.get("remote"), dict) else None,
    }


def _evidence_summary(evidence: dict[str, Any] | None, environment_scope: str) -> dict[str, Any]:
    environments = _required_environments(environment_scope)
    if evidence is None:
        return {
            "present": False,
            "status": "not_found",
            "environment_scope": environment_scope,
            "naming_observed_final_profile": None,
            "naming_profile_detection_status": None,
            "naming_profile_detection_source_path": None,
            "environments": {env: _summarize_env_signals({}) for env in environments},
        }
    env_summary: dict[str, Any] = {}
    signals = evidence.get("signals") or {}
    profile_detection_status, profile_detection_source = _extract_profile_detection(evidence)
    for env in environments:
        env_signals = signals.get(env) if isinstance(signals, dict) else {}
        env_summary[env] = _summarize_env_signals(env_signals)
    return {
        "present": True,
        "status": evidence.get("status"),
        "environment_scope": environment_scope,
        "naming_observed_final_profile": ((evidence.get("naming_observed") or {}).get("final_profile")),
        "naming_profile_detection_status": profile_detection_status,
        "naming_profile_detection_source_path": profile_detection_source,
        "environments": env_summary,
    }


def build_readiness_payload(
    baseline: dict[str, Any],
    naming: dict[str, Any],
    evidence: dict[str, Any] | None,
    smoke_report: dict[str, Any] | None,
    source_paths: dict[str, Path | None],
    environment_scope: str,
) -> dict[str, Any]:
    baseline_signals, baseline_counts, any_signal_ready, any_signal_observed = _signal_readiness_from_baseline(
        baseline,
        environment_scope,
    )
    naming_readiness = _naming_readiness(naming, evidence, environment_scope)
    apply_readiness = _workspace_preconditions()
    smoke_summary = _smoke_report_summary(smoke_report)
    evidence_summary = _evidence_summary(evidence, environment_scope)

    if environment_scope == ENVIRONMENT_SCOPE_DEV_LOCAL:
        baseline_readiness_status = "dev_local_real_evidence" if any_signal_observed else "pending_4e9r_real_evidence"
    else:
        baseline_readiness_status = (
            "ready_for_full_threshold_finalization"
            if baseline_counts["signals_ready"] == baseline_counts["signals_total"]
            else ("partial_signal_finalization_ready" if any_signal_ready else "pending_4e9r_real_evidence")
        )
    baseline_pending = baseline_readiness_status not in {"ready_for_full_threshold_finalization", "dev_local_real_evidence"}

    if environment_scope == ENVIRONMENT_SCOPE_DEV_LOCAL:
        if apply_readiness["pending_4e9r_real_evidence"] or smoke_summary.get("status") in {
            None,
            "not_found",
            "blocked_missing_remote_endpoints",
        }:
            apply_real_status = "pending_4e9r_real_evidence"
        else:
            apply_real_status = "dev_local_real_evidence" if smoke_summary.get("status") in {"ok", "partial"} else "pending_4e9r_real_evidence"
    else:
        apply_real_status = (
            apply_readiness["status"]
            if smoke_summary.get("status") in {None, "not_found"}
            else (
                "pending_4e9r_real_evidence"
                if apply_readiness["pending_4e9r_real_evidence"] or smoke_summary.get("status") != "ok"
                else "ready_current_workspace"
            )
        )
    apply_real_pending = apply_real_status in {"pending_4e9r_real_evidence"}

    pending_blocks: list[str] = []
    if baseline_pending:
        pending_blocks.append("thresholds_final_promotion")
    if naming_readiness["pending_4e9r_real_evidence"]:
        pending_blocks.append("naming_default_profile_finalization")
    if apply_real_pending:
        pending_blocks.append("apply_real_and_remote_smoke")

    if not pending_blocks:
        top_status = (
            "ready_dev_local_real_evidence"
            if environment_scope == ENVIRONMENT_SCOPE_DEV_LOCAL
            else "ready_to_absorb_4e9r_real_evidence_without_rework"
        )
    else:
        top_status = (
            "partial_dev_local_real_evidence"
            if environment_scope == ENVIRONMENT_SCOPE_DEV_LOCAL
            else "partial_pending_4e9r_real_evidence"
        )

    payload: dict[str, Any] = {
        "version": 1,
        "phase": "4E.10",
        "status": top_status,
        "environment_scope": environment_scope,
        "environment_scope_status": (
            "dev_local_real_evidence"
            if environment_scope == ENVIRONMENT_SCOPE_DEV_LOCAL
            else "staging_prod_real_evidence"
        ),
        "generated_at": utc_now_iso(),
        "sources": {
            "baseline_4e9": _repo_relative(source_paths.get("baseline")),
            "naming_4e9": _repo_relative(source_paths.get("naming")),
            "evidence_4e9": _repo_relative(source_paths.get("evidence")),
            "post_apply_smoke_report_4e9": _repo_relative(source_paths.get("smoke_report")),
        },
        "compatibility": {
            "status": "ok",
            "supports_provisional_calibration_state_4e9": True,
            "supports_candidate_default_profile_4e9": True,
            "supports_profiles_alternativos_fallback": True,
            "supports_dev_local_environment_scope": True,
            "baseline_phase_detected": baseline.get("phase"),
            "naming_phase_detected": naming.get("phase"),
            "baseline_status_detected": baseline.get("status"),
            "naming_validation_status_detected": ((naming.get("validation") or {}).get("status")),
            "expected_dry_run_commands_unchanged": [
                "pnpm observability:validate",
                "pnpm observability:apply:dry-run",
                "pnpm observability:post-apply:smoke",
            ],
        },
        "baseline_threshold_finalization_readiness": {
            "status": baseline_readiness_status,
            "pending_4e9r_real_evidence": baseline_pending,
            "environment_scope": environment_scope,
            "summary_counts": baseline_counts,
            "environments": baseline_signals,
            "policy": {
                "rule": "nao_promover_threshold_final_sem_evidencia_real_15m_7d_30d",
                "allow_partial_signal_finalization_when_supported_by_real_evidence": True,
            },
        },
        "naming_default_profile_finalization_readiness": naming_readiness,
        "apply_real_remote_smoke_readiness": {
            "status": apply_real_status,
            "pending_4e9r_real_evidence": apply_real_pending,
            "environment_scope": environment_scope,
            "workspace_preconditions": apply_readiness,
            "current_smoke_report_4e9_summary": smoke_summary,
            "reason": "depende_de_endpoints_credenciais_uids_e_execucao_remota_real",
        },
        "observed_4e9_evidence_summary": evidence_summary,
        "pending_dependencies": [
            {
                "id": "pending_4e9r_real_evidence",
                "status": "blocking" if pending_blocks else "resolved",
                "blocks": pending_blocks,
                "required_inputs": [
                    "endpoints reais Grafana/Prometheus/Loki"
                    + (" (dev_local localhost)" if environment_scope == ENVIRONMENT_SCOPE_DEV_LOCAL else ""),
                    "GRAFANA_API_TOKEN",
                    "MAPIA_DS_PROMETHEUS_UID",
                    "MAPIA_DS_LOKI_UID",
                    "evidencias agregadas 15m/7d/30d por ambiente/sinal"
                    + (" no escopo dev_local" if environment_scope == ENVIRONMENT_SCOPE_DEV_LOCAL else ""),
                    "apply real + post-apply-smoke remoto com relatorio",
                ],
            }
        ],
        "coupling_points_to_4e9r": [
            "baseline-thresholds.4e9.yaml -> evidence.environments.*.signal_status",
            "baseline-thresholds.4e9.yaml -> thresholds.*.calibration_state",
            "naming-compatibility.4e9.yaml -> validation.status/final_profile_detected/final_profile_applied_as_default",
            "observability-evidence.4e9.capture.json -> naming_observed.final_profile e signals.<env>.<signal>.windows",
            "post-apply-smoke report 4E.9/4E.9R -> status remoto (Grafana/Prometheus/Loki)",
        ],
        "next_actions": [
            (
                "Executar 4E.9R em dev_local com endpoints localhost reais e registrar evidencias sem marcar staging/producao."
                if environment_scope == ENVIRONMENT_SCOPE_DEV_LOCAL
                else "Executar 4E.9R com endpoints/credenciais/UIDs reais para desbloquear `pending_4e9r_real_evidence`."
            ),
            "Regerar este artefato 4E.10 apos coleta real/promoção/smoke remoto para atualizar readiness sem retrabalho.",
            "Promover thresholds/profile final somente para sinais/perfis suportados por evidencia real validada.",
        ],
    }
    return payload


def main() -> int:
    args = parse_args()

    baseline_path = Path(args.baseline).resolve()
    naming_path = Path(args.naming).resolve()
    evidence_path = Path(args.evidence).resolve()
    smoke_report_path = Path(args.post_apply_smoke_report).resolve()
    output_path = Path(args.output).resolve()

    baseline = _load_yaml_required(baseline_path, expected_phase="4E.9")
    naming = _load_yaml_required(naming_path, expected_phase="4E.9")
    evidence = _load_json_optional(evidence_path)
    smoke_report = _load_json_optional(smoke_report_path)
    environment_scope = _resolve_environment_scope(args.environment_scope, baseline, evidence)

    payload = build_readiness_payload(
        baseline=baseline,
        naming=naming,
        evidence=evidence,
        smoke_report=smoke_report,
        environment_scope=environment_scope,
        source_paths={
            "baseline": baseline_path,
            "naming": naming_path,
            "evidence": evidence_path if evidence is not None else None,
            "smoke_report": smoke_report_path if smoke_report is not None else None,
        },
    )

    write_text(output_path, _yaml_dump(payload))
    print(f"Finalization readiness 4E.10 gerado: {output_path}")
    print(f"Status: {payload['status']}")
    print(
        "Threshold finalization readiness: "
        f"{payload['baseline_threshold_finalization_readiness']['status']}"
    )
    print(
        "Naming finalization readiness: "
        f"{payload['naming_default_profile_finalization_readiness']['status']}"
    )
    print(
        "Apply/smoke real readiness: "
        f"{payload['apply_real_remote_smoke_readiness']['status']}"
    )
    print(f"Environment scope: {environment_scope}")

    strict_ready_expected_status = (
        "ready_dev_local_real_evidence"
        if environment_scope == ENVIRONMENT_SCOPE_DEV_LOCAL
        else "ready_to_absorb_4e9r_real_evidence_without_rework"
    )
    if args.strict_ready and payload["status"] != strict_ready_expected_status:
        print("Modo strict-ready: bloqueios pendentes detectados (`pending_4e9r_real_evidence`).")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
