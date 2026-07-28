# VISUAL_REFERENCE

Reference imagery for design handoff.

```
VISUAL_REFERENCE/
  console/   photos of the FOLLI_CONSOLE screens on the handset
  app/       screenshots of POUCH_APP (React + Vite), captured from the running app
```

## console/

Five reference photos of the patient-facing console — logo, colours, imagery. Unchanged;
these were simply moved into their own folder.

## app/

Captured 2026-07-28 against the running app with the mock pouch. The mock deliberately
reproduces the bench hardware's real faults, so the fault states below are genuine
renderings, not mock-ups: TEMPLE carries a ~44 mmHg phantom offset and five of six FSRs
are open circuits.

| File | Screen / state |
|---|---|
| `01-board-roster.jpg` | Board — the ICU-style roster of pouches. **Not** the screen Mark's mock depicts |
| `02-device-overview-top.jpg` | POUCH SYSTEM OVERVIEW — three columns, patient band on top. This *is* the mock's screen |
| `03-device-hardware-vnodes-vibration.jpg` | Manifold gauges, valve list, all four V-node cards, vibration table |
| `04-device-alerts.jpg` | Alert strip — persists until acked, written to `events` |
| `05-device-technical-drawer.jpg` | Technical / Service drawer — manifold, link rate, serial log, raw frame |
| `06-device-service-mode.jpg` | Service mode, no patient. Note admin actions correctly disabled |
| `07-patients-list-masked-ids.jpg` | Patients — national IDs masked by default, reveal is audited |
| `08-patient-detail.jpg` | Patient detail with live Israeli-ID check-digit validation |
| `09-patient-detail-zone-defaults.jpg` | Per-zone prescription, massage level, duration; patient trim read-only |
| `10-settings.jpg` | Ceiling, trim range, device registry, detected COM ports |
| `11-admin-confirm-promote-ratchet-warning.jpg` | SET CURRENT AS DEFAULT — the ratchet warning before trim is consumed |
| `12-admin-confirm-reset-defaults.jpg` | RESET ALL DEFAULTS confirmation |
| `13-patient-picker.jpg` | Loading a patient onto a pouch |
| `14-device-no-session.jpg` | No session — START disabled, admin actions greyed |

### Things worth noticing in these shots

- **Pump / Purge Valve read "not reported"** and the valve LEDs are dashed outlines. The
  telemetry CSV carries only time, targets, actuals, manifold and FSRs — the firmware
  never sends pump or valve state, so it is shown as absent rather than inferred.
- **FSRs read `⚠ fault`, never `4095`.** A railed ADC is an open circuit, not a reading.
  EAR reads `n/a` because those channels are stubbed to 0 in firmware — not the same thing.
- **Vibration column says "Duration", not "Time Left".** The firmware auto-times vibration
  out but never reports remaining time, so a countdown would be an animation pretending
  to be a measurement.
- **The V-node head tiles come from `SHARED_ASSETS/`** — the same artwork the console
  shows the patient, dimmed when a zone is prescribed 0.
- **`fw: unknown`** in the header: Gen4 is a byte-for-byte copy of Gen3 and prints the
  Gen3 banner, so a board currently cannot identify itself.
