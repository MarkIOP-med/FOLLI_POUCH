# POUCH_APP — React + Vite + TypeScript / FastAPI + SQLite

The rebuilt clinical app. The original Flask `app.py` and `static/` are untouched.

## Run

Two terminals, from `POUCH_APP/`:

```bash
# 1. backend
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000

# 2. frontend
cd frontend
npm install
npm run dev            # http://localhost:5173
```

Vite proxies `/api` to `127.0.0.1:8000`, so the browser sees one origin.

A **mock pouch** (`POUCH-MOCK`) exists on first run, so everything works with no
hardware. It deliberately imitates the real board's observed misbehaviour — phantom
offset on TEMPLE, railed FSRs — because a mock that only produces clean data hides
exactly the UI states that matter.

Optional demo data: `python seed_demo.py` (server must be running).

## Tests

```bash
cd backend
pip install -e ".[dev]"
pytest                       # 62 tests, no server needed — TestClient runs the app
ruff check .                 # lint
python test_real_serial.py   # real Arduino on COM5, READ-ONLY, never runs the pump
```

Frontend: `npm run typecheck`, `npm run build`.

`tests/conftest.py` points `FOLLI_DB_PATH` at a temp file, so the suite never touches
your working `folli.db`.

---

## Project structure

### Backend — `backend/`

```
app/
  main.py            app factory, lifespan, router registration
  config.py          process settings (env-overridable); clinical settings live in the DB
  core/              pure domain logic — no I/O, no framework, directly unit-testable
    zones.py         canonical FRONT/TEMPLE/EAR/BACK map
    pressure.py      effective(), clamps, zone status, FSR interpretation
    israeli_id.py    teudat zehut check digit
  db/
    schema.py        the SQL schema
    session.py       connect(), get_db() dependency, session_scope()
  repositories/      EVERY SQL statement in the application lives here
  services/          orchestration: snapshot building, alert raising
  transport/         serial + mock links, and the device registry
  routers/           HTTP surface, one module per resource
  schemas/           pydantic request/response models (these generate the OpenAPI doc)
tests/               pytest, with fixtures for a clean DB and a seeded patient
scripts/seed_demo.py
```

The dependency direction is one-way: `routers → services → repositories → db`, with
`core` importable from anywhere and importing nothing. Routers never write SQL;
repositories never import routers.

Handlers take `db: Connection = Depends(get_db)` rather than opening their own
connection, so no handler can leak one.

### Frontend — `frontend/src/`

One folder per component, colocating everything that belongs to it:

```
components/VNodeCard/
  VNodeCard.tsx        markup only
  VNodeCard.scss       styles only for this component
  VNodeCard.lib.ts     non-visual logic (pure, testable)
  VNodeCard.types.ts   props and local types
  index.ts             the public surface
```

```
app/routes.tsx     router + typed route helpers
api/               client, shared types, the SSE hook
domain/            cross-component logic: pressure math, ID validation, status mapping
i18n/              setup + locales/en.json — the only place user-facing copy exists
styles/            _tokens.scss, _mixins.scss, global.scss
components/        AppShell, Gauge, VNodeCard, HardwarePanel, AdminActions, …
screens/           BoardRoster, DeviceScreen, Patients, PatientDetail, Settings
```

**No literal user-facing strings in components.** Everything routes through
`useTranslation()` against `i18n/locales/en.json`, namespaced by screen. Adding a
locale is one JSON file plus two lines in `i18n/index.ts`. Hebrew is the obvious next
one; it will also need `dir="rtl"`, which is why direction is not baked into the CSS.

**Design tokens are injected, not imported.** `vite.config.ts` prepends
`@use "@/styles/tokens"` and `@use "@/styles/mixins"` to every stylesheet, so component
`.scss` files must not `@use` them again.

Imports use the `@/` alias (`@/components/Gauge`), not `../../..` chains.

## Screens

