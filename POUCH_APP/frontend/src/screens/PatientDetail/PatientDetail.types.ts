import type { Patient, Prescription, SessionRow, Settings } from '@/api/types';

export interface PatientDetailState {
  patient: Patient | null;
  settings: Settings | null;
  sessions: SessionRow[];
  error: string | null;
  saved: boolean;
  setField: (patch: Partial<Pick<Patient, 'full_name' | 'national_id'>>) => void;
  setPrescription: (zone: string, patch: Partial<Prescription>) => void;
  save: () => Promise<void>;
  remove: () => Promise<void>;
}
