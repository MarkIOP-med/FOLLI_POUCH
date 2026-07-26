import {
  encodeCommand,
  decodeTelemetry,
  clampPressure,
  pressureForZone,
  EMERGENCY_STOP_COMMAND,
  OperationModes,
  PRESSURE_MAX,
  PRESSURE_MIN,
} from '../src/models/telemetry';

// These map 1:1 to FOLLI_COMSOLE_OVERVIEW.md §3 — the byte layout is the contract
// with the ESP32 firmware, so we assert exact bytes.

describe('command encoding (Characteristic A, 4-byte payload)', () => {
  it('maps node / pressure / massage / mode to the 4 bytes in order', () => {
    expect(
      encodeCommand({
        targetNode: 0x03,
        targetPressure: 40,
        massageLevel: 2,
        operationMode: OperationModes.STATIC_HOLD,
      }),
    ).toEqual([0x03, 40, 0x02, 0x01]);
  });

  it('encodes each V-Node into byte 0', () => {
    const byte0 = (node: 0x01 | 0x02 | 0x03 | 0x04) =>
      encodeCommand({ targetNode: node, targetPressure: 0, massageLevel: 0, operationMode: 0x01 })[0];
    expect([byte0(0x01), byte0(0x02), byte0(0x03), byte0(0x04)]).toEqual([1, 2, 3, 4]);
  });

  it('encodes each massage level into byte 2', () => {
    const byte2 = (lvl: 0 | 1 | 2 | 3) =>
      encodeCommand({ targetNode: 0x01, targetPressure: 0, massageLevel: lvl, operationMode: 0x01 })[2];
    expect([byte2(0), byte2(1), byte2(2), byte2(3)]).toEqual([0, 1, 2, 3]);
  });

  it('clamps out-of-range pressure into byte 1 (0..70)', () => {
    expect(encodeCommand({ targetNode: 1, targetPressure: 999, massageLevel: 0, operationMode: 1 })[1]).toBe(70);
    expect(encodeCommand({ targetNode: 1, targetPressure: -50, massageLevel: 0, operationMode: 1 })[1]).toBe(0);
  });

  it('encodes 70 mmHg as 0x46', () => {
    expect(encodeCommand({ targetNode: 1, targetPressure: 70, massageLevel: 0, operationMode: 1 })[1]).toBe(0x46);
  });
});

describe('clampPressure', () => {
  it('clamps to bounds and rounds', () => {
    expect(clampPressure(-10)).toBe(PRESSURE_MIN);
    expect(clampPressure(1000)).toBe(PRESSURE_MAX);
    expect(clampPressure(24.6)).toBe(25);
    expect(clampPressure(NaN)).toBe(PRESSURE_MIN);
  });
});

describe('emergency stop payload', () => {
  it('is a 4-byte all-zero dump command', () => {
    expect(EMERGENCY_STOP_COMMAND).toEqual([0x00, 0x00, 0x00, 0x00]);
  });
});

describe('telemetry decoding (Characteristic B, 6-byte payload)', () => {
  it('decodes all six sensor bytes', () => {
    expect(decodeTelemetry([12, 20, 22, 8, 85, 0x01])).toEqual({
      foreheadPressure: 12,
      leftTemplePressure: 20,
      rightTemplePressure: 22,
      backPressure: 8,
      batteryPercentage: 85,
      errorFlag: 0x01,
    });
  });

  it('decodes each error flag value', () => {
    expect(decodeTelemetry([0, 0, 0, 0, 0, 0x00]).errorFlag).toBe(0x00);
    expect(decodeTelemetry([0, 0, 0, 0, 0, 0x01]).errorFlag).toBe(0x01);
    expect(decodeTelemetry([0, 0, 0, 0, 0, 0x02]).errorFlag).toBe(0x02);
  });

  it('tolerates a short/empty payload by defaulting to 0', () => {
    expect(decodeTelemetry([])).toEqual({
      foreheadPressure: 0,
      leftTemplePressure: 0,
      rightTemplePressure: 0,
      backPressure: 0,
      batteryPercentage: 0,
      errorFlag: 0x00,
    });
  });
});

describe('pressureForZone', () => {
  const frame = {
    foreheadPressure: 11,
    leftTemplePressure: 22,
    rightTemplePressure: 33,
    backPressure: 44,
    batteryPercentage: 90,
    errorFlag: 0x00 as const,
  };
  it('selects the reading matching the active node', () => {
    expect(pressureForZone(frame, 0x01)).toBe(11);
    expect(pressureForZone(frame, 0x02)).toBe(22);
    expect(pressureForZone(frame, 0x03)).toBe(33);
    expect(pressureForZone(frame, 0x04)).toBe(44);
  });
});
