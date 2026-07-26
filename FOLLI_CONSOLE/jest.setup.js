/* Jest setup: mock native modules that have no JS implementation under node so
   the suite can import the whole app tree without a native build. */

// --- react-native-ble-plx: no native module in jest ---
jest.mock('react-native-ble-plx', () => {
  class BleManager {
    onStateChange() {
      return { remove: jest.fn() };
    }
    startDeviceScan() {}
    stopDeviceScan() {}
  }
  return {
    BleManager,
    State: { PoweredOn: 'PoweredOn', PoweredOff: 'PoweredOff' },
    __esModule: true,
  };
});

// --- expo-linear-gradient -> plain view ---
jest.mock('expo-linear-gradient', () => {
  const React = require('react');
  return { LinearGradient: (props) => React.createElement('LinearGradient', props, props.children) };
});

// --- @react-native-community/slider -> stub host component ---
jest.mock('@react-native-community/slider', () => {
  const React = require('react');
  return { __esModule: true, default: (props) => React.createElement('Slider', props) };
});

// --- react-native-svg -> host-component stubs for every export ---
jest.mock('react-native-svg', () => {
  const React = require('react');
  const make = (name) => (props) => React.createElement(name, props, props && props.children);
  return new Proxy(
    { __esModule: true, default: make('Svg') },
    { get: (target, prop) => (prop in target ? target[prop] : make(String(prop))) },
  );
});

// --- expo native side-effect modules ---
jest.mock('expo-navigation-bar', () => ({
  setVisibilityAsync: jest.fn(),
  setBehaviorAsync: jest.fn(),
  setBackgroundColorAsync: jest.fn(),
}));

jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(),
  deactivateKeepAwake: jest.fn(),
  useKeepAwake: jest.fn(),
}));
