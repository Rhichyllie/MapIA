from __future__ import annotations

import argparse
import json
import math
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _obs_common import (  # noqa: E402
    OBS_ROOT,
    SOURCE_ARTIFACTS,
    audit_forbidden_content,
    discover_files,
    load_json_file,
    load_naming_profile,
    load_yaml_file,
    parse_rendered_bundle,
    render_artifacts,
    resolve_calibration_file,
    resolve_datasource_uids,
)
from _grafana_datasource_discovery import identify_datasource_uids_from_payload  # noqa: E402


REQUIRED_ALERTS = {
    "importing_failure_rate_high",
    "importing_run_duration_p95_high",
    "importing_adapter_warning_rate_high",
    "importing_adapter_late_drops_detected",
    "prisma_error_rate_high",
    "prisma_slow_query_rate_high",
    "otel_expected_span_volume_anomalous",
    "otel_bootstrap_failed",
    "otel_shutdown_failed_observed",
}

REQUIRED_SIGNAL_STATUS_KEYS = {
    "importing_failure_rate",
    "importing_run_duration_p95",
    "importing_adapter_warning_rate",
    "importing_adapter_late_drops",
    "prisma_error_rate",
    "prisma_slow_query_rate",
    "prisma_query_duration_p95",
    "http_spanmetrics_volume",
    "runtime_warnings_recurrence",
}

READINESS_PENDING_BLOCKS = {
    "thresholds_final_promotion": "baseline_threshold_finalization_readiness",
    "naming_default_profile_finalization": "naming_default_profile_finalization_readiness",
    "apply_real_and_remote_smoke": "apply_real_remote_smoke_readiness",
}

ENVIRONMENT_SCOPE_STAGING_PROD = "staging_prod"
ENVIRONMENT_SCOPE_DEV_LOCAL = "dev_local"
VALID_ENVIRONMENT_SCOPES = {ENVIRONMENT_SCOPE_STAGING_PROD, ENVIRONMENT_SCOPE_DEV_LOCAL}
FRONTEND_FONT_SCAN_DIRS = ("app", "src", "pages")
FRONTEND_FONT_SCAN_EXTENSIONS = {".js", ".jsx", ".ts", ".tsx", ".mdx"}
GOOGLE_FONT_IMPORT_TARGET = "next/font" + "/google"
GOOGLE_FONT_IMPORT_PATTERN = re.compile(
    r'^\s*import\b.*["\']' + re.escape(GOOGLE_FONT_IMPORT_TARGET) + r'["\']',
    re.MULTILINE,
)


def _required_environments(environment_scope: str) -> list[str]:
    if environment_scope == ENVIRONMENT_SCOPE_DEV_LOCAL:
        return ["dev_local"]
    return ["staging", "production"]


def _detect_environment_scope_from_baseline(baseline: dict[str, Any]) -> str:
    scope = baseline.get("environment_scope")
    if scope in VALID_ENVIRONMENT_SCOPES:
        return str(scope)
    evidence_scope = ((baseline.get("evidence") or {}).get("environment_scope")) if isinstance(baseline, dict) else None
    if evidence_scope in VALID_ENVIRONMENT_SCOPES:
        return str(evidence_scope)
    return ENVIRONMENT_SCOPE_STAGING_PROD


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Valida observability as code (4E.9)")
    parser.add_argument("--profile", help="Profile de naming (default do YAML se omitido)")
    parser.add_argument(
        "--smoke-render",
        action="store_true",
        help="Executa render dry-run em diretório temporário e valida artefatos renderizados",
    )
    parser.add_argument(
        "--smoke-apply-script",
        action="store_true",
        help="Executa `apply-observability.py --dry-run` como smoke",
    )
    parser.add_argument(
        "--smoke-evidence-scripts",
        action="store_true",
        help="Executa smoke dos scripts de coleta/promocao de evidencias 4E.9",
    )
    return parser.parse_args()


def validate_frontend_local_font_guardrail() -> None:
    repo_root = OBS_ROOT.parent.parent
    offenders: list[str] = []
    for relative_dir in FRONTEND_FONT_SCAN_DIRS:
        scan_root = repo_root / relative_dir
        if not scan_root.exists():
            continue
        for path in scan_root.rglob("*"):
            if not path.is_file() or path.suffix not in FRONTEND_FONT_SCAN_EXTENSIONS:
                continue
            file_text = path.read_text(encoding="utf-8", errors="ignore")
            if GOOGLE_FONT_IMPORT_PATTERN.search(file_text):
                offenders.append(path.relative_to(repo_root).as_posix())
    if offenders:
        raise AssertionError("Forbidden Google font import found in: " + ", ".join(sorted(offenders)))


def validate_source_parsing() -> None:
    for root in SOURCE_ARTIFACTS.values():
        for path in discover_files(root, (".json",)):
            load_json_file(path)
        for path in discover_files(root, (".yaml", ".yml")):
            load_yaml_file(path)
    load_yaml_file(OBS_ROOT / "calibration" / "baseline-thresholds.4e8.yaml")
    load_yaml_file(OBS_ROOT / "calibration" / "naming-compatibility.4e8.yaml")
    if (OBS_ROOT / "calibration" / "baseline-thresholds.4e9.yaml").exists():
        load_yaml_file(OBS_ROOT / "calibration" / "baseline-thresholds.4e9.yaml")
    if (OBS_ROOT / "calibration" / "naming-compatibility.4e9.yaml").exists():
        load_yaml_file(OBS_ROOT / "calibration" / "naming-compatibility.4e9.yaml")
    if (OBS_ROOT / "evidence" / "observability-evidence.4e9.template.json").exists():
        load_json_file(OBS_ROOT / "evidence" / "observability-evidence.4e9.template.json")


def validate_dashboards() -> None:
    dashboards_dir = SOURCE_ARTIFACTS["grafana_dashboards"]
    dashboards = [load_json_file(path) for path in discover_files(dashboards_dir, (".json",))]
    seen_uids: set[str] = set()
    for dashboard in dashboards:
        uid = dashboard.get("uid")
        if not isinstance(uid, str) or not uid:
            raise AssertionError("Dashboard sem uid")
        if uid in seen_uids:
            raise AssertionError(f"UID duplicado de dashboard: {uid}")
        seen_uids.add(uid)

        panels = dashboard.get("panels", [])
        has_prom = False
        has_loki = False
        for panel in panels:
            datasource = panel.get("datasource") or {}
            ds_type = datasource.get("type")
            ds_uid = datasource.get("uid")
            if ds_type == "prometheus":
                has_prom = True
                if ds_uid != "${DS_PROMETHEUS}":
                    raise AssertionError(f"Dashboard {uid}: datasource Prometheus sem placeholder esperado")
            if ds_type == "loki":
                has_loki = True
                if ds_uid != "${DS_LOKI}":
                    raise AssertionError(f"Dashboard {uid}: datasource Loki sem placeholder esperado")
        if has_prom and "${DS_PROMETHEUS}" not in str(dashboard):
            raise AssertionError(f"Dashboard {uid}: placeholder DS_PROMETHEUS ausente")
        if has_loki and "${DS_LOKI}" not in str(dashboard):
            raise AssertionError(f"Dashboard {uid}: placeholder DS_LOKI ausente")


def _collect_alert_names(yaml_doc: object) -> set[str]:
    names: set[str] = set()
    if not isinstance(yaml_doc, dict):
        return names
    for group in yaml_doc.get("groups", []):
        if not isinstance(group, dict):
            continue
        for rule in group.get("rules", []):
            if isinstance(rule, dict) and "alert" in rule:
                names.add(str(rule["alert"]))
    return names


