import { useCallback, useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { api } from '@/api/client';
import type { SerialPort, Settings, Zone } from '@/api/types';
import { useDeviceStream } from '@/api/useDeviceStream';
import { CanvasSelect } from '@/components/CanvasSelect';
import { DiagLayout } from '@/components/DiagLayout';
import { PasswordPrompt } from '@/components/PasswordPrompt/PasswordPrompt';
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
  // Critical actions awaiting the admin password before they fire.
  const [pendingRestart, setPendingRestart] = useState(false);
  const [pendingFactoryReset, setPendingFactoryReset] = useState(false);
  const [newTransport, setNewTransport] = useState<'serial' | 'ble'>('serial');
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
  const busy = busyKey !== null;
  // Zone/vibration rows edit the CHECKED-OUT patient's regime, so they need a
  // connected pouch with a patient checked out (NO_USER by default) — NOT a
  // running session. App-settings rows need neither.
  const patientRowsDisabled =
    !snapshot?.connected || !snapshot?.checked_out_patient || busy;

  const rowDisabled = (needsSession: boolean) =>
    needsSession ? patientRowsDisabled : busy;
  // The identity/regime shown at idle is the checked-out patient (NO_USER);
  // during a session it is the session patient (they are the same once running).
  const shownPatient = snapshot?.patient ?? snapshot?.checked_out_patient ?? null;

  const saveDrafts = () =>
    run('promoting', async () => {
      let nextSettings = settings ?? {
        max_pressure_mmhg: snapshot?.ceiling_mmhg ?? 130,
        trim_range_pct: snapshot?.trim_range_pct ?? 10,
        default_massage_seconds: 30,
        pressure_tolerance_mmhg: 3,
        actuation_threshold_mmhg: 10,
        telemetry_interval_ms: 250,
        vib_pwm_1: 170,
        vib_pwm_2: 215,
        vib_pwm_3: 255,
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
        } else if (row.kind === 'pressureTolerance') {
          nextSettings = {
            ...nextSettings,
            pressure_tolerance_mmhg: Math.max(1, Math.min(20, Math.round(value))),
          };
          settingsChanged = true;
        } else if (row.kind === 'actuationThreshold') {
          nextSettings = {
            ...nextSettings,
            actuation_threshold_mmhg: Math.max(0, Math.min(50, Math.round(value))),
          };
          settingsChanged = true;
        } else if (row.kind === 'telemetryInterval') {
          nextSettings = {
            ...nextSettings,
            telemetry_interval_ms: Math.max(50, Math.min(2000, Math.round(value))),
          };
          settingsChanged = true;
        } else if (
          row.kind === 'vibPwm1' ||
          row.kind === 'vibPwm2' ||
          row.kind === 'vibPwm3'
        ) {
          const field = (
            { vibPwm1: 'vib_pwm_1', vibPwm2: 'vib_pwm_2', vibPwm3: 'vib_pwm_3' } as const
          )[row.kind];
          nextSettings = {
            ...nextSettings,
            [field]: Math.max(0, Math.min(255, Math.round(value))),
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
        port: newPort || null,
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

      {/* SAVE / RESET ALL sit on the heading row, ending on the table's own right
          rule. The mockup stacks them down the side panel with a caption over
          each; moved here the captions go, since the artwork carries its label
          and the band is 91.5px tall. What they free up in the panel goes to the
          device list. */}
      <div className="admin-screen__actions">
        {/* SAVE commits every filled Set Value draft above. */}
        <button
          type="button"
          className="admin-screen__pill"
          disabled={busy || Object.values(drafts).every((v) => v.trim() === '')}
          onClick={saveDrafts}
        >
          <img src={BUTTONS.save} alt={t('diagnostics.admin.save')} />
        </button>
        <button
          type="button"
          className="admin-screen__pill"
          disabled={busy || !snapshot?.connected || !snapshot?.patient}
          onClick={() => run('resetting', () => api.resetDefaults(id))}
        >
          <img src={BUTTONS.resetAll} alt={t('diagnostics.admin.resetAll')} />
        </button>
      </div>

      {/* Boxed to the design's ten-row height and scrolled, rather than left to
          run off the canvas — see AdminScreen.scss. */}
      <div className="admin-screen__table-scroll">
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
      </div>

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
          <span>{shownPatient?.full_name ?? noData}</span>
          <span>{t('diagnostics.users.id')}</span>
          <span>{shownPatient?.national_id_masked ?? noData}</span>
          <span>{t('diagnostics.users.age')}</span>
          <span>{shownPatient?.age ?? noData}</span>
        </div>

        <div className="admin-screen__divider" />

        <div className="admin-screen__protocol">
          <span>{t('diagnostics.users.protocol')}</span>
          <span>{shownPatient?.protocol ?? noData}</span>
        </div>

        {/* An empty #27475a strip closes the data block, exactly as drawn. */}
        <div className="admin-screen__strip" />

        {/* Critical pouch actions, side by side, pinned just below RESET ALL.
            Absolutely positioned (the side panel places all children absolutely)
            with canvas-px sizing — see admin-screen__critical in the SCSS. Both
            password-gated. */}
        <div className="admin-screen__critical">
          <button
            type="button"
            className="admin-screen__critical-btn admin-screen__critical-btn--restart"
            disabled={busy || !snapshot?.connected}
            onClick={() => setPendingRestart(true)}
          >
            Restart pouch
          </button>
          <button
            type="button"
            className="admin-screen__critical-btn admin-screen__critical-btn--danger"
            disabled={busy || !snapshot?.connected}
            onClick={() => setPendingFactoryReset(true)}
          >
            Factory reset
          </button>
        </div>

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
                { value: 'ble', label: 'ble' },
              ]}
              onChange={(v) =>
                setNewTransport((v || 'serial') as 'serial' | 'ble')
              }
            />
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

      <PasswordPrompt
        open={pendingRestart}
        title="Restart pouch"
        detail="This vents and re-initialises the pouch's control loop. It keeps the current session and patient, but will briefly interrupt a running treatment. Enter the admin password to continue."
        confirmLabel="Restart"
        onConfirm={() => {
          setPendingRestart(false);
          if (id) void run('restarting', () => api.restart(id));
        }}
        onCancel={() => setPendingRestart(false)}
      />

      <PasswordPrompt
        open={pendingFactoryReset}
        title="Factory reset"
        detail="This restarts the pouch to NO_USER and DELETES every patient except NO_USER. Clinical settings (pressure ceiling, trim range) are kept. This cannot be undone. Enter the admin password to continue."
        confirmLabel="Factory reset"
        destructive
        onConfirm={() => {
          setPendingFactoryReset(false);
          if (id) void run('factoryReset', () => api.factoryReset(id));
        }}
        onCancel={() => setPendingFactoryReset(false)}
      />
    </DiagLayout>
  );
}
