import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { EMPTY_DEVICE_DRAFT, formatPortList, useSettingsScreen } from './Settings.lib';
import type { NewDeviceDraft } from './Settings.types';
import './Settings.scss';

export function SettingsScreen() {
  const { t } = useTranslation();
  const {
    settings,
    setSettings,
    devices,
    ports,
    error,
    saved,
    saveSettings,
    addDevice,
    removeDevice,
  } = useSettingsScreen();

  const [draft, setDraft] = useState<NewDeviceDraft>(EMPTY_DEVICE_DRAFT);

  if (!settings) return <p className="u-muted">{t('common.loading')}</p>;

  const patchDraft = (patch: Partial<NewDeviceDraft>) =>
    setDraft((prev) => ({ ...prev, ...patch }));

  return (
    <div className="settings">
      <h1 className="settings__heading">{t('settings.heading')}</h1>

      {error && <div className="banner banner--error">{error}</div>}

      <section className="settings__card">
        <h2 className="settings__section-title">{t('settings.clinical')}</h2>

        <div className="settings__row">
          <label htmlFor="max-pressure">{t('settings.maxPressure')}</label>
          <input
            id="max-pressure"
            type="number"
            min={1}
            max={300}
            value={settings.max_pressure_mmhg}
            onChange={(e) =>
              setSettings({ ...settings, max_pressure_mmhg: Number(e.target.value) })
            }
          />
          <span className="u-unit">{t('common.mmhg')}</span>
        </div>

        {/*
          This is a convenience limit. The authoritative clamp must also exist in
          pneumatics.ino so the device stays safe with this app switched off.
        */}
        <p className="u-note">{t('settings.maxPressureNote')}</p>

        <div className="settings__row">
          <label htmlFor="trim-range">{t('settings.trimRange')}</label>
          <span>±</span>
          <input
            id="trim-range"
            type="number"
            min={0}
            max={50}
            value={settings.trim_range_pct}
            onChange={(e) =>
              setSettings({ ...settings, trim_range_pct: Number(e.target.value) })
            }
          />
          <span className="u-unit">{t('common.percent')}</span>
        </div>

        <div className="settings__row">
          <label htmlFor="default-massage">{t('settings.defaultMassage')}</label>
          <input
            id="default-massage"
            type="number"
            min={0}
            value={settings.default_massage_seconds}
            onChange={(e) =>
              setSettings({
                ...settings,
                default_massage_seconds: Number(e.target.value),
              })
            }
          />
          <span className="u-unit">{t('common.seconds')}</span>
        </div>

        <button type="button" className="btn" onClick={() => void saveSettings(settings)}>
          {t('common.save')}
        </button>
        {saved && <span className="u-ok"> {t('common.saved')}</span>}
      </section>

      <section className="settings__card">
        <h2 className="settings__section-title">{t('settings.devices')}</h2>

        <table className="table">
          <tbody>
            {devices.map((device) => (
              <tr key={device.id}>
                <td className="u-mono">{device.id}</td>
                <td>{device.label}</td>
                <td>{device.transport}</td>
                <td className="u-mono">{device.port ?? t('common.emDash')}</td>
                <td className="u-muted">
                  {t('settings.firmwareShort', {
                    version: device.fw_version ?? t('common.unknown'),
                  })}
                </td>
                <td>
                  <button
                    type="button"
                    className="btn btn--tiny btn--ghost btn--danger"
                    onClick={() => void removeDevice(device.id)}
                  >
                    {t('common.remove')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="settings__add">
          <input
            value={draft.id}
            placeholder={t('settings.deviceId')}
            aria-label={t('settings.deviceId')}
            onChange={(e) => patchDraft({ id: e.target.value })}
          />
          <input
            value={draft.label}
            placeholder={t('settings.deviceLabel')}
            aria-label={t('settings.deviceLabel')}
            onChange={(e) => patchDraft({ label: e.target.value })}
          />
          <select
            value={draft.transport}
            aria-label={t('settings.transport.serial')}
            onChange={(e) =>
              patchDraft({ transport: e.target.value as NewDeviceDraft['transport'] })
            }
          >
            <option value="serial">{t('settings.transport.serial')}</option>
            <option value="mock">{t('settings.transport.mock')}</option>
          </select>
          <select
            value={draft.port}
            aria-label={t('settings.devicePort')}
            onChange={(e) => patchDraft({ port: e.target.value })}
          >
            <option value="">{t('settings.devicePort')}</option>
            {ports.map((port) => (
              <option key={port.port} value={port.port}>
                {port.port} ({port.description})
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn"
            disabled={!draft.id.trim() || !draft.label.trim()}
            onClick={async () => {
              if (await addDevice(draft)) setDraft(EMPTY_DEVICE_DRAFT);
            }}
          >
            {t('common.add')}
          </button>
        </div>

        <p className="u-note">
          {t('settings.detectedPorts', {
            ports: formatPortList(ports, t('common.none')),
          })}
        </p>
        <p className="u-note">{t('settings.firmwareNote')}</p>
      </section>
    </div>
  );
}
