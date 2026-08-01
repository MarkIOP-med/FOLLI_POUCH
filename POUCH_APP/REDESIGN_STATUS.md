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

## Known defects

Visible in `VISUAL_REFERENCE/app/v2`, none yet fixed. All four are overflow or
formatting, not layout — the panels are in the right places.

1. **Header band labels collide.** `Pouch:` and `Console:` are positioned to
   the comp's coordinates with no gap between them, so a pouch name of the
   length actually in use runs into the `Console:` label. On all four screens.
2. **V-node reading clipped.** On diagnostics, `Actual: NN mmHg` overruns the
   card's right edge and loses the final glyph. The row was measured against
   the comp's shorter placeholder values.
3. **Duration hour not zero-padded.** The home cards and User Info call
   `formatDuration`, which renders `2:25:06`; the header calls
   `formatClockDuration`, which renders `02:25:13`. Both appear on screen at
   once and do not align. `formatClockDuration` is the one that matches the
   design's fixed-width field — the two call sites should use it.
4. **Profile artwork overlaps a long pouch name** on the home cards.

Not a defect, recorded because it looks like one: every page's title band reads
`POUCH DIAGNOSTICS OVERVIEW v2.4.3`, including home, users and admin. That is
what the comps print on all four pages, so the constant title is correct.

## FOLLI_CONSOLE — done

The four `console_ui_05` comps map onto the three screens that already existed,
not onto four new ones. Restyled in place; there is no second set of screens.

| Comp | Screen | strict | perceptual |
|---|---|---|---|
| PAGE_02 pending | `ConsoleScreen` | 84.49% | 80.48% |
| PAGE_01 active | `ConsoleScreen` | 84.52% | 80.58% |
| PAGE_03 admin gate | `AdminGateScreen` | 94.12% | 91.90% |
| PAGE_04 control panel | `ExitScreen` | 95.36% | 93.43% |

Shots in `VISUAL_REFERENCE/console/v2`, taken by
`FOLLI_CONSOLE/tools/capture_reference.py` against the exported web bundle. Each
shot selects the zone its comp draws, or the comparison measures the selection
rather than the layout.

The two console-screen scores are lower than the other two almost entirely
because of the no-data fields below, not because of layout — five text fields
render an em dash where the comp prints content, and the head artwork is tinted
differently in the comp than in the delivered asset. Neither is closable here.

**Not in the protocol, so rendered as no-data.** The BLE contract is 4-byte
commands and 6-byte telemetry, and the POUCH_APP link that would carry patient
data does not exist yet. Patient name, remaining time, pouch ID, the massage
countdown and the tablet's own battery all show `—`. The single battery byte in
telemetry is the pouch's, not the tablet's, so it is not reused for both.

**Deliberate deviations from the comps.**

1. The comp's `Remaining Time` is labelled `Session Time`, because only elapsed
   time reaches the console. Printing elapsed under a "remaining" label would be
   wrong on a medical device.
2. PAGE_04's artwork reads "Contol Panel" and "Press EXIT unlock and close".
   Both are typos in the design file; the app sets correct English.
3. Connection state and session state are independent. The comps pair
   Connected/ACTIVE and Disconnected/PENDING, but that is a coincidence of which
   two states each page drew.
4. The zone heading is `TEMPLES`, matching the button artwork and the protocol's
   label table; the comp's heading says `TEMPLE`.

**Open.** No font is bundled — the comps set Source Sans throughout plus Poppins
for the zone captions and massage digits, and the console renders in the
platform font. Sizes are right, letterforms are not, and the wider metrics are
why text that fits one line in the comp can wrap. `expo-font` with
`@expo-google-fonts/source-sans-3` and `/poppins` is the fix, mirroring what
POUCH_APP already does with `@fontsource-variable/source-sans-3`.

The console draws the female profile unconditionally. Both sets are wired up;
nothing tells it which to use.

Both suites stay green: 41 jest tests and a clean `expo export`.

## No UI at all

The four delivered pages do not cover everything the replaced screens did.
Creating a patient, editing a prescription in detail, and registering a device
or serial port are reachable only through the API and `scripts/seed_mockup.py`.
Where they belong is a design question for the firm, not something to improvise.

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
