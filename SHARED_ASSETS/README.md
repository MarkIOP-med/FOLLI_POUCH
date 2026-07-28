# SHARED_ASSETS

Single source of truth for artwork used by **both** `FOLLI_CONSOLE` (React Native /
Expo) and `POUCH_APP/frontend` (React / Vite), so the two speak the same visual
language instead of drifting apart.

```
SHARED_ASSETS/
  manifest.json      logical name -> file path, keyed by the canonical zone map
  buttons/           zone tiles, on/off button states, plus/minus, slider parts
  head/              head renders and the all-zones diagram
```

## What is NOT here, and why

`FOLLI_CONSOLE/assets/` still holds `icon.png`, `splash-icon.png`, `favicon.png` and
`android-icon-*.png`. Those are referenced by **`app.json`**, and Expo requires app-config
assets to live inside the project directory — they cannot be shared. That is a platform
constraint, not an oversight.

## How each app consumes it

**POUCH_APP/frontend (Vite)** — path alias, no copying:

```ts
// vite.config.ts:  '@shared-assets' -> ../../SHARED_ASSETS  (+ server.fs.allow)
import frontTile from '@shared-assets/buttons/head_zones_front.png';
```

**FOLLI_CONSOLE (Expo / Metro)** — a **synced mirror**. App code is unchanged and still
requires `../../assets/buttons/...`; `SHARED_ASSETS/sync.mjs` copies the files in before
every start/build/test via npm `pre*` hooks.

```bash
npm run sync-assets            # manual
node ../SHARED_ASSETS/sync.mjs --check   # CI: fail if the mirror is stale
```

> **Why a copy and not a direct reference?** The obvious approach — `metro.config.js`
> with `watchFolders: [SHARED_ASSETS]` and `require('../../../SHARED_ASSETS/...')` — was
> tried first and **does not work**. `expo export` fails with
> `None of these files exist: ..\SHARED_ASSETS\buttons\head_zones_front.png`, because
> Expo's asset plugin resolves asset paths relative to the project root and cannot
> express one above it. `watchFolders` is necessary but not sufficient. This was
> confirmed by running the real bundler, not assumed — so please don't "simplify" it
> back without running `npx expo export --platform web` first.

`FOLLI_CONSOLE/assets/buttons/` is therefore **generated output**. Edit the originals in
`SHARED_ASSETS/buttons/` only; anything written into the mirror is destroyed on the next
sync.

## The zone key is the contract

`manifest.json` keys zones as **`FRONT` / `TEMPLE` / `EAR` / `BACK`** with explicit
`channel` numbers matching `POUCH_ESP_GEN4/config.h`. This is deliberate: the console's
own protocol doc (`FOLLI_COMSOLE_OVERVIEW.md`) uses Forehead / L-Temple / R-Temple / Back,
which disagrees — console byte `0x03` means R-Temple while firmware channel 2 is EAR.
Anything reading this manifest gets the firmware's map, so artwork and actuation cannot
drift apart.

## Adding an asset

1. Drop the file in `buttons/` or `head/`.
2. Add a logical name to `manifest.json`.
3. Reference it by that logical name in both apps — never by a raw path in app code.

Metro requires **static** literal paths (it cannot resolve a `require()` built from a
variable), so the console keeps an explicit require map rather than reading the manifest
at runtime. The manifest is the shared contract; the require map is Metro's tax.
