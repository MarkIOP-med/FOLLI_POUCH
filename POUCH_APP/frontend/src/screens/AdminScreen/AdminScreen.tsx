import { useCallback, useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { api } from '@/api/client';
import type { SerialPort, Settings, Zone } from '@/api/types';
import { useDeviceStream } from '@/api/useDeviceStream';
import { CanvasSelect } from '@/components/CanvasSelect';
import { DiagLayout } from '@/components/DiagLayout';
import { BUTTONS } from '@/domain/diagnosticsAssets';
import { parseTarget } from '@/domain/pressure';
import { useDeviceActions } from '@/domain/useDeviceActions';
import { useRoster } from '@/domain/useRoster';
import {
  APP_VERSION,
  headerFromSnapshot,
  useHeaderUsers,
  useStickyDevice,
} from '@/screens/DiagnosticsScreen/DiagnosticsScreen.lib';
import { TABLE_ROWS, adminActions } from './AdminScreen.lib';
import './AdminScreen.scss';

/** PAGE_04 — Admin Actions, plus app settings and device management. */
export function AdminScreen() {
  // No device id, no screen — the old fallback silently pointed at a mock id.
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { snapshot } = useDeviceStream(id);
  const { busyKey, error, run, clearError } = useDeviceActions();
  const { users } = useHeaderUsers();
  const sticky = useStickyDevice(snapshot, id ?? '');
  const { devices, refresh: refreshRoster, toggleConnection } = useRoster();

  const [settings, setSettings] = useState<Settings | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  // Device management state.
  const [ports, setPorts] = useState<SerialPort[]>([]);
  const [newId, setNewId] = useState('');
  const [newTransport, setNewTransport] = useState<'serial' | 'mock' | 'ble'>('serial');
  const [newPort, setNewPort] = useState('');
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const loadSettings = useCallback(() => {
    api.settings().then(setSettings).catch(() => setSettings(null));
  }, []);

  useEffect(loadSettings, [loadSettings]);
  useEffect(() => {
    api
      .serialPorts()
      .then((next) => {
        setPorts(next);
        // Preselect the CP2102 bridge — almost certainly the pouch.
        const likely = next.find((p) => p.likely_pouch);
        if (likely) setNewPort((prev) => prev || likely.port);
      })
      .catch(() => setPorts([]));
  }, []);

  // No early return while the stream connects: bailing out here used to unmount
  // the whole canvas and flash bare text on every navigation.
  const rows = adminActions(snapshot, settings);
  const blanks = Math.max(0, TABLE_ROWS - rows.length);
  const noData = t('diagnostics.noData');
  const sessionActive = snapshot?.session_id != null;
  const busy = busyKey !== null;
  // Zone/vibration rows need a connected pouch with a session; app-settings rows
  // need neither, so the table is never wholesale-disabled anymore.
  const sessionRowsDisabled = !snapshot?.connected || !sessionActive || busy;

  const rowDisabled = (needsSession: boolean) =>
    needsSession ? sessionRowsDisabled : busy;

  const saveDrafts = () =>
    run('promoting', async () => {
      let nextSettings = settings ?? {
        max_pressure_mmhg: snapshot?.ceiling_mmhg ?? 130,
        trim_range_pct: snapshot?.trim_range_pct ?? 10,
        default_massage_seconds: 30,
      };
      let settingsChanged = false;

      for (const row of rows) {
        const raw = drafts[row.key];
        if (raw == null || raw.trim() === '') continue;
        const value = Number(raw);
        if (!Number.isFinite(value)) continue;

        if (row.kind === 'zone' && row.zone && id) {
          const mmhg = parseTarget(raw, nextSettings.max_pressure_mmhg);
          if (snapshot?.service_mode) await api.setSetpoint(id, row.zone, mmhg);
          else await api.setZoneRx(id, row.zone, mmhg);
        } else if (row.kind === 'vibration' && id) {
          const level = Math.max(0, Math.min(3, Math.round(value)));
          for (const z of ['FRONT', 'TEMPLE', 'EAR', 'BACK'] as Zone[]) {
            await api.setVibration(id, z, level);
          }
        } else if (row.kind === 'ceiling') {
          nextSettings = { ...nextSettings, max_pressure_mmhg: Math.round(value) };
          settingsChanged = true;
        } else if (row.kind === 'trimRange') {
          nextSettings = { ...nextSettings, trim_range_pct: Math.round(value) };
          settingsChanged = true;
        } else if (row.kind === 'massageSeconds') {
          nextSettings = {
            ...nextSettings,
            default_massage_seconds: Math.round(value),
          };
          settingsChanged = true;
        }
      }

      if (settingsChanged) setSettings(await api.saveSettings(nextSettings));
      setDrafts({});
    });

  const addDevice = () =>
    run('startingService', async () => {
      await api.addDevice({
        id: newId.trim(),
        label: newId.trim(),
        transport: newTransport,
        port: newTransport === 'mock' ? null : newPort || null,
      });
      setNewId('');
      await refreshRoster();
    });

  const removeDevice = (deviceId: string) =>
    run('endingSession', async () => {
      await api.removeDevice(deviceId);
      setConfirmRemove(null);
      await refreshRoster();
    });

  if (!id) return <Navigate to="/" replace />;

  return (
    <DiagLayout
      active="settings"
      users={users}
      selectedUserId={sticky.patientId}
      /* Read-only here: patient loading happens on the diagnostics screen. A
         selector that accepts input and discards it reads as broken. */
      selectDisabled
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
                {row.kind !== 'readonly' && (
                  <input
                    className="admin-screen__set-input"
                    type="number"
                    value={drafts[row.key] ?? ''}
                    disabled={rowDisabled(row.needsSession)}
                    aria-label={t(row.labelKey)}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, [row.key]: e.target.value }))
                    }
                  />
                )}
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

      {error && (
        <button
          type="button"
          className="admin-screen__error"
          onClick={clearError}
          title={t('common.dismiss')}
        >
          {error} ✕
        </button>
      )}

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
          {/* SAVE commits every filled Set Value draft above. */}
          <button
            type="button"
            className="admin-screen__pill admin-screen__pill--save"
            disabled={busy || Object.values(drafts).every((v) => v.trim() === '')}
            onClick={saveDrafts}
          >
            <img src={BUTTONS.save} alt={t('diagnostics.admin.save')} />
          </button>

          <span className="admin-screen__reset-label">
            {t('diagnostics.admin.resetToDefault')}
          </span>
          <button
            type="button"
            className="admin-screen__pill admin-screen__pill--reset"
            disabled={sessionRowsDisabled || !snapshot?.patient}
            onClick={() => run('resetting', () => api.resetDefaults(id))}
          >
            <img src={BUTTONS.resetAll} alt={t('diagnostics.admin.resetAll')} />
          </button>
        </div>

        {/* Factory reset — destructive: restores the pouch to NO_USER and deletes
            every patient except NO_USER. Self-contained styling + a confirm so it
            can't be triggered by accident. */}
        <button
          type="button"
          disabled={busy || !snapshot?.connected}
          onClick={() => {
            if (
              window.confirm(
                'Factory reset the pouch?\n\nThis restarts the pouch to NO_USER and ' +
                  'DELETES every patient except NO_USER. Clinical settings (pressure ' +
                  'ceiling, trim range) are kept. This cannot be undone.',
              )
            ) {
              void run('factoryReset', () => api.factoryReset(id));
            }
          }}
          style={{
            marginTop: 14,
            padding: '9px 14px',
            borderRadius: 8,
            border: '1px solid #b3524a',
            background: '#3a1b18',
            color: '#f0b7b0',
            font: '600 13px/1 inherit',
            cursor: 'pointer',
          }}
        >
          Factory reset (delete all patients except NO_USER)
        </button>

        {/* ── Device management ─────────────────────────────────────────────
            Absolutely placed into the band between the strip (y≈349) and the
            "Save Changes" label (y≈520) — the side column is a measured layout
            and flow content lands on top of the General Data block. */}
        <div className="admin-screen__devices">
          <h4 className="admin-screen__devices-title">
            {t('diagnostics.admin.devices.title')}
          </h4>

          {devices.map((device) => (
            <div key={device.id} className="admin-screen__device-row">
              <span className="admin-screen__device-id">
                {device.id}
                <span className="admin-screen__device-meta">
                  {' '}
                  {device.transport}
                  {device.port ? ` · ${device.port}` : ''}
                </span>
              </span>
              <button
                type="button"
                className="admin-screen__device-btn"
                disabled={busy}
                onClick={() => void toggleConnection(device)}
              >
                {device.connected
                  ? t('diagnostics.admin.devices.disconnect')
                  : t('diagnostics.admin.devices.connect')}
              </button>
              {/* Two-click remove: first click arms, second confirms. */}
              <button
                type="button"
                className="admin-screen__device-btn admin-screen__device-btn--danger"
                disabled={busy}
                onClick={() =>
                  confirmRemove === device.id
                    ? void removeDevice(device.id)
                    : setConfirmRemove(device.id)
                }
              >
                {confirmRemove === device.id
                  ? t('diagnostics.admin.devices.confirmRemove')
                  : t('diagnostics.admin.devices.remove')}
              </button>
            </div>
          ))}

          <div className="admin-screen__device-add">
            <input
              className="admin-screen__device-input"
              placeholder={t('diagnostics.admin.devices.idPlaceholder')}
              value={newId}
              disabled={busy}
              onChange={(e) => setNewId(e.target.value)}
            />
            <CanvasSelect
              className="admin-screen__device-input admin-screen__device-input--select"
              value={newTransport}
              disabled={busy}
              placeholder="serial"
              ariaLabel="transport"
              options={[
                { value: 'serial', label: 'serial' },
                { value: 'mock', label: 'mock' },
                { value: 'ble', label: 'ble' },
              ]}
              onChange={(v) =>
                setNewTransport((v || 'serial') as 'serial' | 'mock' | 'ble')
              }
            />
            {newTransport !== 'mock' && (
              <CanvasSelect
                className="admin-screen__device-input admin-screen__device-input--select"
                value={newPort}
                disabled={busy}
                placeholder={t('diagnostics.admin.devices.portPlaceholder')}
                ariaLabel="port"
                options={ports.map((p) => ({
                  value: p.port,
                  label: `${p.port}${p.likely_pouch ? ` ${t('diagnostics.admin.devices.likelyPouch')}` : ''}`,
                }))}
                onChange={setNewPort}
              />
            )}
            <button
              type="button"
              className="admin-screen__device-btn"
              disabled={busy || newId.trim() === ''}
              onClick={addDevice}
            >
              {t('diagnostics.admin.devices.add')}
            </button>
          </div>
        </div>
      </aside>
    </DiagLayout>
  );
}
