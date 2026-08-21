import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

import {
  ALL_ZONES,
  EMPTY_TELEMETRY,
  MassageLevel,
  PRESSURE_MAX,
  PouchTelemetry,
  VNode,
  clampPressure,
  isDeviceRunning,
  zoneName,
} from '../models/telemetry';
import { createPouchClient } from '../services/pouch';
import type { ConnectionState, PouchClient } from '../services/pouch';

// Session lifecycle — MIRRORED FROM THE DEVICE, not tracked locally. The pouch
// may equally be driven by the admin app over USB serial: whoever starts or
// stops it, this console reflects the board's own state machine and its own
// session clock (both arrive in every telemetry frame). PENDING and STOPPED
// only differ in how the idle board got idle: STOPPED right after a stop this
// console issued, PENDING otherwise.
export type SessionState = 'pending' | 'active' | 'stopped';

export interface ZoneSettings {
  /** The patient's dialled target — starts at the prescription. */
  pressure: number;
  massage: MassageLevel;
  /**
   * The clinician's prescribed pressure for this zone — the centre of the band
   * the patient may trim within. Arrives from the BOARD's user record
   * (readuser), which the admin app keeps in sync with its loaded patient.
   */
  prescribed: number;
}

export type ZoneSettingsMap = Record<VNode, ZoneSettings>;

/**
 * Who the board is checked out to — the operator app's patient id, or nobody.
 * The board's user record is RAM-only: every power-cycle comes back unassigned
 * with the FACTORY regime loaded, which is a bench convenience for the
 * operator and never a treatment. Unassigned therefore means: no prescription,
 * no START — until the operator assigns a patient.
 */
export type PatientRecord =
  | { assigned: true; userId: number }
  | { assigned: false; userId: null };

export const NO_PATIENT: PatientRecord = { assigned: false, userId: null };

/** How far either side of the prescription the patient may go. */
export const TRIM_RANGE_PCT = 10;

/**
 * The controller's own deadband. Mirrors CONTROLLER_TOLERANCE_MMHG in
 * POUCH_APP/frontend/src/domain/pressure.ts and services/pouch/protocol.ts —
 * conformance-tested against shared/protocol-vectors.json.
 */
export const CONTROLLER_TOLERANCE_MMHG = 3;

/**
 * The range this zone may be trimmed to, inside the hardware's own 0..70 limit.
 *
 * The margin is 10% of the prescription or 3 mmHg, whichever is larger. Plain
 * 10% collapses below the controller's deadband on small prescriptions — at 25
 * mmHg it is +/-2.5, so the whole travel of the control sits inside the error
 * the controller already has, and the patient gets a slider that does nothing.
 *
 * A zone prescribed 0 is switched off, and stays off — the patient can trim a
 * treatment the clinician ordered, not start one they did not.
 *
 * A zone prescribed ABOVE the patient ceiling is clinician-controlled: shown
 * as the board runs it, but locked here. Silently clamping it to 70 would let
 * SET quietly lower a regime the clinician set deliberately.
 */
export function trimBounds(
  prescribed: number,
  trimRangePct: number = TRIM_RANGE_PCT,
): { min: number; max: number } {
  if (prescribed <= 0) return { min: 0, max: 0 };
  if (prescribed > PRESSURE_MAX) return { min: prescribed, max: prescribed };
  const margin = Math.max((prescribed * trimRangePct) / 100, CONTROLLER_TOLERANCE_MMHG);
  return {
    min: clampPressure(Math.round(prescribed - margin)),
    max: clampPressure(Math.round(prescribed + margin)),
  };
}

// Before the board reports its user record, every zone is unprescribed/inert.
export const DEFAULT_ZONE_SETTINGS: ZoneSettingsMap = {
  0: { pressure: 0, massage: 0, prescribed: 0 },
  1: { pressure: 0, massage: 0, prescribed: 0 },
  2: { pressure: 0, massage: 0, prescribed: 0 },
  3: { pressure: 0, massage: 0, prescribed: 0 },
};

