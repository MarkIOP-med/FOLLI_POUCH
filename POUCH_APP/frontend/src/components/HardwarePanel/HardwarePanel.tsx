import { useTranslation } from 'react-i18next';

import { Gauge } from '@/components/Gauge';
import type { HardwarePanelProps } from './HardwarePanel.types';
import './HardwarePanel.scss';

/** Left column of the overview: hardware controls and manifold diagnostics. */
export function HardwarePanel({
  snapshot,
  busyKey,
  onStart,
  onStop,
  onPause,
  onEmergency,
  onRezero,
}: HardwarePanelProps) {
  const { t } = useTranslation();

  const disabled = !snapshot.connected || busyKey !== null;
  const hardware = snapshot.hardware;

  return (
    <section className="hardware">
      <h2 className="hardware__title">{t('device.hardware.title')}</h2>

      <button
        type="button"
        className="hardware__action hardware__action--start"
        disabled={disabled || snapshot.session_id === null}
        onClick={onStart}
      >
        {t('device.hardware.start')}
      </button>

      {/*
        Sends 'r', not 's'. Verified on hardware: 's' sets currentState = STOPPED,
        runStateMachine() returns at its first line, and nothing writes PUMP_PIN LOW
        — the pump keeps running. A control labelled STOP must actually stop the pump.
      */}
      <button
        type="button"
        className="hardware__action hardware__action--stop"
        disabled={disabled}
        onClick={onStop}
      >
        {t('device.hardware.stopAll')}
      </button>

      <button
        type="button"
        className="hardware__action hardware__action--pause"
        disabled={disabled}
        onClick={onPause}
      >
        {t('device.hardware.pause')}
      </button>

      <div className="hardware__diag">
        <h3 className="hardware__diag-title">{t('device.hardware.manifoldDiagnostic')}</h3>

        <div className="hardware__gauges">
          <Gauge
            label={t('device.hardware.manifoldTarget')}
            value={snapshot.manifold_target_mmhg}
            max={snapshot.ceiling_mmhg}
          />
          <Gauge
            label={t('device.hardware.manifoldActual')}
            value={snapshot.manifold_mmhg}
            max={snapshot.ceiling_mmhg}
            fault={snapshot.manifold_fault}
          />
        </div>

        {snapshot.manifold_fault && (
          <p className="hardware__fault-note">{t('device.hardware.manifoldFault')}</p>
        )}

        <dl className="hardware__list">
          <div>
            <dt>{t('device.hardware.pump')}</dt>
            <dd className="hardware__unreported">
              {hardware?.reported && hardware.pump
                ? hardware.pump
                : t('common.notReported')}
            </dd>
          </div>
          <div>
            <dt>{t('device.hardware.purgeValve')}</dt>
            <dd className="hardware__unreported">
              {hardware?.reported && hardware.purge_valve
                ? hardware.purge_valve
                : t('common.notReported')}
            </dd>
          </div>
        </dl>

        <div className="hardware__valves">
          <span className="hardware__valves-label">{t('device.hardware.valves')}</span>
          {snapshot.zones.map((zone) => (
            <span key={zone.zone} className="hardware__valve">
              <span className="hardware__valve-name">{t(`zones.${zone.zone}`)}</span>
              <span
                className="hardware__valve-led"
                title={t('device.hardware.valveUnknownTitle')}
              />
            </span>
          ))}
        </div>

        {/*
          Same rule as the FSR readings: the absence of data is never dressed up as
          data. serial.ino emits only time, targets, actuals, manifold and FSRs.
        */}
        <p className="u-note">{t('device.hardware.notReportedNote')}</p>
      </div>

      <hr />

      <button
        type="button"
        className="btn btn--ghost btn--wide"
        disabled={disabled}
        onClick={onRezero}
      >
        {t('device.hardware.rezero')}
      </button>
      <button
        type="button"
        className="btn btn--emergency btn--wide"
        disabled={disabled}
        onClick={onEmergency}
      >
        {t('device.hardware.emergency')}
      </button>

      <p className="u-note">{t('device.rezeroNote')}</p>

      {busyKey && <p className="hardware__busy">{t(`device.busy.${busyKey}`)}</p>}
      {!snapshot.connected && (
        <p className="hardware__warn">{t('device.notConnected')}</p>
      )}
    </section>
  );
}
