import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  VNode,
  MassageLevel,
  PouchTelemetry,
  EMPTY_TELEMETRY,
  clampPressure,
  OperationModes,
} from '../models/telemetry';
import { FolliBleClient, ConnectionState, createBleClient } from '../services/ble';

// Session lifecycle: the console boots PENDING (yellow, timer at 00:00).
// Controls are always adjustable — the patient configures zones first, then
// START pushes the whole configuration to the pouch and runs the timer.
// A held STOP dumps pressure and moves to STOPPED; START then begins a fresh
// session from 00:00.
export type SessionState = 'pending' | 'active' | 'stopped';

// Per the BLE protocol every command is per-zone, so each zone carries its own
// target pressure and massage level.
export interface ZoneSettings {
  pressure: number;
  massage: MassageLevel;
}

export type ZoneSettingsMap = Record<VNode, ZoneSettings>;

// Defaults mirror the UI_01 mock: Temples at 25 mmHg / level 2, others off.
export const DEFAULT_ZONE_SETTINGS: ZoneSettingsMap = {
  0x01: { pressure: 0, massage: 0 },
  0x02: { pressure: 25, massage: 2 },
  0x03: { pressure: 0, massage: 0 },
  0x04: { pressure: 0, massage: 0 },
};

const ALL_ZONES: VNode[] = [0x01, 0x02, 0x03, 0x04];

export interface ConsoleController {
  sessionState: SessionState;
  isSessionActive: boolean;
  elapsedSeconds: number;
  activeZone: VNode;
  setActiveZone: (zone: VNode) => void;
  zoneSettings: ZoneSettingsMap;
  targetPressure: number;
  updateTargetPressure: (pressure: number) => void;
  massageLevel: MassageLevel;
  setMassageLevel: (level: MassageLevel) => void;
  // True while the selected zone's settings differ from what the pouch last
  // received — the SET button flickers until the change is actually applied.
  hasUnappliedChanges: boolean;
  liveTelemetry: PouchTelemetry;
  connectionState: ConnectionState;
  isConnected: boolean;
  sendCommandToPouch: () => void;
  handleEmergencyStop: () => void;
  startSession: () => void;
}