export interface ConsoleController {
  sessionState: SessionState;
  isSessionActive: boolean;
  /** The board's checked-out patient, from its user record. */
  patient: PatientRecord;
  /** START is offered only with a patient assigned, a link up, and the board idle. */
  canStart: boolean;
  /** The BOARD's session clock — identical to the admin app's view of it. */
  elapsedSeconds: number;
  activeZone: VNode;
  setActiveZone: (zone: VNode) => void;
  zoneSettings: ZoneSettingsMap;
  targetPressure: number;
  updateTargetPressure: (pressure: number) => void;
  /** Take a prescription (from the board's user record); re-centres each band. */
  applyPrescription: (rx: Partial<Record<VNode, number>>) => void;
  trimMin: number;
  trimMax: number;
  canTrim: boolean;
  massageLevel: MassageLevel;
  setMassageLevel: (level: MassageLevel) => void;
  /** Selected zone's dialled pressure differs from what the pouch last took. */
  hasUnappliedChanges: boolean;
  liveTelemetry: PouchTelemetry;
  hasTelemetry: boolean;
  connectionState: ConnectionState;
  isConnected: boolean;
  /** SET — push the selected zone's dialled pressure to the running session. */
  sendCommandToPouch: () => void;
  /** Massage SET — one-shot vibration run for the selected zone. */
  triggerMassage: () => void;
  handleEmergencyStop: () => void;
  startSession: () => void;
}

