import { useEffect } from 'react';
import { BackHandler, Platform, StatusBar } from 'react-native';
import { KioskLock } from '../services/kiosk/KioskLock';

// Lazily/optionally pull in Expo modules so the hook does not hard-crash if they
// are not installed yet.
function hideSystemChrome() {
  StatusBar.setHidden(true, 'none');
  if (Platform.OS !== 'android') return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const NavigationBar = require('expo-navigation-bar');
    NavigationBar.setVisibilityAsync?.('hidden');
    NavigationBar.setBehaviorAsync?.('overlay-swipe');
  } catch {
    // expo-navigation-bar not installed — skip.
  }
}

function keepAwake() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const KeepAwake = require('expo-keep-awake');
    KeepAwake.activateKeepAwakeAsync?.('folli-console');
  } catch {
    // expo-keep-awake not installed — skip.
  }
}

function releaseKeepAwake() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const KeepAwake = require('expo-keep-awake');
    KeepAwake.deactivateKeepAwake?.('folli-console');
  } catch {
    // ignore
  }
}

// Installs the "unescapable console" behavior for the lifetime of the component:
//  - blocks the Android hardware back button
//  - hides the status bar and (immersive) navigation bar
//  - keeps the screen awake
//  - engages Android lock-task mode when the native module + device-owner exist
export function useKioskLock(enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return;

    hideSystemChrome();
    keepAwake();
    KioskLock.start();

    // Swallow every hardware back press so users can't back out of the console.
    const backSub = BackHandler.addEventListener('hardwareBackPress', () => true);

    return () => {
      backSub.remove();
      releaseKeepAwake();
    };
  }, [enabled]);
}
