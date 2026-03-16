from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _obs_common import OBS_ROOT, utc_now_iso, write_json_file  # noqa: E402
from _grafana_datasource_discovery import (  # noqa: E402
    DEFAULT_GRAFANA_TOKEN_ENV,
    GRAFANA_URL_ENV,
    discover_datasource_uids_from_grafana,
    resolve_missing_uid_env_vars,
    sanitize_discovery_error_message,
)
from _env_file import (  # noqa: E402
    CRITICAL_ENV_KEYS,
    EnvFileError,
    add_env_file_args,
    apply_env_file,
    looks_like_placeholder,
    normalize_string,
    validate_secret_value,
    validate_uid_value,
    validate_url_value,
)


ENV_REQUIREMENTS = {
    "grafana_url_env": ("GRAFANA_URL", "url"),
    "prometheus_url_env": ("PROMETHEUS_URL", "url"),
    "loki_url_env": ("LOKI_URL", "url"),
    "grafana_api_token_env": ("GRAFANA_API_TOKEN", "secret"),
    "grafana_prometheus_uid_env": ("MAPIA_DS_PROMETHEUS_UID", "uid"),
    "grafana_loki_uid_env": ("MAPIA_DS_LOKI_UID", "uid"),
}

APPLY_DEST_REQUIREMENTS = {
    "grafana_dashboards_dir_arg": ("--grafana-dashboards-dir", "path"),
    "grafana_provisioning_dir_arg": ("--grafana-provisioning-dir", "path"),
    "prometheus_rules_dir_arg": ("--prometheus-rules-dir", "path"),
    "loki_rules_dir_arg": ("--loki-rules-dir", "path"),
}

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Gate de precondicoes para execucao REAL da 4E.9R (anti-loop / stop condition)"
    )
    parser.add_argument("--grafana-dashboards-dir", help="Destino filesystem para dashboards Grafana (apply real)")
    parser.add_argument(
        "--grafana-provisioning-dir",
        help="Destino filesystem para provisioning dashboards Grafana (apply real)",
    )
    parser.add_argument("--prometheus-rules-dir", help="Destino filesystem para rules Prometheus (apply real)")
    parser.add_argument("--loki-rules-dir", help="Destino filesystem para rules Loki (apply real)")
    parser.add_argument("--grafana-url", help="URL do Grafana para autodiscovery de UIDs quando ausentes")
    parser.add_argument(
        "--grafana-token-env",
        default=DEFAULT_GRAFANA_TOKEN_ENV,
        help=f"Env var com token Grafana para autodiscovery (default: {DEFAULT_GRAFANA_TOKEN_ENV})",
    )
    parser.add_argument(
        "--output-report",
        help=(
            "Arquivo JSON opcional de relatorio seguro (sem valores secretos). "
            "Ex.: infra/observability/evidence/4e9r-preconditions.report.json"
        ),
    )
    parser.add_argument(
        "--require-ready-env",
        action="store_true",
        help="Retorna exit code 1 se qualquer precondicao estiver ausente/invalida (modo CI/stop condition)",
    )
    add_env_file_args(parser)
    return parser.parse_args()


def _attempt_uid_autodiscovery(args: argparse.Namespace) -> dict[str, Any]:
    metadata: dict[str, Any] = {
        "attempted": False,
        "resolved_by_autodiscovery": False,
        "prometheus_resolved_by_autodiscovery": False,
        "loki_resolved_by_autodiscovery": False,
        "all_required_uids_available_after_autodiscovery": False,
        "reason": None,
        "error": None,
    }

    prometheus_uid_present = bool(normalize_string(os.getenv("MAPIA_DS_PROMETHEUS_UID")))
    loki_uid_present = bool(normalize_string(os.getenv("MAPIA_DS_LOKI_UID")))
    if prometheus_uid_present and loki_uid_present:
        metadata["all_required_uids_available_after_autodiscovery"] = True
        return metadata

    metadata["attempted"] = True
    grafana_url = normalize_string(args.grafana_url or os.getenv(GRAFANA_URL_ENV))
    grafana_token = normalize_string(os.getenv(args.grafana_token_env))
    if not grafana_url:
        metadata["reason"] = "autodiscovery_skipped_missing_grafana_url"
        return metadata
    if not grafana_token:
        metadata["reason"] = "autodiscovery_skipped_missing_grafana_token"
        return metadata

    try:
        discovery = discover_datasource_uids_from_grafana(
            grafana_url=grafana_url,
            grafana_token=grafana_token,
            timeout_seconds=10,
        )
        resolution = resolve_missing_uid_env_vars(discovery)
        metadata.update(resolution)
        if not metadata.get("all_required_uids_available_after_autodiscovery"):
            metadata["reason"] = "autodiscovery_missing_prometheus_or_loki_datasource"
    except Exception as exc:  # noqa: BLE001
        metadata["reason"] = "autodiscovery_http_or_parse_error"
        metadata["error"] = sanitize_discovery_error_message(str(exc))
    return metadata