// The console ViewModel. Owns UI state and translates patient intent into
// protocol commands via the injected PouchClient (tests supply a fake; the app
// uses the explicit factory).
export function useConsole(injectedClient?: PouchClient): ConsoleController {
  const client = useMemo<PouchClient>(
    () => injectedClient ?? createPouchClient(),
    [injectedClient],
  );

  const [activeZone, setActiveZone] = useState<VNode>(1); // Temples
  const [zoneSettings, setZoneSettings] = useState<ZoneSettingsMap>(DEFAULT_ZONE_SETTINGS);
  const [patient, setPatient] = useState<PatientRecord>(NO_PATIENT);
  const [liveTelemetry, setLiveTelemetry] = useState<PouchTelemetry>(EMPTY_TELEMETRY);
  const [hasTelemetry, setHasTelemetry] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  // True between a stop issued HERE and the next run — distinguishes the
  // STOPPED banner from plain PENDING on an idle board.
  const [stoppedHere, setStoppedHere] = useState(false);
  // What each zone's pressure was when last successfully pushed.
  const [sentPressure, setSentPressure] = useState<Partial<Record<VNode, number>>>({});

  // ── device-mirrored session state ─────────────────────────────────────────
  const deviceRunning = hasTelemetry && isDeviceRunning(liveTelemetry.state);
  const sessionState: SessionState = deviceRunning
    ? 'active'
    : stoppedHere
      ? 'stopped'
      : 'pending';
  const isSessionActive = deviceRunning;
  const elapsedSeconds = liveTelemetry.elapsedSeconds;
  const isConnected = connectionState === 'connected';
  const canStart = isConnected && patient.assigned && !deviceRunning;

  const targetPressure = zoneSettings[activeZone].pressure;
  const massageLevel = zoneSettings[activeZone].massage;

  const { min: trimMin, max: trimMax } = trimBounds(zoneSettings[activeZone].prescribed);
  const canTrim = trimMax > trimMin;

  const hasUnappliedChanges =
    isSessionActive && sentPressure[activeZone] !== targetPressure;

  const inputsRef = useRef({ activeZone, zoneSettings, deviceRunning, patient });
  inputsRef.current = { activeZone, zoneSettings, deviceRunning, patient };
  const wasRunningRef = useRef(false);

  // Connect + wire listeners once; auto-reconnect keeps the kiosk alive.
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
      const running = isDeviceRunning(frame.state);
      if (running) setStoppedHere(false);
      // A run boundary means the admin may have loaded a different patient —
      // refresh the board's user record.
      if (running !== wasRunningRef.current) {
        wasRunningRef.current = running;
        client.requestUser().catch(() => undefined);
      }
    });

    const offUser = client.onUser((user) => {
      if (!user.assigned) {
        // Fresh boot or reset: the board carries factory defaults, not a
        // treatment. Nothing to trim, nothing to start.
        setPatient(NO_PATIENT);
        applyPrescription({ 0: 0, 1: 0, 2: 0, 3: 0 });
        return;
      }
      setPatient({ assigned: true, userId: user.userId });
      applyPrescription({
        0: user.pressures[0],
        1: user.pressures[1],
        2: user.pressures[2],
        3: user.pressures[3],
      });
    });

    const offConnection = client.onConnectionChange((state) => {
      setConnectionState(state);
      if (state === 'disconnected' || state === 'error') scheduleRetry();
    });

    attemptConnect();

    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      offTelemetry();
      offUser();
      offConnection();
      client.disconnect().catch(() => {});
    };
    // applyPrescription is stable (useCallback with no deps).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  /** Prescription intake: each zone's band re-centres, the dial resets onto it. */
  const applyPrescription = useCallback((rx: Partial<Record<VNode, number>>) => {
    setZoneSettings((prev) => {
      const next = { ...prev };
      for (const zone of ALL_ZONES) {
        const value = rx[zone];
        if (value === undefined) continue;
        // Kept as prescribed, even above the patient ceiling — trimBounds()
        // decides what the patient may do with it; the display stays truthful.
        const prescribed = Math.max(0, Math.round(value));
        next[zone] = { ...prev[zone], prescribed, pressure: prescribed };
      }
      return next;
    });
  }, []);

  const updateTargetPressure = useCallback((value: number) => {
    setZoneSettings((prev) => {
      const zone = inputsRef.current.activeZone;
      const current = prev[zone];
      // Held inside the prescription's trim band, not merely inside 0..70.
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

  // SET — one zone's live target via the single-pair setpressure form. The
  // other zones are untouched on the board; a failed write leaves the zone
  // dirty so the button keeps flickering.
  const sendCommandToPouch = useCallback(() => {
    const { activeZone: zone, zoneSettings: settings, deviceRunning: running } =
      inputsRef.current;
    // Trimming adjusts a RUNNING treatment. On an idle board a nonzero target
    // would start one — that is START's job, and only START re-zeros first.
    if (!running) return;
    const { min, max } = trimBounds(settings[zone].prescribed);
    if (max <= min) return; // off, or clinician-locked — nothing to push
    const pressure = settings[zone].pressure;
    client
      .setZonePressure(zoneName(zone), pressure)
      .then(() => setSentPressure((prev) => ({ ...prev, [zone]: pressure })))
      .catch((err) => {
        if (__DEV__) console.log('[FOLLI] setpressure failed:', err);
      });
  }, [client]);

  // Massage SET — one-shot run for the selected zone at its chosen level; the
  // firmware auto-stops after its window and other zones keep running (-1).
  const triggerMassage = useCallback(() => {
    const { activeZone: zone, zoneSettings: settings } = inputsRef.current;
    client.vibrateZone(zoneName(zone), settings[zone].massage).catch((err) => {
      if (__DEV__) console.log('[FOLLI] vibrate failed:', err);
    });
  }, [client]);

  // Held STOP — the firmware vents everything; state flips via telemetry.
  const handleEmergencyStop = useCallback(() => {
    setStoppedHere(true);
    setSentPressure({});
    // Reset dials onto the prescription for the next run; the prescription
    // itself is the clinician's and survives.
    setZoneSettings((prev) => {
      const next = { ...prev };
      for (const zone of ALL_ZONES) {
        next[zone] = { ...prev[zone], pressure: prev[zone].prescribed, massage: 0 };
      }
      return next;
    });
    client.stop().catch((err) => {
      if (__DEV__) console.log('[FOLLI] stop failed:', err);
    });
  }, [client]);

  // START — the firmware vents, re-zeros its baseline and applies the checked-
  // out user's regime; ACTIVE + the clock arrive via telemetry, so the console
  // and the admin app flip together.
  const startSession = useCallback(() => {
    // Belt and braces with the firmware, which refuses a patient-side start
    // on an unassigned board (ERR:START:NO_USER_ASSIGNED).
    if (!inputsRef.current.patient.assigned) return;
    setStoppedHere(false);
    setSentPressure({});
    client.start().catch((err) => {
      if (__DEV__) console.log('[FOLLI] start failed:', err);
    });
  }, [client]);

  return {
    sessionState,
    isSessionActive,
    patient,
    canStart,
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
    isConnected,
    sendCommandToPouch,
    triggerMassage,
    handleEmergencyStop,
    startSession,
  };
}
