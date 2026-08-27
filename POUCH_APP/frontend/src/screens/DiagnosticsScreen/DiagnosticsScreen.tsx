import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { api } from '@/api/client';
import type { Gender, Patient, Zone } from '@/api/types';
import { useDeviceStream } from '@/api/useDeviceStream';
import { DiagLayout } from '@/components/DiagLayout';
import { DiagPanel } from '@/components/DiagPanel';
import { VNodeRow } from '@/components/VNodeRow';
import { BUTTONS, PROFILE } from '@/domain/diagnosticsAssets';
import { maskNationalId } from '@/domain/israeliId';
import { setLastDeviceId } from '@/domain/lastDevice';
import { parseTarget } from '@/domain/pressure';
import { useDeviceActions } from '@/domain/useDeviceActions';
import {
  APP_VERSION,
  headerFromSnapshot,
  useHeaderUsers,
  useStickyDevice,
} from './DiagnosticsScreen.lib';
import './DiagnosticsScreen.scss';

/** PAGE_02 — Pouch Diagnostics Overview. */
export function DiagnosticsScreen() {
  // No device id, no screen — the old fallback to a hardcoded mock id silently
  // pointed this screen at a different (usually nonexistent) pouch.
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { snapshot, streamError, stale } = useDeviceStream(id);
  const { busyKey, error, run, clearError } = useDeviceActions();
  const { users } = useHeaderUsers();
  const sticky = useStickyDevice(snapshot, id);

  // Staged patient: chosen in the header but not yet treated. The session — and
  // with it the Session Runtime clock — begins only when START is pressed. Until
  // then the choice lives client-side only (nothing reaches the backend), kept in
  // sessionStorage so a page refresh doesn't silently drop the selection.
  const [stagedPatientId, setStagedPatientId] = useState<number | null>(() => {
    const raw = sessionStorage.getItem(`staged-patient:${id}`);
    return raw ? Number(raw) : null;
  });
  const [stagedPatient, setStagedPatient] = useState<Patient | null>(null);
  // Drafts for the User Pressure Regime inputs; committed by the panel's SET.
  const [regimeDrafts, setRegimeDrafts] = useState<Record<string, string>>({});
  // Per-zone vibration-duration drafts (seconds), committed on blur/Enter.
  const [durationDrafts, setDurationDrafts] = useState<Record<string, string>>({});
  // Alerts list popover — clicking the strip badge shows the alerts instead of
  // silently erasing them.
  const [alertsOpen, setAlertsOpen] = useState(false);
  // Two distinct facts, deliberately not conflated:
  //   appSessionOpen — a session RECORD exists (this operator started one, or
  //     the app adopted a console-started one — either way session_id is set).
  //   pouchRunning   — the DEVICE's own state machine is actively driving
  //     pressure, whoever started it (mirrored from telemetry).
  // Adoption keeps them aligned in the normal case, but START must gate on
  // pouchRunning (never re-zero a running pouch), while record-shaped logic
  // (patient, prescription edits, ending) keys on appSessionOpen.
  const appSessionOpen = snapshot?.session_id != null;
  const pouchRunning =
    snapshot?.device_state === 'PRESSURIZING' ||
    snapshot?.device_state === 'MAINTENANCE';
  const sessionActive = appSessionOpen;

  useEffect(() => {
    if (stagedPatientId == null) sessionStorage.removeItem(`staged-patient:${id}`);
    else sessionStorage.setItem(`staged-patient:${id}`, String(stagedPatientId));
  }, [stagedPatientId, id]);

  useEffect(() => {
    if (id) setLastDeviceId(id);
  }, [id]);

  useEffect(() => {
    if (stagedPatientId == null) {
      setStagedPatient(null);
      return;
    }
    let cancelled = false;
    api
      .patient(stagedPatientId)
      .then((p) => {
        if (!cancelled) setStagedPatient(p);
      })
      .catch(() => {
        if (!cancelled) setStagedPatient(null);
      });
    return () => {
      cancelled = true;
    };
  }, [stagedPatientId]);

  // Keep the selector consistent with a session that is already running (e.g.
  // after navigating back to this screen mid-treatment).
  useEffect(() => {
    if (sessionActive && snapshot?.patient) setStagedPatientId(snapshot.patient.id);
  }, [sessionActive, snapshot?.patient?.id]);

  // The pouch must agree with the selector: after a page refresh (staging is
  // per-tab) or a backend restart, re-check the staged patient out to the
  // board so the patient console shows them. Only when the two disagree, so
  // the stream's own updates never re-trigger it.
  useEffect(() => {
    if (!id || stagedPatientId == null || !snapshot?.connected) return;
    if (snapshot.checked_out_patient?.id === stagedPatientId) return;
    void api.checkoutPatient(id, stagedPatientId).catch(() => undefined);
  }, [stagedPatientId, snapshot?.connected, snapshot?.checked_out_patient?.id, id]);

  // Renders its chrome even before the stream connects — see AdminScreen for why
  // an early return here caused a flash on every navigation. The panels appear
  // immediately and fill in when the first frame lands.
  const gender: Gender =
    snapshot?.patient?.gender ?? stagedPatient?.gender ?? 'female';
  const disabled = !snapshot?.connected || busyKey !== null;
  const noData = t('diagnostics.noData');
  const zones = snapshot?.zones ?? [];

  // Prescription preview while staged (no session yet): zone → prescription.
  const stagedRx = new Map(
    (stagedPatient?.prescriptions ?? []).map((rx) => [rx.zone, rx]),
  );
  const previewing = !sessionActive && stagedPatient != null;

  // Edits made while a patient is only staged write straight to their stored
  // prescription (no session, no device connection needed) and refresh the
  // preview — so vibration/regime controls are usable before START.
  const updateStagedRx = (
    patch: Partial<
      Record<
        string,
        Partial<{ prescribed_mmhg: number; massage_level: number; massage_seconds: number }>
      >
    >,
  ) =>
    run('settingTarget', async () => {
      if (!stagedPatient) return;
      const zoneNames: Zone[] = ['FRONT', 'TEMPLE', 'EAR', 'BACK'];
      const prescriptions = zoneNames.map((z) => {
        const rx = stagedRx.get(z);
        return {
          zone: z,
          prescribed_mmhg: rx?.prescribed_mmhg ?? 0,
          massage_level: rx?.massage_level ?? 0,
          massage_seconds: rx?.massage_seconds ?? 30,
          ...patch[z],
        };
      });
      const saved = await api.updatePatient(stagedPatient.id, {
        full_name: stagedPatient.full_name,
        national_id: stagedPatient.national_id,
        gender: stagedPatient.gender,
        birth_year: stagedPatient.birth_year,
        protocol: stagedPatient.protocol,
        treatment_start_date: stagedPatient.treatment_start_date,
        treatment_number: stagedPatient.treatment_number,
        prescriptions,
      });
      setStagedPatient(saved);
    });

  // No device id, no screen — the old fallback to a hardcoded mock id silently
  // pointed this screen at a different pouch. (After the hooks: hook order.)
  if (!id) return <Navigate to="/" replace />;

  return (
    <DiagLayout
      active="diagnostics"
      users={users}
      selectedUserId={sessionActive ? sticky.patientId : stagedPatientId}
      /* Selecting a patient STAGES them here and checks them out to the pouch
         (its user record + name), so the patient console shows the same person
         at once. No session or runtime clock starts until START is pressed.
         Changing the selection while a session runs ends that session first
         (which vents). */
      onSelectUser={(patientId) => {
        setStagedPatientId(patientId);
        if (sessionActive) void run('endingSession', () => api.endSession(id));
        void api.checkoutPatient(id, patientId).catch(() => undefined);
      }}
      {...headerFromSnapshot(snapshot, id)}
      sessionElapsedS={sticky.sessionElapsedS}
      version={APP_VERSION}
    >
      {/* ── System Telemetry and Hardware ─────────────────────────────── */}
      <DiagPanel
        title={t('device.hardware.title')}
        className="diagnostics__hardware"
        style={{}}
      >
        <div className="hw">
          {/* START begins the session (this is when Session Runtime starts
              counting), re-zeros the pressure baseline (the firmware's restart —
              vent + reference capture, ~2s), then applies the staged patient's
              regime. With no patient staged it opens a service-mode session. */}
          <button
            type="button"
            className="hw__round hw__round--start"
            /* Never re-startable while the pouch is already running — a second
               START would re-zero (vent) a live treatment. That the run may
               have been started from the patient console is exactly why this
               gates on the DEVICE state, not this app's session record. */
            disabled={disabled || pouchRunning}
            onClick={() =>
              run('applying', async () => {
                if (pouchRunning) return;
                if (!appSessionOpen) await api.startSession(id, stagedPatientId);
                await api.rezero(id);
                await api.apply(id);
              })
            }
          >
            <img src={BUTTONS.start} alt={t('device.hardware.start')} />
          </button>
          {/* STOP ends the session (venting everything on the way); with no
              session it is a plain vent — the firmware's `stop`. As the safety
              control it is gated on connection only, never on another command
              being in flight. */}
          <button
            type="button"
            className="hw__round hw__round--stop"
            disabled={!snapshot?.connected}
            onClick={() =>
              run('stopping', () =>
                sessionActive ? api.endSession(id) : api.stop(id),
              )
            }
          >
            <img src={BUTTONS.stop} alt={t('device.hardware.stopAll')} />
          </button>

          {/* Recover a stuck pouch — vents and re-inits the control loop without
              losing the session/patient. Self-contained styling so it sits
              predictably on the measured canvas (pending a visual polish pass). */}
          <button
            type="button"
            className="hw__recover"
            disabled={!snapshot?.connected || busyKey !== null}
            onClick={() => run('restarting', () => api.restart(id))}
            style={{
              gridColumn: '1 / -1',
              marginTop: 8,
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid #6c8a9c',
              background: '#173241',
              color: '#cfe4ef',
              font: '600 13px/1 inherit',
              cursor: 'pointer',
            }}
          >
            {t('device.hardware.restart', 'Restart pouch (if stuck)')}
          </button>

          <div className="hw__rule hw__rule--1" />
          <h3 className="hw__title">{t('device.hardware.manifoldDiagnostic')}</h3>

          <div className="hw__manifold">
            <span>{t('device.vnodes.target')}</span>
            {/* Display-only: the manifold target is derived (highest commanded
                zone — the pump charges to it), not directly settable. The old
                input collected a draft that was never sent anywhere. */}
            <span className="hw__value">
              {snapshot ? snapshot.manifold_target_mmhg : noData}
            </span>
            {/* One run, not four spans — see VNodeRow: the flex gap would be
                added at every word boundary and overflow the panel. */}
            <span>
              {t('common.mmhg')} | {t('device.vnodes.actual')}{' '}
              <span className="hw__value">
                {!snapshot || snapshot.manifold_fault || snapshot.manifold_mmhg == null
                  ? noData
                  : t('units.pressure', { value: snapshot.manifold_mmhg })}
              </span>
            </span>
          </div>

          <div className="hw__rule hw__rule--2" />

          {/* Pump and valve state are not in the telemetry CSV. Empty rings
              rather than a colour that would imply a live reading. */}
          <div className="hw__states">
            <span className="hw__state">
              {t('device.hardware.pump')} <span className="hw__dot-none" />
            </span>
            <span className="hw__state">
              {t('device.hardware.purgeValve')} <span className="hw__dot-none" />
            </span>
          </div>

          <div className="hw__valves-label">{t('device.hardware.valves')}</div>

          <div className="hw__valves">
            {zones.map((z) => (
              <span key={z.zone} className="hw__valve">
                {t(`zones.${z.zone}`)}
                <span className="hw__dot-none" />
              </span>
            ))}
          </div>

          <div className="hw__rule hw__rule--3" />

          <p className="hw__note">{t('device.hardware.notReportedNote')}</p>
        </div>
      </DiagPanel>

      {/* ── V-Nodes Telemetry Array ───────────────────────────────────── */}
      <DiagPanel
        title={t('device.vnodes.title')}
        className="diagnostics__vnodes"
        style={{}}
        captionOffsetX={-37}
      >
        {zones.map((zone) => (
          <VNodeRow
            key={zone.zone}
            zone={zone}
            gender={gender}
            ceiling={snapshot?.ceiling_mmhg ?? 0}
            disabled={disabled || snapshot?.session_id == null}
            onSet={(z: Zone, mmhg: number) =>
              run('settingTarget', async () => {
                if (snapshot?.service_mode) await api.setSetpoint(id, z, mmhg);
                else await api.setZoneRx(id, z, mmhg);
                // Mid-session, a target edit must reach the device — storing
                // the prescription alone changed nothing until the next START.
                if (sessionActive) await api.apply(id);
              })
            }
          />
        ))}
      </DiagPanel>

      {/* ── User Regime ───────────────────────────────────────────────── */}
      <DiagPanel
        title={t('diagnostics.regime.title')}
        className="diagnostics__regime"
        style={{}}
      >
        <div className="regime">
          <div className="regime__identity">
            <span>{t('diagnostics.users.name')}</span>
            <span>
              {snapshot?.service_mode
                ? t('device.patientBand.serviceMode')
                : snapshot?.patient?.full_name ?? stagedPatient?.full_name ?? noData}
            </span>
            <span>{t('diagnostics.users.id')}</span>
            <span>
              {snapshot?.patient?.national_id_masked ??
                (stagedPatient ? maskNationalId(stagedPatient.national_id) : noData)}
            </span>
            <span>{t('diagnostics.users.age')}</span>
            <span>{snapshot?.patient?.age ?? stagedPatient?.age ?? noData}</span>
          </div>

          <img className="regime__profile" src={PROFILE[gender].NONE} alt="" />

          <div className="regime__rule" />

          <p className="regime__label regime__label--default">
            {t('diagnostics.regime.defaultRegime')}
          </p>
          <div className="regime__zones regime__zones--default">
            {zones.map((z) => (
              <span key={z.zone} className="regime__zone-name">
                {t(`zones.${z.zone}`)}
              </span>
            ))}
            {zones.map((z) => (
              <span key={`${z.zone}-v`} className="regime__default">
                {previewing
                  ? stagedRx.get(z.zone)?.prescribed_mmhg ?? 0
                  : z.prescribed_mmhg}
              </span>
            ))}
          </div>

          <p className="regime__label regime__label--user">
            {t('diagnostics.regime.userRegime')}
          </p>
          <div className="regime__zones regime__zones--user">
            {zones.map((z) => (
              <span key={z.zone} className="regime__zone-name">
                {t(`zones.${z.zone}`)}
              </span>
            ))}
            {zones.map((z) => (
              <input
                key={`${z.zone}-i`}
                className="regime__input"
                type="number"
                min={0}
                max={snapshot?.ceiling_mmhg}
                readOnly={!sessionActive && !previewing}
                value={
                  regimeDrafts[z.zone] ??
                  String(
                    previewing
                      ? stagedRx.get(z.zone)?.prescribed_mmhg ?? 0
                      : z.effective_mmhg,
                  )
                }
                onChange={(e) =>
                  (sessionActive || previewing) &&
                  setRegimeDrafts((d) => ({ ...d, [z.zone]: e.target.value }))
                }
                aria-label={t(`zones.${z.zone}`)}
              />
            ))}
          </div>

          {/* Patient trim deliberately has NO control here: trimming is the
              patient's own adjustment and belongs in the patient console (the
              backend /trim endpoint is there waiting for it). The operator app
              only reflects its effect through the effective pressures. */}

          {/* Commits every edited regime input: to the loaded patient (or
              service setpoints) in a session, to the stored prescription while
              staged. Was a button with no handler. */}
          <button
            type="button"
            className="regime__btn regime__btn--set"
            disabled={
              Object.keys(regimeDrafts).length === 0 ||
              (sessionActive ? disabled : !previewing || busyKey !== null)
            }
            onClick={() => {
              const ceiling = snapshot?.ceiling_mmhg ?? 0;
              if (previewing) {
                const patch: Record<string, { prescribed_mmhg: number }> = {};
                for (const [zoneName, raw] of Object.entries(regimeDrafts)) {
                  if (raw.trim() === '') continue;
                  patch[zoneName] = { prescribed_mmhg: parseTarget(raw, ceiling || 999) };
                }
                setRegimeDrafts({});
                void updateStagedRx(patch);
                return;
              }
              void run('settingTarget', async () => {
                for (const [zoneName, raw] of Object.entries(regimeDrafts)) {
                  if (raw.trim() === '') continue;
                  const mmhg = parseTarget(raw, ceiling);
                  if (snapshot?.service_mode) {
                    await api.setSetpoint(id, zoneName as Zone, mmhg);
                  } else {
                    await api.setZoneRx(id, zoneName as Zone, mmhg);
                  }
                }
                setRegimeDrafts({});
                // Push the new targets to the device — SET mid-session must
                // change the pressure, not just the stored prescription.
                await api.apply(id);
              });
            }}
          >
            <img src={BUTTONS.set} alt={t('diagnostics.regime.set')} />
          </button>
          <button
            type="button"
            className="regime__btn regime__btn--save"
            disabled={disabled || !snapshot?.patient}
            onClick={() => run('promoting', () => api.setCurrentAsDefault(id))}
          >
            <img src={BUTTONS.save} alt={t('diagnostics.regime.save')} />
          </button>
        </div>
      </DiagPanel>

      {/* ── Vibration Level Assignment ────────────────────────────────── */}
      <DiagPanel
        title={t('device.vibration.title')}
        className="diagnostics__vibration"
        style={{}}
      >
        <div className="vib-panel">
          {/* A grid of positioned rows, not a table: the mockup sets each row on
              its own measured centre (59.3px pitch) and the level discs on a
              54px pitch, neither of which falls out of table layout. */}
          {/* The mockup's column reads "Time Left", implying a countdown. The
              firmware never reports remaining vibration time, so the column is
              labelled for what it actually holds — the configured duration —
              rather than carrying a separate footnote that would have to sit on
              top of the rows to fit the panel. */}
          <div className="vib-panel__head">
            <span>{t('device.vibration.zonePair')}</span>
            <span>{t('device.vibration.levels')}</span>
            <span className="vib-panel__duration">
              {t('device.vibration.duration')}
            </span>
            <span />
          </div>

          {zones.map((zone, i) => (
            <div
              key={zone.zone}
              className="vib-panel__row"
              style={{ top: `${118.5 + i * 59.3}px` }}
            >
              <span>{t(`zones.${zone.zone}`)}</span>
              <span className="vib-panel__levels">
                {[0, 1, 2, 3].map((level) => {
                  const shown = previewing
                    ? stagedRx.get(zone.zone)?.massage_level ?? 0
                    : zone.massage_level;
                  // Selecting a level only STORES it on the patient — nothing
                  // buzzes until the operator presses the zone's ▶ trigger.
                  const editable =
                    (previewing || (sessionActive && !!snapshot?.patient)) &&
                    busyKey === null &&
                    stagedPatient != null;
                  return (
                    <button
                      key={level}
                      type="button"
                      className={`vib-panel__level${shown === level ? ' is-on' : ''}`}
                      disabled={!editable}
                      aria-pressed={shown === level}
                      onClick={() =>
                        updateStagedRx({ [zone.zone]: { massage_level: level } })
                      }
                    >
                      {level}
                    </button>
                  );
                })}
              </span>
              {/* Duration is editable per zone (blur/Enter commits): live to the
                  device in a session, to the stored prescription while staged. */}
              <span className="vib-panel__duration">
                {!(previewing || (sessionActive && snapshot?.patient)) ? (
                  t('units.duration', { value: zone.massage_seconds })
                ) : (
                  <>
                    [{' '}
                    <input
                      className="vib-panel__duration-input"
                      type="number"
                      min={0}
                      max={600}
                      disabled={busyKey !== null || (sessionActive && disabled)}
                      value={
                        durationDrafts[zone.zone] ??
                        String(
                          previewing
                            ? stagedRx.get(zone.zone)?.massage_seconds ?? 30
                            : zone.massage_seconds,
                        )
                      }
                      onChange={(e) =>
                        setDurationDrafts((d) => ({
                          ...d,
                          [zone.zone]: e.target.value,
                        }))
                      }
                      onBlur={(e) => {
                        if (e.target.value.trim() === '') return;
                        const secs = Math.max(0, Math.min(600, Math.round(Number(e.target.value) || 0)));
                        // Stored only — never triggers the motors.
                        void updateStagedRx({ [zone.zone]: { massage_seconds: secs } });
                        setDurationDrafts((d) => {
                          const next = { ...d };
                          delete next[zone.zone];
                          return next;
                        });
                      }}
                      aria-label={`${t(`zones.${zone.zone}`)} ${t('device.vibration.duration')}`}
                    />{' '}
                    {t('common.secondsLong')} ]
                  </>
                )}
              </span>
              {/* One-shot trigger: buzz THIS zone now at its stored level. The
                  firmware auto-stops after its vibration window; pressing again
                  re-triggers, as many times as the client wants. Levels alone
                  never start anything. */}
              {(() => {
                const level = previewing
                  ? stagedRx.get(zone.zone)?.massage_level ?? 0
                  : zone.massage_level;
                return (
                  <button
                    type="button"
                    className="vib-panel__go"
                    disabled={!snapshot?.connected || busyKey !== null || level === 0}
                    title={t('device.vibration.trigger')}
                    onClick={() =>
                      run('settingVibration', () =>
                        api.vibrateZone(id, zone.zone as Zone, level),
                      )
                    }
                  >
                    ▶
                  </button>
                );
              })()}
            </div>
          ))}
        </div>
      </DiagPanel>

      {/* ── Status strip: stream health, command failures, device alarms ── */}
      {/* Everything here used to fail silently — a dead stream kept painting the
          last pressures, a rejected command just un-disabled its button, and
          alarms were written to the DB without ever reaching a screen. */}
      <div className="diagnostics__status">
        {(streamError || stale) && (
          <span className="diagnostics__status-item diagnostics__status-item--warn">
            {t('device.streamInterrupted')}
          </span>
        )}
        {error && (
          <button
            type="button"
            className="diagnostics__status-item diagnostics__status-item--error"
            onClick={clearError}
            title={t('common.dismiss')}
          >
            {error} ✕
          </button>
        )}
        {snapshot?.error && (
          <span className="diagnostics__status-item diagnostics__status-item--error">
            {t('device.linkError', { message: snapshot.error })}
          </span>
        )}
        {snapshot?.manifold_fault && (
          <span className="diagnostics__status-item diagnostics__status-item--error">
            {t('device.hardware.manifoldFault')}
          </span>
        )}
        {snapshot?.session_source === 'console' && pouchRunning && (
          <span className="diagnostics__status-item diagnostics__status-item--info">
            {t('device.startedExternally')}
          </span>
        )}
        {snapshot?.stopped_externally && (
          <span className="diagnostics__status-item diagnostics__status-item--warn">
            {t('device.stoppedExternally')}
          </span>
        )}
        {/* Alerts collapse to a count that OPENS the list — rendering each one
            inline turned the strip into overlapping log soup, and clearing on
            click erased them before anyone could read them. */}
        {(snapshot?.alerts?.length ?? 0) > 0 && (
          <button
            type="button"
            className="diagnostics__status-item diagnostics__status-item--warn"
            onClick={() => setAlertsOpen((o) => !o)}
          >
            ⚠ {t('diagnostics.alertsCount', { count: snapshot?.alerts?.length ?? 0 })}
          </button>
        )}
      </div>

      {/* ── Alerts popover ──────────────────────────────────────────────── */}
      {alertsOpen && (snapshot?.alerts?.length ?? 0) > 0 && (
        <div className="diagnostics__alerts">
          <div className="diagnostics__alerts-head">
            <span>{t('device.alerts.title')}</span>
            <button
              type="button"
              className="diagnostics__alerts-btn"
              disabled={busyKey !== null}
              onClick={() =>
                run('acking', async () => {
                  for (const alert of snapshot?.alerts ?? []) {
                    await api.ackAlert(id, alert.id);
                  }
                  setAlertsOpen(false);
                })
              }
            >
              {t('diagnostics.clearAll')}
            </button>
            <button
              type="button"
              className="diagnostics__alerts-btn"
              onClick={() => setAlertsOpen(false)}
            >
              ✕
            </button>
          </div>
          {(snapshot?.alerts ?? []).map((alert) => (
            <div key={alert.id} className={`diagnostics__alert diagnostics__alert--${alert.severity}`}>
              <span className="diagnostics__alert-time">
                {new Date(alert.ts * 1000).toLocaleTimeString()}
              </span>
              <span className="diagnostics__alert-text">
                {alert.code}
                {alert.detail ? ` — ${alert.detail}` : ''}
              </span>
              <button
                type="button"
                className="diagnostics__alerts-btn"
                disabled={busyKey !== null}
                onClick={() => run('acking', () => api.ackAlert(id, alert.id))}
              >
                {t('device.alerts.ack')}
              </button>
            </div>
          ))}
        </div>
      )}
    </DiagLayout>
  );
}