// The console ViewModel. Owns all UI state and translates user intent into BLE
// commands. Accepts an injected client purely so tests can supply a fake — the
// app uses the default factory (real BLE with a mock fallback).
export function useConsole(injectedClient?: FolliBleClient): ConsoleController {
  // Create the client once and keep it stable across renders.
  const client = useMemo<FolliBleClient>(
    () => injectedClient ?? createBleClient(),
    [injectedClient],
  );

  const [sessionState, setSessionState] = useState<SessionState>('pending');
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [activeZone, setActiveZone] = useState<VNode>(0x02); // Temples (mock default)
  const [zoneSettings, setZoneSettings] = useState<ZoneSettingsMap>(DEFAULT_ZONE_SETTINGS);
  const [liveTelemetry, setLiveTelemetry] = useState<PouchTelemetry>({
    ...EMPTY_TELEMETRY,
    batteryPercentage: 80,
  });
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  // What each zone last SUCCESSFULLY sent to the pouch. Compared against the
  // live zoneSettings to know whether a change is still unapplied.
  const [sentSettings, setSentSettings] = useState<Partial<Record<VNode, ZoneSettings>>>({});

  const isSessionActive = sessionState === 'active';

  // The controls always show/edit the currently selected zone's settings.
  const targetPressure = zoneSettings[activeZone].pressure;
  const massageLevel = zoneSettings[activeZone].massage;

  const sent = sentSettings[activeZone];
  const hasUnappliedChanges =
    isSessionActive &&
    (!sent || sent.pressure !== targetPressure || sent.massage !== massageLevel);

  // Keep a ref of the latest inputs so callbacks stay stable.
  const inputsRef = useRef({ activeZone, zoneSettings, sessionState });
  inputsRef.current = { activeZone, zoneSettings, sessionState };

  // Session timer: ticks once per second while the session is active.
  useEffect(() => {
    if (!isSessionActive) return;
    const timer = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [isSessionActive]);

  // Connect + wire telemetry/connection listeners once. If the link drops (or
  // the first connect fails because the pouch isn't powered yet), keep retrying
  // every few seconds so the kiosk recovers without any user action.
  useEffect(() => {
    let disposed = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRetry = () => {
      if (disposed || retryTimer) return;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        attemptConnect();
      }, 4000);
    };

    const attemptConnect = () => {
      if (disposed) return;
      client.connect().catch((err) => {
        if (__DEV__) console.log('[FOLLI] connect failed:', err);
        scheduleRetry();
      });
    };

    const offTelemetry = client.onTelemetry(setLiveTelemetry);
    const offConnection = client.onConnectionChange((state) => {
      setConnectionState(state);
      // Unexpected drop while the app is alive -> try to get the link back.
      if (state === 'disconnected' || state === 'error') scheduleRetry();
    });
    attemptConnect();

    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      offTelemetry();
      offConnection();
      client.disconnect().catch(() => {});
    };
  }, [client]);

  const updateTargetPressure = useCallback((value: number) => {
    setZoneSettings((prev) => {
      const zone = inputsRef.current.activeZone;
      return { ...prev, [zone]: { ...prev[zone], pressure: clampPressure(value) } };
    });
  }, []);

  const setMassageLevel = useCallback((level: MassageLevel) => {
    setZoneSettings((prev) => {
      const zone = inputsRef.current.activeZone;
      return { ...prev, [zone]: { ...prev[zone], massage: level } };
    });
  }, []);

  // Push one zone's settings to the pouch as a Static Hold command. Only a
  // successful BLE write records the settings as "applied" — a failed write
  // leaves the zone marked dirty so the SET button keeps flickering.
  const pushZone = useCallback(
    (zone: VNode, settings: ZoneSettings) => {
      client
        .sendCommand({
          targetNode: zone,
          targetPressure: settings.pressure,
          massageLevel: settings.massage,
          operationMode: OperationModes.STATIC_HOLD,
        })
        .then(() => {
          setSentSettings((prev) => ({ ...prev, [zone]: { ...settings } }));
        })
        .catch((err) => {
          if (__DEV__) console.log('[FOLLI] sendCommand failed:', err);
        });
    },
    [client],
  );

  // "SET" — push the selected zone's current settings mid-session.
  const sendCommandToPouch = useCallback(() => {
    const { activeZone: zone, zoneSettings: settings, sessionState: state } = inputsRef.current;
    if (state !== 'active') return;
    pushZone(zone, settings[zone]);
  }, [pushZone]);

  // Long-press STOP — dump pressure and freeze the console in a stopped state.
  // All zone settings reset to off so the next session starts from a safe zero.
  const handleEmergencyStop = useCallback(() => {
    setSessionState('stopped');
    setSentSettings({});
    setZoneSettings({
      0x01: { pressure: 0, massage: 0 },
      0x02: { pressure: 0, massage: 0 },
      0x03: { pressure: 0, massage: 0 },
      0x04: { pressure: 0, massage: 0 },
    });
    client.sendEmergencyStop().catch((err) => {
      if (__DEV__) console.log('[FOLLI] emergency stop failed:', err);
    });
  }, [client]);

  // START — begin a session and push the full per-zone configuration to the
  // pouch so the hardware matches everything the user set up beforehand.
  const startSession = useCallback(() => {
    setElapsedSeconds(0);
    setSessionState('active');
    const { zoneSettings: settings } = inputsRef.current;
    ALL_ZONES.forEach((zone) => pushZone(zone, settings[zone]));
  }, [pushZone]);

  return {
    sessionState,
    isSessionActive,
    elapsedSeconds,
    activeZone,
    setActiveZone,
    zoneSettings,
    targetPressure,
    updateTargetPressure,
    massageLevel,
    setMassageLevel,
    hasUnappliedChanges,
    liveTelemetry,
    connectionState,
    isConnected: connectionState === 'connected',
    sendCommandToPouch,
    handleEmergencyStop,
    startSession,
  };
}
