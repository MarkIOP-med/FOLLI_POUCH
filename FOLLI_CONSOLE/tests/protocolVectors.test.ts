/**
 * Cross-language protocol conformance: every shared vector against protocol.ts.
 *
 * shared/protocol-vectors.json (repo root) is the single source of truth for
 * the FOLLI grammar across the C++ firmware, the backend's Python and this
 * TypeScript mirror. The backend's pytest runs the SAME file
 * (backend/tests/test_protocol_vectors.py) — drift in any implementation fails
 * a suite, never the bench.
 */
import * as fs from 'fs';
import * as path from 'path';

import {
  BLE,
  CONTROLLER_TOLERANCE_MMHG,
  PRESSURE_CEILING_MMHG,
  TRIM_RANGE_PCT,
  VIB_LEAVE_UNCHANGED,
  Zone,
  decodeLine,
  decodeUserPayload,
  encodeAssign,
  encodeLoadUser,
  encodeRead,
  encodeResetAll,
  encodeRestart,
  encodeSaveAsDefault,
  encodeSetPressure,
  encodeSetUserDefaultPressure,
  encodeSetVariable,
  encodeSetVibration,
  encodeStart,
  encodeStop,
} from '../src/services/pouch/protocol';

const vectors = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '..', '..', 'shared', 'protocol-vectors.json'),
    'utf-8',
  ),
);

type EncodeArgs = Record<string, unknown>;

const ENCODERS: Record<string, (args: EncodeArgs) => string> = {
  start: () => encodeStart(),
  stop: () => encodeStop(),
  reset_all: () => encodeResetAll(),
  restart: () => encodeRestart(),
  assign: () => encodeAssign(),
  save_as_default: () => encodeSaveAsDefault(),
  set_pressure: (a) =>
    encodeSetPressure(a.targets as Partial<Record<Zone, number>>),
  set_vibration: (a) => encodeSetVibration(a.levels as number[]),
  load_user: (a) =>
    encodeLoadUser(a.user_id as number, a.pressures as number[], a.name as string | undefined),
  set_user_default_pressure: (a) =>
    encodeSetUserDefaultPressure(a.pressures as number[]),
  set_variable: (a) =>
    encodeSetVariable(a.variable as string, a.value as number | 'default'),
  read: (a) => encodeRead(a.what as string),
};

describe('protocol conformance — encode vectors', () => {
  for (const vector of vectors.encode) {
    it(vector.name, () => {
      expect(ENCODERS[vector.fn](vector.args)).toBe(vector.wire);
    });
  }
});

describe('protocol conformance — BLE decode vectors', () => {
  for (const vector of vectors.decode_ble) {
    it(vector.name, () => {
      const decoded = decodeLine(vector.line);
      expect(decoded.kind).toBe(vector.expect.kind);

      if (vector.expect.kind === 'telemetry' && decoded.kind === 'telemetry') {
        expect(decoded.telemetry.state).toBe(vector.expect.state);
        expect(decoded.telemetry.elapsedSeconds).toBe(vector.expect.elapsed_s);
        expect(decoded.telemetry.actuals).toEqual(vector.expect.actuals);
        expect(decoded.telemetry.targets).toEqual(vector.expect.targets);
        expect(decoded.telemetry.battery).toBe(vector.expect.battery);
        expect(decoded.telemetry.error).toBe(vector.expect.error);
        if (vector.expect.vibration_remaining_s !== undefined) {
          expect(decoded.telemetry.vibrationRemainingS).toBe(
            vector.expect.vibration_remaining_s,
          );
        }
      }
      if (vector.expect.kind === 'response' && decoded.kind === 'response') {
        expect(decoded.tag).toBe(vector.expect.tag);
        expect(decoded.payload).toBe(vector.expect.payload);
      }
    });
  }
});

describe('protocol conformance — shared constants', () => {
  it('clinical constants match the vectors file', () => {
    const c = vectors.constants;
    expect(PRESSURE_CEILING_MMHG).toBe(c.pressure_ceiling_mmhg);
    expect(CONTROLLER_TOLERANCE_MMHG).toBe(c.controller_tolerance_mmhg);
    expect(TRIM_RANGE_PCT).toBe(c.trim_range_pct);
    expect(VIB_LEAVE_UNCHANGED).toBe(c.vibration_leave_unchanged);
  });

  it('BLE endpoint identity matches the vectors file', () => {
    const b = vectors.constants.ble;
    expect(BLE.serviceUuid).toBe(b.service_uuid);
    expect(BLE.commandCharUuid).toBe(b.command_char_uuid);
    expect(BLE.telemetryCharUuid).toBe(b.telemetry_char_uuid);
    expect(BLE.advertisedName).toBe(b.advertised_name);
    expect(BLE.minMtu).toBe(b.min_mtu);
  });
});

describe('protocol conformance — user-record decode vectors', () => {
  for (const vector of vectors.decode_user) {
    it(vector.name, () => {
      const decoded = decodeUserPayload(vector.payload);
      if (vector.expect === null) {
        expect(decoded).toBeNull();
        return;
      }
      expect(decoded).toEqual({
        userId: vector.expect.user_id,
        assigned: vector.expect.assigned,
        pressures: vector.expect.pressures,
        name: vector.expect.name,
      });
    });
  }
});
