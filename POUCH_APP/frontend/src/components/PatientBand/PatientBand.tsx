import { useTranslation } from 'react-i18next';

import { formatDuration } from '@/domain/status';
import type { PatientBandProps } from './PatientBand.types';
import './PatientBand.scss';

/** Who is on this pouch — the clinical context the original mock had no room for. */
export function PatientBand({ snapshot, onChange, onRelease }: PatientBandProps) {
  const { t } = useTranslation();

  if (snapshot.service_mode) {
    return (
      <section className="patient-band patient-band--service">
        <div className="patient-band__main">
          <strong>{t('device.patientBand.serviceMode')}</strong>{' '}
          {t('device.patientBand.serviceModeBody', { ceiling: snapshot.ceiling_mmhg })}
        </div>
        <button type="button" className="btn btn--ghost" onClick={onRelease}>
          {t('device.patientBand.endServiceSession')}
        </button>
      </section>
    );
  }

  if (!snapshot.patient) {
    return (
      <section className="patient-band">
        <div className="patient-band__main">{t('device.patientBand.noPatient')}</div>
        <button type="button" className="btn" onClick={onChange}>
          {t('device.patientBand.loadPatient')}
        </button>
      </section>
    );
  }

  const elapsed = formatDuration(snapshot.session_elapsed_s);

  return (
    <section className="patient-band">
      <div className="patient-band__main">
        <div className="patient-band__name">{snapshot.patient.full_name}</div>
        <div className="patient-band__meta">
          {t('device.patientBand.mrn', { mrn: snapshot.patient.mrn })}
          {snapshot.patient.national_id_masked &&
            ` · ${t('device.patientBand.nationalId', {
              value: snapshot.patient.national_id_masked,
            })}`}
        </div>
      </div>

      <div className="patient-band__session">
        {t('device.patientBand.session', { elapsed: elapsed ?? t('common.emDash') })}
      </div>

      <div className="patient-band__actions">
        <button type="button" className="btn btn--ghost" onClick={onChange}>
          {t('device.patientBand.change')}
        </button>
        <button type="button" className="btn btn--ghost" onClick={onRelease}>
          {t('device.patientBand.release')}
        </button>
      </div>
    </section>
  );
}
