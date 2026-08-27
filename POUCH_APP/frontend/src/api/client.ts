import type {
  DeviceSnapshot,
  Patient,
  SerialPort,
  SessionRow,
  Settings,
  Zone,
} from './types';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(detail);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const api = {
  health: () => req<{ ok: boolean }>('/api/health'),

  settings: () => req<Settings>('/api/settings'),
  saveSettings: (s: Settings) =>
    req<Settings>('/api/settings', { method: 'PUT', body: JSON.stringify(s) }),
  serialPorts: () => req<SerialPort[]>('/api/serial-ports'),

  devices: () => req<DeviceSnapshot[]>('/api/devices'),
  device: (id: string) => req<DeviceSnapshot>(`/api/devices/${id}`),
  addDevice: (d: { id: string; label: string; transport: string; port: string | null }) =>
    req<DeviceSnapshot>('/api/devices', { method: 'POST', body: JSON.stringify(d) }),
  removeDevice: (id: string) => req<void>(`/api/devices/${id}`, { method: 'DELETE' }),

  connect: (id: string) => req<DeviceSnapshot>(`/api/devices/${id}/connect`, { method: 'POST' }),
  disconnect: (id: string) =>
    req<DeviceSnapshot>(`/api/devices/${id}/connect`, { method: 'DELETE' }),

  apply: (id: string) => req<unknown>(`/api/devices/${id}/apply`, { method: 'POST' }),
  pause: (id: string) => req<{ sent: string }>(`/api/devices/${id}/pause`, { method: 'POST' }),
  setZoneRx: (id: string, zone: Zone, mmhg: number) =>
    req<DeviceSnapshot>(`/api/devices/${id}/zones/${zone}`, {
      method: 'PUT',
      body: JSON.stringify({ mmhg }),
    }),
  vibrateZone: (id: string, zone: Zone, level: number) =>
    req<{ sent: string }>(`/api/devices/${id}/vibrate`, {
      method: 'POST',
      body: JSON.stringify({ zone, level }),
    }),
  setVibration: (id: string, zone: Zone, massageLevel: number, seconds?: number) =>
    req<DeviceSnapshot>(`/api/devices/${id}/vibration`, {
      method: 'PUT',
      body: JSON.stringify({
        zone,
        massage_level: massageLevel,
        massage_seconds: seconds ?? null,
      }),
    }),
  resetDefaults: (id: string) =>
    req<DeviceSnapshot>(`/api/devices/${id}/admin/reset-defaults`, { method: 'POST' }),
  setCurrentAsDefault: (id: string) =>
    req<DeviceSnapshot>(`/api/devices/${id}/admin/set-current-default`, {
      method: 'POST',
    }),
  stop: (id: string) => req<{ sent: string }>(`/api/devices/${id}/stop`, { method: 'POST' }),
  emergency: (id: string) =>
    req<{ sent: string }>(`/api/devices/${id}/emergency`, { method: 'POST' }),
  rezero: (id: string) => req<{ sent: string }>(`/api/devices/${id}/rezero`, { method: 'POST' }),
  /** Recover a stuck pouch — vents and re-inits the control loop; keeps the session. */
  restart: (id: string) => req<{ sent: string }>(`/api/devices/${id}/restart`, { method: 'POST' }),
  /** Restore the pouch to NO_USER and delete every patient except NO_USER. */
  factoryReset: (id: string) =>
    req<{ sent: string }>(`/api/devices/${id}/factory-reset`, { method: 'POST' }),
  ackAlert: (id: string, eventId: number) =>
    req<unknown>(`/api/devices/${id}/alerts/${eventId}/ack`, { method: 'POST' }),

  checkoutPatient: (id: string, patientId: number | null) =>
    req<DeviceSnapshot>(`/api/devices/${id}/patient`, {
      method: 'PUT',
      body: JSON.stringify({ patient_id: patientId }),
    }),
  startSession: (id: string, patientId: number | null) =>
    req<DeviceSnapshot>(`/api/devices/${id}/session`, {
      method: 'POST',
      body: JSON.stringify({ patient_id: patientId }),
    }),
  endSession: (id: string) =>
    req<DeviceSnapshot>(`/api/devices/${id}/session`, { method: 'DELETE' }),
  setSetpoint: (id: string, zone: Zone, mmhg: number) =>
    req<DeviceSnapshot>(`/api/devices/${id}/setpoint`, {
      method: 'PUT',
      body: JSON.stringify({ zone, mmhg }),
    }),
  setTrim: (id: string, zone: Zone, trimPct: number) =>
    req<DeviceSnapshot>(`/api/devices/${id}/trim`, {
      method: 'PUT',
      body: JSON.stringify({ zone, trim_pct: trimPct }),
    }),

  patients: (q = '') => req<Patient[]>(`/api/patients?q=${encodeURIComponent(q)}`),
  patient: (id: number) => req<Patient>(`/api/patients/${id}`),
  createPatient: (p: unknown) =>
    req<Patient>('/api/patients', { method: 'POST', body: JSON.stringify(p) }),
  updatePatient: (id: number, p: unknown) =>
    req<Patient>(`/api/patients/${id}`, { method: 'PUT', body: JSON.stringify(p) }),
  deletePatient: (id: number) => req<void>(`/api/patients/${id}`, { method: 'DELETE' }),
  patientSessions: (id: number) => req<SessionRow[]>(`/api/patients/${id}/sessions`),
};
