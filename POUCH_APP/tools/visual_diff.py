"""Measure how closely the built screens match the design firm's mockups.

The brief is 1:1, so fidelity has to be measured rather than eyeballed. This
captures each route at the exact design size (1920x1200), aligns it with the
corresponding mockup, and reports a match score overall and per region — plus a
heat map showing where the differences actually are.

Usage
-----
    python tools/visual_diff.py                 # all screens
    python tools/visual_diff.py diagnostics     # one screen
    python tools/visual_diff.py --open          # write and report paths

Requires the dev server on :5173 and the API on :8000.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright

DESIGN_W, DESIGN_H = 1920, 1200
BASE_URL = "http://127.0.0.1:5173"

ROOT = Path(__file__).resolve().parents[2]
MOCKUPS = ROOT / "SHARED_ASSETS" / "FOLLI_IMAGES" / "DIAGNOSTIC_IMAGES" / "interface"
OUT = Path(__file__).resolve().parent / "diff_output"


@dataclass(frozen=True)
class Screen:
    key: str
    route: str
    mockup: str
    #: Regions the mockup draws but the firmware cannot supply, so they are
    #: expected to differ. Reported separately rather than counted as failures.
    expected_deviations: tuple[tuple[str, tuple[int, int, int, int]], ...] = ()


SCREENS = (
    Screen(
        key="diagnostics",
        # POUCH-MOCKUP carries the mockup's own figures (scripts/seed_mockup.py),
        # so the score reflects layout and style rather than content differences.
        route="/diagnostics/POUCH-MOCKUP",
        mockup="diagnostics_ui_04_PAGE_02.png",
        expected_deviations=(
            ("pouch/console battery", (600, 62, 1040, 262)),
            ("pump + relief valve", (140, 690, 660, 780)),
            ("per-valve dots", (140, 780, 660, 1010)),
        ),
    ),
    Screen(key="home", route="/home", mockup="diagnostics_ui_04_PAGE_01.jpeg"),
    Screen(
        key="users",
        route="/users/POUCH-MOCKUP",
        mockup="diagnostics_ui_04_PAGE_03.png",
    ),
    Screen(
        key="admin",
        route="/admin/POUCH-MOCKUP",
        mockup="diagnostics_ui_04_PAGE_04.png",
    ),
)

#: Horizontal bands, so a low overall score can be attributed to a region.
BANDS = (
    ("status bar", 0, 62),
    ("header band", 62, 263),
    ("content", 263, 1160),
    ("footer", 1160, DESIGN_H),
)


#: The time printed on every mockup. Pinned during capture so the status bar is
#: comparing layout rather than how long ago the design was made.
MOCKUP_CLOCK = "2026-06-20T10:53:23"


def capture(page, screen: Screen) -> Image.Image:
    joiner = "&" if "?" in screen.route else "?"
    page.goto(
        f"{BASE_URL}{screen.route}{joiner}clock={MOCKUP_CLOCK}",
        wait_until="networkidle",
    )
    # Telemetry streams in; let a few frames land so the screen is populated.
    page.wait_for_timeout(2500)
    raw = page.screenshot(clip={"x": 0, "y": 0, "width": DESIGN_W, "height": DESIGN_H})
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"{screen.key}_actual.png"
    path.write_bytes(raw)
    return Image.open(path).convert("RGB")


def load_mockup(screen: Screen) -> Image.Image:
    img = Image.open(MOCKUPS / screen.mockup).convert("RGB")
    return img.resize((DESIGN_W, DESIGN_H), Image.LANCZOS)


#: A channel delta below this is invisible — antialiasing, JPEG noise, subpixel
#: text rendering. Above it, something is genuinely in the wrong place.
VISIBLE_DELTA = 24


def score(a: Image.Image, b: Image.Image, box=None) -> float:
    """Percentage of pixels that match visibly, 100 = nothing noticeably differs.

    Mean pixel difference was the obvious metric and it is nearly useless here:
    most of this canvas is dark background that always matches, so real layout
    errors moved the number by a fraction of a percent. Counting pixels whose
    difference is actually visible tracks what a reviewer would see.
    """
    if box:
        a, b = a.crop(box), b.crop(box)
    delta = np.asarray(ImageChops.difference(a, b), dtype=np.int16).max(axis=2)
    return float(100.0 * (delta <= VISIBLE_DELTA).mean())


def heatmap(actual: Image.Image, mock: Image.Image, path: Path) -> None:
    delta = np.asarray(ImageChops.difference(actual, mock)).sum(axis=2)
    norm = np.clip(delta / max(delta.max(), 1) * 255, 0, 255).astype(np.uint8)

    # Red where the render diverges, over a dimmed copy of the actual screen.
    base = (np.asarray(actual).astype(np.float32) * 0.35).astype(np.uint8)
    overlay = base.copy()
    overlay[..., 0] = np.maximum(overlay[..., 0], norm)
    Image.fromarray(overlay).save(path)


def perceptual(a: Image.Image, b: Image.Image) -> float:
    """Match at the level a person actually perceives.

    The strict score counts every pixel whose value differs, which on text means
    it is largely measuring glyph rasterisation — the mockup was rendered by a
    design tool, not by Chrome, so identical font at identical size still lands
    on different subpixels. Downsampling collapses that noise and leaves
    position, size and colour: the things "1:1" actually means to a reviewer.
    """
    small_a = a.resize((240, 150), Image.LANCZOS)
    small_b = b.resize((240, 150), Image.LANCZOS)
    delta = np.asarray(ImageChops.difference(small_a, small_b), dtype=np.int16).max(axis=2)
    return float(100.0 * (delta <= VISIBLE_DELTA).mean())


def worst_blocks(a: Image.Image, b: Image.Image, size=96, top=6):
    """The regions contributing most of the difference, so fixes can be aimed."""
    delta = np.asarray(ImageChops.difference(a, b), dtype=np.int16).max(axis=2)
    bad = (delta > VISIBLE_DELTA).astype(np.float32)
    rows, cols = bad.shape[0] // size, bad.shape[1] // size
    scored = [
        (bad[r * size:(r + 1) * size, c * size:(c + 1) * size].mean(),
         c * size, r * size)
        for r in range(rows) for c in range(cols)
    ]
    return sorted(scored, reverse=True)[:top]


def report(screen: Screen, actual: Image.Image, mock: Image.Image) -> float:
    overall = score(actual, mock)
    print(f"\n  {screen.key.upper()}  ({screen.route})")
    print(f"    strict (per-pixel)     {overall:6.2f}%")
    print(f"    perceptual             {perceptual(actual, mock):6.2f}%")

    for label, y0, y1 in BANDS:
        print(f"    {label:<22} {score(actual, mock, (0, y0, DESIGN_W, y1)):6.2f}%")

    print("    worst regions (x, y — aim fixes here):")
    for frac, x, y in worst_blocks(actual, mock):
        print(f"      ({x:>4}, {y:>4})  {frac * 100:5.1f}% of pixels differ")

    if screen.expected_deviations:
        print("    expected deviations (deferred indicators — not failures):")
        for label, box in screen.expected_deviations:
            print(f"      {label:<20} {score(actual, mock, box):6.2f}%")

    mock.save(OUT / f"{screen.key}_expected.png")
    heatmap(actual, mock, OUT / f"{screen.key}_diff.png")
    return overall


def main() -> int:
    wanted = [a for a in sys.argv[1:] if not a.startswith("-")]
    screens = [s for s in SCREENS if not wanted or s.key in wanted]
    if not screens:
        print(f"no screen matched {wanted}; known: {[s.key for s in SCREENS]}")
        return 2

    print(f"comparing at {DESIGN_W}x{DESIGN_H} against {MOCKUPS.name}/")
    results: list[tuple[str, float]] = []

    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(
            viewport={"width": DESIGN_W, "height": DESIGN_H},
            device_scale_factor=1,
        )
        for screen in screens:
            if not (MOCKUPS / screen.mockup).exists():
                print(f"\n  {screen.key.upper()}: mockup missing ({screen.mockup})")
                continue
            try:
                actual = capture(page, screen)
            except Exception as exc:
                print(f"\n  {screen.key.upper()}: capture failed — {exc}")
                continue
            results.append((screen.key, report(screen, actual, load_mockup(screen))))
        browser.close()

    print(f"\n  artefacts in {OUT}")
    for key, value in results:
        print(f"    {key:<14} {value:6.2f}%   "
              f"{key}_actual.png / {key}_expected.png / {key}_diff.png")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
