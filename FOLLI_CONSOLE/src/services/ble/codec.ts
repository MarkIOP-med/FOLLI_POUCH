// Pure base64 <-> byte-array codec.
// react-native-ble-plx exchanges characteristic values as base64 strings, so we
// need to convert to/from our raw command/telemetry byte arrays. Implemented
// without Buffer/atob so it works identically in RN, Node (tests) and web.

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// Encode a byte array (values 0..255) into a base64 string.
export function bytesToBase64(bytes: ArrayLike<number>): string {
  let out = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i] & 0xff;
    const b1 = i + 1 < len ? bytes[i + 1] & 0xff : 0;
    const b2 = i + 2 < len ? bytes[i + 2] & 0xff : 0;

    out += B64_CHARS[b0 >> 2];
    out += B64_CHARS[((b0 & 0x03) << 4) | (b1 >> 4)];
    out += i + 1 < len ? B64_CHARS[((b1 & 0x0f) << 2) | (b2 >> 6)] : '=';
    out += i + 2 < len ? B64_CHARS[b2 & 0x3f] : '=';
  }
  return out;
}

// Decode a base64 string back into a byte array.
export function base64ToBytes(b64: string): number[] {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = B64_CHARS.indexOf(clean[i]);
    const c1 = B64_CHARS.indexOf(clean[i + 1]);
    const c2 = clean[i + 2] ? B64_CHARS.indexOf(clean[i + 2]) : -1;
    const c3 = clean[i + 3] ? B64_CHARS.indexOf(clean[i + 3]) : -1;

    bytes.push((c0 << 2) | (c1 >> 4));
    if (c2 !== -1) bytes.push(((c1 & 0x0f) << 4) | (c2 >> 2));
    if (c3 !== -1) bytes.push(((c2 & 0x03) << 6) | c3);
  }
  return bytes;
}
