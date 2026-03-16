from __future__ import annotations

import json
import os
import re
import shutil
from datetime import datetime, timezone
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml


REPO_ROOT = Path(__file__).resolve().parents[3]
OBS_ROOT = REPO_ROOT / "infra" / "observability"

SOURCE_ARTIFACTS = {
    "grafana_dashboards": OBS_ROOT / "grafana" / "dashboards",
    "grafana_provisioning": OBS_ROOT / "grafana" / "provisioning" / "dashboards",
    "prometheus_rules": OBS_ROOT / "prometheus" / "alerts",
    "loki_rules": OBS_ROOT / "loki" / "alerts",
}

FORBIDDEN_PATTERNS = [
    re.compile(r"authorization", re.IGNORECASE),
    re.compile(r"bearer\s+[a-z0-9._-]+", re.IGNORECASE),
    re.compile(r"token\s*[:=]", re.IGNORECASE),
    re.compile(r"password\s*[:=]", re.IGNORECASE),
    re.compile(r"set-cookie", re.IGNORECASE),
    re.compile(r"cookie\s*:", re.IGNORECASE),
    re.compile(r"select\s+.+\s+from\s+", re.IGNORECASE),
    re.compile(r"query_string", re.IGNORECASE),
]


@dataclass(frozen=True)
class NamingProfile:
    name: str
    labels: dict[str, str]
    metrics: dict[str, str]


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def write_json_file(path: Path, payload: Any) -> None:
    write_text(path, json.dumps(payload, indent=2, ensure_ascii=True) + "\n")