def _validate_4e10_semantics(readiness: dict[str, Any]) -> None:
    top_status = str(readiness.get("status") or "")
    environment_scope = str(readiness.get("environment_scope") or ENVIRONMENT_SCOPE_STAGING_PROD)
    if environment_scope not in VALID_ENVIRONMENT_SCOPES:
        raise AssertionError(f"Artefato 4E.10 com environment_scope invalido: {environment_scope!r}")
    if not top_status:
        raise AssertionError("Artefato 4E.10 sem status")

    baseline_block = readiness.get("baseline_threshold_finalization_readiness")
    naming_block = readiness.get("naming_default_profile_finalization_readiness")
    apply_block = readiness.get("apply_real_remote_smoke_readiness")
    for field_name, block in [
        ("baseline_threshold_finalization_readiness", baseline_block),
        ("naming_default_profile_finalization_readiness", naming_block),
        ("apply_real_remote_smoke_readiness", apply_block),
    ]:
        if not isinstance(block, dict):
            raise AssertionError(f"Artefato 4E.10 com `{field_name}` invalido (esperado objeto)")
        if "status" not in block or "pending_4e9r_real_evidence" not in block:
            raise AssertionError(f"Artefato 4E.10 com `{field_name}` sem `status`/`pending_4e9r_real_evidence`")

    baseline_status = str(baseline_block.get("status") or "")
    naming_status = str(naming_block.get("status") or "")
    apply_status = str(apply_block.get("status") or "")
    baseline_pending = bool(baseline_block.get("pending_4e9r_real_evidence"))
    naming_pending = bool(naming_block.get("pending_4e9r_real_evidence"))
    apply_pending = bool(apply_block.get("pending_4e9r_real_evidence"))

    allowed_baseline_statuses = {
        "ready_for_full_threshold_finalization",
        "partial_signal_finalization_ready",
        "pending_4e9r_real_evidence",
        "dev_local_real_evidence",
    }
    allowed_naming_statuses = {
        "ready_for_default_profile_finalization",
        "pending_4e9r_real_evidence",
        "dev_local_real_evidence",
    }
    allowed_apply_statuses = {"ready_current_workspace", "pending_4e9r_real_evidence", "dev_local_real_evidence"}
    if baseline_status not in allowed_baseline_statuses:
        raise AssertionError(f"Status invalido em baseline_threshold_finalization_readiness: {baseline_status!r}")
    if naming_status not in allowed_naming_statuses:
        raise AssertionError(f"Status invalido em naming_default_profile_finalization_readiness: {naming_status!r}")
    if apply_status not in allowed_apply_statuses:
        raise AssertionError(f"Status invalido em apply_real_remote_smoke_readiness: {apply_status!r}")

    expected_baseline_pending = baseline_status not in {"ready_for_full_threshold_finalization", "dev_local_real_evidence"}
    expected_naming_pending = naming_status not in {"ready_for_default_profile_finalization", "dev_local_real_evidence"}
    expected_apply_pending = apply_status not in {"ready_current_workspace", "dev_local_real_evidence"}
    if baseline_pending != expected_baseline_pending:
        raise AssertionError(
            "Inconsistencia 4E.10: baseline_threshold_finalization_readiness.pending_4e9r_real_evidence "
            f"({baseline_pending}) nao bate com status {baseline_status!r}"
        )
    if naming_pending != expected_naming_pending:
        raise AssertionError(
            "Inconsistencia 4E.10: naming_default_profile_finalization_readiness.pending_4e9r_real_evidence "
            f"({naming_pending}) nao bate com status {naming_status!r}"
        )
    if apply_pending != expected_apply_pending:
        raise AssertionError(
            "Inconsistencia 4E.10: apply_real_remote_smoke_readiness.pending_4e9r_real_evidence "
            f"({apply_pending}) nao bate com status {apply_status!r}"
        )

    derived_pending_blocks = []
    for block_name, readiness_field in READINESS_PENDING_BLOCKS.items():
        block = readiness.get(readiness_field) or {}
        if bool(block.get("pending_4e9r_real_evidence")):
            derived_pending_blocks.append(block_name)

    pending_dependencies = readiness.get("pending_dependencies") or []
    pending_entry = None
    for item in pending_dependencies:
        if isinstance(item, dict) and item.get("id") == "pending_4e9r_real_evidence":
            pending_entry = item
            break
    if not isinstance(pending_entry, dict):
        raise AssertionError("Artefato 4E.10 sem pending_dependencies[id=pending_4e9r_real_evidence]")

    entry_status = pending_entry.get("status")
    entry_blocks = pending_entry.get("blocks")
    if entry_status not in {"blocking", "resolved"}:
        raise AssertionError("pending_dependencies[id=pending_4e9r_real_evidence] com status invalido")
    if not isinstance(entry_blocks, list):
        raise AssertionError("pending_dependencies[id=pending_4e9r_real_evidence].blocks deve ser lista")
    unknown_blocks = sorted(set(entry_blocks) - set(READINESS_PENDING_BLOCKS.keys()))
    if unknown_blocks:
        raise AssertionError(f"pending_dependencies.blocks contem blocos desconhecidos: {', '.join(unknown_blocks)}")
    if sorted(entry_blocks) != sorted(derived_pending_blocks):
        raise AssertionError(
            "pending_dependencies.blocks inconsistente com blocos de readiness pendentes. "
            f"Esperado={sorted(derived_pending_blocks)} Atual={sorted(entry_blocks)}"
        )
    expected_entry_status = "blocking" if derived_pending_blocks else "resolved"
    if entry_status != expected_entry_status:
        raise AssertionError(
            "pending_dependencies.status inconsistente com blocks. "
            f"Esperado={expected_entry_status!r} Atual={entry_status!r}"
        )

    any_pending = bool(derived_pending_blocks)
    is_ready_top = top_status.startswith("ready_")
    is_partial_top = top_status.startswith("partial_")
    if any_pending and is_ready_top:
        raise AssertionError("Topo 4E.10 nao pode ser `ready_*` quando existem blocos pendentes")
    if not any_pending and not is_ready_top:
        raise AssertionError("Topo 4E.10 deve ser `ready_*` quando nao ha blocos pendentes")
    if environment_scope == ENVIRONMENT_SCOPE_DEV_LOCAL and is_ready_top and top_status != "ready_dev_local_real_evidence":
        raise AssertionError("Topo 4E.10 em dev_local deve ser `ready_dev_local_real_evidence` quando sem pendencias")
    if is_ready_top:
        if entry_status != "resolved" or entry_blocks:
            raise AssertionError("Topo 4E.10 `ready_*` exige pending_4e9r_real_evidence resolvido e sem blocks")
    if is_partial_top:
        if not any_pending:
            raise AssertionError("Topo 4E.10 `partial_*` exige ao menos um bloco pendente")
        if entry_status != "blocking":
            raise AssertionError("Topo 4E.10 `partial_*` exige pending_4e9r_real_evidence em status=blocking")


def validate_alert_coverage() -> None:
    prom_doc = load_yaml_file(SOURCE_ARTIFACTS["prometheus_rules"] / "mapia-observability.rules.yaml")
    loki_doc = load_yaml_file(SOURCE_ARTIFACTS["loki_rules"] / "mapia-otel-runtime.rules.yaml")
    alert_names = _collect_alert_names(prom_doc) | _collect_alert_names(loki_doc)
    missing = sorted(REQUIRED_ALERTS - alert_names)
    if missing:
        raise AssertionError(f"Alertas obrigatorios ausentes: {', '.join(missing)}")

    prom_text = (SOURCE_ARTIFACTS["prometheus_rules"] / "mapia-observability.rules.yaml").read_text(encoding="utf-8")
    if "importing_telemetry_run_duration_milliseconds_bucket" not in prom_text:
        raise AssertionError("Rules Prometheus ainda nao usam histogram naming `_milliseconds_bucket` para importing run duration")
    if "prisma_telemetry_query_duration_milliseconds_bucket" not in prom_text:
        raise AssertionError("Rules Prometheus ainda nao usam histogram naming `_milliseconds_bucket` para Prisma query duration")

    dash2_text = (SOURCE_ARTIFACTS["grafana_dashboards"] / "mapia-dashboard-2-importing-performance.json").read_text(
        encoding="utf-8"
    )
    if "importing_telemetry_run_duration_milliseconds_bucket" not in dash2_text:
        raise AssertionError("Dashboard 2 nao foi ajustado para importing run duration `_milliseconds_bucket`")
    if "importing_telemetry_step_duration_milliseconds_bucket" not in dash2_text:
        raise AssertionError("Dashboard 2 nao foi ajustado para importing step duration `_milliseconds_bucket`")


def validate_calibration_files() -> None:
    baseline_path = resolve_calibration_file("baseline-thresholds")
    baseline = load_yaml_file(baseline_path)
    if baseline.get("phase") not in {"4E.8", "4E.9"}:
        raise AssertionError(f"{baseline_path.name} sem phase suportada (4E.8/4E.9)")
    windows = baseline.get("baseline_windows", {})
    expected_windows = {"alert": "15m", "operational": "7d", "trend": "30d"}
    if windows != expected_windows:
        raise AssertionError(f"Janelas esperadas {expected_windows}, encontrado {windows}")
    status = str(baseline.get("status", ""))
    if not any(token in status for token in ["partial", "real", "blocked"]):
        raise AssertionError("Status da baseline deve explicitar estado (partial/real/blocked)")
    if baseline.get("phase") == "4E.9":
        environment_scope = _detect_environment_scope_from_baseline(baseline)
        evidence = baseline.get("evidence") or {}
        environments = (evidence.get("environments") or {}) if isinstance(evidence, dict) else {}
        for env in _required_environments(environment_scope):
            env_entry = environments.get(env)
            if not isinstance(env_entry, dict):
                raise AssertionError(f"Baseline 4E.9 sem evidence.environments.{env}")
            signal_status = env_entry.get("signal_status")
            if not isinstance(signal_status, dict):
                raise AssertionError(f"Baseline 4E.9 sem evidence.environments.{env}.signal_status")
            missing_signal_keys = sorted(REQUIRED_SIGNAL_STATUS_KEYS - set(signal_status.keys()))
            if missing_signal_keys:
                raise AssertionError(
                    f"Baseline 4E.9 com sinais ausentes em evidence.environments.{env}.signal_status: {', '.join(missing_signal_keys)}"
                )

        thresholds_delta = baseline.get("thresholds_delta")
        if not isinstance(thresholds_delta, dict):
            raise AssertionError("Baseline 4E.9 sem `thresholds_delta`")
        for env in ["staging", "production"]:
            env_delta = thresholds_delta.get(env)
            if not isinstance(env_delta, dict) or not env_delta:
                raise AssertionError(f"Baseline 4E.9 sem delta de thresholds para {env}")
            sample = next(iter(env_delta.values()))
            if not isinstance(sample, dict):
                raise AssertionError(f"Baseline 4E.9 delta de thresholds invalido para {env}")
            for field in ["previous", "current", "reason", "evidence_used"]:
                if field not in sample:
                    raise AssertionError(f"Baseline 4E.9 delta de thresholds ({env}) sem campo `{field}`")

    naming_path = resolve_calibration_file("naming-compatibility")
    naming = load_yaml_file(naming_path)
    if naming.get("phase") not in {"4E.8", "4E.9"}:
        raise AssertionError(f"{naming_path.name} sem phase suportada (4E.8/4E.9)")
    profile = load_naming_profile(naming.get("default_profile"), naming_path=naming_path)
    if not profile.metrics.get("spanmetrics_calls_total"):
        raise AssertionError("Naming profile sem mapeamento de spanmetrics_calls_total")
    if (OBS_ROOT / "evidence" / "observability-evidence.4e9.template.json").exists():
        evidence = load_json_file(OBS_ROOT / "evidence" / "observability-evidence.4e9.template.json")
        if evidence.get("phase") != "4E.9":
            raise AssertionError("Template de evidencias 4E.9 sem phase=4E.9")
    if naming.get("phase") == "4E.9":
        validation = naming.get("validation")
        if not isinstance(validation, dict):
            raise AssertionError("Naming 4E.9 sem bloco `validation`")
        for field in ["status", "validated_on", "source_evidence_file", "evidence_status"]:
            if field not in validation:
                raise AssertionError(f"Naming 4E.9 validation sem campo `{field}`")

    readiness_4e10_path = OBS_ROOT / "calibration" / "finalization-readiness.4e10.yaml"
    if readiness_4e10_path.exists():
        readiness = load_yaml_file(readiness_4e10_path)
        if not isinstance(readiness, dict):
            raise AssertionError("Artefato 4E.10 de readiness invalido (esperado objeto YAML)")
        if readiness.get("phase") != "4E.10":
            raise AssertionError("Artefato 4E.10 de readiness sem phase=4E.10")
        status = str(readiness.get("status", ""))
        if not any(token in status for token in ["partial", "ready", "pending_4e9r_real_evidence"]):
            raise AssertionError("Status do artefato 4E.10 deve explicitar estado operacional")
        compatibility = readiness.get("compatibility")
        if not isinstance(compatibility, dict):
            raise AssertionError("Artefato 4E.10 sem bloco `compatibility`")
        if compatibility.get("baseline_phase_detected") != "4E.9":
            raise AssertionError("Artefato 4E.10 deve apontar baseline 4E.9")
        if compatibility.get("naming_phase_detected") != "4E.9":
            raise AssertionError("Artefato 4E.10 deve apontar naming 4E.9")
        readiness_scope = str(readiness.get("environment_scope") or ENVIRONMENT_SCOPE_STAGING_PROD)
        if readiness_scope not in VALID_ENVIRONMENT_SCOPES:
            raise AssertionError(f"Artefato 4E.10 com environment_scope invalido: {readiness_scope!r}")
        evidence_summary = readiness.get("observed_4e9_evidence_summary") or {}
        evidence_summary_envs = (evidence_summary.get("environments") or {}) if isinstance(evidence_summary, dict) else {}
        for env in _required_environments(readiness_scope):
            if env not in evidence_summary_envs:
                raise AssertionError(f"Artefato 4E.10 sem observed_4e9_evidence_summary.environments.{env}")
        pending_dependencies = readiness.get("pending_dependencies")
        if not isinstance(pending_dependencies, list) or not pending_dependencies:
            raise AssertionError("Artefato 4E.10 sem `pending_dependencies`")
        if not any(
            isinstance(item, dict) and item.get("id") == "pending_4e9r_real_evidence"
            for item in pending_dependencies
        ):
            raise AssertionError("Artefato 4E.10 deve registrar dependencia `pending_4e9r_real_evidence`")
        for field in [
            "baseline_threshold_finalization_readiness",
            "naming_default_profile_finalization_readiness",
            "apply_real_remote_smoke_readiness",
            "coupling_points_to_4e9r",
        ]:
            if field not in readiness:
                raise AssertionError(f"Artefato 4E.10 sem campo `{field}`")
        if not isinstance(readiness.get("coupling_points_to_4e9r"), list) or not readiness.get("coupling_points_to_4e9r"):
            raise AssertionError("Artefato 4E.10 deve listar pontos de acoplamento com 4E.9R")
        _validate_4e10_semantics(readiness)


