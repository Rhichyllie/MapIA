from __future__ import annotations

import argparse
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _env_file import EnvFileError, add_env_file_args, parse_dotenv_file  # noqa: E402
from _grafana_datasource_discovery import (  # noqa: E402
    GRAFANA_URL_ENV,
    discover_datasource_uids_from_grafana,
    sanitize_discovery_error_message,
)
from _obs_common import OBS_ROOT, load_json_file, utc_now_iso, write_json_file  # noqa: E402


REPO_ROOT = OBS_ROOT.parent.parent
SCRIPTS_ROOT = OBS_ROOT / "scripts"
STRICT_READY_MODE_ALWAYS = "always"
STRICT_READY_MODE_SKIP_IN_DEV_LOCAL = "skip_in_dev_local"
STRICT_READY_MODE_NEVER = "never"
STRICT_READY_MODES = {
    STRICT_READY_MODE_ALWAYS,
    STRICT_READY_MODE_SKIP_IN_DEV_LOCAL,
    STRICT_READY_MODE_NEVER,
}
DEV_LOCAL_APPLY_ROOT = Path(tempfile.gettempdir()) / "mapia-observability-dev-local-apply"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Orquestrador operacional da 4E.9R REAL (STOP CONDITION hardening)")
    parser.add_argument("--require-ready-env", action="store_true", help="Exige gate pronto (exit=1 se gate bloquear)")
    parser.add_argument(
        "--pnpm-cmd",
        default="pnpm",
        help="Binario/comando do pnpm para subprocess (ex.: pnpm, .\\pnpm.cmd, caminho absoluto).",
    )
    parser.add_argument(
        "--strict-ready-mode",
        choices=sorted(STRICT_READY_MODES),
        default=STRICT_READY_MODE_SKIP_IN_DEV_LOCAL,
        help=(
            "Controla o passo H_strict_ready: `always`, `skip_in_dev_local` (default) ou `never`. "
            "Em dev_local, o default evita falha por `partial_dev_local_real_evidence`."
        ),
    )
    parser.add_argument(
        "--environment-scope",
        choices=["staging_prod", "dev_local"],
        default="staging_prod",
        help="Escopo de ambientes para coleta/promoção/readiness (default: staging_prod).",
    )
    parser.add_argument("--profile", help="Profile de naming preferido (fallback quando nao houver profile final validado)")
    parser.add_argument("--grafana-url", help="URL do Grafana (opcional; fallback para env/script)")
    parser.add_argument("--prometheus-url", help="URL do Prometheus (opcional; fallback para env/script)")
    parser.add_argument("--loki-url", help="URL do Loki (opcional; fallback para env/script)")
    parser.add_argument("--grafana-token-env", default="GRAFANA_API_TOKEN", help="Env var do token Grafana")
    parser.add_argument("--timeout-seconds", type=int, default=15, help="Timeout HTTP por query na coleta")
    parser.add_argument("--datasource-prometheus-uid", help="UID da datasource Prometheus (opcional)")
    parser.add_argument("--datasource-loki-uid", help="UID da datasource Loki (opcional)")
    parser.add_argument("--grafana-dashboards-dir", help="Destino Grafana dashboards (apply real)")
    parser.add_argument("--grafana-provisioning-dir", help="Destino Grafana provisioning dashboards (apply real)")
    parser.add_argument("--prometheus-rules-dir", help="Destino Prometheus rules (apply real)")
    parser.add_argument("--loki-rules-dir", help="Destino Loki rules (apply real)")
    parser.add_argument(
        "--preconditions-report",
        help="Arquivo JSON do gate de precondicoes",
    )
    parser.add_argument(
        "--evidence-output",
        help="Arquivo JSON de evidencias agregadas (deve ser versionado)",
    )
    parser.add_argument(
        "--smoke-report",
        help="Arquivo JSON do smoke remoto pos-apply",
    )
    parser.add_argument(
        "--baseline-output",
        default=str(OBS_ROOT / "calibration" / "baseline-thresholds.4e9.yaml"),
        help="Arquivo YAML de baseline 4E.9",
    )
    parser.add_argument(
        "--naming-output",
        default=str(OBS_ROOT / "calibration" / "naming-compatibility.4e9.yaml"),
        help="Arquivo YAML de naming 4E.9",
    )
    parser.add_argument(
        "--readiness-output",
        default=str(OBS_ROOT / "calibration" / "finalization-readiness.4e10.yaml"),
        help="Arquivo YAML de readiness 4E.10",
    )
    parser.add_argument(
        "--run-report",
        help="Arquivo JSON consolidado da execucao",
    )
    add_env_file_args(parser)
    return parser.parse_args()