def _validate_path_value(value: str | None) -> tuple[bool, str | None, dict[str, Any]]:
    normalized = normalize_string(value)
    metadata: dict[str, Any] = {
        "is_absolute": None,
        "parent_exists": None,
        "has_explicit_parent_component": None,
    }
    if normalized is None or normalized == "":
        return (False, "missing_or_empty", metadata)
    is_placeholder, placeholder_reason = looks_like_placeholder(normalized)
    if is_placeholder:
        return (False, placeholder_reason, metadata)

    path_obj = Path(normalized)
    metadata["is_absolute"] = path_obj.is_absolute()
    metadata["has_explicit_parent_component"] = str(path_obj.parent) not in {"", "."}
    try:
        parent_path = path_obj.parent if path_obj.is_absolute() else (Path.cwd() / path_obj.parent)
        metadata["parent_exists"] = bool(parent_path.exists())
    except Exception:  # noqa: BLE001
        metadata["parent_exists"] = None
    return (True, None, metadata)


def _check_env_requirement(key: str, env_name: str, kind: str) -> dict[str, Any]:
    raw = os.getenv(env_name)
    normalized = normalize_string(raw)
    present = isinstance(normalized, str) and normalized != ""

    if not present:
        valid = False
        invalid_reason = "missing_or_empty"
    elif kind == "url":
        valid, invalid_reason = validate_url_value(normalized)
    elif kind == "uid":
        valid, invalid_reason = validate_uid_value(normalized)
    else:
        valid, invalid_reason = validate_secret_value(normalized)

    return {
        "id": key,
        "source": "env",
        "env": env_name,
        "kind": kind,
        "present": present,
        "valid": valid,
        "invalid_reason": invalid_reason,
        "value_length": len(raw) if isinstance(raw, str) else 0,
    }


def _check_arg_path_requirement(key: str, arg_flag: str, value: str | None) -> dict[str, Any]:
    normalized = normalize_string(value)
    present = isinstance(normalized, str) and normalized != ""
    valid, invalid_reason, path_meta = _validate_path_value(normalized)
    if not present:
        valid = False
        invalid_reason = "missing_or_empty"

    payload: dict[str, Any] = {
        "id": key,
        "source": "arg",
        "arg": arg_flag,
        "kind": "path",
        "present": present,
        "valid": valid,
        "invalid_reason": invalid_reason,
        "value_length": len(value) if isinstance(value, str) else 0,
    }
    payload.update(path_meta)
    return payload


