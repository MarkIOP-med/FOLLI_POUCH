// Central app configuration constants.

// Admin password that gates the EXIT / control-panel screen.
// NOTE: This is intentionally a simple hard-coded gate for a kiosk device.
// It is NOT real security — anyone with the source can read it. It exists only
// to stop an ordinary end-user from casually leaving the locked console.
export const ADMIN_PASSWORD = 'admin123';

// Visual slider range. The BLE protocol supports 0..70 mmHg (see telemetry.ts),
// but the console UI caps the selectable pressure at 28 so the control matches
// the UI_01 design (thumb ~89% along the track at 25 mmHg). Raise this if
// higher targets are ever needed — the protocol layer already handles it.
export const PRESSURE_UI_MAX = 28;
