from __future__ import annotations

import os
import re
import urllib.parse
from pathlib import Path
from typing import Any


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

VALID_ENV_FILE_MODES = {"merge", "override"}
VALID_ENV_FILE_PRIORITIES = {"envfile", "env"}
ENV_KEY_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
UID_RE = re.compile(r"[A-Za-z0-9_-]{2,128}$")

CRITICAL_ENV_KEYS = {
    "GRAFANA_URL",
    "PROMETHEUS_URL",
    "LOKI_URL",
    "GRAFANA_API_TOKEN",
    "MAPIA_DS_PROMETHEUS_UID",
    "MAPIA_DS_LOKI_UID",
}


class EnvFileError(ValueError):
    pass


def normalize_string(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    return value.strip()


def looks_like_placeholder(value: str | None) -> tuple[bool, str | None]:
    normalized = normalize_string(value)
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


def add_env_file_args(parser, *, include_priority: bool = True) -> None:
    parser.add_argument(
        "--env-file",
        help=(
            "Arquivo dotenv local (KEY=VALUE) para carregar env vars sem depender da sessao shell. "
            "Nao versionar este arquivo."
        ),
    )
    parser.add_argument(
        "--env-file-mode",
        choices=sorted(VALID_ENV_FILE_MODES),
        default="merge",
        help="Modo de merge das env vars do arquivo: merge (default) ou override.",
    )
    if include_priority:
        parser.add_argument(
            "--env-file-priority",
            choices=sorted(VALID_ENV_FILE_PRIORITIES),
            default="envfile",
            help=(
                "Prioridade para chaves criticas em conflito (env-file vs env existente). "
                "`envfile` (default) torna execucao deterministica para 4E.9R."
            ),
        )


def validate_url_value(value: str | None) -> tuple[bool, str | None]:
    normalized = normalize_string(value)
    if normalized is None or normalized == "":
        return (False, "missing_or_empty")
    is_placeholder, placeholder_reason = looks_like_placeholder(normalized)
    if is_placeholder:
        return (False, placeholder_reason)
    parsed = urllib.parse.urlparse(normalized)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return (False, "invalid_url_format")
    return (True, None)


def validate_uid_value(value: str | None) -> tuple[bool, str | None]:
    normalized = normalize_string(value)
    if normalized is None or normalized == "":
        return (False, "missing_or_empty")
    is_placeholder, placeholder_reason = looks_like_placeholder(normalized)
    if is_placeholder:
        return (False, placeholder_reason)
    if not UID_RE.fullmatch(normalized):
        return (False, "invalid_uid_format")
    return (True, None)


def validate_secret_value(value: str | None) -> tuple[bool, str | None]:
    normalized = normalize_string(value)
    if normalized is None or normalized == "":
        return (False, "missing_or_empty")
    is_placeholder, placeholder_reason = looks_like_placeholder(normalized)
    if is_placeholder:
        return (False, placeholder_reason)
    return (True, None)


def parse_dotenv_file(path: Path) -> dict[str, str]:
    if not path.exists():
        raise EnvFileError(f"Env-file nao encontrado: {path}")
    if not path.is_file():
        raise EnvFileError(f"Env-file invalido (esperado arquivo regular): {path}")

    entries: dict[str, str] = {}
    for line_number, raw_line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        stripped = raw_line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if stripped.lower().startswith("export "):
            stripped = stripped[7:].strip()
        if "=" not in stripped:
            raise EnvFileError(f"Linha invalida no env-file (esperado KEY=VALUE): {path}:{line_number}")

        key_raw, value_raw = stripped.split("=", 1)
        key = key_raw.strip()
        if not key or not ENV_KEY_RE.fullmatch(key):
            raise EnvFileError(f"Chave invalida no env-file: {path}:{line_number}")

        value = value_raw.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        entries[key] = value
    return entries


def apply_env_file(
    env_file: str | Path | None,
    *,
    mode: str = "merge",
    priority: str = "envfile",
    env: dict[str, str] | None = None,
    selected_keys: set[str] | None = None,
    priority_keys: set[str] | None = None,
    fail_on_placeholder: bool = True,
) -> dict[str, Any]:
    if mode not in VALID_ENV_FILE_MODES:
        raise EnvFileError(f"--env-file-mode invalido: {mode!r}")
    if priority not in VALID_ENV_FILE_PRIORITIES:
        raise EnvFileError(f"--env-file-priority invalido: {priority!r}")

    if env_file is None:
        return {
            "enabled": False,
            "mode": mode,
            "priority": priority,
            "path": None,
            "loaded_keys_count": 0,
            "selected_keys_count": 0,
            "applied_keys_count": 0,
            "skipped_existing_keys_count": 0,
            "conflict_keys_count": 0,
            "conflicts_overridden_count": 0,
            "conflicts_preserved_count": 0,
            "priority_keys_count": 0,
            "ignored_keys_count": 0,
            "selected_value_lengths": {},
        }

    target_env: dict[str, str] = env if env is not None else os.environ
    env_file_path = Path(env_file).resolve()
    parsed_entries = parse_dotenv_file(env_file_path)
    effective_priority_keys = set(priority_keys or (selected_keys or set()))

    filtered_entries: dict[str, str] = {}
    ignored_keys: list[str] = []
    for key, value in parsed_entries.items():
        if selected_keys is not None and key not in selected_keys:
            ignored_keys.append(key)
            continue
        filtered_entries[key] = value

    placeholder_hits: list[dict[str, str]] = []
    for key, value in filtered_entries.items():
        is_placeholder, reason = looks_like_placeholder(value)
        if is_placeholder:
            placeholder_hits.append({"key": key, "reason": reason or "placeholder_detected"})
    if placeholder_hits and fail_on_placeholder:
        summary = ", ".join(f"{item['key']} ({item['reason']})" for item in placeholder_hits)
        raise EnvFileError(f"Env-file contem placeholders invalidos: {summary}")

    applied_keys: list[str] = []
    skipped_existing_keys: list[str] = []
    conflict_keys_count = 0
    conflicts_overridden_count = 0
    conflicts_preserved_count = 0
    for key, value in filtered_entries.items():
        existing_present = key in target_env
        existing_value = target_env.get(key)
        is_priority_key = key in effective_priority_keys
        is_conflict = existing_present and existing_value != value and is_priority_key
        if is_conflict:
            conflict_keys_count += 1

        if mode == "merge" and existing_present:
            if is_priority_key and priority == "envfile":
                target_env[key] = value
                applied_keys.append(key)
                if is_conflict:
                    conflicts_overridden_count += 1
                continue
            skipped_existing_keys.append(key)
            if is_conflict:
                conflicts_preserved_count += 1
            continue

        target_env[key] = value
        applied_keys.append(key)
        if is_conflict:
            conflicts_overridden_count += 1

    return {
        "enabled": True,
        "mode": mode,
        "priority": priority,
        "path": str(env_file_path),
        "loaded_keys_count": len(parsed_entries),
        "selected_keys_count": len(filtered_entries),
        "applied_keys_count": len(applied_keys),
        "applied_keys": sorted(applied_keys),
        "skipped_existing_keys_count": len(skipped_existing_keys),
        "skipped_existing_keys": sorted(skipped_existing_keys),
        "conflict_keys_count": conflict_keys_count,
        "conflicts_overridden_count": conflicts_overridden_count,
        "conflicts_preserved_count": conflicts_preserved_count,
        "priority_keys_count": len(effective_priority_keys),
        "ignored_keys_count": len(ignored_keys),
        "ignored_keys": sorted(ignored_keys),
        "placeholder_hits": placeholder_hits,
        "selected_value_lengths": {key: len(value) for key, value in filtered_entries.items()},
    }
