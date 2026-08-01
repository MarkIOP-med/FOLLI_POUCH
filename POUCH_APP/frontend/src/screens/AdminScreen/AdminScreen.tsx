import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { api } from '@/api/client';
import { useDeviceStream } from '@/api/useDeviceStream';
import { DiagLayout } from '@/components/DiagLayout';
import { BUTTONS } from '@/domain/diagnosticsAssets';
import { useDeviceActions } from '@/domain/useDeviceActions';
import {
  APP_VERSION,
  headerFromSnapshot,
  useHeaderUsers,
  useStickyDevice,
} from '@/screens/DiagnosticsScreen/DiagnosticsScreen.lib';
import { TABLE_ROWS, adminActions } from './AdminScreen.lib';
import './AdminScreen.scss';

const DEFAULT_DEVICE = 'POUCH-MOCKUP';

/** PAGE_04 — Admin Actions. */
export function AdminScreen() {
  const { id = DEFAULT_DEVICE } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { snapshot } = useDeviceStream(id);
  const { busyKey, run } = useDeviceActions();
  const { users } = useHeaderUsers();
  const sticky = useStickyDevice(snapshot, id);

  // No early return while the stream connects: bailing out here used to unmount
  // the whole canvas — frame, gradient, status bar and rail — and replace it with
  // a bare line of text for the ~200ms until the first SSE frame, which read as a
  // flash of unrelated content on every navigation. The chrome now stays put and
  // only the values are absent.
  const rows = adminActions(snapshot);
  const blanks = Math.max(0, TABLE_ROWS - rows.length);
  const noData = t('diagnostics.noData');
  const disabled = !snapshot?.connected || busyKey !== null || !snapshot.patient;

  return (
    <DiagLayout
      active="settings"
      users={users}
      selectedUserId={sticky.patientId}
      onSelectUser={() => undefined}
      {...headerFromSnapshot(snapshot, id)}
      sessionElapsedS={sticky.sessionElapsedS}
      version={APP_VERSION}
    >
      <h2 className="admin-screen__heading">{t('diagnostics.admin.heading')}</h2>

      <table className="admin-screen__table">
        <thead>
          <tr>
            <th className="admin-screen__table-action">
              {t('diagnostics.admin.columns.action')}
            </th>
            <th className="admin-screen__table-current">
              {t('diagnostics.admin.columns.currentValue')}
            </th>
            <th className="admin-screen__table-set">
              {t('diagnostics.admin.columns.setValue')}
            </th>
            <th className="admin-screen__table-desc">
              {t('diagnostics.admin.columns.description')}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td>{t(row.labelKey)}</td>
              <td className="admin-screen__table-current">
                {row.value ?? t('diagnostics.admin.unset')}
              </td>
              <td className="admin-screen__table-set">
                <input
                  className="admin-screen__set-input"
                  type="number"
                  disabled={disabled || !row.editable}
                  aria-label={t(row.labelKey)}
                />
              </td>
              <td>{t(row.descriptionKey)}</td>
            </tr>
          ))}
          {Array.from({ length: blanks }, (_, i) => (
            <tr key={`blank-${i}`} className="admin-screen__empty">
              <td />
              <td />
              <td />
              <td />
            </tr>
          ))}
        </tbody>
      </table>

      <aside className="admin-screen__side">
        <h3 className="admin-screen__side-caption">
          {t('diagnostics.admin.generalData')}
        </h3>

        <div className="admin-screen__general">
          <span>{t('diagnostics.users.name')}</span>
          <span>{snapshot?.patient?.full_name ?? noData}</span>
          <span>{t('diagnostics.users.id')}</span>
          <span>{snapshot?.patient?.national_id_masked ?? noData}</span>
          <span>{t('diagnostics.users.age')}</span>
          <span>{snapshot?.patient?.age ?? noData}</span>
        </div>

        <div className="admin-screen__divider" />

        <div className="admin-screen__protocol">
          <span>{t('diagnostics.users.protocol')}</span>
          <span>{snapshot?.patient?.protocol ?? noData}</span>
        </div>

        {/* An empty #27475a strip closes the data block, exactly as drawn. */}
        <div className="admin-screen__strip" />

        <div className="admin-screen__actions">
          <span className="admin-screen__save-label">
            {t('diagnostics.admin.saveChanges')}
          </span>
          <button
            type="button"
            className="admin-screen__pill admin-screen__pill--save"
            disabled={disabled}
            onClick={() => run('promoting', () => api.setCurrentAsDefault(id))}
          >
            <img src={BUTTONS.save} alt={t('diagnostics.admin.save')} />
          </button>

          <span className="admin-screen__reset-label">
            {t('diagnostics.admin.resetToDefault')}
          </span>
          <button
            type="button"
            className="admin-screen__pill admin-screen__pill--reset"
            disabled={disabled}
            onClick={() => run('resetting', () => api.resetDefaults(id))}
          >
            <img src={BUTTONS.resetAll} alt={t('diagnostics.admin.resetAll')} />
          </button>
        </div>
      </aside>
    </DiagLayout>
  );
}
