import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { api } from '@/api/client';
import { maskNationalId } from '@/domain/israeliId';
import {
  emptyPrescriptions,
  usePatientSearch,
  useRevealedIds,
  zoneDefaultsSummary,
} from './Patients.lib';
import './Patients.scss';

export function Patients() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const { patients, error, setError } = usePatientSearch(query);
  const { revealed, reveal } = useRevealedIds();

  const createPatient = async () => {
    try {
      const created = await api.createPatient(
        emptyPrescriptions(t('patients.newName')),
      );
      navigate(`/patients/${created.id}`);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="patients">
      <header className="patients__head">
        <h1 className="patients__heading">{t('patients.heading')}</h1>
        <input
          className="patients__search"
          type="search"
          placeholder={t('patients.search')}
          aria-label={t('patients.search')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="button" className="btn" onClick={() => void createPatient()}>
          {t('patients.new')}
        </button>
      </header>

      {error && <div className="banner banner--error">{error}</div>}

      <table className="table">
        <thead>
          <tr>
            <th>{t('patients.columns.mrn')}</th>
            <th>{t('patients.columns.name')}</th>
            <th>{t('patients.columns.nationalId')}</th>
            <th>{t('patients.columns.zoneDefaults')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {patients.map((patient) => (
            <tr key={patient.id}>
              <td className="u-mono">{patient.mrn}</td>
              <td>
                <Link to={`/patients/${patient.id}`}>{patient.full_name}</Link>
              </td>
              <td className="u-mono">
                {/*
                  PHI, and this screen may live on a wall in a clinical space.
                  Masked until the operator explicitly asks to see it.
                */}
                {revealed.has(patient.id)
                  ? (patient.national_id ?? t('common.emDash'))
                  : maskNationalId(patient.national_id)}
                {patient.national_id && !revealed.has(patient.id) && (
                  <button
                    type="button"
                    className="btn btn--tiny btn--ghost patients__reveal"
                    onClick={() => reveal(patient.id)}
                  >
                    {t('patients.reveal')}
                  </button>
                )}
              </td>
              <td className="u-mono u-small">{zoneDefaultsSummary(patient)}</td>
              <td>
                <Link className="btn btn--tiny" to={`/patients/${patient.id}`}>
                  {t('common.edit')}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {patients.length === 0 && <p className="u-muted">{t('patients.empty')}</p>}
    </div>
  );
}
