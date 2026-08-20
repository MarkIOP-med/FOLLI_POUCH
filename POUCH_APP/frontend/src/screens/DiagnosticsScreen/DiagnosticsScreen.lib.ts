import { useCallback, useEffect, useState } from 'react';

import { api } from '@/api/client';
import type { DeviceSnapshot, Patient } from '@/api/types';
import type { HeaderUser } from '@/components/HeaderBand';

export const APP_VERSION = '2.4.3';

/**
 * The roster is app-wide reference data that changes when someone is admitted,
 * not per screen. Every screen mounting its own empty-then-fetch cycle made the
 * header's user selector collapse to zero options and the name blank on every
 * navigation, so the last result is held here and reused as the initial state.
 */
let cachedPatients: Patient[] = [];

/** Patients as the header's user selector needs them. */
export function useHeaderUsers() {
  const [patients, setPatients] = useState<Patient[]>(cachedPatients);

  const reload = useCallback(() => {
    return api
      .patients()
      .then((next) => {
        cachedPatients = next;
        setPatients(next);
      })
      .catch(() => setPatients(cachedPatients));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const users: HeaderUser[] = patients.map((p) => ({
    id: p.id,
    name: p.full_name,
    nationalId: p.national_id,
  }));

  return { patients, users, reload };
}

/**
 * Header props derived from a device snapshot.
 *
 * Accepts null so a screen can render its full chrome while the stream is still
 * connecting, instead of unmounting the canvas and flashing a bare line of text.
 *
 * Battery stays null on both units — the firmware reports neither, and the
 * header renders the no-data state rather than a plausible level.
 */
export function headerFromSnapshot(snapshot: DeviceSnapshot | null, deviceId?: string) {
  return {
    version: APP_VERSION,
    consoleId: null,
    pouchId: snapshot?.id ?? deviceId ?? null,
    connected: snapshot?.connected ?? false,
    sessionElapsedS: snapshot?.session_elapsed_s ?? null,
    pouchBatteryPercent: null,
    consoleBatteryPercent: null,
  };
}

/**
 * The session facts a pouch had, remembered across screen changes.
 *
 * Only two fields, and deliberately so. Who is in the chair and how long they
 * have been there change on the scale of a session, so showing a value ~200ms
 * old while the stream reconnects is accurate; without this the header's name and
 * runtime blanked on every navigation, which is what read as flicker.
 *
 * The pressures, FSR readings and valve state in the same snapshot are NEVER
 * cached — a stale reading that still looks live is dangerous, and that is the
 * whole reason this holds these two fields instead of the snapshot.
 */
interface StickySession {
  patientId: number | null;
  sessionElapsedS: number | null;
}

const lastSessionByDevice = new Map<string, StickySession>();

export function useStickyDevice(
  snapshot: DeviceSnapshot | null,
  deviceId: string | undefined,
): StickySession {
  const key = deviceId ?? '';
  const live: StickySession = {
    patientId: snapshot?.patient?.id ?? null,
    sessionElapsedS: snapshot?.session_elapsed_s ?? null,
  };

  useEffect(() => {
    if (snapshot) lastSessionByDevice.set(key, live);
  }, [snapshot, live.patientId, live.sessionElapsedS, key]);

  // Once a frame has arrived it is authoritative, including when it reports no
  // patient — otherwise ending a session would leave the old name on screen.
  return snapshot
    ? live
    : lastSessionByDevice.get(key) ?? { patientId: null, sessionElapsedS: null };
}

/** Manifold target is the highest commanded zone; the pump charges to it. */
export function manifoldTarget(snapshot: DeviceSnapshot): number {
  return snapshot.manifold_target_mmhg;
}
