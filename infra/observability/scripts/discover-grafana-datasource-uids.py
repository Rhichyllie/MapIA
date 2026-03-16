from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _grafana_datasource_discovery import (  # noqa: E402
    DEFAULT_GRAFANA_TOKEN_ENV,
    GRAFANA_URL_ENV,
    discover_datasource_uids_from_grafana,
    sanitize_discovery_error_message,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Descobre UIDs de datasources Prometheus/Loki no Grafana")
    parser.add_argument("--grafana-url", help="URL base do Grafana (fallback para GRAFANA_URL)")
    parser.add_argument(
        "--grafana-token-env",
        default=DEFAULT_GRAFANA_TOKEN_ENV,
        help=f"Nome da env var com token de API do Grafana (default: {DEFAULT_GRAFANA_TOKEN_ENV})",
    )
    parser.add_argument("--timeout-seconds", type=int, default=10, help="Timeout HTTP por requisicao")
    return parser.parse_args()


def _print_datasource_line(prefix: str, payload: dict[str, str] | None) -> None:
    if not isinstance(payload, dict) or not payload.get("uid"):
        print(f"{prefix}: nao encontrado")
        return
    print(
        f"{prefix}: uid={payload.get('uid')} "
        f"type={payload.get('type') or '<unknown>'} "
        f"name={payload.get('name') or '<unnamed>'}"
    )


def main() -> int:
    args = parse_args()
    if args.timeout_seconds <= 0:
        raise SystemExit("--timeout-seconds deve ser > 0")

    grafana_url = (args.grafana_url or os.getenv(GRAFANA_URL_ENV) or "").strip()
    grafana_token = (os.getenv(args.grafana_token_env) or "").strip()
    if not grafana_url:
        print("Autodiscovery bloqueado: grafana_url ausente (use --grafana-url ou GRAFANA_URL).")
        return 1
    if not grafana_token:
        print(f"Autodiscovery bloqueado: token ausente em {args.grafana_token_env}.")
        return 1

    try:
        discovery = discover_datasource_uids_from_grafana(
            grafana_url=grafana_url,
            grafana_token=grafana_token,
            timeout_seconds=args.timeout_seconds,
        )
    except Exception as exc:  # noqa: BLE001
        print(f"Falha no autodiscovery: {sanitize_discovery_error_message(str(exc))}")
        return 1

    print("Grafana datasource autodiscovery")
    print(f"Datasources listados: {int(discovery.get('datasources_count') or 0)}")
    for row in discovery.get("datasources") or []:
        if not isinstance(row, dict):
            continue
        print(
            f"- uid={row.get('uid')} "
            f"type={row.get('type') or '<unknown>'} "
            f"name={row.get('name') or '<unnamed>'}"
        )

    _print_datasource_line("Prometheus", discovery.get("prometheus"))
    _print_datasource_line("Loki", discovery.get("loki"))

    return 0 if bool(discovery.get("resolved")) else 1


if __name__ == "__main__":
    raise SystemExit(main())