AUTHORIZATION_RE = re.compile(r"authorization", re.IGNORECASE)
BEARER_RE = re.compile(r"bearer\s+", re.IGNORECASE)
URL_WITH_CREDENTIALS_RE = re.compile(r"https?://[^/\s:@]+:[^@\s/]+@", re.IGNORECASE)
SECRET_QUERYSTRING_RE = re.compile(r"https?://[^\s\"']*[?&](token|api[_-]?key|apikey|access_token)=", re.IGNORECASE)
LONG_TOKEN_RE = re.compile(r"[A-Za-z0-9_\-+=/.]{81,}")


def _shannon_entropy(value: str) -> float:
    if not value:
        return 0.0
    counts: dict[str, int] = {}
    for char in value:
        counts[char] = counts.get(char, 0) + 1
    entropy = 0.0
    length = float(len(value))
    for count in counts.values():
        probability = count / length
        entropy -= probability * math.log2(probability)
    return entropy


def _looks_like_suspicious_long_token(token: str) -> bool:
    if len(token) <= 80:
        return False
    has_alpha = any(char.isalpha() for char in token)
    has_digit = any(char.isdigit() for char in token)
    if not (has_alpha and has_digit):
        return False
    entropy = _shannon_entropy(token)
    return entropy >= 3.5


def _detect_sensitive_evidence_json_hits(text: str) -> list[str]:
    hits: list[str] = []
    if AUTHORIZATION_RE.search(text):
        hits.append("authorization_keyword")
    if BEARER_RE.search(text):
        hits.append("bearer_prefix")
    if URL_WITH_CREDENTIALS_RE.search(text):
        hits.append("url_with_embedded_credentials")
    if SECRET_QUERYSTRING_RE.search(text):
        hits.append("url_with_secret_query_parameter")
    for match in LONG_TOKEN_RE.finditer(text):
        if _looks_like_suspicious_long_token(match.group(0)):
            hits.append("suspicious_long_high_entropy_token")
            break
    return hits


def validate_security_guards() -> None:
    for root in [OBS_ROOT / "grafana", OBS_ROOT / "prometheus", OBS_ROOT / "loki", OBS_ROOT / "calibration"]:
        for path in discover_files(root, (".json", ".yaml", ".yml", ".md")):
            text = path.read_text(encoding="utf-8")
            hits = audit_forbidden_content(path, text)
            if hits:
                raise AssertionError(f"Padroes sensiveis detectados em {path}: {hits}")
    evidence_root = OBS_ROOT / "evidence"
    if evidence_root.exists():
        for path in discover_files(evidence_root, (".json", ".yaml", ".yml")):
            text = path.read_text(encoding="utf-8")
            hits = audit_forbidden_content(path, text)
            if hits:
                raise AssertionError(f"Padroes sensiveis detectados em {path}: {hits}")
            if path.suffix == ".json":
                json_hits = _detect_sensitive_evidence_json_hits(text)
                if json_hits:
                    raise AssertionError(f"Evidencia JSON com conteudo sensivel detectado em {path}: {json_hits}")


def validate_grafana_datasource_autodiscovery_parser() -> None:
    payload_type_match = [
        {"uid": "PROM_MAIN_UID", "type": "prometheus", "name": "Prometheus Main"},
        {"uid": "LOKI_MAIN_UID", "type": "loki", "name": "Loki Main"},
        {"uid": "MYSQL_UID", "type": "mysql", "name": "Mysql Metrics"},
    ]
    result_type_match = identify_datasource_uids_from_payload(payload_type_match)
    if not result_type_match.get("resolved"):
        raise AssertionError("Autodiscovery parser: payload com tipos prometheus/loki deveria resolver ambos")
    if ((result_type_match.get("prometheus") or {}).get("uid")) != "PROM_MAIN_UID":
        raise AssertionError("Autodiscovery parser: UID de Prometheus inesperado no cenário por type")
    if ((result_type_match.get("loki") or {}).get("uid")) != "LOKI_MAIN_UID":
        raise AssertionError("Autodiscovery parser: UID de Loki inesperado no cenário por type")

    payload_name_match = [
        {"uid": "PROM_BY_NAME_UID", "type": "graphite", "name": "Prometheus Legacy"},
        {"uid": "LOKI_BY_NAME_UID", "type": "elasticsearch", "name": "Loki Logs"},
    ]
    result_name_match = identify_datasource_uids_from_payload(payload_name_match)
    if not result_name_match.get("resolved"):
        raise AssertionError("Autodiscovery parser: payload com fallback por name deveria resolver ambos")
    if ((result_name_match.get("prometheus") or {}).get("uid")) != "PROM_BY_NAME_UID":
        raise AssertionError("Autodiscovery parser: UID de Prometheus inesperado no cenário por name")
    if ((result_name_match.get("loki") or {}).get("uid")) != "LOKI_BY_NAME_UID":
        raise AssertionError("Autodiscovery parser: UID de Loki inesperado no cenário por name")

    payload_missing_loki = [
        {"uid": "PROM_ONLY_UID", "type": "prometheus", "name": "Prometheus Only"},
    ]
    result_missing_loki = identify_datasource_uids_from_payload(payload_missing_loki)
    if result_missing_loki.get("resolved"):
        raise AssertionError("Autodiscovery parser: payload sem Loki nao deveria ficar resolved=true")


def smoke_render(profile: str | None) -> None:
    with tempfile.TemporaryDirectory(prefix="mapia-observability-render-") as tmp:
        tmp_path = Path(tmp)
        uids = resolve_datasource_uids(allow_placeholder_defaults=True)
        render_artifacts(tmp_path, profile, uids)
        parse_rendered_bundle(tmp_path)


def smoke_apply_script(profile: str | None) -> None:
    script = OBS_ROOT / "scripts" / "apply-observability.py"
    cmd = [
        sys.executable,
        str(script),
        "--dry-run",
        "--datasource-prometheus-uid",
        "DRYRUN_PROM",
        "--datasource-loki-uid",
        "DRYRUN_LOKI",
    ]
    if profile:
        cmd.extend(["--profile", profile])
    result = subprocess.run(cmd, cwd=OBS_ROOT.parent.parent, check=False, capture_output=True, text=True)
    if result.returncode != 0:
        raise AssertionError(
            "Smoke do apply script falhou.\nSTDOUT:\n"
            + result.stdout
            + "\nSTDERR:\n"
            + result.stderr
        )


