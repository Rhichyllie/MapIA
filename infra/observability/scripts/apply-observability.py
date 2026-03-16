from __future__ import annotations

import argparse
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _env_file import EnvFileError, add_env_file_args, apply_env_file  # noqa: E402
from _obs_common import copy_tree_contents, parse_rendered_bundle, render_artifacts, resolve_datasource_uids  # noqa: E402


UID_ENV_KEYS = {"MAPIA_DS_PROMETHEUS_UID", "MAPIA_DS_LOKI_UID"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Render/apply observability as code (4E.9)")
    parser.add_argument("--profile", help="Profile de naming do backend/collector")
    parser.add_argument("--dry-run", action="store_true", help="Nao copia artefatos; apenas renderiza e valida")
    parser.add_argument("--render-dir", help="Diretorio para bundle renderizado (se omitido usa temp)")
    parser.add_argument("--keep-rendered", action="store_true", help="Mantem diretório renderizado temporário")
    parser.add_argument("--datasource-prometheus-uid", help="UID da datasource Prometheus no Grafana")
    parser.add_argument("--datasource-loki-uid", help="UID da datasource Loki no Grafana")
    parser.add_argument("--grafana-dashboards-dir", help="Destino filesystem para dashboards Grafana")
    parser.add_argument("--grafana-provisioning-dir", help="Destino filesystem para provisioning dashboards Grafana")
    parser.add_argument("--prometheus-rules-dir", help="Destino filesystem para rules Prometheus")
    parser.add_argument("--loki-rules-dir", help="Destino filesystem para rules Loki")
    parser.add_argument(
        "--fail-on-placeholder-uids",
        action="store_true",
        help="Falha se UIDs nao forem informados (mesmo em dry-run)",
    )
    add_env_file_args(parser)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        env_file_metadata = apply_env_file(
            args.env_file,
            mode=args.env_file_mode,
            priority=args.env_file_priority,
            selected_keys=UID_ENV_KEYS,
            priority_keys=UID_ENV_KEYS,
        )
    except EnvFileError as exc:
        raise SystemExit(f"--env-file invalido: {exc}") from exc

    if env_file_metadata.get("enabled"):
        print(
            "Env-file carregado para UIDs: "
            f"selected_keys={env_file_metadata.get('selected_keys_count', 0)} "
            f"applied_keys={env_file_metadata.get('applied_keys_count', 0)} "
            f"mode={env_file_metadata.get('mode')} "
            f"priority={env_file_metadata.get('priority')} "
            f"conflicts={env_file_metadata.get('conflict_keys_count', 0)}"
        )

    if args.render_dir:
        render_root = Path(args.render_dir).resolve()
        render_root.mkdir(parents=True, exist_ok=True)
        temp_dir_ctx = None
    else:
        if args.keep_rendered:
            render_root = Path(tempfile.mkdtemp(prefix="mapia-observability-render-")).resolve()
            temp_dir_ctx = None
        else:
            temp_dir_ctx = tempfile.TemporaryDirectory(prefix="mapia-observability-render-")
            render_root = Path(temp_dir_ctx.name)

    try:
        uids = resolve_datasource_uids(
            prometheus_uid=args.datasource_prometheus_uid,
            loki_uid=args.datasource_loki_uid,
            allow_placeholder_defaults=not args.fail_on_placeholder_uids and args.dry_run,
        )
        manifest = render_artifacts(render_root, args.profile, uids)
        parsed = parse_rendered_bundle(render_root)

        print(f"Render concluido: {render_root}")
        print(f"Profile de naming: {manifest['profile']}")
        print(f"Dashboards/rules renderizados: {len(manifest['files'])} arquivos")
        print(
            "Datasources UIDs resolvidos: "
            f"prometheus={manifest['datasource_uids']['prometheus']} "
            f"loki={manifest['datasource_uids']['loki']}"
        )
        print(f"Parse OK: {len(parsed['json_files'])} JSON, {len(parsed['yaml_files'])} YAML")

        if args.dry_run:
            print("Modo: dry-run (apply manual assistido / CI ready)")
            print("Nenhum arquivo foi copiado para destinos de ambiente.")
            return 0

        copy_actions = []
        if args.grafana_dashboards_dir:
            copy_actions.append(
                (
                    render_root / "grafana" / "dashboards",
                    Path(args.grafana_dashboards_dir).resolve(),
                    "grafana dashboards",
                )
            )
        if args.grafana_provisioning_dir:
            copy_actions.append(
                (
                    render_root / "grafana" / "provisioning" / "dashboards",
                    Path(args.grafana_provisioning_dir).resolve(),
                    "grafana provisioning",
                )
            )
        if args.prometheus_rules_dir:
            copy_actions.append(
                (
                    render_root / "prometheus" / "alerts",
                    Path(args.prometheus_rules_dir).resolve(),
                    "prometheus rules",
                )
            )
        if args.loki_rules_dir:
            copy_actions.append(
                (
                    render_root / "loki" / "alerts",
                    Path(args.loki_rules_dir).resolve(),
                    "loki rules",
                )
            )

        if not copy_actions:
            print("Nenhum destino de apply informado. Render concluido; use os argumentos de destino para aplicar.")
            print("Status: manual assistido (bundle pronto)")
            return 0

        for source_dir, target_dir, label in copy_actions:
            copied = copy_tree_contents(source_dir, target_dir)
            print(f"Apply filesystem ({label}): {len(copied)} arquivo(s) -> {target_dir}")

        print("Status: apply automatico (filesystem copy) concluido")
        return 0
    finally:
        if temp_dir_ctx and not args.keep_rendered and not args.render_dir:
            temp_dir_ctx.cleanup()
        elif args.keep_rendered:
            print(f"Bundle renderizado mantido temporariamente em: {render_root}")


if __name__ == "__main__":
    raise SystemExit(main())
