"""Capture the reference screenshots in VISUAL_REFERENCE/app/.

These are the committed record of what the app looks like — the thing to open
when someone asks "what does the pouch screen show", without standing up a
server and a seeded database first.

Distinct from visual_diff.py, which measures the render against the design
firm's comps and throws its output away. This writes a small, durable, reviewable
set and keeps it in git.

Usage
-----
    python tools/capture_reference.py            # writes VISUAL_REFERENCE/app/v2
    python tools/capture_reference.py --set v3   # a later revision

Requires the dev server on :5173 and the API on :8000, with scripts/seed_mockup.py
already run so the screens have something to draw.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path

from playwright.sync_api import sync_playwright

DESIGN_W, DESIGN_H = 1920, 1200
BASE_URL = "http://127.0.0.1:5173"

ROOT = Path(__file__).resolve().parents[2]
REFERENCE = ROOT / "VISUAL_REFERENCE" / "app"

#: Pinned so re-running produces the same clock rather than a diff in every
#: shot. Matches visual_diff.py, which is the time printed on the mockups.
PINNED_CLOCK = "2026-06-20T10:53:23"

#: JPEG to match the existing v1 set. These are for looking at, not for
#: measuring — visual_diff.py works from PNG.
QUALITY = 92


@dataclass(frozen=True)
class Shot:
    name: str
    route: str


#: Numbered in reading order, matching the v1 naming convention. The four pages
#: the design firm delivered are the whole app now, so this set is four shots
#: rather than v1's fourteen.
SHOTS = (
    Shot("01-home-user-overview", "/home"),
    Shot("02-diagnostics-overview", "/diagnostics/POUCH-MOCKUP"),
    Shot("03-users-system-users", "/users/POUCH-MOCKUP"),
    Shot("04-admin-actions", "/admin/POUCH-MOCKUP"),
)


def capture(page, shot: Shot, out_dir: Path) -> Path:
    joiner = "&" if "?" in shot.route else "?"
    page.goto(f"{BASE_URL}{shot.route}{joiner}clock={PINNED_CLOCK}", wait_until="networkidle")
    # Telemetry arrives over SSE after first paint; without this the readouts are
    # captured mid-populate and the shot shows a screen no user ever sees.
    page.wait_for_timeout(2500)

    path = out_dir / f"{shot.name}.jpg"
    page.screenshot(
        path=str(path),
        clip={"x": 0, "y": 0, "width": DESIGN_W, "height": DESIGN_H},
        type="jpeg",
        quality=QUALITY,
    )
    return path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--set", default="v2", help="subdirectory under VISUAL_REFERENCE/app")
    args = parser.parse_args()

    out_dir = REFERENCE / args.set
    out_dir.mkdir(parents=True, exist_ok=True)
    print(f"capturing {len(SHOTS)} screens at {DESIGN_W}x{DESIGN_H} -> {out_dir}")

    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(
            viewport={"width": DESIGN_W, "height": DESIGN_H},
            device_scale_factor=1,
        )
        for shot in SHOTS:
            path = capture(page, shot, out_dir)
            print(f"  {shot.name:<28} {path.stat().st_size / 1024:6.0f} kB  {shot.route}")
        browser.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
