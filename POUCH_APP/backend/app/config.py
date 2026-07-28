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

    # Serial link. The bench board is an Arduino Due; opening its programming port
    # at 1200 baud is the bootloader erase trigger, so the rate is deliberately not
    # env-overridable.
    serial_baud: int = 9600

    # SSE coalescing. Telemetry lands at ~12 Hz; the UI cannot use more than this.
    stream_interval_s: float = 0.2
    # Telemetry is downsampled before it reaches the DB: 12 Hz x 4 zones raw is
    # roughly 4M rows per pouch per day.
    telemetry_write_interval_s: float = 1.0

    # Fault detection thresholds, mirrored in the frontend domain layer.
    flatline_fault_seconds: int = _env_int("FOLLI_FLATLINE_FAULT_S", 30)
    out_of_band_debounce_seconds: int = _env_int("FOLLI_BAND_DEBOUNCE_S", 5)

    # No auth yet — every audit row is attributed to this actor. When login lands,
    # this becomes the fallback for unauthenticated system actions only.
    default_actor: str = "operator"


settings = Settings()
