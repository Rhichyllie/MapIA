from __future__ import annotations

import os
import shlex
import subprocess
import sys
from pathlib import Path


SCRIPTS_ROOT = Path(__file__).resolve().parent
REPO_ROOT = SCRIPTS_ROOT.parent.parent.parent
ORCHESTRATOR_SCRIPT = SCRIPTS_ROOT / "run-4e9r-real.py"
EXTRA_ARGS_ENV = "MAPIA_4E9R_DEV_LOCAL_ARGS"


def _split_extra_args(value: str | None) -> list[str]:
    if not value or not value.strip():
        return []
    try:
        return shlex.split(value, posix=os.name != "nt")
    except ValueError as exc:
        raise SystemExit(f"{EXTRA_ARGS_ENV} invalido: {exc}") from exc


def main() -> int:
    default_pnpm_cmd = ".\\pnpm.cmd" if os.name == "nt" else "pnpm"
    cmd = [
        sys.executable,
        str(ORCHESTRATOR_SCRIPT),
        "--require-ready-env",
        "--environment-scope",
        "dev_local",
        "--strict-ready-mode",
        "skip_in_dev_local",
        "--pnpm-cmd",
        default_pnpm_cmd,
    ]
    cmd.extend(_split_extra_args(os.getenv(EXTRA_ARGS_ENV)))
    cmd.extend(sys.argv[1:])
    result = subprocess.run(cmd, cwd=REPO_ROOT, check=False)
    return int(result.returncode)


if __name__ == "__main__":
    raise SystemExit(main())
