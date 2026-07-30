import { useCallback, useEffect, useState } from 'react';

import { api } from '@/api/client';
import { ZONES } from '@/api/types';
import type { Patient } from '@/api/types';

const DEFAULT_MASSAGE_SECONDS = 30;

export function usePatientSearch(query: string) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    api
      .patients(query)
      .then((rows) => !cancelled && setPatients(rows))
      .catch((err: Error) => !cancelled && setError(err.message));

    // Stale responses from a superseded query must not overwrite newer results.
    return () => {
      cancelled = true;
    };
  }, [query]);

  return { patients, error, setError };
}

/** Blank prescriptions for a new patient — every zone off until a clinician sets it. */
export function emptyPrescriptions(name: string) {
  return {
    full_name: name,
    national_id: null,
    prescriptions: ZONES.map((zone) => ({
      zone,
      prescribed_mmhg: 0,
      massage_level: 0,
      massage_seconds: DEFAULT_MASSAGE_SECONDS,
    })),
  };
}

/** Compact "F40 T40 E0 B35" summary for the list view. */
export function zoneDefaultsSummary(patient: Patient): string {
  return patient.prescriptions
    .map((rx) => `${rx.zone.charAt(0)}${rx.prescribed_mmhg}`)
    .join(' ');
}

/** Tracks which national IDs the operator has explicitly revealed. */
export function useRevealedIds() {
  const [revealed, setRevealed] = useState<ReadonlySet<number>>(new Set());

  const reveal = useCallback((id: number) => {
    setRevealed((prev) => new Set(prev).add(id));
  }, []);

  return { revealed, reveal };
}