def _timestamp_tag() -> str:
    return time.strftime("%Y%m%d-%H%M%S", time.gmtime())


def _resolve_outputs(args: argparse.Namespace) -> dict[str, Path]:
    tag = _timestamp_tag()
    return {
        "preconditions_report": Path(
            args.preconditions_report or (OBS_ROOT / "evidence" / f"4e9r-preconditions.{tag}.report.json")
        ).resolve(),
        "evidence_output": Path(
            args.evidence_output or (OBS_ROOT / "evidence" / f"observability-evidence.4e9r.{tag}.json")
        ).resolve(),
        "smoke_report": Path(
            args.smoke_report or (OBS_ROOT / "evidence" / f"post-apply-smoke.4e9r.{tag}.report.json")
        ).resolve(),
        "baseline_output": Path(args.baseline_output).resolve(),
        "naming_output": Path(args.naming_output).resolve(),
        "readiness_output": Path(args.readiness_output).resolve(),
        "run_report": Path(args.run_report or (OBS_ROOT / "evidence" / f"run-4e9r-real.{tag}.report.json")).resolve(),
    }


def _ensure_dev_local_apply_destinations(args: argparse.Namespace) -> None:
    if args.environment_scope != "dev_local":
        return

    defaults = {
        "grafana_dashboards_dir": DEV_LOCAL_APPLY_ROOT / "grafana" / "dashboards-parent" / "dashboards",
        "grafana_provisioning_dir": DEV_LOCAL_APPLY_ROOT / "grafana" / "provisioning-parent" / "dashboards",
        "prometheus_rules_dir": DEV_LOCAL_APPLY_ROOT / "prometheus" / "rules",
        "loki_rules_dir": DEV_LOCAL_APPLY_ROOT / "loki" / "rules",
    }
    for attr_name, default_path in defaults.items():
        current_value = getattr(args, attr_name, None)
        if current_value:
            resolved_current = Path(str(current_value)).resolve()
            resolved_current.mkdir(parents=True, exist_ok=True)
            setattr(args, attr_name, str(resolved_current))
            continue
        default_path.mkdir(parents=True, exist_ok=True)
        setattr(args, attr_name, str(default_path.resolve()))


def _cmd_with_env_file(cmd: list[str], args: argparse.Namespace) -> list[str]:
    merged = list(cmd)
    if args.env_file:
        merged.extend(
            [
                "--env-file",
                args.env_file,
                "--env-file-mode",
                args.env_file_mode,
                "--env-file-priority",
                args.env_file_priority,
            ]
        )
    return merged


