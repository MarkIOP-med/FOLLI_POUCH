import { useCallback, useEffect, useState } from 'react';

import { api } from '@/api/client';
import type { Patient, Prescription, SessionRow, Settings } from '@/api/types';
import type { PatientDetailState } from './PatientDetail.types';

export function usePatientDetail(
  patientId: number,
  onDeleted: () => void,
): PatientDetailState {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.patient(patientId).then(setPatient).catch((e: Error) => setError(e.message));
    api.settings().then(setSettings).catch(() => undefined);
    api.patientSessions(patientId).then(setSessions).catch(() => setSessions([]));
  }, [patientId]);

  const setField = useCallback(
    (patch: Partial<Pick<Patient, 'full_name' | 'national_id'>>) => {
      setPatient((prev) => (prev ? { ...prev, ...patch } : prev));
      setSaved(false);
    },
    [],
  );

  const setPrescription = useCallback((zone: string, patch: Partial<Prescription>) => {
    setPatient((prev) =>
      prev
        ? {
            ...prev,
            prescriptions: prev.prescriptions.map((rx) =>
              rx.zone === zone ? { ...rx, ...patch } : rx,
            ),
          }
        : prev,
    );
    setSaved(false);
  }, []);

  const save = useCallback(async () => {
    if (!patient) return;
    try {
      // Sends prescribed_mmhg only. patient_trim_pct is the patient's and is never
      // written from this screen — see NOTES_ARCHITECTURE_SCRATCH.md §5.1(c).
      const updated = await api.updatePatient(patientId, {
        full_name: patient.full_name,
        national_id: patient.national_id || null,
        prescriptions: patient.prescriptions.map((rx) => ({
          zone: rx.zone,
          prescribed_mmhg: rx.prescribed_mmhg,
          massage_level: rx.massage_level,
          massage_seconds: rx.massage_seconds,
        })),
      });
      setPatient(updated);
      setSaved(true);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [patient, patientId]);

  const remove = useCallback(async () => {
    try {
      await api.deletePatient(patientId);
      onDeleted();
    } catch (err) {
      setError((err as Error).message);
    }
  }, [patientId, onDeleted]);

  return {
    patient,
    settings,
    sessions,
    error,
    saved,
    setField,
    setPrescription,
    save,
    remove,
  };
}

export function sessionDurationSeconds(session: SessionRow): number | null {
  return session.ended_at ? session.ended_at - session.started_at : null;
}
