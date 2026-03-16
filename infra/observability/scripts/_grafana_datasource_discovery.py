from __future__ import annotations

import os
import re
from typing import Any

from _obs_common import http_json_query


GRAFANA_URL_ENV = "GRAFANA_URL"
DEFAULT_GRAFANA_TOKEN_ENV = "GRAFANA_API_TOKEN"
PROMETHEUS_UID_ENV = "MAPIA_DS_PROMETHEUS_UID"
LOKI_UID_ENV = "MAPIA_DS_LOKI_UID"

_URL_RE = re.compile(r"https?://[^\s]+", re.IGNORECASE)
_BEARER_RE = re.compile(r"bearer\s+[^\s\"']+", re.IGNORECASE)


def sanitize_discovery_error_message(message: str) -> str:
    text = str(message or "")
    text = _BEARER_RE.sub("Bearer <redacted>", text)
    text = _URL_RE.sub("<redacted_url>", text)
    return text[:500]


def _normalize_text(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    if not normalized:
        return None
    return normalized


def _extract_datasource_rows(payload: Any) -> list[dict[str, str]]:
    rows_raw: list[Any]
    if isinstance(payload, list):
        rows_raw = payload
    elif isinstance(payload, dict) and isinstance(payload.get("datasources"), list):
        rows_raw = payload.get("datasources") or []
    elif isinstance(payload, dict) and isinstance(payload.get("data"), list):
        rows_raw = payload.get("data") or []
    else:
        rows_raw = []

    rows: list[dict[str, str]] = []
    for item in rows_raw:
        if not isinstance(item, dict):
            continue
        uid = _normalize_text(item.get("uid"))
        if not uid:
            continue
        rows.append(
            {
                "uid": uid,
                "type": _normalize_text(item.get("type")) or "",
                "name": _normalize_text(item.get("name")) or "",
            }
        )
    return rows


def _best_datasource_candidate(rows: list[dict[str, str]], target: str) -> dict[str, Any] | None:
    best: dict[str, Any] | None = None
    best_score = -1
    for index, row in enumerate(rows):
        type_normalized = (row.get("type") or "").lower()
        name_normalized = (row.get("name") or "").lower()
        match_by_type = type_normalized == target
        match_by_name = target in name_normalized
        score = (2 if match_by_type else 0) + (1 if match_by_name else 0)
        if score <= 0:
            continue
        if score > best_score:
            best_score = score
            best = {
                "uid": row.get("uid"),
                "type": row.get("type"),
                "name": row.get("name"),
                "matched_by_type": match_by_type,
                "matched_by_name": match_by_name,
                "score": score,
                "index": index,
            }
    if best is None:
        return None
    best.pop("index", None)
    return best


def identify_datasource_uids_from_payload(payload: Any) -> dict[str, Any]:
    rows = _extract_datasource_rows(payload)
    prometheus = _best_datasource_candidate(rows, "prometheus")
    loki = _best_datasource_candidate(rows, "loki")
    return {
        "datasources_count": len(rows),
        "datasources": rows,
        "prometheus": {"found": bool(prometheus), **(prometheus or {})},
        "loki": {"found": bool(loki), **(loki or {})},
        "resolved": bool(prometheus and loki),
    }


def discover_datasource_uids_from_grafana(
    *,
    grafana_url: str,
    grafana_token: str,
    timeout_seconds: int = 10,
) -> dict[str, Any]:
    payload = http_json_query(
        grafana_url,
        "/api/datasources",
        headers={"Authorization": f"Bearer {grafana_token}"},
        timeout_seconds=timeout_seconds,
    )
    return identify_datasource_uids_from_payload(payload)


def resolve_missing_uid_env_vars(
    discovery_result: dict[str, Any],
    *,
    env: dict[str, str] | None = None,
) -> dict[str, Any]:
    target_env = env if env is not None else os.environ

    prom_present_before = bool(_normalize_text(target_env.get(PROMETHEUS_UID_ENV)))
    loki_present_before = bool(_normalize_text(target_env.get(LOKI_UID_ENV)))
    prom_uid_discovered = _normalize_text(((discovery_result.get("prometheus") or {}).get("uid")))
    loki_uid_discovered = _normalize_text(((discovery_result.get("loki") or {}).get("uid")))

    prom_resolved = False
    loki_resolved = False
    if not prom_present_before and prom_uid_discovered:
        target_env[PROMETHEUS_UID_ENV] = prom_uid_discovered
        prom_resolved = True
    if not loki_present_before and loki_uid_discovered:
        target_env[LOKI_UID_ENV] = loki_uid_discovered
        loki_resolved = True

    return {
        "attempted": True,
        "prometheus_resolved_by_autodiscovery": prom_resolved,
        "loki_resolved_by_autodiscovery": loki_resolved,
        "resolved_by_autodiscovery": prom_resolved or loki_resolved,
        "all_required_uids_available_after_autodiscovery": bool(
            _normalize_text(target_env.get(PROMETHEUS_UID_ENV)) and _normalize_text(target_env.get(LOKI_UID_ENV))
        ),
    }
