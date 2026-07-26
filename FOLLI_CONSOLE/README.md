# FOLLI Comfort Console

React Native / Expo control panel for the FOLLI head-comfort pouch (Poco C71 ⇄
ESP32-WROOM-32 over BLE). See [`FOLLI_COMSOLE_OVERVIEW.md`](./FOLLI_COMSOLE_OVERVIEW.md)
for the hardware + GATT protocol spec.

## What's implemented

| Area | Status |
| --- | --- |
| UI matching `UI_01.png` | ✅ Console screen (header, treatment area + head graphic, pressure slider, massage levels, blue STOP). The 3D head is an **SVG approximation**, not the original raster. |
| Real BLE | ✅ `react-native-ble-plx` client implementing the exact GATT service/characteristics from the spec, with a mock fallback so the UI runs without hardware. |
| Kiosk / "no way out" | ✅ JS lockdown (blocks Back, immersive full-screen, keep-awake) + OS Lock-Task hooks. **True lockdown needs device-owner provisioning — see below.** |
| Gear → admin gate → EXIT | ✅ Gear (top-right) → password `admin123` → red round EXIT button (releases lock-task, then quits). |
| Tests | ✅ 34 tests, all controls + protocol bytes + password gate + exit path. |

## Run

```bash
npm install --legacy-peer-deps
npx expo run:android      # needs a dev build — BLE does not work in Expo Go
```

Without hardware the app auto-uses an in-memory pouch simulator, so every control
is live. Real BLE activates automatically on a native build with a pouch present.

## Test

```bash
npm test
```

Pure protocol encode/decode, the `useConsole` control logic, the admin gate, the
exit path, and a full `ConsoleScreen` render are covered. No hardware required.

## Making it unescapable

App code alone **cannot** block Home/Recents/shade — that's an Android limitation.
Full kiosk lockdown requires Lock Task Mode + Device Owner provisioning (one ADB
command). Step-by-step, including the native module to drop in:
[`native/android/README_KIOSK.md`](./native/android/README_KIOSK.md).

## Structure

```
App.tsx                       state-based router + kiosk lock
src/config.ts                 ADMIN_PASSWORD ('admin123'), session label
src/models/telemetry.ts       pure command/telemetry byte codecs (spec §3)
src/services/ble/             BleClient (real) · MockBleClient · codec · factory
src/services/kiosk/           KioskLock (lock-task + exit)
src/viewmodels/               useConsole (controls→BLE) · useKioskLock
src/components/HeadNodeIcon.tsx line-art head icons (marker per zone)
src/screens/                  ConsoleScreen · AdminGateScreen · ExitScreen
tests/                        34 tests
```
