export const ZONES = ['FRONT', 'TEMPLE', 'EAR', 'BACK'] as const;
export type Zone = (typeof ZONES)[number];

export type ZoneStatus =
  | 'OK'
  | 'SETTLING'
  | 'OUT_OF_BAND'
  | 'SENSOR_FAULT'
  | 'NO_DATA';

export interface FsrReading {
  raw: number | null;
  state: 'OK' | 'FAULT' | 'NOT_IMPLEMENTED';
}

export interface ZoneView {
  zone: Zone;
  prescribed_mmhg: number;
  trim_pct: number;
  trim_meaningful: boolean;
  effective_mmhg: number;
  actual_mmhg: number | null;
  status: ZoneStatus;
  massage_level: number;
  massage_seconds: number;
  fsr_l: FsrReading | null;
  fsr_r: FsrReading | null;
}

export interface Alert {
  id: number;
  severity: 'info' | 'warn' | 'alarm';
  code: string;
  detail: string | null;
  ts: number;
}

export type Gender = 'male' | 'female';

export interface PatientRef {
  id: number;
  mrn: string;
  full_name: string;
  national_id_masked: string | null;
  gender: Gender | null;
  age: number | null;
  protocol: string | null;
  treatment_start_date: number | null;
  treatment_number: number | null;
}

export interface DeviceSnapshot {
  id: string;
  label: string;
  transport: string;
  port: string | null;
  connected: boolean;
  rate_hz: number;
  fw_version: string | null;
  error: string | null;
  service_mode: boolean;
  session_id: number | null;
  session_started_at: number | null;
  session_elapsed_s: number | null;
  patient: PatientRef | null;
  /** Who the pouch is checked out to — pushed to the board (and so to the
      patient console) the moment the operator selects them, before any session. */
  checked_out_patient: PatientRef | null;
  /** The checked-out patient's STORED regime per zone — what the Admin screen
      shows and edits at idle (distinct from zones[], which is commanded now). */
  checked_out_regime: Record<
    string,
    {
      prescribed_mmhg: number;
      patient_trim_pct: number;
      massage_level: number;
      massage_seconds: number;
    }
  >;
  /** Who opened the running session: 'app' (this operator) or 'console' (the
      patient console; the app adopted it). null when idle. */
  session_source: 'app' | 'console' | null;
  zones: ZoneView[];
  ceiling_mmhg: number;
  trim_range_pct: number;
  alerts: Alert[];
  manifold_mmhg: number | null;
  /** The device's own state machine (IDLE/PRESSURIZING/MAINTENANCE/…), from telemetry. */
  device_state: string | null;
  /** The device's own session clock, seconds — shared with the BLE console. */
  device_elapsed_s: number | null;
  /** Massage countdown seconds from the board — synced with the patient console. */
  vibration_remaining_s: number | null;
  /** App session running but device idle with zero targets: stopped out-of-band
      (e.g. the patient's console STOP). */
  stopped_externally: boolean;
  manifold_target_mmhg: number;
  manifold_fault: boolean;
  /** Pump/valve state is NOT in the telemetry CSV — `reported` is false and the
   *  fields are null. Rendered as "not reported", never inferred. */
  hardware: {
    reported: boolean;
    pump: string | null;
    pump_duty_pct: number | null;
    purge_valve: string | null;
    valves: Record<string, string | null>;
    note: string;
  };
  technical?: {
    log_tail: string[];
    /** Tagged OK:/ERR:/R: command responses from the pouch, newest last. */
    last_responses: string[];
    raw_frame: unknown;
  };
}

export interface Prescription {
  zone: Zone;
  prescribed_mmhg: number;
  patient_trim_pct: number;
  massage_level: number;
  massage_seconds: number;
}

export interface Patient {
  id: number;
  mrn: string;
  full_name: string;
  national_id: string | null;
  created_at: number;
  prescriptions: Prescription[];
  gender: Gender | null;
  birth_year: number | null;
  /** Derived server-side from birth_year so it cannot go stale. */
  age: number | null;
  protocol: string | null;
  treatment_start_date: number | null;
  treatment_number: number | null;
}

export interface Settings {
  max_pressure_mmhg: number;
  trim_range_pct: number;
  default_massage_seconds: number;
  /** Control-loop deadband (mmHg) pushed to the firmware. */
  pressure_tolerance_mmhg: number;
}

export interface SerialPort {
  port: string;
  description: string;
  hwid: string;
  /** CP2102 USB bridge detected — almost certainly the pouch. */
  likely_pouch: boolean;
}

export interface SessionRow {
  id: number;
  device_id: string;
  started_at: number;
  ended_at: number | null;
  ended_by: string | null;
  event_count: number;
}