def load_yaml_file(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return yaml.safe_load(handle)


def load_json_file(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def discover_files(root: Path, suffixes: tuple[str, ...]) -> list[Path]:
    return sorted(path for path in root.rglob("*") if path.is_file() and path.suffix in suffixes)


def audit_forbidden_content(path: Path, text: str) -> list[str]:
    hits: list[str] = []
    for pattern in FORBIDDEN_PATTERNS:
        if pattern.search(text):
            hits.append(pattern.pattern)
    return hits


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def resolve_calibration_file(stem: str, preferred_phases: tuple[str, ...] = ("4e9", "4e8")) -> Path:
    candidates = [OBS_ROOT / "calibration" / f"{stem}.{phase}.yaml" for phase in preferred_phases]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    raise FileNotFoundError(f"Arquivo de calibracao nao encontrado para {stem}: {', '.join(map(str, candidates))}")


def _sanitize_uid(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    if not value:
        return None
    if not re.fullmatch(r"[A-Za-z0-9_-]{2,128}", value):
        raise ValueError(f"UID invalido: {value!r}")
    return value


def resolve_datasource_uids(
    prometheus_uid: str | None = None,
    loki_uid: str | None = None,
    allow_placeholder_defaults: bool = False,
) -> dict[str, str]:
    prom = _sanitize_uid(prometheus_uid or os.getenv("MAPIA_DS_PROMETHEUS_UID"))
    loki = _sanitize_uid(loki_uid or os.getenv("MAPIA_DS_LOKI_UID"))
    if allow_placeholder_defaults:
        prom = prom or "REPLACE_ME_PROMETHEUS_UID"
        loki = loki or "REPLACE_ME_LOKI_UID"
    if prom is None or loki is None:
        missing = []
        if prom is None:
            missing.append("MAPIA_DS_PROMETHEUS_UID")
        if loki is None:
            missing.append("MAPIA_DS_LOKI_UID")
        raise ValueError(f"Datasources UIDs ausentes: {', '.join(missing)}")
    return {"prometheus": prom, "loki": loki}


def load_naming_profile(profile_name: str | None = None, naming_path: Path | None = None) -> NamingProfile:
    naming_path = naming_path or resolve_calibration_file("naming-compatibility")
    raw = load_yaml_file(naming_path)
    canonical_labels = dict((raw or {}).get("canonical", {}).get("labels", {}))
    canonical_metrics = dict((raw or {}).get("canonical", {}).get("metrics", {}))
    profiles = dict((raw or {}).get("profiles", {}))
    selected_name = profile_name or (raw or {}).get("default_profile")
    if not selected_name or selected_name not in profiles:
        available = ", ".join(sorted(profiles)) or "<none>"
        raise ValueError(f"Profile de naming invalido: {selected_name!r}. Disponiveis: {available}")
    selected = profiles[selected_name] or {}
    label_overrides = dict(selected.get("labels", {}))
    metric_overrides = dict(selected.get("metrics", {}))
    labels = {key: label_overrides.get(key, value) for key, value in canonical_labels.items()}
    metrics = {key: metric_overrides.get(key, value) for key, value in canonical_metrics.items()}
    return NamingProfile(name=selected_name, labels=labels, metrics=metrics)


def naming_replacement_map(profile: NamingProfile, naming_path: Path | None = None) -> dict[str, str]:
    naming_path = naming_path or resolve_calibration_file("naming-compatibility")
    raw = load_yaml_file(naming_path)
    canonical_labels = dict((raw or {}).get("canonical", {}).get("labels", {}))
    canonical_metrics = dict((raw or {}).get("canonical", {}).get("metrics", {}))

    replacements: dict[str, str] = {}
    for key, canonical_value in canonical_labels.items():
        target_value = profile.labels[key]
        if target_value != canonical_value:
            replacements[canonical_value] = target_value
    for key, canonical_value in canonical_metrics.items():
        target_value = profile.metrics[key]
        if target_value != canonical_value:
            replacements[canonical_value] = target_value
    return replacements


def apply_naming_replacements(text: str, replacements: dict[str, str]) -> str:
    if not replacements:
        return text
    rendered = text
    for source, target in sorted(replacements.items(), key=lambda item: len(item[0]), reverse=True):
        rendered = re.sub(
            rf"(?<![A-Za-z0-9_]){re.escape(source)}(?![A-Za-z0-9_])",
            target,
            rendered,
        )
    return rendered


def render_artifacts(
    output_root: Path,
    profile_name: str | None,
    datasource_uids: dict[str, str],
) -> dict[str, Any]:
    naming_path = resolve_calibration_file("naming-compatibility")
    profile = load_naming_profile(profile_name, naming_path=naming_path)
    replacements = naming_replacement_map(profile, naming_path=naming_path)
    output_root.mkdir(parents=True, exist_ok=True)

    rendered_files: list[str] = []
    for source_dir in SOURCE_ARTIFACTS.values():
        for source_file in discover_files(source_dir, (".json", ".yaml", ".yml")):
            rel = source_file.relative_to(OBS_ROOT)
            target_file = output_root / rel
            text = read_text(source_file)
            text = text.replace("${DS_PROMETHEUS}", datasource_uids["prometheus"])
            text = text.replace("${DS_LOKI}", datasource_uids["loki"])
            text = apply_naming_replacements(text, replacements)
            write_text(target_file, text)
            rendered_files.append(str(rel).replace("\\", "/"))

    manifest = {
        "rendered_at": utc_now_iso(),
        "naming_file": str(naming_path.relative_to(OBS_ROOT)).replace("\\", "/"),
        "profile": profile.name,
        "datasource_uids": datasource_uids,
        "applied_naming_replacements": replacements,
        "files": rendered_files,
    }
    write_json_file(output_root / "render-manifest.json", manifest)
    return manifest


def parse_rendered_bundle(render_root: Path) -> dict[str, list[str]]:
    json_files = discover_files(render_root, (".json",))
    yaml_files = discover_files(render_root, (".yaml", ".yml"))
    for file_path in json_files:
        load_json_file(file_path)
    for file_path in yaml_files:
        load_yaml_file(file_path)
    return {
        "json_files": [str(path.relative_to(render_root)).replace("\\", "/") for path in json_files],
        "yaml_files": [str(path.relative_to(render_root)).replace("\\", "/") for path in yaml_files],
    }


def copy_tree_contents(source_dir: Path, target_dir: Path) -> list[str]:
    target_dir.mkdir(parents=True, exist_ok=True)
    copied: list[str] = []
    for file_path in discover_files(source_dir, (".json", ".yaml", ".yml")):
        rel = file_path.relative_to(source_dir)
        dest = target_dir / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(file_path, dest)
        copied.append(str(dest))
    return copied


def http_json(
    url: str,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    timeout_seconds: int = 10,
) -> Any:
    request = urllib.request.Request(url=url, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            payload = response.read().decode("utf-8")
            return json.loads(payload)
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {error.code} em {url}: {body[:500]}") from error


def http_json_query(
    base_url: str,
    path: str,
    params: dict[str, str] | None = None,
    headers: dict[str, str] | None = None,
    timeout_seconds: int = 10,
) -> Any:
    query = urllib.parse.urlencode(params or {}, doseq=True)
    url = base_url.rstrip("/") + path
    if query:
        url = f"{url}?{query}"
    return http_json(url, headers=headers, timeout_seconds=timeout_seconds)
