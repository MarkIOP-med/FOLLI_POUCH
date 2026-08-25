/**
 * The FOLLI wire protocol — TypeScript mirror of
 * POUCH_APP/backend/app/transport/protocol.py (change one, change both).
 *
 * Source of truth for the grammar: POUCH_ESP_GEN4/POUCH_ESP.md. Conformance is
 * enforced mechanically: tests/protocolVectors.test.ts runs this module against
 * shared/protocol-vectors.json — the same vectors the backend's pytest runs —
 * so the C++/Python/TypeScript implementations cannot silently drift.
 *
 * Pure functions only: no I/O, no BLE, no React. Transports ship these strings;
 * the view model consumes the parsed results.
 */

/** Channel indices, identical to the firmware and the operator app. */
export const CHANNELS = ['FRONT', 'TEMPLE', 'EAR', 'BACK'] as const;
export type Zone = (typeof CHANNELS)[number];
export type Channel = 0 | 1 | 2 | 3;

export const channelOf = (zone: Zone): Channel =>
  CHANNELS.indexOf(zone) as Channel;

/** Shared clinical constants — asserted against shared/protocol-vectors.json. */
export const PRESSURE_CEILING_MMHG = 130;
export const CONTROLLER_TOLERANCE_MMHG = 3;
export const TRIM_RANGE_PCT = 10;
/** setvibration level meaning "leave this channel as it is". */
export const VIB_LEAVE_UNCHANGED = -1;

/** BLE endpoint identity — asserted against the vectors file. */
export const BLE = {
  serviceUuid: '4fafc201-1fb5-459e-8fcc-c5c9c331914b',
  commandCharUuid: 'beb5483e-36e1-4688-b7f5-ea07361b26a8',
  telemetryCharUuid: 'd68a2a54-7f15-4ba5-bc44-59368d400d3b',
  advertisedName: 'FOLLISAVE-POUCH',
  /** Enriched telemetry (~55 bytes) truncates at the default 20-byte MTU. */
  minMtu: 185,
} as const;

export type DeviceState =
  | 'IDLE'
  | 'PRESSURIZING'
  | 'MAINTENANCE'
  | 'EMERGENCY_RELIEF'
  | 'STOPPED';

const STATE_CHARS: Record<string, DeviceState> = {
  I: 'IDLE',
  P: 'PRESSURIZING',
  M: 'MAINTENANCE',
  E: 'EMERGENCY_RELIEF',
  S: 'STOPPED',
};

// ── command encoders ─────────────────────────────────────────────────────────

export const encodeStart = (): string => 'start';
export const encodeStop = (): string => 'stop';
export const encodeResetAll = (): string => 'resetall';
export const encodeRestart = (): string => 'restart';
export const encodeAssign = (): string => 'assign';
export const encodeSaveAsDefault = (): string => 'saveasdefault';

/** targets: zone → mmHg. Indexed-pair batch form: "setpressure:1,60;2,80". */
export function encodeSetPressure(targets: Partial<Record<Zone, number>>): string {
  const pairs = (Object.entries(targets) as [Zone, number][]).map(
    ([zone, mmhg]) => `${channelOf(zone)},${Math.round(mmhg)}`,
  );
  if (pairs.length === 0) throw new Error('no targets given');
  return `setpressure:${pairs.join(';')}`;
}

/** Positional levels for channels 0..N-1 (max 4); -1 = leave unchanged. */
export function encodeSetVibration(levels: number[]): string {
  if (levels.length < 1 || levels.length > 4) {
    throw new Error('setvibration takes 1-4 levels');
  }
  const clamped = levels.map((lv) => Math.max(-1, Math.min(3, Math.round(lv))));
  return `setvibration:${clamped.join(',')}`;
}

/** user:<id>:<p0..p3>[:<name>] — the name is what this console displays. */
export function encodeLoadUser(userId: number, pressures: number[], name?: string): string {
  if (pressures.length !== 4) throw new Error('user record needs exactly 4 pressures');
  const line = `user:${Math.round(userId)}:${pressures.map((p) => Math.round(p)).join(',')}`;
  const wireName = (name ?? '').replace(/:/g, ' ').split(/\s+/).filter(Boolean).join(' ');
  return wireName ? `${line}:${wireName}` : line;
}

