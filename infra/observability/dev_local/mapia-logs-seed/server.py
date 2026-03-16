from __future__ import annotations

import time
from datetime import datetime, timezone
from pathlib import Path


LOG_DIR = Path("/var/log/mapia")
LOG_PATH = LOG_DIR / "mapia-seed.log"
SEED_MESSAGES = (
    "message=\"[seed-log] heartbeat\" level=INFO source=mapia-logs-seed",
    "message=\"[seed-log] catalog_warm\" level=INFO source=mapia-logs-seed",
    "message=\"[seed-log] loki_stream_ready\" level=INFO source=mapia-logs-seed",
)


def _timestamp() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _write_line(handle, sequence: int) -> None:
    message = SEED_MESSAGES[sequence % len(SEED_MESSAGES)]
    handle.write(f"{_timestamp()} sequence={sequence} {message}\n")
    handle.flush()


def main() -> int:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    with LOG_PATH.open("a", encoding="utf-8", buffering=1) as handle:
        sequence = 0
        for _ in range(3):
            _write_line(handle, sequence)
            sequence += 1
        while True:
            _write_line(handle, sequence)
            sequence += 1
            time.sleep(1)


if __name__ == "__main__":
    raise SystemExit(main())
