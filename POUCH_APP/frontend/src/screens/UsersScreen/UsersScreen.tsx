import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { useDeviceStream } from '@/api/useDeviceStream';
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

/** PAGE_03 — System Users and User Info. */
export function UsersScreen() {
  // No device id, no screen — the old fallback silently pointed at a mock id.
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const { snapshot } = useDeviceStream(id);
  const { patients, users } = useHeaderUsers();
  const sticky = useStickyDevice(snapshot, id);
  // Seeded from the pouch's last known patient so the panel is populated on the
  // first paint instead of blanking until the stream connects.
  const [selectedId, setSelectedId] = useState<number | null>(sticky.patientId);

  // Default to whoever is loaded on the pouch.
  useEffect(() => {
    if (selectedId === null && sticky.patientId !== null) setSelectedId(sticky.patientId);
  }, [sticky.patientId, selectedId]);

  // Renders its chrome even before the stream connects — see AdminScreen for why
  // an early return here caused a flash on every navigation.
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
          <select
            id="user-picker"
            className="users-screen__select"
            value={selectedId ?? ''}
            onChange={(e) =>
              setSelectedId(e.target.value === '' ? null : Number(e.target.value))
            }
          >
            {/* Without an explicit empty option the browser paints the first
                patient's name while nothing is actually selected. */}
            <option value="">{noData}</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
        </div>
      </DiagPanel>

      <DiagPanel
        title={t('diagnostics.users.userInfo')}
        className="users-screen__info"
        style={{}}
        captionOffsetX={-71}
      >
        {/* Positioned against the panel, not threaded through the field grid —
            the mockup overlaps it with the first four rows. */}
        <img className="users-screen__profile" src={PROFILE[gender].NONE} alt="" />

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
          {/* No planned duration is set yet, so remaining time cannot be derived
              — reported as absent rather than counted down from a guess. */}
          <span className="users-screen__value users-screen__pending">
            {formatDuration(snapshot?.session_elapsed_s ?? null) ?? noData}
          </span>
        </div>
      </DiagPanel>
    </DiagLayout>
  );
}