export function encodeSetUserDefaultPressure(pressures: number[]): string {
  if (pressures.length !== 4) throw new Error('needs exactly 4 pressures');
  return `setuserdefaultpressure:${pressures.map((p) => Math.round(p)).join(',')}`;
}

export function encodeSetVariable(name: string, value: number | 'default'): string {
  return `setvariable:${name},${value}`;
}

const READ_COMMANDS = [
  'readpressure', 'readfsr', 'readvariables', 'readuser',
  'readstate', 'readvibration', 'readall',
] as const;

export function encodeRead(what: string): string {
  const word = what.toLowerCase().startsWith('read')
    ? what.toLowerCase()
    : `read${what.toLowerCase()}`;
  if (!(READ_COMMANDS as readonly string[]).includes(word)) {
    throw new Error(`unknown read command ${what}`);
  }
  return word;
}

// ── inbound decoding ─────────────────────────────────────────────────────────

/** Periodic BLE telemetry: T:<state>,<elapsed>,<a0..a3>,<t0..t3>,<batt>,<err>. */
export interface BleTelemetry {
  state: DeviceState;
  elapsedSeconds: number;
  /** Actual pressures, channel order FRONT/TEMPLE/EAR/BACK. */
  actuals: [number, number, number, number];
  /** Commanded targets, same order. */
  targets: [number, number, number, number];
  battery: number;
  error: number;
}

/** The device's checked-out user, from R:USER:<id>,<assigned>,<p0..p3>,<name>. */
export interface DeviceUser {
  userId: number;
  assigned: boolean;
  pressures: [number, number, number, number];
  /** Display name the operator app pushed; empty when none travelled. */
  name: string;
}

export type DecodedLine =
  | { kind: 'telemetry'; telemetry: BleTelemetry }
  | { kind: 'response'; tag: 'OK' | 'ERR' | 'R'; payload: string }
  | { kind: 'invalid'; line: string };

/** Classify one notify line from the pouch. */
export function decodeLine(line: string): DecodedLine {
  if (line.startsWith('T:')) {
    const telemetry = decodeBleTelemetry(line);
    return telemetry ? { kind: 'telemetry', telemetry } : { kind: 'invalid', line };
  }
  for (const tag of ['OK', 'ERR', 'R'] as const) {
    if (line.startsWith(`${tag}:`)) {
      return { kind: 'response', tag, payload: line.slice(tag.length + 1) };
    }
  }
  return { kind: 'invalid', line };
}

export function decodeBleTelemetry(line: string): BleTelemetry | null {
  if (!line.startsWith('T:')) return null;
  const parts = line.slice(2).split(',');
  if (parts.length !== 12) return null;
  const state = STATE_CHARS[parts[0]];
  if (!state) return null;
  const nums = parts.slice(1).map((p) => Number(p));
  if (nums.some((n) => !Number.isFinite(n))) return null;
  return {
    state,
    elapsedSeconds: nums[0],
    actuals: [nums[1], nums[2], nums[3], nums[4]],
    targets: [nums[5], nums[6], nums[7], nums[8]],
    battery: nums[9],
    error: nums[10],
  };
}

/**
 * Parse the payload of an R:USER response ("8,true,0,95,125,0,Edna Levi").
 * The name is the LAST field and free text, so everything after the sixth
 * comma belongs to it; pre-name firmware (six fields) still parses.
 */
export function decodeUserPayload(payload: string): DeviceUser | null {
  if (!payload.startsWith('USER:')) return null;
  const parts = payload.slice('USER:'.length).split(',');
  if (parts.length < 6) return null;
  const userId = Number(parts[0]);
  const pressures = parts.slice(2, 6).map((p) => Number(p));
  if (!Number.isFinite(userId) || pressures.some((p) => !Number.isFinite(p))) {
    return null;
  }
  return {
    userId,
    assigned: parts[1] === 'true',
    pressures: pressures as [number, number, number, number],
    name: parts.slice(6).join(',').trim(),
  };
}
