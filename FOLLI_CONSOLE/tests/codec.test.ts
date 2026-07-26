import { bytesToBase64, base64ToBytes } from '../src/services/ble/codec';

// ble-plx exchanges characteristic values as base64. These must round-trip our
// 4-byte command / 6-byte telemetry payloads exactly.

describe('base64 codec', () => {
  it('encodes the emergency stop command', () => {
    // [0,0,0,0] -> "AAAAAA=="
    expect(bytesToBase64([0, 0, 0, 0])).toBe('AAAAAA==');
  });

  it('round-trips a 4-byte command payload', () => {
    const bytes = [0x03, 40, 0x02, 0x01];
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it('round-trips a 6-byte telemetry payload', () => {
    const bytes = [12, 20, 22, 8, 85, 0x01];
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it('round-trips full-range byte values', () => {
    const bytes = [0, 1, 70, 128, 200, 255];
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it('decodes a known base64 string', () => {
    expect(base64ToBytes('AwABAA==')).toEqual([0x03, 0x00, 0x01, 0x00]);
  });
});
