import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { TechnicalDrawerProps } from './TechnicalDrawer.types';
import './TechnicalDrawer.scss';

/**
 * Service information: manifold, transport, firmware identity, serial log and the
 * raw telemetry frame. Collapsed by default so it does not compete with the
 * clinical view for attention.
 */
export function TechnicalDrawer({ snapshot, defaultOpen = false }: TechnicalDrawerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpen);

  const logLines = snapshot.technical?.log_tail ?? [];

  return (
    <section className="technical">
      <button
        type="button"
        className="technical__toggle"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? '▾' : '▸'} {t('device.technical.toggle')}
      </button>

      {open && (
        <>
          <dl className="technical__grid">
            <div>
              <dt>{t('device.technical.manifold')}</dt>
              <dd className={snapshot.manifold_fault ? 'is-fault' : undefined}>
                {snapshot.manifold_fault
                  ? t('device.technical.manifoldFaultShort')
                  : snapshot.manifold_mmhg == null
                    ? t('common.emDash')
                    : t('units.pressure', { value: snapshot.manifold_mmhg })}
              </dd>
            </div>
            <div>
              <dt>{t('device.technical.transport')}</dt>
              <dd>
                {snapshot.transport} {snapshot.port ?? ''}
              </dd>
            </div>
            <div>
              <dt>{t('device.technical.linkRate')}</dt>
              <dd>{t('units.rate', { value: snapshot.rate_hz })}</dd>
            </div>
            <div>
              <dt>{t('device.technical.firmware')}</dt>
              {/*
                Gen4 is a byte-for-byte copy of Gen3 and prints the Gen3 banner, so a
                board cannot currently identify itself. Show that, don't hide it.
              */}
              <dd>{snapshot.fw_version ?? t('device.technical.firmwareUnknown')}</dd>
            </div>
          </dl>

          <h3 className="technical__section-title">{t('device.technical.serialLog')}</h3>
          <pre className="technical__log">
            {logLines.length > 0
              ? logLines.join('\n')
              : t('device.technical.serialLogEmpty')}
          </pre>

          <h3 className="technical__section-title">{t('device.technical.rawFrame')}</h3>
          <pre className="technical__log">
            {JSON.stringify(snapshot.technical?.raw_frame ?? null, null, 2)}
          </pre>
        </>
      )}
    </section>
  );
}
