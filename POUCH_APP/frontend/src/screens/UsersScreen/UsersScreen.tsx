import { Fragment, useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { api } from '@/api/client';
import type { Gender, Zone } from '@/api/types';
import { useDeviceStream } from '@/api/useDeviceStream';
import { CanvasSelect } from '@/components/CanvasSelect';
import { DiagLayout } from '@/components/DiagLayout';
import { DiagPanel } from '@/components/DiagPanel';
import { PROFILE } from '@/domain/diagnosticsAssets';
import { maskNationalId } from '@/domain/israeliId';
import { formatDuration } from '@/domain/status';
import {
  APP_VERSION,
  headerFromSnapshot,
  useHeaderUsers,
  useStickyDevice,
} from '@/screens/DiagnosticsScreen/DiagnosticsScreen.lib';
import './UsersScreen.scss';

const ZONES: Zone[] = ['FRONT', 'TEMPLE', 'EAR', 'BACK'];

interface PatientForm {
  full_name: string;
  national_id: string;
  gender: Gender | '';
  birth_year: string;
  protocol: string;
  pressures: Record<Zone, string>;
}

const EMPTY_FORM: PatientForm = {
  full_name: '',
  national_id: '',
  gender: '',
  birth_year: '',
  protocol: '',
  pressures: { FRONT: '0', TEMPLE: '0', EAR: '0', BACK: '0' },
};

/** PAGE_03 — System Users and User Info, with create/edit/delete. */
export function UsersScreen() {
  // No device id, no screen — the old fallback silently pointed at a mock id.
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const { snapshot } = useDeviceStream(id);
  const { patients, users, reload } = useHeaderUsers();
  const sticky = useStickyDevice(snapshot, id ?? '');
  // Seeded from the pouch's last known patient so the panel is populated on the
  // first paint instead of blanking until the stream connects.
  const [selectedId, setSelectedId] = useState<number | null>(sticky.patientId);

  // Edit state: null = viewing; 'new' = creating; number = editing that patient.
  const [editing, setEditing] = useState<'new' | number | null>(null);
  const [form, setForm] = useState<PatientForm>(EMPTY_FORM);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Default to whoever is loaded on the pouch.
  useEffect(() => {
    if (selectedId === null && sticky.patientId !== null) setSelectedId(sticky.patientId);
  }, [sticky.patientId, selectedId]);

  const selected = patients.find((p) => p.id === selectedId) ?? null;
  const noData = t('diagnostics.noData');
  const gender = selected?.gender ?? 'female';

  const startDate = selected?.treatment_start_date
    ? new Date(selected.treatment_start_date * 1000).toLocaleDateString(i18n.language, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : noData;

  const beginCreate = () => {
    setForm(EMPTY_FORM);
    setEditing('new');
    setError(null);
  };

  const beginEdit = () => {
    if (!selected) return;
    const pressures = { ...EMPTY_FORM.pressures };
    for (const rx of selected.prescriptions) {
      pressures[rx.zone] = String(rx.prescribed_mmhg);
    }
    setForm({
      full_name: selected.full_name,
      national_id: selected.national_id ?? '',
      gender: selected.gender ?? '',
      birth_year: selected.birth_year ? String(selected.birth_year) : '',
      protocol: selected.protocol ?? '',
      pressures,
    });
    setEditing(selected.id);
    setError(null);
  };

  const savePatient = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload = {
        full_name: form.full_name.trim(),
        national_id: form.national_id.trim() || null,
        gender: form.gender || null,
        birth_year: form.birth_year.trim() ? Number(form.birth_year) : null,
        protocol: form.protocol.trim() || null,
        prescriptions: ZONES.map((zone) => ({
          zone,
          prescribed_mmhg: Math.max(0, Math.round(Number(form.pressures[zone]) || 0)),
          massage_level: 0,
          massage_seconds: 30,
        })),
      };
      const saved =
        editing === 'new'
          ? await api.createPatient(payload)
          : await api.updatePatient(editing as number, payload);
      await reload();
      setSelectedId(saved.id);
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const deletePatient = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await api.deletePatient(selected.id);
      await reload();
      setSelectedId(null);
      setConfirmDelete(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const field = (key: keyof Omit<PatientForm, 'pressures'>, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  if (!id) return <Navigate to="/" replace />;

  return (
    <DiagLayout
      active="users"
      users={users}
      selectedUserId={selectedId}
      onSelectUser={setSelectedId}
      {...headerFromSnapshot(snapshot, id)}
      sessionElapsedS={sticky.sessionElapsedS}
      version={APP_VERSION}
    >
      <DiagPanel
        title={t('diagnostics.users.systemUsers')}
        className="users-screen__list"
        style={{}}
      >
        <div className="users-screen__picker">
          <label className="users-screen__picker-label" htmlFor="user-picker">
            {t('diagnostics.users.name')}
          </label>
          <CanvasSelect
            id="user-picker"
            className="users-screen__select"
            value={selectedId != null ? String(selectedId) : ''}
            disabled={editing !== null}
            placeholder={noData}
            ariaLabel={t('diagnostics.users.name')}
            options={patients.map((p) => ({ value: String(p.id), label: p.full_name }))}
            onChange={(v) => setSelectedId(v === '' ? null : Number(v))}
          />
        </div>

        {/* CRUD row sits under the picker sub-box, on the panel itself. */}
        <div className="users-screen__crud">
          {editing === null ? (
            <>
              <button type="button" className="users-screen__crud-btn" onClick={beginCreate}>
                {t('diagnostics.users.crud.new')}
              </button>
              <button
                type="button"
                className="users-screen__crud-btn"
                disabled={!selected}
                onClick={beginEdit}
              >
                {t('diagnostics.users.crud.edit')}
              </button>
              {/* Two-click delete: first click arms, second confirms. */}
              <button
                type="button"
                className="users-screen__crud-btn users-screen__crud-btn--danger"
                disabled={!selected || busy}
                onClick={() =>
                  confirmDelete ? void deletePatient() : setConfirmDelete(true)
                }
                onBlur={() => setConfirmDelete(false)}
              >
                {confirmDelete
                  ? t('diagnostics.users.crud.confirmDelete')
                  : t('diagnostics.users.crud.delete')}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="users-screen__crud-btn"
                disabled={busy || form.full_name.trim() === ''}
                onClick={() => void savePatient()}
              >
                {t('diagnostics.users.crud.save')}
              </button>
              <button
                type="button"
                className="users-screen__crud-btn"
                disabled={busy}
                onClick={() => setEditing(null)}
              >
                {t('diagnostics.users.crud.cancel')}
              </button>
            </>
          )}
        </div>
        {error && <div className="users-screen__crud-error">{error}</div>}
      </DiagPanel>

      <DiagPanel
        title={t('diagnostics.users.userInfo')}
        className="users-screen__info"
        style={{}}
        captionOffsetX={-71}
      >
        {/* Positioned against the panel, not threaded through the field grid —
            the mockup overlaps it with the first four rows. */}
        <img
          className="users-screen__profile"
          src={PROFILE[(editing !== null ? form.gender || 'female' : gender) as Gender].NONE}
          alt=""
        />

        {editing !== null ? (
          /* ── edit form ─────────────────────────────────────────────── */
          <div className="users-screen__fields">
            <span className="users-screen__label">{t('diagnostics.users.name')}</span>
            <input
              className="users-screen__edit"
              value={form.full_name}
              onChange={(e) => field('full_name', e.target.value)}
            />

            <span className="users-screen__label">{t('diagnostics.users.id')}</span>
            <input
              className="users-screen__edit"
              value={form.national_id}
              placeholder={t('diagnostics.users.crud.idHint')}
              onChange={(e) => field('national_id', e.target.value)}
            />

            <span className="users-screen__label">{t('diagnostics.users.gender')}</span>
            <CanvasSelect
              className="users-screen__edit users-screen__edit--select"
              value={form.gender}
              placeholder={noData}
              ariaLabel={t('diagnostics.users.gender')}
              options={[
                { value: 'female', label: t('diagnostics.users.gender_female') },
                { value: 'male', label: t('diagnostics.users.gender_male') },
              ]}
              onChange={(v) => field('gender', v)}
            />

            <span className="users-screen__label">{t('diagnostics.users.crud.birthYear')}</span>
            <input
              className="users-screen__edit"
              type="number"
              value={form.birth_year}
              onChange={(e) => field('birth_year', e.target.value)}
            />

            <span className="users-screen__label">{t('diagnostics.users.protocol')}</span>
            <input
              className="users-screen__edit"
              value={form.protocol}
              onChange={(e) => field('protocol', e.target.value)}
            />

            {ZONES.map((zone) => (
              <Fragment key={zone}>
                <span className="users-screen__label">
                  {t(`zones.${zone}`)} ({t('common.mmhg')})
                </span>
                <input
                  className="users-screen__edit"
                  type="number"
                  min={0}
                  value={form.pressures[zone]}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      pressures: { ...f.pressures, [zone]: e.target.value },
                    }))
                  }
                />
              </Fragment>
            ))}
          </div>
        ) : (
          /* ── read-only info ─────────────────────────────────────────── */
          <div className="users-screen__fields">
            <span className="users-screen__label">{t('diagnostics.users.name')}</span>
            <span className="users-screen__value">{selected?.full_name ?? noData}</span>

            <span className="users-screen__label">{t('diagnostics.users.id')}</span>
            {/* Masked like every other screen — this is a ward-visible tablet. */}
            <span className="users-screen__value">
              {selected ? maskNationalId(selected.national_id) : noData}
            </span>

            <span className="users-screen__label">{t('diagnostics.users.gender')}</span>
            <span className="users-screen__value">
              {selected?.gender ? t(`diagnostics.users.gender_${selected.gender}`) : noData}
            </span>

            <span className="users-screen__label">{t('diagnostics.users.age')}</span>
            <span className="users-screen__value">{selected?.age ?? noData}</span>

            <span className="users-screen__label">{t('diagnostics.users.protocol')}</span>
            <span className="users-screen__value">{selected?.protocol ?? noData}</span>

            <span className="users-screen__label">{t('diagnostics.users.startDate')}</span>
            <span className="users-screen__value">{startDate}</span>

            <span className="users-screen__label">{t('diagnostics.users.treatmentNo')}</span>
            <span className="users-screen__value">
              {selected?.treatment_number ?? noData}
            </span>

            <span className="users-screen__label">{t('diagnostics.users.console')}</span>
            <span className="users-screen__value users-screen__pending">
              {t('common.notReported')}
            </span>

            <span className="users-screen__label">{t('diagnostics.users.pouch')}</span>
            <span className="users-screen__value">{snapshot?.id ?? noData}</span>

            <span className="users-screen__label">{t('diagnostics.users.timeRemain')}</span>
            <span className="users-screen__value users-screen__pending">
              {formatDuration(snapshot?.session_elapsed_s ?? null) ?? noData}
            </span>
          </div>
        )}
      </DiagPanel>
    </DiagLayout>
  );
}