def _normalize_string(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    if not normalized:
        return None
    return normalized


def _load_env_file_entries(args: argparse.Namespace) -> dict[str, str]:
    if not args.env_file:
        return {}
    try:
        return parse_dotenv_file(Path(args.env_file).resolve())
    except EnvFileError:
        return {}


def _value_from_runtime_or_env_file(
    key: str,
    *,
    env_file_entries: dict[str, str],
) -> str | None:
    runtime_value = _normalize_string(os.getenv(key))
    if runtime_value:
        return runtime_value
    return _normalize_string(env_file_entries.get(key))


def _resolve_datasource_uids_for_run(
    args: argparse.Namespace,
    *,
    env_file_entries: dict[str, str],
) -> tuple[str | None, str | None, dict[str, Any]]:
    resolved_prometheus_uid = _normalize_string(args.datasource_prometheus_uid) or _value_from_runtime_or_env_file(
        "MAPIA_DS_PROMETHEUS_UID",
        env_file_entries=env_file_entries,
    )
    resolved_loki_uid = _normalize_string(args.datasource_loki_uid) or _value_from_runtime_or_env_file(
        "MAPIA_DS_LOKI_UID",
        env_file_entries=env_file_entries,
    )
    metadata: dict[str, Any] = {
        "attempted": False,
        "resolved_by_autodiscovery": False,
        "prometheus_resolved_by_autodiscovery": False,
        "loki_resolved_by_autodiscovery": False,
        "all_required_uids_available_after_autodiscovery": bool(resolved_prometheus_uid and resolved_loki_uid),
        "reason": None,
        "error": None,
    }
    if resolved_prometheus_uid and resolved_loki_uid:
        return resolved_prometheus_uid, resolved_loki_uid, metadata

    metadata["attempted"] = True
    grafana_url = _normalize_string(args.grafana_url) or _value_from_runtime_or_env_file(
        GRAFANA_URL_ENV,
        env_file_entries=env_file_entries,
    )
    grafana_token = _value_from_runtime_or_env_file(
        args.grafana_token_env,
        env_file_entries=env_file_entries,
    )
    if not grafana_url:
        metadata["reason"] = "autodiscovery_skipped_missing_grafana_url"
        return resolved_prometheus_uid, resolved_loki_uid, metadata
    if not grafana_token:
        metadata["reason"] = "autodiscovery_skipped_missing_grafana_token"
        return resolved_prometheus_uid, resolved_loki_uid, metadata

    try:
        discovery = discover_datasource_uids_from_grafana(
            grafana_url=grafana_url,
            grafana_token=grafana_token,
            timeout_seconds=max(1, int(args.timeout_seconds)),
        )
        if not resolved_prometheus_uid:
            resolved_prometheus_uid = _normalize_string(((discovery.get("prometheus") or {}).get("uid")))
            metadata["prometheus_resolved_by_autodiscovery"] = bool(resolved_prometheus_uid)
        if not resolved_loki_uid:
            resolved_loki_uid = _normalize_string(((discovery.get("loki") or {}).get("uid")))
            metadata["loki_resolved_by_autodiscovery"] = bool(resolved_loki_uid)
        metadata["resolved_by_autodiscovery"] = bool(
            metadata["prometheus_resolved_by_autodiscovery"] or metadata["loki_resolved_by_autodiscovery"]
        )
    except Exception as exc:  # noqa: BLE001
        metadata["reason"] = "autodiscovery_http_or_parse_error"
        metadata["error"] = sanitize_discovery_error_message(str(exc))

    metadata["all_required_uids_available_after_autodiscovery"] = bool(resolved_prometheus_uid and resolved_loki_uid)
    if not metadata["all_required_uids_available_after_autodiscovery"] and not metadata.get("reason"):
        metadata["reason"] = "autodiscovery_missing_prometheus_or_loki_datasource"
    return resolved_prometheus_uid, resolved_loki_uid, metadata


def _run_step(
    run_report: dict[str, Any],
    *,
    step_id: str,
    description: str,
    cmd: list[str],
) -> subprocess.CompletedProcess[str]:
    started_at = utc_now_iso()
    print(f"[4E.9R] {step_id}: {description}")
    result = subprocess.run(
        cmd,
        cwd=REPO_ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    if result.stdout:
        print(result.stdout, end="")
    if result.stderr:
        print(result.stderr, end="", file=sys.stderr)
    finished_at = utc_now_iso()
    run_report["steps"].append(
        {
            "id": step_id,
            "description": description,
            "status": "ok" if result.returncode == 0 else "failed",
            "exit_code": result.returncode,
            "started_at": started_at,
            "finished_at": finished_at,
        }
    )
    return result


def _append_step_record(
    run_report: dict[str, Any],
    *,
    step_id: str,
    description: str,
    status: str,
    exit_code: int | None = None,
    **extra: Any,
) -> None:
    step_payload: dict[str, Any] = {
        "id": step_id,
        "description": description,
        "status": status,
        "started_at": utc_now_iso(),
        "finished_at": utc_now_iso(),
    }
    if exit_code is not None:
        step_payload["exit_code"] = exit_code
    step_payload.update(extra)
    run_report["steps"].append(step_payload)


def _pnpm_command(args: argparse.Namespace, *subcommand: str) -> list[str]:
    return [args.pnpm_cmd, *subcommand]


def _effective_strict_ready_behavior(args: argparse.Namespace) -> str:
    if args.strict_ready_mode == STRICT_READY_MODE_NEVER:
        return "skipped"
    if args.strict_ready_mode == STRICT_READY_MODE_SKIP_IN_DEV_LOCAL and args.environment_scope == "dev_local":
        return "skipped"
    return "blocking"


def _resolve_apply_profile(evidence_path: Path, requested_profile: str | None) -> tuple[str | None, dict[str, Any]]:
    try:
        evidence = load_json_file(evidence_path)
    except Exception:  # noqa: BLE001
        return (
            requested_profile,
            {
                "status": "evidence_unreadable",
                "selected_profile": requested_profile,
            },
        )

    prometheus = (evidence or {}).get("prometheus") if isinstance(evidence, dict) else {}
    if not isinstance(prometheus, dict):
        prometheus = {}
    profile_detection = prometheus.get("profile_detection")
    if not isinstance(profile_detection, dict):
        profile_detection = {}

    detection_status = str(profile_detection.get("status") or "")
    best_score_raw = profile_detection.get("best_score")
    try:
        best_score = int(best_score_raw)
    except (TypeError, ValueError):
        best_score = 0
    best_profile = prometheus.get("best_profile_by_presence_score")
    if not isinstance(best_profile, str) or not best_profile:
        best_profile = None

    if detection_status == "unique_best_candidate" and best_score > 0 and best_profile:
        return (
            best_profile,
            {
                "status": "validated_unique_best_candidate",
                "selected_profile": best_profile,
                "best_score": best_score,
            },
        )

    fallback_profile = requested_profile
    return (
        fallback_profile,
        {
            "status": "not_finalized_from_real_evidence",
            "selected_profile": fallback_profile,
            "best_score": best_score,
            "detected_status": detection_status,
        },
    )


def _write_report(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    write_json_file(path, payload)
    print(f"[4E.9R] run report salvo em: {path}")


def main() -> int:
    args = parse_args()
    _ensure_dev_local_apply_destinations(args)
    outputs = _resolve_outputs(args)
    env_file_entries = _load_env_file_entries(args)
    resolved_prometheus_uid, resolved_loki_uid, uid_autodiscovery = _resolve_datasource_uids_for_run(
        args,
        env_file_entries=env_file_entries,
    )
    run_report: dict[str, Any] = {
        "version": 1,
        "phase": "4E.9R",
        "kind": "run_orchestrator",
        "status": "running",
        "started_at": utc_now_iso(),
        "finished_at": None,
        "require_ready_env": bool(args.require_ready_env),
        "environment_scope": args.environment_scope,
        "toolchain": {
            "pnpm_cmd": str(args.pnpm_cmd),
            "platform": sys.platform,
        },
        "strict_ready": {
            "mode": args.strict_ready_mode,
            "effective_behavior": _effective_strict_ready_behavior(args),
            "status": "pending",
            "reason": None,
        },
        "env_file": {
            "enabled": bool(args.env_file),
            "mode": args.env_file_mode,
            "priority": args.env_file_priority,
            "path": str(Path(args.env_file).resolve()) if args.env_file else None,
        },
        "outputs": {key: str(value) for key, value in outputs.items()},
        "steps": [],
        "profile_resolution": None,
        "uid_autodiscovery": {
            "attempted": bool(uid_autodiscovery.get("attempted")),
            "resolved_by_autodiscovery": bool(uid_autodiscovery.get("resolved_by_autodiscovery")),
            "prometheus_resolved_by_autodiscovery": bool(uid_autodiscovery.get("prometheus_resolved_by_autodiscovery")),
            "loki_resolved_by_autodiscovery": bool(uid_autodiscovery.get("loki_resolved_by_autodiscovery")),
            "all_required_uids_available_after_autodiscovery": bool(
                uid_autodiscovery.get("all_required_uids_available_after_autodiscovery")
            ),
            "reason": uid_autodiscovery.get("reason"),
            "error": uid_autodiscovery.get("error"),
            "provided_via_args": bool(args.datasource_prometheus_uid and args.datasource_loki_uid),
        },
        "stop_condition_triggered": False,
    }

    try:
        gate_cmd = [
            sys.executable,
            str(SCRIPTS_ROOT / "check-4e9r-preconditions.py"),
            "--output-report",
            str(outputs["preconditions_report"]),
        ]
        if args.grafana_dashboards_dir:
            gate_cmd.extend(["--grafana-dashboards-dir", args.grafana_dashboards_dir])
        if args.grafana_provisioning_dir:
            gate_cmd.extend(["--grafana-provisioning-dir", args.grafana_provisioning_dir])
        if args.prometheus_rules_dir:
            gate_cmd.extend(["--prometheus-rules-dir", args.prometheus_rules_dir])
        if args.loki_rules_dir:
            gate_cmd.extend(["--loki-rules-dir", args.loki_rules_dir])
        if args.grafana_url:
            gate_cmd.extend(["--grafana-url", args.grafana_url])
        if args.grafana_token_env:
            gate_cmd.extend(["--grafana-token-env", args.grafana_token_env])
        if args.require_ready_env:
            gate_cmd.append("--require-ready-env")
        gate_result = _run_step(
            run_report,
            step_id="A_gate_preconditions",
            description="Gate de precondicoes 4E.9R",
            cmd=_cmd_with_env_file(gate_cmd, args),
        )
        if gate_result.returncode != 0:
            run_report["status"] = "blocked_preconditions"
            run_report["stop_condition_triggered"] = True
            return 1

        validate_cmd = _pnpm_command(args, "observability:validate")
        validate_result = _run_step(
            run_report,
            step_id="B_observability_validate",
            description=" ".join(validate_cmd),
            cmd=validate_cmd,
        )
        if validate_result.returncode != 0:
            run_report["status"] = "failed_validate"
            return validate_result.returncode

        for step_id, subcommand in [
            ("C_lint", "lint"),
            ("C_typecheck", "typecheck"),
            ("C_test", "test"),
            ("C_build", "build"),
        ]:
            cmd = _pnpm_command(args, subcommand)
            result = _run_step(run_report, step_id=step_id, description=" ".join(cmd), cmd=cmd)
            if result.returncode != 0:
                run_report["status"] = "failed_quality_gate"
                return result.returncode

        collect_cmd = [
            sys.executable,
            str(SCRIPTS_ROOT / "collect-observability-evidence.py"),
            "--output",
            str(outputs["evidence_output"]),
            "--environment-scope",
            args.environment_scope,
            "--timeout-seconds",
            str(args.timeout_seconds),
            "--grafana-token-env",
            args.grafana_token_env,
        ]
        if args.profile:
            collect_cmd.extend(["--profile", args.profile])
        if args.grafana_url:
            collect_cmd.extend(["--grafana-url", args.grafana_url])
        if args.prometheus_url:
            collect_cmd.extend(["--prometheus-url", args.prometheus_url])
        if args.loki_url:
            collect_cmd.extend(["--loki-url", args.loki_url])
        collect_result = _run_step(
            run_report,
            step_id="D_collect_real_evidence",
            description="Coleta de evidencias reais 15m/7d/30d",
            cmd=_cmd_with_env_file(collect_cmd, args),
        )
        if collect_result.returncode != 0:
            run_report["status"] = "failed_collect_evidence"
            return collect_result.returncode

        promote_cmd = [
            sys.executable,
            str(SCRIPTS_ROOT / "promote-baseline-4e9.py"),
            "--evidence",
            str(outputs["evidence_output"]),
            "--environment-scope",
            args.environment_scope,
            "--output-baseline",
            str(outputs["baseline_output"]),
            "--output-naming",
            str(outputs["naming_output"]),
        ]
        promote_result = _run_step(
            run_report,
            step_id="E_promote_baseline",
            description="Promocao baseline/naming 4E.9",
            cmd=promote_cmd,
        )
        if promote_result.returncode != 0:
            run_report["status"] = "failed_promote_baseline"
            return promote_result.returncode

        apply_profile, profile_resolution = _resolve_apply_profile(outputs["evidence_output"], args.profile)
        run_report["profile_resolution"] = profile_resolution

        apply_cmd = [
            sys.executable,
            str(SCRIPTS_ROOT / "apply-observability.py"),
            "--fail-on-placeholder-uids",
        ]
        if resolved_prometheus_uid:
            apply_cmd.extend(["--datasource-prometheus-uid", resolved_prometheus_uid])
        if resolved_loki_uid:
            apply_cmd.extend(["--datasource-loki-uid", resolved_loki_uid])
        if apply_profile:
            apply_cmd.extend(["--profile", apply_profile])
        if args.grafana_dashboards_dir:
            apply_cmd.extend(["--grafana-dashboards-dir", args.grafana_dashboards_dir])
        if args.grafana_provisioning_dir:
            apply_cmd.extend(["--grafana-provisioning-dir", args.grafana_provisioning_dir])
        if args.prometheus_rules_dir:
            apply_cmd.extend(["--prometheus-rules-dir", args.prometheus_rules_dir])
        if args.loki_rules_dir:
            apply_cmd.extend(["--loki-rules-dir", args.loki_rules_dir])
        apply_result = _run_step(
            run_report,
            step_id="F_apply_real",
            description="Apply real de dashboards/provisioning/rules",
            cmd=_cmd_with_env_file(apply_cmd, args),
        )
        if apply_result.returncode != 0:
            run_report["status"] = "failed_apply_real"
            return apply_result.returncode

        smoke_cmd = [
            sys.executable,
            str(SCRIPTS_ROOT / "post-apply-smoke.py"),
            "--require-remote",
            "--output-report",
            str(outputs["smoke_report"]),
            "--grafana-token-env",
            args.grafana_token_env,
        ]
        if apply_profile:
            smoke_cmd.extend(["--profile", apply_profile])
        if resolved_prometheus_uid:
            smoke_cmd.extend(["--datasource-prometheus-uid", resolved_prometheus_uid])
        if resolved_loki_uid:
            smoke_cmd.extend(["--datasource-loki-uid", resolved_loki_uid])
        if args.grafana_url:
            smoke_cmd.extend(["--grafana-url", args.grafana_url])
        if args.prometheus_url:
            smoke_cmd.extend(["--prometheus-url", args.prometheus_url])
        if args.loki_url:
            smoke_cmd.extend(["--loki-url", args.loki_url])
        smoke_result = _run_step(
            run_report,
            step_id="G_post_apply_smoke",
            description="Smoke remoto pos-apply",
            cmd=_cmd_with_env_file(smoke_cmd, args),
        )
        if smoke_result.returncode != 0:
            run_report["status"] = "failed_post_apply_smoke"
            return smoke_result.returncode

        readiness_cmd = [
            sys.executable,
            str(SCRIPTS_ROOT / "generate-4e10-finalization-readiness.py"),
            "--environment-scope",
            args.environment_scope,
            "--baseline",
            str(outputs["baseline_output"]),
            "--naming",
            str(outputs["naming_output"]),
            "--evidence",
            str(outputs["evidence_output"]),
            "--post-apply-smoke-report",
            str(outputs["smoke_report"]),
            "--output",
            str(outputs["readiness_output"]),
        ]
        readiness_result = _run_step(
            run_report,
            step_id="H_generate_readiness",
            description="Geracao do readiness 4E.10",
            cmd=readiness_cmd,
        )
        if readiness_result.returncode != 0:
            run_report["status"] = "failed_generate_readiness"
            return readiness_result.returncode

        if run_report["strict_ready"]["effective_behavior"] == "skipped":
            skip_reason = (
                "disabled_in_dev_local"
                if args.environment_scope == "dev_local" and args.strict_ready_mode == STRICT_READY_MODE_SKIP_IN_DEV_LOCAL
                else "disabled_by_mode"
            )
            run_report["strict_ready"]["status"] = "skipped"
            run_report["strict_ready"]["reason"] = skip_reason
            _append_step_record(
                run_report,
                step_id="H_strict_ready",
                description="Validacao strict-ready 4E.10",
                status="skipped",
                blocking=False,
                reason=skip_reason,
            )
            run_report["status"] = "completed_success"
            return 0

        strict_ready_result = _run_step(
            run_report,
            step_id="H_strict_ready",
            description="Validacao strict-ready 4E.10",
            cmd=readiness_cmd + ["--strict-ready"],
        )
        if strict_ready_result.returncode != 0:
            run_report["strict_ready"]["status"] = "failed"
            run_report["strict_ready"]["reason"] = "strict_ready_pending_dependencies"
            run_report["status"] = "failed_strict_ready"
            return strict_ready_result.returncode

        run_report["strict_ready"]["status"] = "passed"
        run_report["status"] = "completed_success"
        return 0
    finally:
        run_report["finished_at"] = utc_now_iso()
        _write_report(outputs["run_report"], run_report)


if __name__ == "__main__":
    raise SystemExit(main())
