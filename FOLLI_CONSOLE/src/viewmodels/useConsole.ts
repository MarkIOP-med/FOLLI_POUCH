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
  /**
   * The clinician's prescribed pressure for this zone, and the centre of the
   * band the patient may move within.
   *
   * The console is not allowed to set pressure outright — it may only trim what
   * it was given. Today this is seeded from the defaults below; once the pouch
   * (or POUCH_APP through it) sends a prescription, that value lands here and
   * the band moves with it.
   */
  prescribed: number;
}

export type ZoneSettingsMap = Record<VNode, ZoneSettings>;

/** How far either side of the prescription the patient may go. */
export const TRIM_RANGE_PCT = 10;

/**
 * The controller's own deadband. It holds pressure to about this accuracy, so a
 * trim narrower than this is a control the patient can move without anything
 * measurable happening. Mirrors CONTROLLER_TOLERANCE_MMHG in
 * POUCH_APP/frontend/src/domain/pressure.ts — change one, change both.
 */
export const CONTROLLER_TOLERANCE_MMHG = 3;

/**
 * The range this zone may be trimmed to, inside the hardware's own 0..70 limit.
 *
 * The margin is 10% of the prescription or 3 mmHg, whichever is larger. Plain
 * 10% collapses below the controller's deadband on small prescriptions — at 25
 * mmHg it is +/-2.5, so the whole travel of the control sits inside the error
 * the controller already has, and the patient gets a slider that does nothing.
 * The floor keeps the adjustment real at every prescription.
 *
 * A zone prescribed 0 is switched off, and stays off — the patient can trim a
 * treatment the clinician ordered, not start one they did not.
 */
export function trimBounds(
  prescribed: number,
  trimRangePct: number = TRIM_RANGE_PCT,
): { min: number; max: number } {
  if (prescribed <= 0) return { min: 0, max: 0 };
  const margin = Math.max((prescribed * trimRangePct) / 100, CONTROLLER_TOLERANCE_MMHG);
  return {
    min: clampPressure(Math.round(prescribed - margin)),
    max: clampPressure(Math.round(prescribed + margin)),
  };
}

// Defaults mirror the UI_01 mock: Temples at 25 mmHg / level 2, others off.
export const DEFAULT_ZONE_SETTINGS: ZoneSettingsMap = {
  0x01: { pressure: 0, massage: 0, prescribed: 0 },
  0x02: { pressure: 25, massage: 2, prescribed: 25 },
  0x03: { pressure: 0, massage: 0, prescribed: 0 },
  0x04: { pressure: 0, massage: 0, prescribed: 0 },
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
  /** Take a prescription from the pouch/app; re-centres each zone's band. */
  applyPrescription: (rx: Partial<Record<VNode, number>>) => void;
  /** Inclusive bounds of the prescription's trim band for the selected zone. */
  trimMin: number;
  trimMax: number;
  /** False when the zone has no prescription, so there is nothing to trim. */
  canTrim: boolean;
  massageLevel: MassageLevel;
  setMassageLevel: (level: MassageLevel) => void;
  // True while the selected zone's settings differ from what the pouch last
  // received — the SET button flickers until the change is actually applied.
  hasUnappliedChanges: boolean;
  liveTelemetry: PouchTelemetry;
  /** True once the pouch has actually sent a frame. */
  hasTelemetry: boolean;
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
  // Starts genuinely empty. It previously seeded batteryPercentage at 80, which
  // meant a console with no pouch in range displayed a confident 80% charge for
  // a device it had never spoken to.
  const [liveTelemetry, setLiveTelemetry] = useState<PouchTelemetry>(EMPTY_TELEMETRY);
  // False until a telemetry frame actually lands, so readings that have never
  // been reported render as no-data instead of as zero.
  const [hasTelemetry, setHasTelemetry] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  // What each zone last SUCCESSFULLY sent to the pouch. Compared against the
  // live zoneSettings to know whether a change is still unapplied.
  const [sentSettings, setSentSettings] = useState<Partial<Record<VNode, ZoneSettings>>>({});

  const isSessionActive = sessionState === 'active';

  // The controls always show/edit the currently selected zone's settings.
  const targetPressure = zoneSettings[activeZone].pressure;
  const massageLevel = zoneSettings[activeZone].massage;

  // The band the controls may move within, for the selected zone.
  const { min: trimMin, max: trimMax } = trimBounds(zoneSettings[activeZone].prescribed);
  // A zone with no prescription has nothing to trim, so the controls are inert
  // rather than merely pinned at zero.
  const canTrim = trimMax > trimMin;

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

    const offTelemetry = client.onTelemetry((frame) => {
      setLiveTelemetry(frame);
      setHasTelemetry(true);
    });
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

  /**
   * Take a prescription for one or more zones.
   *
   * This is the seam the pouch — or POUCH_APP through it — will call once a
   * transport exists to carry patient data. Each zone's baseline moves and its
   * target re-centres on it, so a new prescription is not silently trimmed by
   * whatever the previous patient had dialled in.
   */
  const applyPrescription = useCallback((rx: Partial<Record<VNode, number>>) => {
    setZoneSettings((prev) => {
      const next = { ...prev };
      for (const zone of ALL_ZONES) {
        const value = rx[zone];
        if (value === undefined) continue;
        const prescribed = clampPressure(value);
        next[zone] = { ...prev[zone], prescribed, pressure: prescribed };
      }
      return next;
    });
  }, []);

  const updateTargetPressure = useCallback((value: number) => {
    setZoneSettings((prev) => {
      const zone = inputsRef.current.activeZone;
      const current = prev[zone];
      // Held inside the prescription's trim band, not merely inside 0..70. The
      // console trims a prescribed treatment; it does not set one.
      const { min, max } = trimBounds(current.prescribed);
      const trimmed = Math.max(min, Math.min(max, clampPressure(value)));
      return { ...prev, [zone]: { ...current, pressure: trimmed } };
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
    // Zero the live targets but keep each zone's prescription: the next session
    // has to start from the same clinical order, not from nothing.
    setZoneSettings((prev) => ({
      0x01: { ...prev[0x01], pressure: 0, massage: 0 },
      0x02: { ...prev[0x02], pressure: 0, massage: 0 },
      0x03: { ...prev[0x03], pressure: 0, massage: 0 },
      0x04: { ...prev[0x04], pressure: 0, massage: 0 },
    }));
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
    applyPrescription,
    trimMin,
    trimMax,
    canTrim,
    massageLevel,
    setMassageLevel,
    hasUnappliedChanges,
    liveTelemetry,
    hasTelemetry,
    connectionState,
    isConnected: connectionState === 'connected',
    sendCommandToPouch,
    handleEmergencyStop,
    startSession,
  };
}
