from __future__ import annotations

import argparse
import copy
import sys
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


SIGNAL_STATUS_KEYS = [
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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Promove baseline/naming para 4E.9 a partir de evidencias")
    parser.add_argument(
        "--evidence",
        default=str(OBS_ROOT / "evidence" / "observability-evidence.4e9.capture.json"),
        help="Arquivo JSON de evidencias agregadas",
    )
    parser.add_argument(
        "--output-baseline",
        default=str(OBS_ROOT / "calibration" / "baseline-thresholds.4e9.yaml"),
        help="Arquivo YAML de baseline 4E.9",
    )
    parser.add_argument(
        "--output-naming",
        default=str(OBS_ROOT / "calibration" / "naming-compatibility.4e9.yaml"),
        help="Arquivo YAML de naming 4E.9",
    )
    parser.add_argument(
        "--allow-threshold-overrides-from-evidence",
        action="store_true",
        help="Permite aplicar `threshold_decisions` presentes no arquivo de evidencias",
    )
    parser.add_argument(
        "--environment-scope",
        choices=sorted(VALID_ENVIRONMENT_SCOPES),
        help="Escopo de ambientes. Se omitido, detecta do arquivo de evidencias (default implícito: staging_prod).",
    )
    return parser.parse_args()


def _required_environments(environment_scope: str) -> list[str]:
    if environment_scope == ENVIRONMENT_SCOPE_DEV_LOCAL:
        return ["dev_local"]
    return ["staging", "production"]


def _detect_environment_scope(evidence: dict[str, Any], explicit_scope: str | None = None) -> str:
    if explicit_scope in VALID_ENVIRONMENT_SCOPES:
        return explicit_scope
    collector_scope = ((evidence.get("collector") or {}).get("environment_scope")) if isinstance(evidence, dict) else None
    if collector_scope in VALID_ENVIRONMENT_SCOPES:
        return str(collector_scope)
    top_scope = evidence.get("environment_scope") if isinstance(evidence, dict) else None
    if top_scope in VALID_ENVIRONMENT_SCOPES:
        return str(top_scope)
    signals = evidence.get("signals") if isinstance(evidence, dict) else None
    if isinstance(signals, dict):
        signal_envs = {str(key) for key in signals.keys()}
        if "dev_local" in signal_envs and not ({"staging", "production"} & signal_envs):
            return ENVIRONMENT_SCOPE_DEV_LOCAL
    return ENVIRONMENT_SCOPE_STAGING_PROD


def _deep_update_scalars(target: dict[str, Any], patch: dict[str, Any], prefix: str = "") -> list[str]:
    applied: list[str] = []
    for key, value in patch.items():
        path = f"{prefix}.{key}" if prefix else key
        if isinstance(value, dict):
            current = target.get(key)
            if not isinstance(current, dict):
                target[key] = {}
                current = target[key]
            applied.extend(_deep_update_scalars(current, value, path))
            continue
        target[key] = value
        applied.append(path)
    return applied


def _repo_relative_str(path_str: str | None) -> str | None:
    if not path_str:
        return path_str
    try:
        path = Path(path_str).resolve()
        return str(path.relative_to(OBS_ROOT)).replace("\\", "/")
    except Exception:  # noqa: BLE001
        return path_str


def _load_evidence(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {
            "version": 1,
            "phase": "4E.9",
            "status": "missing_evidence_file",
            "collected_at": None,
            "signals": {"staging": {}, "production": {}},
            "naming_observed": {"status": "not_collected", "final_profile": None, "profile_candidates": {}},
            "remote_smoke": {"grafana": {"executed": False}, "prometheus": {"executed": False}, "loki": {"executed": False}},
            "notes": [f"Arquivo de evidencia nao encontrado: {path}"],
        }
    data = load_json_file(path)
    if not isinstance(data, dict):
        raise ValueError("Arquivo de evidencias deve conter objeto JSON")
    return data


def _windows_present(signal_entry: dict[str, Any]) -> list[str]:
    windows = signal_entry.get("windows")
    if not isinstance(windows, dict):
        return []
    return [window for window, payload in windows.items() if isinstance(payload, dict) and payload.get("status") in {"ok", "ok_multi"}]


def _env_status(signals_by_env: dict[str, Any]) -> tuple[str, dict[str, Any], list[str]]:
    signal_status_map: dict[str, Any] = {}
    pending: list[str] = []
    completed = 0
    partial = 0
    for signal_key in SIGNAL_STATUS_KEYS:
        entry = signals_by_env.get(signal_key) if isinstance(signals_by_env, dict) else None
        if not isinstance(entry, dict):
            signal_status_map[signal_key] = {
                "status": "provisional_no_evidence",
                "windows_present": [],
                "reason": "sinal ausente no arquivo de evidencias",
            }
            pending.append(signal_key)
            continue
        status = str(entry.get("status") or "unknown")
        windows = _windows_present(entry)
        if status == "evidence_present_all_windows":
            normalized = "evidence_present_all_windows"
            completed += 1
        elif status in {"evidence_partial", "no_data_or_query_error"}:
            normalized = status
            partial += 1
            pending.append(signal_key)
        else:
            normalized = "provisional_no_evidence"
            pending.append(signal_key)
        signal_status_map[signal_key] = {
            "status": normalized,
            "windows_present": windows,
            "reason": entry.get("reason"),
        }

    if completed == len(SIGNAL_STATUS_KEYS):
        env_status = "evidence_complete_all_required_signals"
    elif completed > 0 or partial > 0:
        env_status = "evidence_partial"
    else:
        env_status = "no_real_evidence"
    return env_status, signal_status_map, pending


def _flatten_scalar_paths(payload: dict[str, Any], prefix: str = "") -> dict[str, Any]:
    flat: dict[str, Any] = {}
    for key, value in payload.items():
        path = f"{prefix}.{key}" if prefix else key
        if isinstance(value, dict):
            flat.update(_flatten_scalar_paths(value, path))
            continue
        flat[path] = value
    return flat


def _build_threshold_delta(
    source_baseline: dict[str, Any],
    promoted_baseline: dict[str, Any],
    evidence: dict[str, Any],
    applied_overrides: list[str],
) -> dict[str, Any]:
    overrides = set(applied_overrides)
    evidence_source = _repo_relative_str(evidence.get("_source_file"))

    def _reason_for(path: str, previous: Any, current: Any) -> tuple[str, str | None]:
        if path in overrides:
            return ("manual_threshold_decision_from_evidence", f"threshold_decisions.{path}")
        if previous == current:
            return ("inherited_from_4e8_pending_real_evidence", None)
        return ("changed_during_promotion_review_required", evidence_source)

    payload: dict[str, Any] = {
        "source_baseline": str(resolve_calibration_file("baseline-thresholds", preferred_phases=("4e8",)).relative_to(OBS_ROOT)).replace(
            "\\", "/"
        ),
        "evidence_source_file": evidence_source,
        "generated_at": utc_now_iso(),
        "staging": {},
        "production": {},
    }

    source_thresholds = (source_baseline.get("thresholds") or {})
    promoted_thresholds = (promoted_baseline.get("thresholds") or {})
    for env in ["staging", "production"]:
        source_env = source_thresholds.get(env) if isinstance(source_thresholds, dict) else {}
        promoted_env = promoted_thresholds.get(env) if isinstance(promoted_thresholds, dict) else {}
        if not isinstance(source_env, dict):
            source_env = {}
        if not isinstance(promoted_env, dict):
            promoted_env = {}

        source_flat = {
            path: value
            for path, value in _flatten_scalar_paths(source_env).items()
            if path != "calibration_state"
        }
        promoted_flat = {
            path: value
            for path, value in _flatten_scalar_paths(promoted_env).items()
            if path != "calibration_state"
        }

        env_delta: dict[str, Any] = {}
        for path in sorted(set(source_flat) | set(promoted_flat)):
            previous = source_flat.get(path)
            current = promoted_flat.get(path)
            reason, evidence_used = _reason_for(f"{env}.{path}", previous, current)
            env_delta[path] = {
                "previous": previous,
                "current": current,
                "reason": reason,
                "evidence_used": evidence_used,
            }
        payload[env] = env_delta

    return payload


def _promote_baseline(
    evidence: dict[str, Any],
    apply_threshold_overrides: bool,
    *,
    environment_scope: str,
) -> tuple[dict[str, Any], list[str]]:
    source_baseline_path = resolve_calibration_file("baseline-thresholds", preferred_phases=("4e8",))
    source_baseline = load_yaml_file(source_baseline_path)
    if not isinstance(source_baseline, dict):
        raise ValueError("baseline 4E.8 invalida")

    baseline = copy.deepcopy(source_baseline)
    baseline["phase"] = "4E.9"
    baseline["status"] = "partial_blocked_pending_real_evidence"
    baseline["calibration_date"] = utc_now_iso().split("T", 1)[0]
    baseline["source_baseline"] = str(source_baseline_path.relative_to(OBS_ROOT)).replace("\\", "/")
    baseline["environment_scope"] = environment_scope
    baseline["environment_scope_status"] = (
        "dev_local_real_evidence"
        if environment_scope == ENVIRONMENT_SCOPE_DEV_LOCAL
        else "staging_prod_real_evidence"
    )

    evidence_path = _repo_relative_str(evidence.get("_source_file"))
    envs_raw = evidence.get("signals") or {}
    required_environments = _required_environments(environment_scope)
    environment_entries: dict[str, Any] = {}
    pending_by_environment: dict[str, list[str]] = {}
    has_real_data = False
    for env in required_environments:
        env_status, env_signal_status, env_pending = _env_status((envs_raw.get(env) or {}))
        if env_status in {"evidence_complete_all_required_signals", "evidence_partial"}:
            has_real_data = True
        environment_entries[env] = {
            "status": env_status,
            "signal_status": env_signal_status,
        }
        pending_by_environment[env] = env_pending

    applied_overrides: list[str] = []
    threshold_decisions = evidence.get("threshold_decisions")
    if apply_threshold_overrides and isinstance(threshold_decisions, dict):
        for env in ["staging", "production"]:
            env_patch = threshold_decisions.get(env)
            if isinstance(env_patch, dict) and isinstance(baseline.get("thresholds", {}).get(env), dict):
                applied_overrides.extend(
                    [f"{env}.{path}" for path in _deep_update_scalars(baseline["thresholds"][env], env_patch)]
                )
                # Promocao explicita se houve override manual com evidencias.
                baseline["thresholds"][env]["calibration_state"] = "manually_promoted_from_4e9_evidence"

    for env in ["staging", "production"]:
        env_thresholds = (baseline.get("thresholds") or {}).get(env)
        if isinstance(env_thresholds, dict) and env_thresholds.get("calibration_state") != "manually_promoted_from_4e9_evidence":
            env_thresholds["calibration_state"] = "provisional_4e9_inherited_from_4e8_pending_real_evidence"

    if environment_scope == ENVIRONMENT_SCOPE_DEV_LOCAL:
        baseline["status"] = "dev_local_real_evidence" if has_real_data else "blocked_dev_local_real_evidence_missing"
    elif applied_overrides and has_real_data:
        baseline["status"] = "partial_real_baseline_with_manual_threshold_promotions"

    baseline["evidence"] = {
        "status": evidence.get("status"),
        "environment_scope": environment_scope,
        "required_environments": required_environments,
        "source_file": evidence_path,
        "collected_at": evidence.get("collected_at"),
        "required_windows": {"alert": "15m", "operational": "7d", "trend": "30d"},
        "remote_smoke": evidence.get("remote_smoke", {}),
        "naming_observed_final_profile": ((evidence.get("naming_observed") or {}).get("final_profile")),
        "environments": environment_entries,
    }

    pending_real_data_signals: list[str] = []
    for env in required_environments:
        pending_real_data_signals.extend(pending_by_environment.get(env) or [])
    baseline["pending_real_data_signals"] = sorted(set(pending_real_data_signals))
    baseline["thresholds_overrides_applied_from_evidence"] = applied_overrides
    baseline["thresholds_delta"] = _build_threshold_delta(source_baseline, baseline, evidence, applied_overrides)
    baseline["recalibration_notes"] = [
        "4E.9 promove o pipeline de ingestao/coleta de evidencias reais e baseline/naming versionados para promocao automatizada.",
        "Thresholds nao sao promovidos automaticamente sem evidencias reais e/ou `threshold_decisions` explicitas no arquivo de evidencias.",
        "Quando ha evidencias parciais, manter provisório por sinal/ambiente com motivo registrado em `evidence.environments.*.signal_status`.",
    ]
    baseline["next_step_to_finalize_real_baseline"] = [
        "Executar `collect-observability-evidence.py` com endpoints reais de Grafana/Prometheus/Loki e confirmar `signals.*.*.status` com janelas 15m/7d/30d.",
        "Preencher/gerar `threshold_decisions` com thresholds finais por sinal/ambiente a partir das evidencias reais.",
        "Reexecutar `promote-baseline-4e9.py --allow-threshold-overrides-from-evidence` e ajustar rules conforme thresholds promovidos.",
    ]
    if environment_scope == ENVIRONMENT_SCOPE_DEV_LOCAL:
        baseline["next_step_to_finalize_real_baseline"].append(
            "Em `dev_local`, manter status `dev_local_real_evidence` para validação operacional sem promover defaults globais de staging/producao."
        )
    return baseline, applied_overrides


def _promote_naming(evidence: dict[str, Any], *, environment_scope: str) -> dict[str, Any]:
    source_naming_path = resolve_calibration_file("naming-compatibility", preferred_phases=("4e8",))
    source_naming = load_yaml_file(source_naming_path)
    if not isinstance(source_naming, dict):
        raise ValueError("naming 4E.8 invalido")

    naming = copy.deepcopy(source_naming)
    naming["phase"] = "4E.9"
    naming["source_naming"] = str(source_naming_path.relative_to(OBS_ROOT)).replace("\\", "/")
    naming["environment_scope"] = environment_scope
    naming["status"] = "dev_local_real_evidence" if environment_scope == ENVIRONMENT_SCOPE_DEV_LOCAL else "staging_prod_real_evidence"

    naming_observed = evidence.get("naming_observed") or {}
    final_profile = naming_observed.get("final_profile")
    profiles = naming.get("profiles") or {}
    profile_validated = isinstance(final_profile, str) and final_profile in profiles

    should_promote_default_profile = environment_scope != ENVIRONMENT_SCOPE_DEV_LOCAL and profile_validated
    if should_promote_default_profile:
        naming["default_profile"] = final_profile

    validation_status = "validated_from_real_evidence" if should_promote_default_profile else "blocked_no_real_profile_validation"
    if environment_scope == ENVIRONMENT_SCOPE_DEV_LOCAL:
        validation_status = (
            "dev_local_real_evidence"
            if str(naming_observed.get("status") or "") == "collected"
            else "blocked_no_real_profile_validation"
        )

    naming["validation"] = {
        "status": validation_status,
        "environment_scope": environment_scope,
        "validated_on": utc_now_iso(),
        "source_evidence_file": _repo_relative_str(evidence.get("_source_file")),
        "evidence_status": evidence.get("status"),
        "candidate_scores": naming_observed.get("profile_candidates", {}),
        "observed_prometheus_labels_sample": ((naming_observed.get("prometheus") or {}).get("labels_present") or [])[:50],
        "observed_loki_labels_sample": ((naming_observed.get("loki") or {}).get("labels_present") or [])[:50],
        "final_profile_detected": final_profile,
        "final_profile_applied_as_default": final_profile if should_promote_default_profile else None,
    }

    notes = list(naming.get("notes") or [])
    notes.append(
        "4E.9 adiciona metadados de validacao por evidencia real; sem evidencias reais, o profile default pode permanecer candidato (nao validado)."
    )
    if environment_scope == ENVIRONMENT_SCOPE_DEV_LOCAL:
        notes.append(
            "Escopo dev_local: evidencias reais locais nao promovem automaticamente default_profile global de staging/producao."
        )
    naming["notes"] = notes
    return naming


def _yaml_dump(payload: dict[str, Any]) -> str:
    return yaml.safe_dump(payload, sort_keys=False, allow_unicode=False)


def main() -> int:
    args = parse_args()
    evidence_path = Path(args.evidence).resolve()
    evidence = _load_evidence(evidence_path)
    evidence["_source_file"] = str(evidence_path)
    environment_scope = _detect_environment_scope(evidence, args.environment_scope)

    baseline, applied_overrides = _promote_baseline(
        evidence,
        args.allow_threshold_overrides_from_evidence,
        environment_scope=environment_scope,
    )
    naming = _promote_naming(evidence, environment_scope=environment_scope)

    output_baseline = Path(args.output_baseline).resolve()
    output_naming = Path(args.output_naming).resolve()
    write_text(output_baseline, _yaml_dump(baseline))
    write_text(output_naming, _yaml_dump(naming))

    print(f"Baseline 4E.9 gerada: {output_baseline}")
    print(f"Naming 4E.9 gerado: {output_naming}")
    print(f"Status baseline: {baseline.get('status')}")
    print(f"Environment scope: {environment_scope}")
    print(f"Status naming validation: {((naming.get('validation') or {}).get('status'))}")
    print(f"Threshold overrides aplicados: {len(applied_overrides)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
