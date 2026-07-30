import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { isValidIsraeliId } from '@/domain/israeliId';
import { formatDuration } from '@/domain/status';
import { sessionDurationSeconds, usePatientDetail } from './PatientDetail.lib';
import './PatientDetail.scss';

const LEVELS = [0, 1, 2, 3] as const;

export function PatientDetail() {
  const { id } = useParams<{ id: string }>();
  const patientId = Number(id);
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  const {
    patient,
    settings,
    sessions,
    error,
    saved,
    setField,
    setPrescription,
    save,
    remove,
  } = usePatientDetail(patientId, () => navigate('/patients'));

  if (!patient || !settings) {
    return (
      <div className="patient-detail">
        <Link to="/patients">{t('common.backToPatients')}</Link>
        {error ? (
          <div className="banner banner--error">{error}</div>
        ) : (
          <p className="u-muted">{t('common.loading')}</p>
        )}
      </div>
    );
  }

  const idValid = !patient.national_id || isValidIsraeliId(patient.national_id);

  return (
    <div className="patient-detail">
      <header className="patient-detail__head">
        <Link to="/patients">{t('common.backToPatients')}</Link>
        <h1 className="patient-detail__heading">{patient.full_name}</h1>
        <span className="u-muted">{t('patients.detail.mrn', { mrn: patient.mrn })}</span>
        <button
          type="button"
          className="btn btn--ghost btn--danger"
          onClick={() => void remove()}
        >
          {t('common.delete')}
        </button>
      </header>

      {error && <div className="banner banner--error">{error}</div>}

      <section className="patient-detail__card">
        <div className="patient-detail__row">
          <label htmlFor="full-name">{t('patients.detail.fullName')}</label>
          <input
            id="full-name"
            value={patient.full_name}
            onChange={(e) => setField({ full_name: e.target.value })}
          />
        </div>

        <div className="patient-detail__row">
          <label htmlFor="national-id">{t('patients.detail.nationalId')}</label>
          <input
            id="national-id"
            value={patient.national_id ?? ''}
            placeholder={t('patients.detail.nationalIdPlaceholder')}
            onChange={(e) => setField({ national_id: e.target.value })}
          />
          {patient.national_id && (
            <span className={idValid ? 'u-ok' : 'u-bad'}>
              {idValid
                ? t('patients.detail.nationalIdValid')
                : t('patients.detail.nationalIdInvalid')}
            </span>
          )}
        </div>

        <p className="u-note">{t('patients.detail.nationalIdNote')}</p>
      </section>

      <section className="patient-detail__card">
        <div className="patient-detail__zones-head">
          <h2>{t('patients.detail.zoneDefaults')}</h2>
          <span className="u-muted">
            {t('patients.detail.ceiling', { value: settings.max_pressure_mmhg })}
          </span>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th>{t('patients.detail.columns.zone')}</th>
              <th>{t('patients.detail.columns.pressure')}</th>
              <th>{t('patients.detail.columns.massageLevel')}</th>
              <th>{t('patients.detail.columns.duration')}</th>
              <th>{t('patients.detail.columns.patientTrim')}</th>
            </tr>
          </thead>
          <tbody>
            {patient.prescriptions.map((rx) => (
              <tr key={rx.zone}>
                <td className="u-mono">{t(`zones.${rx.zone}`)}</td>
                <td>
                  <input
                    type="number"
                    min={0}
                    max={settings.max_pressure_mmhg}
                    value={rx.prescribed_mmhg}
                    aria-label={t(`zones.${rx.zone}`)}
                    onChange={(e) =>
                      setPrescription(rx.zone, {
                        prescribed_mmhg: Number(e.target.value),
                      })
                    }
                  />
                  <span className="u-unit"> {t('common.mmhg')}</span>
                  {rx.prescribed_mmhg === 0 && (
                    <span className="u-muted"> {t('patients.detail.zoneOff')}</span>
                  )}
                </td>
                <td>
                  {LEVELS.map((level) => (
                    <button
                      key={level}
                      type="button"
                      className={`level${rx.massage_level === level ? ' is-on' : ''}`}
                      aria-pressed={rx.massage_level === level}
                      onClick={() => setPrescription(rx.zone, { massage_level: level })}
                    >
                      {level}
                    </button>
                  ))}
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    value={rx.massage_seconds}
                    onChange={(e) =>
                      setPrescription(rx.zone, {
                        massage_seconds: Number(e.target.value),
                      })
                    }
                  />
                  <span className="u-unit"> {t('common.seconds')}</span>
                </td>
                <td className="patient-detail__trim">
                  {rx.patient_trim_pct > 0 ? '+' : ''}
                  {rx.patient_trim_pct}
                  {t('common.percent')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <button type="button" className="btn" disabled={!idValid} onClick={() => void save()}>
          {t('common.save')}
        </button>
        {saved && <span className="u-ok"> {t('common.saved')}</span>}
      </section>

      <section className="patient-detail__card">
        <div className="patient-detail__zones-head">
          <h2>{t('patients.detail.sessionHistory')}</h2>
        </div>

        {sessions.length === 0 && (
          <p className="u-muted">{t('patients.detail.noSessions')}</p>
        )}

        <ul className="patient-detail__sessions">
          {sessions.map((session) => (
            <li key={session.id}>
              <span className="u-mono">
                {new Date(session.started_at * 1000).toLocaleString(i18n.language)}
              </span>
              <span>{session.device_id}</span>
              <span>
                {formatDuration(sessionDurationSeconds(session)) ??
                  t('patients.detail.sessionRunning')}
              </span>
              <span className="u-muted">{session.ended_by ?? ''}</span>
              <span className="u-muted">
                {t('patients.detail.sessionEvents', { count: session.event_count })}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