def _build_report(
    args: argparse.Namespace,
    *,
    env_file_metadata: dict[str, Any] | None = None,
    env_file_error: str | None = None,
    uid_autodiscovery: dict[str, Any] | None = None,
) -> dict[str, Any]:
    checks: dict[str, Any] = {}
    missing: list[str] = []
    invalid: list[str] = []

    for key, (env_name, kind) in ENV_REQUIREMENTS.items():
        check = _check_env_requirement(key, env_name, kind)
        if key == "grafana_prometheus_uid_env":
            check["resolved_by_autodiscovery"] = bool((uid_autodiscovery or {}).get("prometheus_resolved_by_autodiscovery"))
        elif key == "grafana_loki_uid_env":
            check["resolved_by_autodiscovery"] = bool((uid_autodiscovery or {}).get("loki_resolved_by_autodiscovery"))
        checks[key] = check
        if not check["present"]:
            missing.append(env_name)
        elif not check["valid"]:
            invalid.append(env_name)

    arg_value_map = {
        "grafana_dashboards_dir_arg": args.grafana_dashboards_dir,
        "grafana_provisioning_dir_arg": args.grafana_provisioning_dir,
        "prometheus_rules_dir_arg": args.prometheus_rules_dir,
        "loki_rules_dir_arg": args.loki_rules_dir,
    }
    for key, (arg_flag, _kind) in APPLY_DEST_REQUIREMENTS.items():
        check = _check_arg_path_requirement(key, arg_flag, arg_value_map[key])
        checks[key] = check
        if not check["present"]:
            missing.append(arg_flag)
        elif not check["valid"]:
            invalid.append(arg_flag)

    env_file_check: dict[str, Any] = {
        "id": "env_file_arg",
        "source": "arg",
        "arg": "--env-file",
        "kind": "dotenv",
        "present": bool(args.env_file),
        "valid": env_file_error is None,
        "invalid_reason": None if env_file_error is None else "invalid_env_file",
        "value_length": len(args.env_file) if isinstance(args.env_file, str) else 0,
        "mode": args.env_file_mode,
        "priority": args.env_file_priority,
    }
    if env_file_metadata:
        env_file_check["loaded_keys_count"] = env_file_metadata.get("loaded_keys_count", 0)
        env_file_check["selected_keys_count"] = env_file_metadata.get("selected_keys_count", 0)
        env_file_check["applied_keys_count"] = env_file_metadata.get("applied_keys_count", 0)
        env_file_check["conflict_keys_count"] = env_file_metadata.get("conflict_keys_count", 0)
    checks["env_file_arg"] = env_file_check
    if env_file_error:
        invalid.append("--env-file")

    blocked = bool(missing or invalid)
    status = "blocked_preconditions_missing" if blocked else "ready_preconditions_met"

    notes: list[str] = []
    for key in APPLY_DEST_REQUIREMENTS:
        check = checks[key]
        if check["present"] and check["valid"] and check.get("parent_exists") is False:
            notes.append(
                f"{check['arg']}: diretorio pai nao existe no host atual (confirmar destino ou pre-criar diretorios antes do apply)"
            )
    if env_file_metadata and env_file_metadata.get("enabled"):
        notes.append(
            "env-file carregado sem expor valores: "
            f"selected_keys={env_file_metadata.get('selected_keys_count', 0)} "
            f"applied_keys={env_file_metadata.get('applied_keys_count', 0)} "
            f"mode={env_file_metadata.get('mode')} "
            f"priority={env_file_metadata.get('priority')} "
            f"conflicts={env_file_metadata.get('conflict_keys_count', 0)}"
        )
    if env_file_error:
        notes.append(f"--env-file invalido: {env_file_error}")
    if (uid_autodiscovery or {}).get("attempted"):
        notes.append(
            "datasource UID autodiscovery: "
            f"resolved_by_autodiscovery={bool((uid_autodiscovery or {}).get('resolved_by_autodiscovery'))}"
        )
        if (uid_autodiscovery or {}).get("reason"):
            notes.append(f"datasource UID autodiscovery reason: {(uid_autodiscovery or {}).get('reason')}")
        if (uid_autodiscovery or {}).get("error"):
            notes.append(f"datasource UID autodiscovery error: {(uid_autodiscovery or {}).get('error')}")

    return {
        "version": 1,
        "phase": "4E.9R",
        "kind": "preconditions_gate",
        "status": status,
        "checked_at": utc_now_iso(),
        "strict_mode_requested": bool(args.require_ready_env),
        "stop_condition": {
            "active": blocked,
            "message": (
                "Precondicoes reais ausentes/invalidas: NAO executar collect/apply/smoke ate corrigir ambiente."
                if blocked
                else "Precondicoes minimas presentes/validas. Prosseguir com o runbook 4E.9R REAL."
            ),
        },
        "summary": {
            "required_total": len(ENV_REQUIREMENTS) + len(APPLY_DEST_REQUIREMENTS),
            "checks_present": sum(1 for item in checks.values() if item.get("present") is True),
            "checks_valid": sum(1 for item in checks.values() if item.get("valid") is True),
            "missing_count": len(missing),
            "invalid_count": len(invalid),
        },
        "checks": checks,
        "missing": missing,
        "invalid": invalid,
        "notes": notes,
        "env_file": {
            "enabled": bool(env_file_metadata and env_file_metadata.get("enabled")),
            "mode": args.env_file_mode,
            "priority": args.env_file_priority,
            "path": str(Path(args.env_file).resolve()) if args.env_file else None,
            "loaded_keys_count": (env_file_metadata or {}).get("loaded_keys_count", 0),
            "selected_keys_count": (env_file_metadata or {}).get("selected_keys_count", 0),
            "applied_keys_count": (env_file_metadata or {}).get("applied_keys_count", 0),
            "conflict_keys_count": (env_file_metadata or {}).get("conflict_keys_count", 0),
            "conflicts_overridden_count": (env_file_metadata or {}).get("conflicts_overridden_count", 0),
            "conflicts_preserved_count": (env_file_metadata or {}).get("conflicts_preserved_count", 0),
            "error": env_file_error,
        },
        "uid_autodiscovery": {
            "attempted": bool((uid_autodiscovery or {}).get("attempted")),
            "resolved_by_autodiscovery": bool((uid_autodiscovery or {}).get("resolved_by_autodiscovery")),
            "prometheus_resolved_by_autodiscovery": bool(
                (uid_autodiscovery or {}).get("prometheus_resolved_by_autodiscovery")
            ),
            "loki_resolved_by_autodiscovery": bool((uid_autodiscovery or {}).get("loki_resolved_by_autodiscovery")),
            "all_required_uids_available_after_autodiscovery": bool(
                (uid_autodiscovery or {}).get("all_required_uids_available_after_autodiscovery")
            ),
            "reason": (uid_autodiscovery or {}).get("reason"),
            "error": (uid_autodiscovery or {}).get("error"),
        },
        "next_action": (
            "Corrigir precondicoes e rerodar este gate com --require-ready-env antes de iniciar a 4E.9R REAL."
            if blocked
            else "Executar coleta real (15m/7d/30d), promocao baseline/naming, apply real e smoke remoto."
        ),
    }


