"""Capture the console reference screenshots in VISUAL_REFERENCE/console/.

The committed record of what the console looks like, so the screens can be
reviewed without an Android device, a pouch, or a running Metro bundler.

Runs against the exported web bundle rather than a dev server, so what is
captured is what actually ships:

    npx expo export --platform web --output-dir /tmp/web
    python -m http.server 5202 --directory /tmp/web
    python tools/capture_reference.py --port 5202

The mock BLE client backs the web build, so the pouch reports telemetry and the
screens populate without hardware.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from playwright.sync_api import sync_playwright

# The comps' own canvas. Capturing at this size means a shot can be laid
# straight over console_ui_05 without rescaling either one.
DESIGN_W, DESIGN_H = 886, 1890

ROOT = Path(__file__).resolve().parents[2]
REFERENCE = ROOT / "VISUAL_REFERENCE" / "console"

# Matches src/config.ts. A soft lock in front of the admin panel, not a secret.
ADMIN_PASSWORD = "admin123"

QUALITY = 92


def capture_all(page, out_dir: Path) -> list[tuple[str, Path]]:
    """Walk the console through each state the comps document."""
    shots: list[tuple[str, Path]] = []

    def shoot(name: str) -> None:
        path = out_dir / f"{name}.jpg"
        page.screenshot(path=str(path), type="jpeg", quality=QUALITY)
        shots.append((name, path))

    # Each comp draws a different zone, so each shot selects the zone its comp
    # uses. Otherwise the two differ on the highlighted tile, the zone name and
    # every pressure readout, and the comparison measures the selection rather
    # than the layout.

    # PAGE_02 — pending, before START, FRONT selected.
    page.get_by_test_id("zone-1").click()
    page.wait_for_timeout(600)
    shoot("01-console-pending")

    # PAGE_01 — a running session, TEMPLE selected.
    page.get_by_test_id("zone-2").click()
    page.wait_for_timeout(300)
    page.get_by_test_id("start-button").click()
    page.wait_for_timeout(1200)
    shoot("02-console-active")

    # PAGE_03 — the admin gate.
    page.get_by_test_id("settings-gear").click()
    page.wait_for_timeout(600)
    shoot("03-admin-gate")

    # PAGE_04 — the control panel behind it.
    page.get_by_test_id("admin-password-input").fill(ADMIN_PASSWORD)
    page.get_by_test_id("admin-submit").click()
    page.wait_for_timeout(600)
    shoot("04-control-panel")

    return shots


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=5202)
    parser.add_argument("--set", default="v2", help="subdirectory under VISUAL_REFERENCE/console")
    args = parser.parse_args()

    out_dir = REFERENCE / args.set
    out_dir.mkdir(parents=True, exist_ok=True)
    print(f"capturing at {DESIGN_W}x{DESIGN_H} -> {out_dir}")

    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(
            viewport={"width": DESIGN_W, "height": DESIGN_H},
            device_scale_factor=1,
        )
        page.goto(f"http://127.0.0.1:{args.port}/", wait_until="networkidle")
        # The mock pouch connects and starts streaming after first paint.
        page.wait_for_timeout(3000)

        for name, path in capture_all(page, out_dir):
            print(f"  {name:<22} {path.stat().st_size / 1024:6.0f} kB")

        browser.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
