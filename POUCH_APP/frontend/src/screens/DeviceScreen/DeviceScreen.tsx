import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';

import { api } from '@/api/client';
import type { Patient, Zone } from '@/api/types';
import { useDeviceStream } from '@/api/useDeviceStream';
import { AdminActions } from '@/components/AdminActions';
import { AlertStrip } from '@/components/AlertStrip';
import { DeviceHeader } from '@/components/DeviceHeader';
import { HardwarePanel } from '@/components/HardwarePanel';
import { PatientBand } from '@/components/PatientBand';
import { TechnicalDrawer } from '@/components/TechnicalDrawer';
import { VNodeCard } from '@/components/VNodeCard';
import { VibrationTable } from '@/components/VibrationTable';
import { useDeviceActions } from './DeviceScreen.lib';
import './DeviceScreen.scss';

const VIBRATION_ANCHOR = 'vibration-panel';

/** POUCH SYSTEM OVERVIEW — the connected-pouch screen. */
export function DeviceScreen() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { snapshot, streamError } = useDeviceStream(id);
  const { busyKey, error, run } = useDeviceActions();

  const [picking, setPicking] = useState(false);
  const [patients, setPatients] = useState<Patient[]>([]);

  useEffect(() => {
    if (!picking) return;
    api.patients().then(setPatients).catch(() => setPatients([]));
  }, [picking]);

  if (!id) return null;

  if (!snapshot) {
    return (
      <div className="device-screen">
        <Link to="/">{t('common.back')}</Link>
        <p className="u-muted">{t('device.connecting', { id })}</p>
        {streamError && <div className="banner banner--error">{streamError}</div>}
      </div>
    );
  }

  const noSession = snapshot.session_id === null;
  const adminDisabled = !snapshot.connected || busyKey !== null || !snapshot.patient;

  const loadPatient = async (patientId: number) => {
    setPicking(false);
    if (snapshot.session_id !== null) await api.endSession(id);
    await run('loadingPatient', () => api.startSession(id, patientId));
  };

  return (
    <div className="device-screen">
      <DeviceHeader snapshot={snapshot} />

      {streamError && <div className="banner banner--warn">{streamError}</div>}
      {error && <div className="banner banner--error">{error}</div>}
      {snapshot.error && (
        <div className="banner banner--error">
          {t('device.linkError', { message: snapshot.error })}
        </div>
      )}

      {noSession ? (
        <section className="session-bar">
          <div style={{ flex: 1 }}>{t('device.session.none')}</div>
          <div className="session-bar__actions">
            <button
              type="button"
              className="btn"
              disabled={!snapshot.connected}
              onClick={() => setPicking(true)}
            >
              {t('device.session.loadPatient')}
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              disabled={!snapshot.connected}
              onClick={() => run('startingService', () => api.startSession(id, null))}
            >
              {t('device.session.serviceMode')}
            </button>
          </div>
        </section>
      ) : (
        <PatientBand
          snapshot={snapshot}
          onChange={() => setPicking(true)}
          onRelease={() => run('endingSession', () => api.endSession(id))}
        />
      )}

      {picking && (
        <section className="patient-picker">
          <h2 className="patient-picker__title">{t('device.session.pickerTitle')}</h2>

          {patients.length === 0 && (
            <p className="u-muted">
              <Trans
                i18nKey="device.session.pickerEmpty"
                components={{ 1: <Link to="/patients" /> }}
              />
            </p>
          )}

          <ul className="patient-picker__list">
            {patients.map((patient) => (
              <li key={patient.id} className="patient-picker__item">
                <span>
                  {patient.full_name}{' '}
                  <span className="u-muted">
                    {t('patients.detail.mrn', { mrn: patient.mrn })}
                  </span>
                </span>
                <button
                  type="button"
                  className="btn btn--tiny"
                  onClick={() => void loadPatient(patient.id)}
                >
                  {t('common.load')}
                </button>
              </li>
            ))}
          </ul>

          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => setPicking(false)}
          >
            {t('common.cancel')}
          </button>
        </section>
      )}

      <div className="device-screen__grid">
        <HardwarePanel
          snapshot={snapshot}
          busyKey={busyKey}
          onStart={() => run('applying', () => api.apply(id))}
          onStop={() => run('stopping', () => api.stop(id))}
          onPause={() => run('pausing', () => api.pause(id))}
          onEmergency={() => run('venting', () => api.emergency(id))}
          onRezero={() => run('rezeroing', () => api.rezero(id))}
        />

        <section className="device-screen__vnodes">
          <h2 className="device-screen__vnodes-title">{t('device.vnodes.title')}</h2>
          {snapshot.zones.map((zone) => (
            <VNodeCard
              key={zone.zone}
              zone={zone}
              ceiling={snapshot.ceiling_mmhg}
              serviceMode={snapshot.service_mode}
              disabled={!snapshot.connected || noSession}
              onTarget={(z: Zone, mmhg: number) =>
                run('settingTarget', () =>
                  snapshot.service_mode
                    ? api.setSetpoint(id, z, mmhg)
                    : api.setZoneRx(id, z, mmhg),
                )
              }
            />
          ))}
        </section>

        <div className="device-screen__side">
          <AdminActions
            disabled={adminDisabled}
            onResetDefaults={() => run('resetting', () => api.resetDefaults(id))}
            onSetCurrentDefault={() =>
              run('promoting', () => api.setCurrentAsDefault(id))
            }
            onOpenVibration={() =>
              document
                .getElementById(VIBRATION_ANCHOR)
                ?.scrollIntoView({ behavior: 'smooth' })
            }
            onOpenDefaults={() => setPicking(false)}
          />

          <div id={VIBRATION_ANCHOR}>
            <VibrationTable
              zones={snapshot.zones}
              disabled={adminDisabled}
              onSet={(zone: Zone, level: number) =>
                run('settingVibration', () => api.setVibration(id, zone, level))
              }
            />
          </div>
        </div>
      </div>

      <AlertStrip
        alerts={snapshot.alerts}
        onAck={(eventId) => run('acking', () => api.ackAlert(id, eventId))}
      />

      <TechnicalDrawer snapshot={snapshot} />
    </div>
  );
}
