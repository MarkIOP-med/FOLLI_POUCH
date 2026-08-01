# 2026-07 Redesign — implementation status

Tracking the rebuild of POUCH_APP against the design firm's delivery in
`SHARED_ASSETS/FOLLI_IMAGES/`. Written so this is resumable without re-deriving
the groundwork.

## Locked decisions

| Question | Decision |
|---|---|
| Deferred indicators (battery, pump, relief valve, per-valve, console link) | Exact geometry, **no-data state** — empty ring / `—`, never a fabricated reading. Validate with Mark before wiring. |
| PAGE_01 six slots | **Dynamic** grid over the device registry; six is what fit the mockup. |
| Scope | All 8 screens — 4 diagnostics (this app) + 4 console (React Native). |
| Pressure ceiling | **70 mmHg stands.** Mockup values of 89–98 are placeholder art. |
| Canvas | **1920×1200**, scaled as one unit. Confirmed from the PDFs, and the native resolution of a standard 10.1" tablet. |

## Done

- **`styles/_tokens.scss`** — extracted from the vector PDFs, not sampled. Exact
  fills (`#27475a` captions, `#4f89ad` selection, `#28d35a`/`#f83a30` status),
  border `#4c6470` at four weights (3 / 2.76 / 2.27 / 0.83 px), and geometry
  (header band 1870×200 @ 25,62.3; rail 75 wide; rows 69.9 on a 72.5 pitch).
  A clearly-marked transitional alias block keeps the pre-redesign screens
  compiling; **delete it once they are migrated.**
- **Font** — `@fontsource-variable/source-sans-3` bundled as a dependency, not
  CDN-linked, because the tablets have no internet. Verified actually loading.
- **`AppFrame`** — 1920×1200 canvas, absolutely centred then scaled.
  (`place-items: center` does not work here: `transform` does not affect layout
  size, so the scaled result lands off-centre.)
- **`StatusBar`, `IconRail`, `HeaderBand`, `DiagPanel`, `DiagLayout`** — shared
  by all four diagnostics screens.
- **Backend fields** — patient gender / birth year / protocol / treatment start
  and number; session planned duration and console id. Idempotent migrations
  checked against `PRAGMA table_info`. Age is derived, not stored.
- **`tools/visual_diff.py`** — headless capture at exact design size, aligned
  against the mockup, overall + per-band scores and a heat map. Knows which
  regions are deferred indicators and reports them separately.
- **`scripts/seed_mockup.py`** — seeds the mockup's own figures (Natalie
  Mitchell, the specific pressures and durations) onto `POUCH-MOCKUP`, so the
  diff measures layout rather than content differences.

## In progress — PAGE_02

Renders at `/diagnostics/POUCH-MOCKUP`. Structurally complete: three columns at
measured coordinates, supplied START/STOP artwork, zone-highlighted profiles,
FSR faults as `⚠ fault` rather than numbers.

**Current score: 78.67% of pixels visibly matching.**

> On the metric: mean pixel difference reported ~91% and was nearly useless —
> most of this canvas is dark background that always matches, so real layout
> errors moved it by fractions of a percent. The score now counts pixels whose
> difference exceeds a visible threshold, which tracks what a reviewer sees.
> The diff found a real bug immediately: an unreset `<h2>` margin on the panel
> caption was pushing every panel's content 40px low.

Known remaining gaps: vertical rhythm inside the V-node cards and the right
column is tighter than the mockup; status-bar logo inset.

## Not started

- **PAGE_01** (home / User Overview grid), **PAGE_03** (System Users + User
  Info), **PAGE_04** (Admin Actions table + General Data). Backend fields they
  need are already in place.
- **FOLLI_CONSOLE** — the four `console_ui_05` pages. Different codebase and
  language (React Native / Expo). Must keep 41 jest tests and the expo bundle
  green.

## How to work on this

```bash
# terminal 1
cd POUCH_APP/backend && python -m uvicorn app.main:app --reload --port 8000
# terminal 2
cd POUCH_APP/frontend && npm run dev
# seed the mockup's figures, then measure
cd POUCH_APP/backend && python scripts/seed_mockup.py
cd POUCH_APP && python tools/visual_diff.py diagnostics
```

`tools/diff_output/` holds `*_actual.png`, `*_expected.png` and `*_diff.png`
(heat map) per screen. Change one thing, re-run, keep it if the score improves.
