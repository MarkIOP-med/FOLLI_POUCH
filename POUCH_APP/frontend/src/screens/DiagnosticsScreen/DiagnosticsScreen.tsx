import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { api } from '@/api/client';
import type { Gender, Zone } from '@/api/types';
import { useDeviceStream } from '@/api/useDeviceStream';
import { DiagLayout } from '@/components/DiagLayout';
import { DiagPanel } from '@/components/DiagPanel';
import { VNodeRow } from '@/components/VNodeRow';
import { BUTTONS, PROFILE } from '@/domain/diagnosticsAssets';
import { useDeviceActions } from '@/domain/useDeviceActions';
import {
  APP_VERSION,
  headerFromSnapshot,
  useHeaderUsers,
  useStickyDevice,
} from './DiagnosticsScreen.lib';
import './DiagnosticsScreen.scss';

const DEFAULT_DEVICE = 'POUCH-MOCK';

/** PAGE_02 — Pouch Diagnostics Overview. */
export function DiagnosticsScreen() {
  const { id = DEFAULT_DEVICE } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { snapshot } = useDeviceStream(id);
  const { busyKey, run } = useDeviceActions();
  const { users } = useHeaderUsers();
  const sticky = useStickyDevice(snapshot, id);
  const [manifoldDraft, setManifoldDraft] = useState('');

  // Renders its chrome even before the stream connects — see AdminScreen for why
  // an early return here caused a flash on every navigation. The panels appear
  // immediately and fill in when the first frame lands.
  const gender: Gender = snapshot?.patient?.gender ?? 'female';
  const disabled = !snapshot?.connected || busyKey !== null;
  const noData = t('diagnostics.noData');
  const zones = snapshot?.zones ?? [];

  return (
    <DiagLayout
      active="diagnostics"
      users={users}
      selectedUserId={sticky.patientId}
      onSelectUser={() => undefined}
      {...headerFromSnapshot(snapshot, id)}
      sessionElapsedS={sticky.sessionElapsedS}
      version={APP_VERSION}
    >
      {/* ── System Telemetry and Hardware ─────────────────────────────── */}
      <DiagPanel
        title={t('device.hardware.title')}
        className="diagnostics__hardware"
        style={{}}
      >
        <div className="hw">
          <button
            type="button"
            className="hw__round hw__round--start"
            disabled={disabled || snapshot?.session_id == null}
            onClick={() => run('applying', () => api.apply(id))}
          >
            <img src={BUTTONS.start} alt={t('device.hardware.start')} />
          </button>
          {/* Sends the vent command, not the firmware's stop — 's' never
              writes PUMP_PIN LOW, so it does not stop the pump. */}
          <button
            type="button"
            className="hw__round hw__round--stop"
            disabled={disabled}
            onClick={() => run('stopping', () => api.stop(id))}
          >
            <img src={BUTTONS.stop} alt={t('device.hardware.stopAll')} />
          </button>

          <div className="hw__rule hw__rule--1" />
          <h3 className="hw__title">{t('device.hardware.manifoldDiagnostic')}</h3>

          <div className="hw__manifold">
            <span>{t('device.vnodes.target')}</span>
            <input
              className="hw__input"
              type="number"
              min={0}
              max={snapshot?.ceiling_mmhg}
              value={manifoldDraft || snapshot?.manifold_target_mmhg || ''}
              disabled={disabled}
              aria-label={t('device.hardware.manifoldTarget')}
              onChange={(e) => setManifoldDraft(e.target.value)}
            />
            {/* One run, not four spans — see VNodeRow: the flex gap would be
                added at every word boundary and overflow the panel. */}
            <span>
              {t('common.mmhg')} | {t('device.vnodes.actual')}{' '}
              <span className="hw__value">
                {!snapshot || snapshot.manifold_fault || snapshot.manifold_mmhg == null
                  ? noData
                  : t('units.pressure', { value: snapshot.manifold_mmhg })}
              </span>
            </span>
          </div>

          <div className="hw__rule hw__rule--2" />

          {/* Pump and valve state are not in the telemetry CSV. Empty rings
              rather than a colour that would imply a live reading. */}
          <div className="hw__states">
            <span className="hw__state">
              {t('device.hardware.pump')} <span className="hw__dot-none" />
            </span>
            <span className="hw__state">
              {t('device.hardware.purgeValve')} <span className="hw__dot-none" />
            </span>
          </div>

          <div className="hw__valves-label">{t('device.hardware.valves')}</div>

          <div className="hw__valves">
            {zones.map((z) => (
              <span key={z.zone} className="hw__valve">
                {t(`zones.${z.zone}`)}
                <span className="hw__dot-none" />
              </span>
            ))}
          </div>

          <div className="hw__rule hw__rule--3" />

          <p className="hw__note">{t('device.hardware.notReportedNote')}</p>
        </div>
      </DiagPanel>

      {/* ── V-Nodes Telemetry Array ───────────────────────────────────── */}
      <DiagPanel
        title={t('device.vnodes.title')}
        className="diagnostics__vnodes"
        style={{}}
        captionOffsetX={-37}
      >
        {zones.map((zone) => (
          <VNodeRow
            key={zone.zone}
            zone={zone}
            gender={gender}
            ceiling={snapshot?.ceiling_mmhg ?? 0}
            disabled={disabled || snapshot?.session_id == null}
            onSet={(z: Zone, mmhg: number) =>
              run('settingTarget', () =>
                snapshot?.service_mode
                  ? api.setSetpoint(id, z, mmhg)
                  : api.setZoneRx(id, z, mmhg),
              )
            }
          />
        ))}
      </DiagPanel>

      {/* ── User Regime ───────────────────────────────────────────────── */}
      <DiagPanel
        title={t('diagnostics.regime.title')}
        className="diagnostics__regime"
        style={{}}
      >
        <div className="regime">
          <div className="regime__identity">
            <span>{t('diagnostics.users.name')}</span>
            <span>{snapshot?.patient?.full_name ?? noData}</span>
            <span>{t('diagnostics.users.id')}</span>
            <span>{snapshot?.patient?.national_id_masked ?? noData}</span>
            <span>{t('diagnostics.users.age')}</span>
            <span>{snapshot?.patient?.age ?? noData}</span>
          </div>

          <img className="regime__profile" src={PROFILE[gender].NONE} alt="" />

          <div className="regime__rule" />

          <p className="regime__label regime__label--default">
            {t('diagnostics.regime.defaultRegime')}
          </p>
          <div className="regime__zones regime__zones--default">
            {zones.map((z) => (
              <span key={z.zone} className="regime__zone-name">
                {t(`zones.${z.zone}`)}
              </span>
            ))}
            {zones.map((z) => (
              <span key={`${z.zone}-v`} className="regime__default">
                {z.prescribed_mmhg}
              </span>
            ))}
          </div>

          <p className="regime__label regime__label--user">
            {t('diagnostics.regime.userRegime')}
          </p>
          <div className="regime__zones regime__zones--user">
            {zones.map((z) => (
              <span key={z.zone} className="regime__zone-name">
                {t(`zones.${z.zone}`)}
              </span>
            ))}
            {zones.map((z) => (
              <input
                key={`${z.zone}-i`}
                className="regime__input"
                type="number"
                readOnly
                value={z.effective_mmhg}
                aria-label={t(`zones.${z.zone}`)}
              />
            ))}
          </div>

          <button
            type="button"
            className="regime__btn regime__btn--set"
            disabled={disabled}
          >
            <img src={BUTTONS.set} alt={t('diagnostics.regime.set')} />
          </button>
          <button
            type="button"
            className="regime__btn regime__btn--save"
            disabled={disabled || !snapshot?.patient}
            onClick={() => run('promoting', () => api.setCurrentAsDefault(id))}
          >
            <img src={BUTTONS.save} alt={t('diagnostics.regime.save')} />
          </button>
        </div>
      </DiagPanel>

      {/* ── Vibration Level Assignment ────────────────────────────────── */}
      <DiagPanel
        title={t('device.vibration.title')}
        className="diagnostics__vibration"
        style={{}}
      >
        <div className="vib-panel">
          {/* A grid of positioned rows, not a table: the mockup sets each row on
              its own measured centre (59.3px pitch) and the level discs on a
              54px pitch, neither of which falls out of table layout. */}
          {/* The mockup's column reads "Time Left", implying a countdown. The
              firmware never reports remaining vibration time, so the column is
              labelled for what it actually holds — the configured duration —
              rather than carrying a separate footnote that would have to sit on
              top of the rows to fit the panel. */}
          <div className="vib-panel__head">
            <span>{t('device.vibration.zonePair')}</span>
            <span>{t('device.vibration.levels')}</span>
            <span className="vib-panel__duration">
              {t('device.vibration.duration')}
            </span>
          </div>

          {zones.map((zone, i) => (
            <div
              key={zone.zone}
              className="vib-panel__row"
              style={{ top: `${118.5 + i * 59.3}px` }}
            >
              <span>{t(`zones.${zone.zone}`)}</span>
              <span className="vib-panel__levels">
                {[0, 1, 2, 3].map((level) => (
                  <button
                    key={level}
                    type="button"
                    className={`vib-panel__level${
                      zone.massage_level === level ? ' is-on' : ''
                    }`}
                    disabled={disabled || !snapshot?.patient}
                    aria-pressed={zone.massage_level === level}
                    onClick={() =>
                      run('settingVibration', () =>
                        api.setVibration(id, zone.zone as Zone, level),
                      )
                    }
                  >
                    {level}
                  </button>
                ))}
              </span>
              <span className="vib-panel__duration">
                {t('units.duration', { value: zone.massage_seconds })}
              </span>
            </div>
          ))}
        </div>
      </DiagPanel>
    </DiagLayout>
  );
}
