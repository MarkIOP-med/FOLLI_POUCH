import { FolliBleClient } from './types';
import { MockBleClient } from './MockBleClient';

export * from './types';
export { MockBleClient } from './MockBleClient';

// Factory: return a real ble-plx client when the native module is available,
// otherwise fall back to the in-memory simulator. This keeps Expo Go / web /
// tests fully interactive and never crashes on a missing native module.
export function createBleClient(): FolliBleClient {
  try {
    // Lazy require so importing this module never eagerly loads the native
    // BLE module in environments where it does not exist.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { BleClient } = require('./BleClient');
    return new BleClient();
  } catch (err) {
    // No native BLE (Expo Go, web, jest) — simulate the pouch instead.
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log('[FOLLI BLE] Native BLE unavailable, using MockBleClient.', err);
    }
    return new MockBleClient();
  }
}
