/**
 * Domain model for the console UI, over the Gen4 text protocol.
 *
 * The wire grammar itself lives in src/services/pouch/protocol.ts (mirrored
 * against the backend and conformance-tested via shared/protocol-vectors.json);
 * this module only shapes it for screens: zone labels, clamps, defaults.
 *
 * Channels are 0-indexed FRONT/TEMPLE/EAR/BACK, identical to the firmware and
 * the operator app — the legacy 0x01-0x04 "Forehead/L-Temple/R-Temple" byte
 * protocol is gone.
 */
import {
  BleTelemetry,
  CHANNELS,
  Channel,
  DeviceState,
  PRESSURE_CEILING_MMHG,
  Zone,
} from '../services/pouch/protocol';

export type { BleTelemetry as PouchTelemetry, DeviceState, Zone };
export { CHANNELS, PRESSURE_CEILING_MMHG };

/** Zone identifier used across screens — a firmware channel index. */
export type VNode = Channel;

export type MassageLevel = 0 | 1 | 2 | 3;

export const ALL_ZONES: VNode[] = [0, 1, 2, 3];

/** UI-facing labels per channel (the artwork uses the same names). */
export const ZONE_LABELS: Record<VNode, string> = {
  0: 'Front',
  1: 'Temples',
  2: 'Ears',
  3: 'Back',
};

export const zoneName = (zone: VNode): Zone => CHANNELS[zone];

export const PRESSURE_MIN = 0;
export const PRESSURE_MAX = PRESSURE_CEILING_MMHG;

export function clampPressure(value: number): number {
  return Math.max(PRESSURE_MIN, Math.min(PRESSURE_MAX, Math.round(value)));
}

/** A telemetry value for a "we haven't heard from the pouch yet" render. */
export const EMPTY_TELEMETRY: BleTelemetry = {
  state: 'IDLE',
  elapsedSeconds: 0,
  actuals: [0, 0, 0, 0],
  targets: [0, 0, 0, 0],
  battery: 0,
  error: 0,
  vibrationRemainingS: 0,
};

export function pressureForZone(t: BleTelemetry, zone: VNode): number {
  return t.actuals[zone];
}

/** The board runs a session when its state machine is driving pressure. */
export function isDeviceRunning(state: DeviceState): boolean {
  return state === 'PRESSURIZING' || state === 'MAINTENANCE';
}