def smoke_evidence_scripts(profile: str | None) -> None:
    collect_script = OBS_ROOT / "scripts" / "collect-observability-evidence.py"
    promote_script = OBS_ROOT / "scripts" / "promote-baseline-4e9.py"
    readiness_script = OBS_ROOT / "scripts" / "generate-4e10-finalization-readiness.py"
    preconditions_script = OBS_ROOT / "scripts" / "check-4e9r-preconditions.py"
    run_4e9r_script = OBS_ROOT / "scripts" / "run-4e9r-real.py"

    def _write_json(path: Path, payload: Any) -> None:
        path.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")

    def _write_env_file(path: Path, entries: dict[str, str]) -> None:
        lines = [f"{key}={value}" for key, value in entries.items()]
        path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    def _write_fake_pnpm_command(path: Path) -> None:
        if os.name == "nt":
            path.write_text("@echo off\r\nexit /b 0\r\n", encoding="utf-8")
            return
        path.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
        path.chmod(0o755)

    def _run_readiness(
        *,
        baseline_path: Path,
        naming_path: Path,
        evidence_path: Path,
        output_path: Path,
        smoke_report_path: Path | None = None,
        strict_ready: bool = False,
        environment_scope: str | None = None,
        env: dict[str, str] | None = None,
    ) -> subprocess.CompletedProcess[str]:
        cmd = [
            sys.executable,
            str(readiness_script),
            "--baseline",
            str(baseline_path),
            "--naming",
            str(naming_path),
            "--evidence",
            str(evidence_path),
            "--post-apply-smoke-report",
            str(smoke_report_path or (output_path.parent / "missing-post-apply-smoke.report.json")),
            "--output",
            str(output_path),
        ]
        if environment_scope:
            cmd.extend(["--environment-scope", environment_scope])
        if strict_ready:
            cmd.append("--strict-ready")
        return subprocess.run(
            cmd,
            cwd=OBS_ROOT.parent.parent,
            check=False,
            capture_output=True,
            text=True,
            env=env,
        )

    def _run_preconditions(
        *,
        output_report_path: Path,
        env: dict[str, str] | None = None,
        require_ready_env: bool = False,
        grafana_dashboards_dir: Path | None = None,
        grafana_provisioning_dir: Path | None = None,
        prometheus_rules_dir: Path | None = None,
        loki_rules_dir: Path | None = None,
        env_file_path: Path | None = None,
        env_file_mode: str = "merge",
        env_file_priority: str = "envfile",
    ) -> subprocess.CompletedProcess[str]:
        cmd = [
            sys.executable,
            str(preconditions_script),
            "--output-report",
            str(output_report_path),
        ]
        if grafana_dashboards_dir is not None:
            cmd.extend(["--grafana-dashboards-dir", str(grafana_dashboards_dir)])
        if grafana_provisioning_dir is not None:
            cmd.extend(["--grafana-provisioning-dir", str(grafana_provisioning_dir)])
        if prometheus_rules_dir is not None:
            cmd.extend(["--prometheus-rules-dir", str(prometheus_rules_dir)])
        if loki_rules_dir is not None:
            cmd.extend(["--loki-rules-dir", str(loki_rules_dir)])
        if env_file_path is not None:
            cmd.extend(
                [
                    "--env-file",
                    str(env_file_path),
                    "--env-file-mode",
                    env_file_mode,
                    "--env-file-priority",
                    env_file_priority,
                ]
            )
        if require_ready_env:
            cmd.append("--require-ready-env")
        return subprocess.run(
            cmd,
            cwd=OBS_ROOT.parent.parent,
            check=False,
            capture_output=True,
            text=True,
            env=env,
        )

    def _run_orchestrator(
        *,
        env: dict[str, str] | None = None,
        env_file_path: Path | None = None,
        env_file_priority: str = "envfile",
        pnpm_cmd: str | None = None,
        strict_ready_mode: str | None = None,
        timeout_seconds: int | None = None,
        environment_scope: str = "staging_prod",
        preconditions_report_path: Path,
        evidence_output_path: Path,
        smoke_report_path: Path,
        baseline_output_path: Path | None = None,
        naming_output_path: Path | None = None,
        readiness_output_path: Path | None = None,
        run_report_path: Path,
        grafana_dashboards_dir: Path,
        grafana_provisioning_dir: Path,
        prometheus_rules_dir: Path,
        loki_rules_dir: Path,
    ) -> subprocess.CompletedProcess[str]:
        cmd = [
            sys.executable,
            str(run_4e9r_script),
            "--require-ready-env",
            "--environment-scope",
            environment_scope,
            "--preconditions-report",
            str(preconditions_report_path),
            "--evidence-output",
            str(evidence_output_path),
            "--smoke-report",
            str(smoke_report_path),
            "--run-report",
            str(run_report_path),
            "--grafana-dashboards-dir",
            str(grafana_dashboards_dir),
            "--grafana-provisioning-dir",
            str(grafana_provisioning_dir),
            "--prometheus-rules-dir",
            str(prometheus_rules_dir),
            "--loki-rules-dir",
            str(loki_rules_dir),
        ]
        if pnpm_cmd is not None:
            cmd.extend(["--pnpm-cmd", pnpm_cmd])
        if strict_ready_mode is not None:
            cmd.extend(["--strict-ready-mode", strict_ready_mode])
        if timeout_seconds is not None:
            cmd.extend(["--timeout-seconds", str(timeout_seconds)])
        if baseline_output_path is not None:
            cmd.extend(["--baseline-output", str(baseline_output_path)])
        if naming_output_path is not None:
            cmd.extend(["--naming-output", str(naming_output_path)])
        if readiness_output_path is not None:
            cmd.extend(["--readiness-output", str(readiness_output_path)])
        if env_file_path is not None:
            cmd.extend(
                [
                    "--env-file",
                    str(env_file_path),
                    "--env-file-mode",
                    "merge",
                    "--env-file-priority",
                    env_file_priority,
                ]
            )
        return subprocess.run(
            cmd,
            cwd=OBS_ROOT.parent.parent,
            check=False,
            capture_output=True,
            text=True,
            env=env,
        )

    def _signals_to_by_window_shape(signals_payload: dict[str, Any]) -> dict[str, Any]:
        result: dict[str, Any] = {"staging": {}, "production": {}}
        for env in ["staging", "production"]:
            env_payload = signals_payload.get(env) if isinstance(signals_payload, dict) else {}
            by_window: dict[str, dict[str, Any]] = {}
            if isinstance(env_payload, dict):
                for signal_key, signal_entry in env_payload.items():
                    if not isinstance(signal_entry, dict):
                        continue
                    windows = signal_entry.get("windows")
                    if not isinstance(windows, dict):
                        continue
                    for window_key, window_payload in windows.items():
                        by_window.setdefault(str(window_key), {})
                        by_window[str(window_key)][str(signal_key)] = window_payload
            result[env] = by_window
        return result

    with tempfile.TemporaryDirectory(prefix="mapia-observability-evidence-smoke-") as tmp:
        tmp_path = Path(tmp)
        evidence_path = tmp_path / "observability-evidence.4e9.capture.json"
        baseline_path = tmp_path / "baseline-thresholds.4e9.yaml"
        naming_path = tmp_path / "naming-compatibility.4e9.yaml"
        readiness_path = tmp_path / "finalization-readiness.4e10.yaml"
        preconditions_blocked_report_path = tmp_path / "4e9r-preconditions.blocked.report.json"
        preconditions_ready_report_path = tmp_path / "4e9r-preconditions.ready.report.json"
        preconditions_envfile_placeholder_report_path = tmp_path / "4e9r-preconditions.envfile-placeholders.report.json"
        preconditions_envfile_valid_report_path = tmp_path / "4e9r-preconditions.envfile-valid.report.json"
        preconditions_envfile_priority_envfile_report_path = tmp_path / "4e9r-preconditions.priority-envfile.report.json"
        preconditions_envfile_priority_env_report_path = tmp_path / "4e9r-preconditions.priority-env.report.json"
        preconditions_dedupe_behavior_report_path = tmp_path / "4e9r-preconditions.dedupe-behavior.report.json"
        preconditions_envfile_placeholder_path = tmp_path / ".env.4e9r.placeholders.local"
        preconditions_envfile_valid_path = tmp_path / ".env.4e9r.valid.local"
        preconditions_envfile_conflict_path = tmp_path / ".env.4e9r.conflict.local"
        orchestrator_preconditions_report_path = tmp_path / "4e9r-orchestrator.preconditions.report.json"
        orchestrator_evidence_output_path = tmp_path / "4e9r-orchestrator.evidence.json"
        orchestrator_smoke_report_path = tmp_path / "4e9r-orchestrator.smoke.report.json"
        orchestrator_run_report_path = tmp_path / "4e9r-orchestrator.run.report.json"
        orchestrator_staging_preconditions_report_path = tmp_path / "4e9r-orchestrator.staging.preconditions.report.json"
        orchestrator_staging_evidence_output_path = tmp_path / "4e9r-orchestrator.staging.evidence.json"
        orchestrator_staging_smoke_report_path = tmp_path / "4e9r-orchestrator.staging.smoke.report.json"
        orchestrator_staging_baseline_output_path = tmp_path / "4e9r-orchestrator.staging.baseline.yaml"
        orchestrator_staging_naming_output_path = tmp_path / "4e9r-orchestrator.staging.naming.yaml"
        orchestrator_staging_readiness_output_path = tmp_path / "4e9r-orchestrator.staging.readiness.yaml"
        orchestrator_staging_run_report_path = tmp_path / "4e9r-orchestrator.staging.run.report.json"
        orchestrator_dev_local_preconditions_report_path = tmp_path / "4e9r-orchestrator.dev-local.preconditions.report.json"
        orchestrator_dev_local_evidence_output_path = tmp_path / "4e9r-orchestrator.dev-local.evidence.json"
        orchestrator_dev_local_smoke_report_path = tmp_path / "4e9r-orchestrator.dev-local.smoke.report.json"
        orchestrator_dev_local_baseline_output_path = tmp_path / "4e9r-orchestrator.dev-local.baseline.yaml"
        orchestrator_dev_local_naming_output_path = tmp_path / "4e9r-orchestrator.dev-local.naming.yaml"
        orchestrator_dev_local_readiness_output_path = tmp_path / "4e9r-orchestrator.dev-local.readiness.yaml"
        orchestrator_dev_local_run_report_path = tmp_path / "4e9r-orchestrator.dev-local.run.report.json"
        fake_pnpm_path = tmp_path / ("fake-pnpm.cmd" if os.name == "nt" else "fake-pnpm.sh")
        _write_fake_pnpm_command(fake_pnpm_path)

        collect_cmd = [sys.executable, str(collect_script), "--template-only", "--output", str(evidence_path)]
        if profile:
            collect_cmd.extend(["--profile", profile])
        collect_result = subprocess.run(collect_cmd, cwd=OBS_ROOT.parent.parent, check=False, capture_output=True, text=True)
        if collect_result.returncode != 0:
            raise AssertionError(
                "Smoke do collect script falhou.\nSTDOUT:\n"
                + collect_result.stdout
                + "\nSTDERR:\n"
                + collect_result.stderr
            )

        promote_cmd = [
            sys.executable,
            str(promote_script),
            "--evidence",
            str(evidence_path),
            "--output-baseline",
            str(baseline_path),
            "--output-naming",
            str(naming_path),
        ]
        promote_result = subprocess.run(promote_cmd, cwd=OBS_ROOT.parent.parent, check=False, capture_output=True, text=True)
        if promote_result.returncode != 0:
            raise AssertionError(
                "Smoke do promote script falhou.\nSTDOUT:\n"
                + promote_result.stdout
                + "\nSTDERR:\n"
                + promote_result.stderr
            )

        readiness_result = _run_readiness(
            baseline_path=baseline_path,
            naming_path=naming_path,
            evidence_path=evidence_path,
            output_path=readiness_path,
        )
        if readiness_result.returncode != 0:
            raise AssertionError(
                "Smoke do readiness 4E.10 script falhou.\nSTDOUT:\n"
                + readiness_result.stdout
                + "\nSTDERR:\n"
                + readiness_result.stderr
            )
        evidence_payload = load_json_file(evidence_path)
        load_yaml_file(baseline_path)
        load_yaml_file(naming_path)
        readiness_a = load_yaml_file(readiness_path)
        if ((readiness_a.get("observed_4e9_evidence_summary") or {}).get("environments") or {}).get("staging", {}).get(
            "signal_shape_detected"
        ) not in {"empty", "by_signal"}:
            raise AssertionError(
                "Smoke 4E.10 baseline (template-only): shape de signals inesperado (esperado `empty` ou `by_signal`)"
            )

        # Cenário A (legacy): profile_detection em `evidence.prometheus.profile_detection`
        evidence_shape_a = json.loads(json.dumps(evidence_payload))
        evidence_shape_a.setdefault("signals", {}).setdefault("staging", {}).setdefault("importing_failure_rate", {}).setdefault(
            "windows", {}
        )["alert_15m"] = {"status": "ok", "value": 0.01, "result_count": 1}
        evidence_shape_a.setdefault("prometheus", {})
        evidence_shape_a["prometheus"]["profile_detection"] = {"status": "no_matches", "best_score": 0}
        evidence_shape_a_path = tmp_path / "observability-evidence.4e9.shape-a.json"
        readiness_shape_a_path = tmp_path / "finalization-readiness.4e10.shape-a.yaml"
        _write_json(evidence_shape_a_path, evidence_shape_a)
        readiness_shape_a_result = _run_readiness(
            baseline_path=baseline_path,
            naming_path=naming_path,
            evidence_path=evidence_shape_a_path,
            output_path=readiness_shape_a_path,
        )
        if readiness_shape_a_result.returncode != 0:
            raise AssertionError(
                "Smoke 4E.10 cenário A (legacy profile_detection) falhou.\nSTDOUT:\n"
                + readiness_shape_a_result.stdout
                + "\nSTDERR:\n"
                + readiness_shape_a_result.stderr
            )
        readiness_shape_a = load_yaml_file(readiness_shape_a_path)
        naming_readiness_a = readiness_shape_a.get("naming_default_profile_finalization_readiness") or {}
        if naming_readiness_a.get("profile_detection_status_from_evidence") != "no_matches":
            raise AssertionError("Smoke 4E.10 cenário A: fallback de profile_detection legacy nao lido corretamente")
        if naming_readiness_a.get("profile_detection_source_path_from_evidence") != "prometheus.profile_detection":
            raise AssertionError("Smoke 4E.10 cenário A: source path de profile_detection legacy inesperado")
        env_summary_a = ((readiness_shape_a.get("observed_4e9_evidence_summary") or {}).get("environments") or {}).get("staging", {})
        if env_summary_a.get("signal_shape_detected") != "by_signal":
            raise AssertionError("Smoke 4E.10 cenário A: shape legacy por sinal nao detectado como `by_signal`")

        # Cenário B: profile_detection em `remote_smoke.prometheus.profile_detection` + shape de sinais por janela.
        evidence_shape_b = json.loads(json.dumps(evidence_shape_a))
        evidence_shape_b["signals"] = _signals_to_by_window_shape(evidence_shape_b.get("signals") or {})
        evidence_shape_b.setdefault("signals", {}).setdefault("staging", {}).setdefault("operational_7d", {})[
            "prisma_error_rate"
        ] = {"status": "empty", "value": None, "result_count": 0}
        evidence_shape_b.setdefault("remote_smoke", {}).setdefault("prometheus", {})
        evidence_shape_b["remote_smoke"]["prometheus"]["profile_detection"] = {"status": "ambiguous_tie", "best_score": 5}
        if isinstance(evidence_shape_b.get("prometheus"), dict):
            evidence_shape_b["prometheus"].pop("profile_detection", None)
        evidence_shape_b_path = tmp_path / "observability-evidence.4e9.shape-b.json"
        readiness_shape_b_path = tmp_path / "finalization-readiness.4e10.shape-b.yaml"
        _write_json(evidence_shape_b_path, evidence_shape_b)
        readiness_shape_b_result = _run_readiness(
            baseline_path=baseline_path,
            naming_path=naming_path,
            evidence_path=evidence_shape_b_path,
            output_path=readiness_shape_b_path,
        )
        if readiness_shape_b_result.returncode != 0:
            raise AssertionError(
                "Smoke 4E.10 cenário B (remote_smoke profile_detection + by_window) falhou.\nSTDOUT:\n"
                + readiness_shape_b_result.stdout
                + "\nSTDERR:\n"
                + readiness_shape_b_result.stderr
            )
        readiness_shape_b = load_yaml_file(readiness_shape_b_path)
        naming_readiness_b = readiness_shape_b.get("naming_default_profile_finalization_readiness") or {}
        if naming_readiness_b.get("profile_detection_status_from_evidence") != "ambiguous_tie":
            raise AssertionError("Smoke 4E.10 cenário B: fallback remote_smoke.prometheus.profile_detection nao lido")
        if naming_readiness_b.get("profile_detection_source_path_from_evidence") != "remote_smoke.prometheus.profile_detection":
            raise AssertionError("Smoke 4E.10 cenário B: source path de profile_detection inesperado")
        if naming_readiness_b.get("reason") != "prometheus_profile_detection_ambiguous_tie":
            raise AssertionError("Smoke 4E.10 cenário B: reason de naming readiness nao refletiu profile_detection")
        env_summary_b = ((readiness_shape_b.get("observed_4e9_evidence_summary") or {}).get("environments") or {}).get("staging", {})
        if env_summary_b.get("signal_shape_detected") not in {"by_window", "mixed"}:
            raise AssertionError("Smoke 4E.10 cenário B: shape por janela nao detectado")
        if int(env_summary_b.get("signals_with_any_window") or 0) < 1:
            raise AssertionError("Smoke 4E.10 cenário B: signals_with_any_window deveria ser >= 1")

        # Cenário C: placeholders devem manter status pendente e serem tratados como inválidos.
        placeholder_env = dict(os.environ)
        placeholder_env.update(
            {
                "GRAFANA_URL": "https://example.invalid",
                "PROMETHEUS_URL": "placeholder",
                "LOKI_URL": "https://__placeholder__",
                "GRAFANA_API_TOKEN": "   ",
                "MAPIA_DS_PROMETHEUS_UID": "REPLACE_ME_PROMETHEUS_UID",
                "MAPIA_DS_LOKI_UID": "__placeholder__",
            }
        )
        readiness_placeholder_path = tmp_path / "finalization-readiness.4e10.placeholders.yaml"
        readiness_placeholder_result = _run_readiness(
            baseline_path=baseline_path,
            naming_path=naming_path,
            evidence_path=evidence_path,
            output_path=readiness_placeholder_path,
            env=placeholder_env,
        )
        if readiness_placeholder_result.returncode != 0:
            raise AssertionError(
                "Smoke 4E.10 cenário C (placeholders) falhou.\nSTDOUT:\n"
                + readiness_placeholder_result.stdout
                + "\nSTDERR:\n"
                + readiness_placeholder_result.stderr
            )
        readiness_placeholder = load_yaml_file(readiness_placeholder_path)
        workspace_preconditions = (
            ((readiness_placeholder.get("apply_real_remote_smoke_readiness") or {}).get("workspace_preconditions")) or {}
        )
        if workspace_preconditions.get("status") != "pending_4e9r_real_evidence":
            raise AssertionError("Smoke 4E.10 cenário C: placeholders deveriam resultar em pending_4e9r_real_evidence")
        invalid_list = workspace_preconditions.get("invalid") or []
        if not isinstance(invalid_list, list) or not invalid_list:
            raise AssertionError("Smoke 4E.10 cenário C: placeholders deveriam ser marcados em `invalid`")
        missing_list = workspace_preconditions.get("missing") or []
        if not isinstance(missing_list, list):
            raise AssertionError("Smoke 4E.10 cenário C: `missing` deveria ser lista")
        checks = workspace_preconditions.get("checks") or {}
        if not isinstance(checks, dict):
            raise AssertionError("Smoke 4E.10 cenário C: `checks` deveria ser objeto")
        for expected_invalid_env_key in [
            "prometheus_url_env",
            "loki_url_env",
            "grafana_prometheus_uid_env",
            "grafana_loki_uid_env",
        ]:
            if checks.get(expected_invalid_env_key, {}).get("env") not in invalid_list:
                raise AssertionError(
                    f"Smoke 4E.10 cenário C: {expected_invalid_env_key} deveria constar em `invalid` (placeholder)"
                )
            invalid_reason = str((checks.get(expected_invalid_env_key) or {}).get("invalid_reason", ""))
            if "placeholder" not in invalid_reason:
                raise AssertionError(
                    f"Smoke 4E.10 cenário C: invalid_reason de {expected_invalid_env_key} deveria indicar placeholder"
                )
        token_check = checks.get("grafana_api_token_env")
        if not isinstance(token_check, dict):
            raise AssertionError("Smoke 4E.10 cenário C: check do token Grafana ausente")
        if token_check.get("env") not in missing_list:
            raise AssertionError("Smoke 4E.10 cenário C: token com whitespace deveria cair em `missing`")
        if token_check.get("env") in invalid_list:
            raise AssertionError("Smoke 4E.10 cenário C: token com whitespace nao deve cair simultaneamente em `invalid`")
        if token_check.get("invalid_reason") != "missing_or_empty":
            raise AssertionError("Smoke 4E.10 cenário C: token com whitespace deveria ter invalid_reason=missing_or_empty")

        # Cenário D: --strict-ready deve falhar com exit code 1 quando houver pendências.
        readiness_strict_path = tmp_path / "finalization-readiness.4e10.strict.yaml"
        readiness_strict_result = _run_readiness(
            baseline_path=baseline_path,
            naming_path=naming_path,
            evidence_path=evidence_path,
            output_path=readiness_strict_path,
            strict_ready=True,
            env=placeholder_env,
        )
        if readiness_strict_result.returncode != 1:
            raise AssertionError(
                "Smoke 4E.10 cenário D: --strict-ready deveria retornar 1 quando houver pendencias "
                f"(retornou {readiness_strict_result.returncode})"
            )
        if "pending_4e9r_real_evidence" not in (readiness_strict_result.stdout + readiness_strict_result.stderr):
            raise AssertionError("Smoke 4E.10 cenário D: mensagem de strict-ready nao menciona pending_4e9r_real_evidence")

        apply_root = tmp_path / "apply-destinations"
        (apply_root / "grafana" / "dashboards-parent").mkdir(parents=True, exist_ok=True)
        (apply_root / "grafana" / "provisioning-parent").mkdir(parents=True, exist_ok=True)
        (apply_root / "prometheus").mkdir(parents=True, exist_ok=True)
        (apply_root / "loki").mkdir(parents=True, exist_ok=True)

        # Cenário 1: env-file ausente -> comportamento baseado em env vars continua funcionando.
        preconditions_ready_env = dict(os.environ)
        preconditions_ready_env.update(
            {
                "GRAFANA_URL": "https://grafana.mapia.local",
                "PROMETHEUS_URL": "https://prometheus.mapia.local",
                "LOKI_URL": "https://loki.mapia.local",
                "GRAFANA_API_TOKEN": "smoke_token_only_not_real",
                "MAPIA_DS_PROMETHEUS_UID": "PROM_DS_UID_SMOKE",
                "MAPIA_DS_LOKI_UID": "LOKI_DS_UID_SMOKE",
            }
        )
        preconditions_ready_result = _run_preconditions(
            output_report_path=preconditions_ready_report_path,
            env=preconditions_ready_env,
            require_ready_env=True,
            grafana_dashboards_dir=apply_root / "grafana" / "dashboards-parent" / "dashboards",
            grafana_provisioning_dir=apply_root / "grafana" / "provisioning-parent" / "dashboards",
            prometheus_rules_dir=apply_root / "prometheus" / "rules",
            loki_rules_dir=apply_root / "loki" / "rules",
        )
        if preconditions_ready_result.returncode != 0:
            raise AssertionError(
                "Smoke 4E.9R preconditions (ready) falhou.\nSTDOUT:\n"
                + preconditions_ready_result.stdout
                + "\nSTDERR:\n"
                + preconditions_ready_result.stderr
            )
        preconditions_ready_report = load_json_file(preconditions_ready_report_path)
        if preconditions_ready_report.get("status") != "ready_preconditions_met":
            raise AssertionError("Smoke 4E.9R preconditions (ready): status JSON inesperado")
        if preconditions_ready_report.get("stop_condition", {}).get("active"):
            raise AssertionError("Smoke 4E.9R preconditions (ready): stop_condition.active deveria ser false")
        if preconditions_ready_report.get("invalid"):
            raise AssertionError("Smoke 4E.9R preconditions (ready): lista invalid deveria estar vazia")
        if preconditions_ready_report.get("missing"):
            raise AssertionError("Smoke 4E.9R preconditions (ready): lista missing deveria estar vazia")
        ready_checks = preconditions_ready_report.get("checks") or {}
        token_check = ready_checks.get("grafana_api_token_env")
        if not isinstance(token_check, dict):
            raise AssertionError("Smoke 4E.9R preconditions (ready): check do token Grafana ausente")
        # O report nao deve expor o valor do token; apenas metadados.
        if "value" in token_check:
            raise AssertionError("Smoke 4E.9R preconditions (ready): report nao deve serializar valores secretos")
        if "smoke_token_only_not_real" in json.dumps(preconditions_ready_report):
            raise AssertionError("Smoke 4E.9R preconditions (ready): token apareceu no relatorio JSON")

        # Cenário 2: env-file com placeholders deve bloquear o gate com invalid.
        _write_env_file(
            preconditions_envfile_placeholder_path,
            {
                "GRAFANA_URL": "https://grafana.mapia.local",
                "PROMETHEUS_URL": "<prometheus-url>",
                "LOKI_URL": "https://loki.mapia.local",
                "GRAFANA_API_TOKEN": "replace_me",
                "MAPIA_DS_PROMETHEUS_UID": "PROM_DS_UID_SMOKE",
                "MAPIA_DS_LOKI_UID": "LOKI_DS_UID_SMOKE",
            },
        )
        preconditions_envfile_placeholder_env = dict(os.environ)
        for env_key in [
            "GRAFANA_URL",
            "PROMETHEUS_URL",
            "LOKI_URL",
            "GRAFANA_API_TOKEN",
            "MAPIA_DS_PROMETHEUS_UID",
            "MAPIA_DS_LOKI_UID",
        ]:
            preconditions_envfile_placeholder_env.pop(env_key, None)
        preconditions_envfile_placeholder_result = _run_preconditions(
            output_report_path=preconditions_envfile_placeholder_report_path,
            env=preconditions_envfile_placeholder_env,
            require_ready_env=True,
            grafana_dashboards_dir=apply_root / "grafana" / "dashboards-parent" / "dashboards",
            grafana_provisioning_dir=apply_root / "grafana" / "provisioning-parent" / "dashboards",
            prometheus_rules_dir=apply_root / "prometheus" / "rules",
            loki_rules_dir=apply_root / "loki" / "rules",
            env_file_path=preconditions_envfile_placeholder_path,
        )
        if preconditions_envfile_placeholder_result.returncode != 1:
            raise AssertionError(
                "Smoke 4E.9R env-file placeholders: gate deveria retornar 1 "
                f"(retornou {preconditions_envfile_placeholder_result.returncode})"
            )
        preconditions_envfile_placeholder_report = load_json_file(preconditions_envfile_placeholder_report_path)
        if preconditions_envfile_placeholder_report.get("status") != "blocked_preconditions_missing":
            raise AssertionError("Smoke 4E.9R env-file placeholders: status JSON inesperado")
        invalid_envfile_placeholder = preconditions_envfile_placeholder_report.get("invalid") or []
        if "--env-file" not in invalid_envfile_placeholder:
            raise AssertionError("Smoke 4E.9R env-file placeholders: --env-file deveria constar em invalid")

        # Cenário 3: env-file sintaticamente válido (fake) + destinos temporários -> gate ready.
        _write_env_file(
            preconditions_envfile_valid_path,
            {
                "GRAFANA_URL": "https://grafana.mapia.local",
                "PROMETHEUS_URL": "https://prometheus.mapia.local",
                "LOKI_URL": "https://loki.mapia.local",
                "GRAFANA_API_TOKEN": "smoke_token_only_not_real_from_envfile",
                "MAPIA_DS_PROMETHEUS_UID": "PROM_DS_UID_SMOKE_ENVFILE",
                "MAPIA_DS_LOKI_UID": "LOKI_DS_UID_SMOKE_ENVFILE",
            },
        )
        preconditions_envfile_valid_env = dict(os.environ)
        for env_key in [
            "GRAFANA_URL",
            "PROMETHEUS_URL",
            "LOKI_URL",
            "GRAFANA_API_TOKEN",
            "MAPIA_DS_PROMETHEUS_UID",
            "MAPIA_DS_LOKI_UID",
        ]:
            preconditions_envfile_valid_env.pop(env_key, None)
        preconditions_envfile_valid_result = _run_preconditions(
            output_report_path=preconditions_envfile_valid_report_path,
            env=preconditions_envfile_valid_env,
            require_ready_env=True,
            grafana_dashboards_dir=apply_root / "grafana" / "dashboards-parent" / "dashboards",
            grafana_provisioning_dir=apply_root / "grafana" / "provisioning-parent" / "dashboards",
            prometheus_rules_dir=apply_root / "prometheus" / "rules",
            loki_rules_dir=apply_root / "loki" / "rules",
            env_file_path=preconditions_envfile_valid_path,
        )
        if preconditions_envfile_valid_result.returncode != 0:
            raise AssertionError(
                "Smoke 4E.9R env-file válido falhou.\nSTDOUT:\n"
                + preconditions_envfile_valid_result.stdout
                + "\nSTDERR:\n"
                + preconditions_envfile_valid_result.stderr
            )
        preconditions_envfile_valid_report = load_json_file(preconditions_envfile_valid_report_path)
        if preconditions_envfile_valid_report.get("status") != "ready_preconditions_met":
            raise AssertionError("Smoke 4E.9R env-file válido: status JSON inesperado")
        if "smoke_token_only_not_real_from_envfile" in json.dumps(preconditions_envfile_valid_report):
            raise AssertionError("Smoke 4E.9R env-file válido: token apareceu no relatorio JSON")

        # Cenário 4 (S1): env sujo + priority=envfile deve usar env-file para chaves críticas.
        _write_env_file(
            preconditions_envfile_conflict_path,
            {
                "GRAFANA_URL": "https://grafana.mapia.local",
                "PROMETHEUS_URL": "https://prometheus.mapia.local",
                "LOKI_URL": "https://loki.mapia.local",
                "GRAFANA_API_TOKEN": "smoke_token_conflict_envfile",
                "MAPIA_DS_PROMETHEUS_UID": "PROM_DS_UID_CONFLICT",
                "MAPIA_DS_LOKI_UID": "LOKI_DS_UID_CONFLICT",
            },
        )
        preconditions_dirty_env = dict(os.environ)
        preconditions_dirty_env.update(
            {
                "GRAFANA_URL": "https://stale-grafana.invalid.local",
                "PROMETHEUS_URL": "placeholder",
                "LOKI_URL": "https://stale-loki.invalid.local",
                "GRAFANA_API_TOKEN": "   ",
                "MAPIA_DS_PROMETHEUS_UID": "__placeholder__",
                "MAPIA_DS_LOKI_UID": "LOKI_DS_UID_STALE",
            }
        )
        preconditions_priority_envfile_result = _run_preconditions(
            output_report_path=preconditions_envfile_priority_envfile_report_path,
            env=preconditions_dirty_env,
            require_ready_env=True,
            grafana_dashboards_dir=apply_root / "grafana" / "dashboards-parent" / "dashboards",
            grafana_provisioning_dir=apply_root / "grafana" / "provisioning-parent" / "dashboards",
            prometheus_rules_dir=apply_root / "prometheus" / "rules",
            loki_rules_dir=apply_root / "loki" / "rules",
            env_file_path=preconditions_envfile_conflict_path,
            env_file_priority="envfile",
        )
        if preconditions_priority_envfile_result.returncode != 0:
            raise AssertionError(
                "Smoke 4E.9R priority=envfile deveria sobrescrever env sujo e passar.\nSTDOUT:\n"
                + preconditions_priority_envfile_result.stdout
                + "\nSTDERR:\n"
                + preconditions_priority_envfile_result.stderr
            )
        preconditions_priority_envfile_report = load_json_file(preconditions_envfile_priority_envfile_report_path)
        if preconditions_priority_envfile_report.get("status") != "ready_preconditions_met":
            raise AssertionError("Smoke 4E.9R priority=envfile: status JSON inesperado")
        envfile_meta_priority_envfile = preconditions_priority_envfile_report.get("env_file") or {}
        if int(envfile_meta_priority_envfile.get("conflict_keys_count") or 0) < 1:
            raise AssertionError("Smoke 4E.9R priority=envfile: deveria detectar conflito entre env e env-file")
        if int(envfile_meta_priority_envfile.get("conflicts_overridden_count") or 0) < 1:
            raise AssertionError("Smoke 4E.9R priority=envfile: deveria sobrescrever conflitos")

        # Cenário 5 (S2): conflito com priority=env deve manter env existente e falhar de forma clara.
        preconditions_priority_env_result = _run_preconditions(
            output_report_path=preconditions_envfile_priority_env_report_path,
            env=preconditions_dirty_env,
            require_ready_env=True,
            grafana_dashboards_dir=apply_root / "grafana" / "dashboards-parent" / "dashboards",
            grafana_provisioning_dir=apply_root / "grafana" / "provisioning-parent" / "dashboards",
            prometheus_rules_dir=apply_root / "prometheus" / "rules",
            loki_rules_dir=apply_root / "loki" / "rules",
            env_file_path=preconditions_envfile_conflict_path,
            env_file_priority="env",
        )
        if preconditions_priority_env_result.returncode != 1:
            raise AssertionError(
                "Smoke 4E.9R priority=env deveria manter env sujo e bloquear "
                f"(retornou {preconditions_priority_env_result.returncode})"
            )
        preconditions_priority_env_report = load_json_file(preconditions_envfile_priority_env_report_path)
        if preconditions_priority_env_report.get("status") != "blocked_preconditions_missing":
            raise AssertionError("Smoke 4E.9R priority=env: status JSON inesperado")
        envfile_meta_priority_env = preconditions_priority_env_report.get("env_file") or {}
        if int(envfile_meta_priority_env.get("conflicts_preserved_count") or 0) < 1:
            raise AssertionError("Smoke 4E.9R priority=env: deveria preservar ao menos um conflito")

        # Cenário 6 (S3): comportamento de placeholder/whitespace no gate (dedupe funcional).
        preconditions_dedupe_env = dict(os.environ)
        preconditions_dedupe_env.update(
            {
                "GRAFANA_URL": "https://grafana.mapia.local",
                "PROMETHEUS_URL": "https://__placeholder__",
                "LOKI_URL": "https://loki.mapia.local",
                "GRAFANA_API_TOKEN": "   ",
                "MAPIA_DS_PROMETHEUS_UID": "PROM_DS_UID_VALID",
                "MAPIA_DS_LOKI_UID": "__placeholder__",
            }
        )
        preconditions_dedupe_result = _run_preconditions(
            output_report_path=preconditions_dedupe_behavior_report_path,
            env=preconditions_dedupe_env,
            require_ready_env=True,
            grafana_dashboards_dir=apply_root / "grafana" / "dashboards-parent" / "dashboards",
            grafana_provisioning_dir=apply_root / "grafana" / "provisioning-parent" / "dashboards",
            prometheus_rules_dir=apply_root / "prometheus" / "rules",
            loki_rules_dir=apply_root / "loki" / "rules",
        )
        if preconditions_dedupe_result.returncode != 1:
            raise AssertionError("Smoke 4E.9R dedupe: gate deveria bloquear placeholders/whitespace")
        preconditions_dedupe_report = load_json_file(preconditions_dedupe_behavior_report_path)
        checks_dedupe = preconditions_dedupe_report.get("checks") or {}
        if "placeholder" not in str((checks_dedupe.get("prometheus_url_env") or {}).get("invalid_reason", "")):
            raise AssertionError("Smoke 4E.9R dedupe: PROMETHEUS_URL placeholder nao foi detectado")
        if (checks_dedupe.get("grafana_api_token_env") or {}).get("invalid_reason") != "missing_or_empty":
            raise AssertionError("Smoke 4E.9R dedupe: token com whitespace deveria ser missing_or_empty")
        if "placeholder" not in str((checks_dedupe.get("grafana_loki_uid_env") or {}).get("invalid_reason", "")):
            raise AssertionError("Smoke 4E.9R dedupe: MAPIA_DS_LOKI_UID placeholder nao foi detectado")

        # Cenário 7 (S4): guardrail de security deve falhar para JSON com `Bearer`.
        security_leak_path = OBS_ROOT / "evidence" / "__smoke_sensitive_evidence_do_not_commit.json"
        try:
            _write_json(
                security_leak_path,
                {
                    "phase": "4E.9",
                    "leak_probe": "Bearer test-token-should-never-pass",
                    "url_probe": "https://user:pass@example.internal/path?token=abc",
                },
            )
            try:
                validate_security_guards()
            except AssertionError as exc:
                if "sensiveis detectados" not in str(exc):
                    raise
            else:
                raise AssertionError("Smoke security guard: JSON com Bearer deveria ser bloqueado")
        finally:
            if security_leak_path.exists():
                security_leak_path.unlink()

        # Cenário 8: orquestrador deve parar no gate falho (sem coletar/apply/smoke).
        orchestrator_env = dict(os.environ)
        for env_key in [
            "GRAFANA_URL",
            "PROMETHEUS_URL",
            "LOKI_URL",
            "GRAFANA_API_TOKEN",
            "MAPIA_DS_PROMETHEUS_UID",
            "MAPIA_DS_LOKI_UID",
        ]:
            orchestrator_env.pop(env_key, None)
        orchestrator_result = _run_orchestrator(
            env=orchestrator_env,
            pnpm_cmd="pnpm",
            env_file_path=preconditions_envfile_placeholder_path,
            env_file_priority="envfile",
            preconditions_report_path=orchestrator_preconditions_report_path,
            evidence_output_path=orchestrator_evidence_output_path,
            smoke_report_path=orchestrator_smoke_report_path,
            run_report_path=orchestrator_run_report_path,
            grafana_dashboards_dir=apply_root / "grafana" / "dashboards-parent" / "dashboards",
            grafana_provisioning_dir=apply_root / "grafana" / "provisioning-parent" / "dashboards",
            prometheus_rules_dir=apply_root / "prometheus" / "rules",
            loki_rules_dir=apply_root / "loki" / "rules",
        )
        if orchestrator_result.returncode == 0:
            raise AssertionError("Smoke 4E.9R orquestrador: execucao deveria falhar quando o gate falha")
        if not orchestrator_run_report_path.exists():
            raise AssertionError("Smoke 4E.9R orquestrador: run report nao foi gerado")
        orchestrator_run_report = load_json_file(orchestrator_run_report_path)
        if orchestrator_run_report.get("status") != "blocked_preconditions":
            raise AssertionError("Smoke 4E.9R orquestrador: status final deveria ser blocked_preconditions")
        toolchain = orchestrator_run_report.get("toolchain") or {}
        if toolchain.get("pnpm_cmd") != "pnpm":
            raise AssertionError("Smoke 4E.9R orquestrador: toolchain.pnpm_cmd deveria refletir --pnpm-cmd")
        if toolchain.get("platform") != sys.platform:
            raise AssertionError("Smoke 4E.9R orquestrador: toolchain.platform deveria refletir sys.platform")
        env_file_block = orchestrator_run_report.get("env_file") or {}
        if env_file_block.get("priority") != "envfile":
            raise AssertionError("Smoke 4E.9R orquestrador: priority default deveria ser envfile")
        steps = orchestrator_run_report.get("steps") or []
        step_ids = [item.get("id") for item in steps if isinstance(item, dict)]
        if "A_gate_preconditions" not in step_ids:
            raise AssertionError("Smoke 4E.9R orquestrador: passo A_gate_preconditions ausente no report")
        for forbidden_step in [
            "D_collect_real_evidence",
            "F_apply_real",
            "G_post_apply_smoke",
        ]:
            if forbidden_step in step_ids:
                raise AssertionError(f"Smoke 4E.9R orquestrador: {forbidden_step} nao deveria executar apos gate falho")
        if orchestrator_evidence_output_path.exists():
            raise AssertionError("Smoke 4E.9R orquestrador: evidencia nao deveria ser gerada com gate bloqueado")
        if orchestrator_smoke_report_path.exists():
            raise AssertionError("Smoke 4E.9R orquestrador: smoke report nao deveria ser gerado com gate bloqueado")

        # Cenário 9: staging_prod continua bloqueando em strict-ready quando ainda houver pendencias.
        orchestrator_live_like_env = dict(os.environ)
        orchestrator_live_like_env.update(
            {
                "GRAFANA_URL": "http://127.0.0.1:3000",
                "PROMETHEUS_URL": "http://127.0.0.1:9090",
                "LOKI_URL": "http://127.0.0.1:3100",
                "GRAFANA_API_TOKEN": "smoke_token_orchestrator_live_like",
                "MAPIA_DS_PROMETHEUS_UID": "PROM_DS_UID_ORCH",
                "MAPIA_DS_LOKI_UID": "LOKI_DS_UID_ORCH",
            }
        )
        orchestrator_staging_result = _run_orchestrator(
            env=orchestrator_live_like_env,
            pnpm_cmd=str(fake_pnpm_path),
            strict_ready_mode="always",
            timeout_seconds=1,
            environment_scope="staging_prod",
            preconditions_report_path=orchestrator_staging_preconditions_report_path,
            evidence_output_path=orchestrator_staging_evidence_output_path,
            smoke_report_path=orchestrator_staging_smoke_report_path,
            baseline_output_path=orchestrator_staging_baseline_output_path,
            naming_output_path=orchestrator_staging_naming_output_path,
            readiness_output_path=orchestrator_staging_readiness_output_path,
            run_report_path=orchestrator_staging_run_report_path,
            grafana_dashboards_dir=apply_root / "grafana" / "dashboards-parent" / "dashboards",
            grafana_provisioning_dir=apply_root / "grafana" / "provisioning-parent" / "dashboards",
            prometheus_rules_dir=apply_root / "prometheus" / "rules",
            loki_rules_dir=apply_root / "loki" / "rules",
        )
        if orchestrator_staging_result.returncode != 1:
            raise AssertionError(
                "Smoke 4E.9R orquestrador staging_prod: strict-ready deveria bloquear "
                f"(retornou {orchestrator_staging_result.returncode})"
            )
        orchestrator_staging_run_report = load_json_file(orchestrator_staging_run_report_path)
        if orchestrator_staging_run_report.get("status") != "failed_strict_ready":
            raise AssertionError("Smoke 4E.9R orquestrador staging_prod: status final deveria ser failed_strict_ready")
        staging_strict_ready = orchestrator_staging_run_report.get("strict_ready") or {}
        if staging_strict_ready.get("mode") != "always":
            raise AssertionError("Smoke 4E.9R orquestrador staging_prod: strict_ready.mode deveria ser always")
        if staging_strict_ready.get("effective_behavior") != "blocking":
            raise AssertionError("Smoke 4E.9R orquestrador staging_prod: strict_ready deveria permanecer blocking")
        if staging_strict_ready.get("status") != "failed":
            raise AssertionError("Smoke 4E.9R orquestrador staging_prod: strict_ready.status deveria ser failed")
        staging_steps = orchestrator_staging_run_report.get("steps") or []
        staging_strict_step = next(
            (item for item in staging_steps if isinstance(item, dict) and item.get("id") == "H_strict_ready"),
            None,
        )
        if not isinstance(staging_strict_step, dict) or staging_strict_step.get("status") != "failed":
            raise AssertionError("Smoke 4E.9R orquestrador staging_prod: H_strict_ready deveria constar como failed")
        staging_readiness = load_yaml_file(orchestrator_staging_readiness_output_path)
        if staging_readiness.get("status") != "partial_pending_4e9r_real_evidence":
            raise AssertionError("Smoke 4E.9R orquestrador staging_prod: readiness deveria permanecer parcial")
        if "smoke_token_orchestrator_live_like" in json.dumps(orchestrator_staging_run_report):
            raise AssertionError("Smoke 4E.9R orquestrador staging_prod: token nao deveria aparecer no run report")

        # Cenário 10: dev_local nao deve falhar por strict-ready quando o resto do pipeline estiver saudavel.
        orchestrator_dev_local_result = _run_orchestrator(
            env=orchestrator_live_like_env,
            pnpm_cmd=str(fake_pnpm_path),
            strict_ready_mode="skip_in_dev_local",
            timeout_seconds=1,
            environment_scope="dev_local",
            preconditions_report_path=orchestrator_dev_local_preconditions_report_path,
            evidence_output_path=orchestrator_dev_local_evidence_output_path,
            smoke_report_path=orchestrator_dev_local_smoke_report_path,
            baseline_output_path=orchestrator_dev_local_baseline_output_path,
            naming_output_path=orchestrator_dev_local_naming_output_path,
            readiness_output_path=orchestrator_dev_local_readiness_output_path,
            run_report_path=orchestrator_dev_local_run_report_path,
            grafana_dashboards_dir=apply_root / "grafana" / "dashboards-parent" / "dashboards",
            grafana_provisioning_dir=apply_root / "grafana" / "provisioning-parent" / "dashboards",
            prometheus_rules_dir=apply_root / "prometheus" / "rules",
            loki_rules_dir=apply_root / "loki" / "rules",
        )
        if orchestrator_dev_local_result.returncode != 0:
            raise AssertionError(
                "Smoke 4E.9R orquestrador dev_local deveria concluir com sucesso mesmo sem evidencia completa.\nSTDOUT:\n"
                + orchestrator_dev_local_result.stdout
                + "\nSTDERR:\n"
                + orchestrator_dev_local_result.stderr
            )
        orchestrator_dev_local_run_report = load_json_file(orchestrator_dev_local_run_report_path)
        if orchestrator_dev_local_run_report.get("status") != "completed_success":
            raise AssertionError("Smoke 4E.9R orquestrador dev_local: status final deveria ser completed_success")
        dev_local_strict_ready = orchestrator_dev_local_run_report.get("strict_ready") or {}
        if dev_local_strict_ready.get("mode") != "skip_in_dev_local":
            raise AssertionError("Smoke 4E.9R orquestrador dev_local: strict_ready.mode deveria ser skip_in_dev_local")
        if dev_local_strict_ready.get("effective_behavior") != "skipped":
            raise AssertionError("Smoke 4E.9R orquestrador dev_local: strict_ready deveria ser skipped")
        if dev_local_strict_ready.get("status") != "skipped":
            raise AssertionError("Smoke 4E.9R orquestrador dev_local: strict_ready.status deveria ser skipped")
        if dev_local_strict_ready.get("reason") != "disabled_in_dev_local":
            raise AssertionError("Smoke 4E.9R orquestrador dev_local: strict_ready.reason inesperado")
        dev_local_steps = orchestrator_dev_local_run_report.get("steps") or []
        dev_local_strict_step = next(
            (item for item in dev_local_steps if isinstance(item, dict) and item.get("id") == "H_strict_ready"),
            None,
        )
        if not isinstance(dev_local_strict_step, dict):
            raise AssertionError("Smoke 4E.9R orquestrador dev_local: passo H_strict_ready deveria constar no report")
        if dev_local_strict_step.get("status") != "skipped":
            raise AssertionError("Smoke 4E.9R orquestrador dev_local: H_strict_ready deveria ser skipped")
        if dev_local_strict_step.get("blocking") is not False:
            raise AssertionError("Smoke 4E.9R orquestrador dev_local: H_strict_ready deveria ser non-blocking")
        dev_local_orchestrator_readiness = load_yaml_file(orchestrator_dev_local_readiness_output_path)
        if dev_local_orchestrator_readiness.get("status") not in {
            "partial_dev_local_real_evidence",
            "ready_dev_local_real_evidence",
        }:
            raise AssertionError(
                "Smoke 4E.9R orquestrador dev_local: readiness deveria permanecer em estado dev_local sem bloquear"
            )
        if "smoke_token_orchestrator_live_like" in json.dumps(orchestrator_dev_local_run_report):
            raise AssertionError("Smoke 4E.9R orquestrador dev_local: token nao deveria aparecer no run report")

        # Cenário 11: dev_local (localhost) deve aceitar flags/schema sem exigir serviços ativos.
        dev_local_evidence_path = tmp_path / "observability-evidence.4e9.dev-local.json"
        dev_local_baseline_path = tmp_path / "baseline-thresholds.4e9.dev-local.yaml"
        dev_local_naming_path = tmp_path / "naming-compatibility.4e9.dev-local.yaml"
        dev_local_readiness_path = tmp_path / "finalization-readiness.4e10.dev-local.yaml"
        dev_local_smoke_report_path = tmp_path / "post-apply-smoke.4e9.dev-local.report.json"
        _write_json(
            dev_local_smoke_report_path,
            {
                "phase": "4E.9",
                "mode": "remote_or_mixed",
                "status": "partial",
                "remote": {"prometheus": {"status": "partial"}, "loki": {"status": "partial"}},
            },
        )

        collect_dev_local_cmd = [
            sys.executable,
            str(collect_script),
            "--environment-scope",
            "dev_local",
            "--prometheus-url",
            "http://127.0.0.1:9090",
            "--loki-url",
            "http://127.0.0.1:3100",
            "--grafana-url",
            "http://127.0.0.1:3000",
            "--timeout-seconds",
            "1",
            "--output",
            str(dev_local_evidence_path),
        ]
        collect_dev_local_result = subprocess.run(
            collect_dev_local_cmd,
            cwd=OBS_ROOT.parent.parent,
            check=False,
            capture_output=True,
            text=True,
        )
        if collect_dev_local_result.returncode != 0:
            raise AssertionError(
                "Smoke dev_local collect falhou.\nSTDOUT:\n"
                + collect_dev_local_result.stdout
                + "\nSTDERR:\n"
                + collect_dev_local_result.stderr
            )
        dev_local_evidence = load_json_file(dev_local_evidence_path)
        if ((dev_local_evidence.get("collector") or {}).get("environment_scope")) != "dev_local":
            raise AssertionError("Smoke dev_local: collector.environment_scope deveria ser dev_local")
        if "dev_local" not in ((dev_local_evidence.get("signals") or {}).keys()):
            raise AssertionError("Smoke dev_local: signals.dev_local ausente")

        promote_dev_local_cmd = [
            sys.executable,
            str(promote_script),
            "--environment-scope",
            "dev_local",
            "--evidence",
            str(dev_local_evidence_path),
            "--output-baseline",
            str(dev_local_baseline_path),
            "--output-naming",
            str(dev_local_naming_path),
        ]
        promote_dev_local_result = subprocess.run(
            promote_dev_local_cmd,
            cwd=OBS_ROOT.parent.parent,
            check=False,
            capture_output=True,
            text=True,
        )
        if promote_dev_local_result.returncode != 0:
            raise AssertionError(
                "Smoke dev_local promote falhou.\nSTDOUT:\n"
                + promote_dev_local_result.stdout
                + "\nSTDERR:\n"
                + promote_dev_local_result.stderr
            )
        dev_local_baseline = load_yaml_file(dev_local_baseline_path)
        dev_local_naming = load_yaml_file(dev_local_naming_path)
        if dev_local_baseline.get("environment_scope") != "dev_local":
            raise AssertionError("Smoke dev_local: baseline.environment_scope deveria ser dev_local")
        if dev_local_naming.get("environment_scope") != "dev_local":
            raise AssertionError("Smoke dev_local: naming.environment_scope deveria ser dev_local")
        if "dev_local_real_evidence" not in str(dev_local_baseline.get("status") or ""):
            raise AssertionError("Smoke dev_local: baseline.status deveria explicitar dev_local_real_evidence")

        readiness_dev_local_env = dict(preconditions_ready_env)
        readiness_dev_local_result = _run_readiness(
            baseline_path=dev_local_baseline_path,
            naming_path=dev_local_naming_path,
            evidence_path=dev_local_evidence_path,
            output_path=dev_local_readiness_path,
            smoke_report_path=dev_local_smoke_report_path,
            strict_ready=False,
            environment_scope="dev_local",
            env=readiness_dev_local_env,
        )
        if readiness_dev_local_result.returncode != 0:
            raise AssertionError(
                "Smoke dev_local readiness falhou.\nSTDOUT:\n"
                + readiness_dev_local_result.stdout
                + "\nSTDERR:\n"
                + readiness_dev_local_result.stderr
            )
        dev_local_readiness = load_yaml_file(dev_local_readiness_path)
        if dev_local_readiness.get("environment_scope") != "dev_local":
            raise AssertionError("Smoke dev_local: readiness.environment_scope deveria ser dev_local")
        if "dev_local_real_evidence" not in str(dev_local_readiness.get("status") or ""):
            raise AssertionError("Smoke dev_local: readiness.status deveria explicitar dev_local_real_evidence")



def main() -> int:
    args = parse_args()
    validate_frontend_local_font_guardrail()
    validate_source_parsing()
    validate_dashboards()
    validate_alert_coverage()
    validate_calibration_files()
    validate_security_guards()
    validate_grafana_datasource_autodiscovery_parser()
    if args.smoke_render:
        smoke_render(args.profile)
    if args.smoke_apply_script:
        smoke_apply_script(args.profile)
    if args.smoke_evidence_scripts:
        smoke_evidence_scripts(args.profile)
    print("Observability as code validation: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