def _print_human_report(report: dict[str, Any]) -> None:
    print("4E.9R REAL preconditions gate")
    print(f"Status: {report['status']}")
    print(report["stop_condition"]["message"])
    summary = report.get("summary") or {}
    print(
        "Resumo: "
        f"required={summary.get('required_total')} "
        f"present={summary.get('checks_present')} "
        f"valid={summary.get('checks_valid')} "
        f"missing={summary.get('missing_count')} "
        f"invalid={summary.get('invalid_count')}"
    )

    missing = report.get("missing") or []
    invalid = report.get("invalid") or []
    checks = report.get("checks") or {}

    if missing:
        print("Missing:")
        for item in missing:
            print(f"- {item}")
    if invalid:
        print("Invalid:")
        for item in invalid:
            reason = None
            if isinstance(checks, dict):
                for check in checks.values():
                    if not isinstance(check, dict):
                        continue
                    if check.get("env") == item or check.get("arg") == item:
                        reason = check.get("invalid_reason")
                        break
            if reason:
                print(f"- {item} ({reason})")
            else:
                print(f"- {item}")

    notes = report.get("notes") or []
    if notes:
        print("Notas:")
        for note in notes:
            print(f"- {note}")
    uid_autodiscovery = report.get("uid_autodiscovery") or {}
    if uid_autodiscovery.get("attempted"):
        print(
            "UID autodiscovery: "
            f"resolved_by_autodiscovery={bool(uid_autodiscovery.get('resolved_by_autodiscovery'))}"
        )


def main() -> int:
    args = parse_args()
    env_file_metadata: dict[str, Any] | None = None
    env_file_error: str | None = None
    try:
        env_file_metadata = apply_env_file(
            args.env_file,
            mode=args.env_file_mode,
            priority=args.env_file_priority,
            selected_keys=CRITICAL_ENV_KEYS,
            priority_keys=CRITICAL_ENV_KEYS,
        )
    except EnvFileError as exc:
        env_file_error = str(exc)

    uid_autodiscovery = _attempt_uid_autodiscovery(args)
    report = _build_report(
        args,
        env_file_metadata=env_file_metadata,
        env_file_error=env_file_error,
        uid_autodiscovery=uid_autodiscovery,
    )

    _print_human_report(report)
    if args.output_report:
        output_path = Path(args.output_report)
        if not output_path.is_absolute():
            output_path = (OBS_ROOT.parent.parent / output_path).resolve()
        write_json_file(output_path, report)
        print(f"Relatorio JSON salvo em: {output_path}")

    if env_file_error:
        return 1
    if args.require_ready_env and report["status"] != "ready_preconditions_met":
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
