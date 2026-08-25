/**
 * Domain-model helpers over the Gen4 protocol. The wire grammar itself is
 * conformance-tested in protocolVectors.test.ts against the shared vectors.
 */
import {
  ALL_ZONES,
  EMPTY_TELEMETRY,
  PRESSURE_MAX,
  ZONE_LABELS,
  clampPressure,
  isDeviceRunning,
  pressureForZone,
  zoneName,
} from '../src/models/telemetry';

describe('zone model', () => {
  it('channels are 0-indexed FRONT/TEMPLE/EAR/BACK, matching the firmware', () => {
    expect(ALL_ZONES).toEqual([0, 1, 2, 3]);
    expect(zoneName(0)).toBe('FRONT');
    expect(zoneName(1)).toBe('TEMPLE');
    expect(zoneName(2)).toBe('EAR');
    expect(zoneName(3)).toBe('BACK');
  });

  it('labels every channel for the UI', () => {
    expect(ZONE_LABELS[0]).toBe('Front');
    expect(ZONE_LABELS[1]).toBe('Temples');
    expect(ZONE_LABELS[2]).toBe('Ears');
    expect(ZONE_LABELS[3]).toBe('Back');
  });
});

describe('clampPressure', () => {
  it('clamps into 0..130 and rounds', () => {
    expect(clampPressure(-5)).toBe(0);
    expect(clampPressure(25.6)).toBe(26);
    expect(clampPressure(500)).toBe(PRESSURE_MAX);
  });
});

describe('telemetry helpers', () => {
  it('pressureForZone reads the channel-ordered actuals', () => {
    const t = { ...EMPTY_TELEMETRY, actuals: [11, 22, 33, 44] as [number, number, number, number] };
    expect(pressureForZone(t, 0)).toBe(11);
    expect(pressureForZone(t, 2)).toBe(33);
  });

  it('isDeviceRunning is true only while the board drives pressure', () => {
    expect(isDeviceRunning('PRESSURIZING')).toBe(true);
    expect(isDeviceRunning('MAINTENANCE')).toBe(true);
    expect(isDeviceRunning('IDLE')).toBe(false);
    expect(isDeviceRunning('STOPPED')).toBe(false);
    expect(isDeviceRunning('EMERGENCY_RELIEF')).toBe(false);
  });
});