| Route | Screen |
|---|---|
| `/` | Board roster — every pouch at a glance, polled at 2 s |
| `/devices/:id` | **POUCH SYSTEM OVERVIEW** — Mark's three-column mock (hardware / v-nodes / admin) with a patient band added on top |
| `/patients` | Patient list, national IDs masked by default |
| `/patients/:id` | Demographics, per-zone defaults, session history |
| `/settings` | Ceiling, trim range, device registration |

## Decisions baked into the code

**Zone map is `FRONT, TEMPLE, EAR, BACK`** — firmware order, list index = channel index
(`backend/app/zones.py`). `FOLLI_COMSOLE_OVERVIEW.md` disagrees (Forehead / L-Temple /
R-Temple / Back); it is the outlier and the document that changes. Until it does,
console byte `0x03` means R-Temple while firmware channel 2 is EAR — **the wrong pad
inflates.**

**Prescription and patient trim are separate columns.** `prescribed_mmhg` is the
clinician's; `patient_trim_pct` (±10%) is the patient's, set from the console. Effective
pressure is derived, never stored. Folding a trim back into the prescription compounds
across sessions (40 → 44 → 48.4 → …) and walks past the ceiling with nobody at fault.

**STOP ALL sends `r`, not `s`.** Verified on hardware: `s` sets `currentState = STOPPED`,
`runStateMachine()` returns at its first line, and nothing writes `PUMP_PIN` LOW — the
pump keeps running. A control labelled STOP must actually stop the pump.

**The ceiling here is a convenience limit.** The authoritative clamp must also live in
`pneumatics.ino`, so the device stays safe with this app switched off.

**Faults never render as numbers.** An FSR at `4095` is an open circuit, not a reading,
and shows `⚠ fault`. A pressure flat at `0` for >30 s is a fault, not "at atmosphere".
Zone status is `OK / SETTLING / OUT_OF_BAND / SENSOR_FAULT` — a zone 42 mmHg off target
is never `OK`, even during the alarm debounce.

**Only `warn`/`alarm` reach the alert strip.** `connected`, `apply` and `session_start`
are log entries; surfacing them as alerts buries the one that matters.

**MRN comes from the row id after insert,** never `MAX(id)+1` — that reuses numbers once
a patient is deleted, so a retired MRN silently reappears on a different person.

**National ID is optional and check-digit validated** (Israeli teudat zehut, validated on
both sides). Random 9-digit strings fail ~90% of the time. The internal MRN is the key.

## Firmware work this depends on

| Needed | Why | Status in app |
|---|---|---|
| `v` identity command | Gen4 is a byte-for-byte copy of Gen3 and prints the Gen3 banner, so a board cannot identify itself | header shows `fw unknown` |
| `z` re-zero command | baseline is captured 500 ms after boot, before sensors settle; `r` vents without re-capturing | RE-ZERO button vents instead |
| `s` must stop the pump | see above | STOP sends `r` |
| phase-2 pump timeout | `pneumatics.ino` holds `PUMP_PIN` HIGH until the manifold reads target; with a dead manifold sensor that never happens | manifold fault raises an alert |
| firmware pressure clamp | app-side ceiling is not a safety control | ceiling clamps input only |
| pump / valve / purge state in telemetry | the CSV carries only time, targets, actuals, manifold and FSRs — the mock's pump-duty and valve LEDs have no data source | shown as "not reported", never inferred |
| vibration time-remaining in telemetry | firmware auto-times vibration out but never reports the countdown | duration shown, not a live count |
| `vib:` parsing in `serial.ino` | listed in the protocol, not implemented | levels are stored, not sent |
| a true PAUSE | `s` freezes the state machine without stopping the pump | PAUSE vents and holds the session |

Measured ceiling: **~12 Hz telemetry, ~80 ms command latency** at 9600 baud. 115200 would
move the bottleneck to the sensor oversampling (~45 Hz) — firmware and both apps must agree.

> Caveat on that 12 Hz: measured directly off the port it was 12.3 Hz, but the first
> `test_real_serial.py` run reported **16 Hz** through the app. Most likely the 3-second
> sliding window in `Link.rate_hz` catching buffered lines just after the port-open reset,
> rather than a true sustained rate. Not chased — but don't treat 12 Hz as exact until
> someone measures it over a longer window.
