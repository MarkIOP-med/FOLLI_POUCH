import { NativeModules, Platform, BackHandler } from 'react-native';

// Optional native module. Present only if the FolliKiosk Android module has been
// added to the native project (see native/android/README_KIOSK.md). When absent,
// every call is a graceful no-op so the JS app still runs everywhere.
const Native: {
  startLockTask?: () => Promise<void>;
  stopLockTask?: () => Promise<void>;
  isLockTaskActive?: () => Promise<boolean>;
} | undefined = (NativeModules as any).FolliKiosk;

// KioskLock centralizes the "unescapable app" behavior.
//
// IMPORTANT (read native/android/README_KIOSK.md): App code alone CANNOT block
// the Home button, Recents, notification shade or power menu. Full lockdown
// requires Android Lock Task Mode, and to make that non-escapable the device
// must be provisioned as **device owner** via ADB. This module drives the OS
// lock-task API when available and degrades to JS-only lockdown otherwise.
export const KioskLock = {
  // Enter Android screen-pinning / lock-task mode (best effort).
  async start(): Promise<void> {
    if (Platform.OS !== 'android') return;
    try {
      await Native?.startLockTask?.();
    } catch (err) {
      if (__DEV__) console.log('[KioskLock] startLockTask failed/absent:', err);
    }
  },

  // Leave lock-task mode. MUST run before exitApp() or the app cannot close.
  async stop(): Promise<void> {
    if (Platform.OS !== 'android') return;
    try {
      await Native?.stopLockTask?.();
    } catch (err) {
      if (__DEV__) console.log('[KioskLock] stopLockTask failed/absent:', err);
    }
  },

  // The ONLY sanctioned way out: leave lock-task, then terminate the app.
  async exit(): Promise<void> {
    await this.stop();
    // Give the OS a tick to release lock-task before we tear down.
    BackHandler.exitApp();
  },
};
