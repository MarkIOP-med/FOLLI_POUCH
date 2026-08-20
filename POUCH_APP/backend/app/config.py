"""Application configuration.

Environment-overridable so the same image can run on a bench, in CI and on a ward
without code changes. Anything hard-coded that a deployment might reasonably need
to change belongs here.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ[name])
    except (KeyError, ValueError):
        return default


def _env_list(name: str, default: list[str]) -> list[str]:
    raw = os.environ.get(name)
    return [item.strip() for item in raw.split(",") if item.strip()] if raw else default


@dataclass(frozen=True)
class Settings:
    """Process-level settings. Clinical settings live in the DB, not here."""

    db_path: Path = Path(os.environ.get("FOLLI_DB_PATH", BASE_DIR / "folli.db"))

    cors_origins: tuple[str, ...] = tuple(
        _env_list(
            "FOLLI_CORS_ORIGINS",
            ["http://localhost:5173", "http://127.0.0.1:5173"],
        )
    )

    # SSE coalescing. Telemetry lands at 5 Hz (firmware SERIAL_LOG_INTERVAL_MS =
    # 200ms); the UI cannot use more than this.
    stream_interval_s: float = 0.2
    # Telemetry is downsampled before it reaches the DB: 5 Hz x 4 zones raw is
    # roughly 1.7M rows per pouch per day.
    telemetry_write_interval_s: float = 1.0

    # The serial baud and the fault-detection thresholds are NOT here: baud is
    # pinned in transport/serial_link.py, and the flatline/debounce windows are
    # constants in core/pressure.py (mirrored in the frontend domain layer).
    # Env knobs for them existed once but were read by nothing — a setting that
    # silently does nothing is worse than none.

    # No auth yet — every audit row is attributed to this actor. When login lands,
    # this becomes the fallback for unauthenticated system actions only.
    default_actor: str = "operator"


settings = Settings()
