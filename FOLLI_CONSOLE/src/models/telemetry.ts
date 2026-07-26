// Data contracts + pure encode/decode for the FOLLI BLE GATT protocol.
// These functions have ZERO native/React imports on purpose so they can be
// unit-tested in isolation and map 1:1 to FOLLI_COMSOLE_OVERVIEW.md §3.

// --- Type-level contracts -------------------------------------------------

// The 4 V-Nodes exactly as specified (Byte 0 of the command payload).
export type VNode = 0x01 | 0x02 | 0x03 | 0x04; // Forehead, L-Temple, R-Temple, Back

// Valid massage speeds (Byte 2 of the command payload).
export type MassageLevel = 0 | 1 | 2 | 3; // Off, Low, Med, High

// Operation mode trigger (Byte 3 of the command payload).
export type OperationMode = 0x00 | 0x01 | 0x02; // Emergency/Dump, Static Hold, Dynamic Burst

// System error flag (Byte 5 of the telemetry payload).
export type ErrorFlag = 0x00 | 0x01 | 0x02; // Normal, Leak, Over-Temp

// --- Constants ------------------------------------------------------------

export const PRESSURE_MIN = 0;
export const PRESSURE_MAX = 70; // 0x46 -> 70 mmHg

export const OperationModes = {
  EMERGENCY: 0x00 as OperationMode,
  STATIC_HOLD: 0x01 as OperationMode,
  DYNAMIC_BURST: 0x02 as OperationMode,
};

// Human-readable labels for each node, keyed by V-Node id. Labels follow the
// official button artwork (assets/buttons): Front / Temples / Ears / Back.
// The underlying protocol bytes are unchanged (0x01 forehead .. 0x04 back).
export const ZONE_LABELS: Record<VNode, string> = {
  0x01: 'Front',
  0x02: 'Temples',
  0x03: 'Ears',
  0x04: 'Back',
};

// A full "dump pressure / hard stop" payload: [0x00, 0x00, 0x00, 0x00].
export const EMERGENCY_STOP_COMMAND: number[] = [0x00, 0x00, 0x00, 0x00];

// --- Command (phone -> ESP32) --------------------------------------------

export interface PouchCommand {
  targetNode: VNode;
  targetPressure: number; // 0..70 mmHg (clamped on encode)
  massageLevel: MassageLevel;
  operationMode: OperationMode;
}

// Clamp + round a raw slider value into the valid 0..70 mmHg pressure range.
export function clampPressure(value: number): number {
  if (Number.isNaN(value)) return PRESSURE_MIN;
  return Math.max(PRESSURE_MIN, Math.min(PRESSURE_MAX, Math.round(value)));
}

// Encode a command into the 4-byte array the ESP32 expects on Characteristic A.
export function encodeCommand(cmd: PouchCommand): number[] {
  return [
    cmd.targetNode & 0xff,
    clampPressure(cmd.targetPressure) & 0xff,
    cmd.massageLevel & 0xff,
    cmd.operationMode & 0xff,
  ];
}

// --- Telemetry (ESP32 -> phone) ------------------------------------------

export interface PouchTelemetry {
  foreheadPressure: number;
  leftTemplePressure: number;
  rightTemplePressure: number;
  backPressure: number;
  batteryPercentage: number;
  errorFlag: ErrorFlag;
}

export const EMPTY_TELEMETRY: PouchTelemetry = {
  foreheadPressure: 0,
  leftTemplePressure: 0,
  rightTemplePressure: 0,
  backPressure: 0,
  batteryPercentage: 0,
  errorFlag: 0x00,
};

// Decode the 6-byte telemetry payload from Characteristic B into a struct.
// Tolerates short/empty arrays by defaulting missing bytes to 0.
export function decodeTelemetry(bytes: ArrayLike<number>): PouchTelemetry {
  const b = (i: number): number => (bytes[i] ?? 0) & 0xff;
  return {
    foreheadPressure: b(0),
    leftTemplePressure: b(1),
    rightTemplePressure: b(2),
    backPressure: b(3),
    batteryPercentage: b(4),
    errorFlag: (b(5) as ErrorFlag),
  };
}

// Pick the live pressure reading for a given node out of a telemetry frame.
export function pressureForZone(t: PouchTelemetry, zone: VNode): number {
  switch (zone) {
    case 0x01:
      return t.foreheadPressure;
    case 0x02:
      return t.leftTemplePressure;
    case 0x03:
      return t.rightTemplePressure;
    case 0x04:
      return t.backPressure;
    default:
      return 0;
  }
}
