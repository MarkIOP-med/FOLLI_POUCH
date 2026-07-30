import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Zone } from '@/api/types';
import { STATUS_CLASS, fsrDisplay } from '@/domain/status';
import { ZoneGlyph } from '@/components/ZoneGlyph';
import { parseTarget, trimSummary } from './VNodeCard.lib';
import type { VNodeCardProps } from './VNodeCard.types';
import './VNodeCard.scss';

/** One V-node in the telemetry array: target, actual, trim and both FSR channels. */
export function VNodeCard({
  zone,
  ceiling,
  serviceMode,
  disabled = false,
  onTarget,
}: VNodeCardProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(String(zone.prescribed_mmhg));

  useEffect(() => setDraft(String(zone.prescribed_mmhg)), [zone.prescribed_mmhg]);

  const statusClass = STATUS_CLASS[zone.status];
  const trim = trimSummary(zone);
  const left = fsrDisplay(zone.fsr_l);
  const right = fsrDisplay(zone.fsr_r);

  const commit = () => onTarget(zone.zone as Zone, parseTarget(draft));

  const renderFsr = (display: ReturnType<typeof fsrDisplay>) => (
    <span className={display.className}>
      {display.kind === 'fault' && t('status.fsrFault')}
      {display.kind === 'none' && t('common.notAvailable')}
      {display.kind === 'value' && display.value}
    </span>
  );

  return (
    <article className={`vnode ${statusClass}`}>
      <ZoneGlyph zone={zone.zone as Zone} active={zone.effective_mmhg > 0} />

      <div className="vnode__body">
        <header className="vnode__head">
          <h3 className="vnode__title">{t(`zones.titles.${zone.zone}`)}</h3>
          <span className={`pill ${statusClass}`}>{t(`status.${zone.status}`)}</span>
        </header>

        <div className="vnode__line">
          <span className="vnode__label">
            {serviceMode ? t('device.vnodes.setpoint') : t('device.vnodes.target')}
          </span>
          <input
            className="vnode__input"
            type="number"
            min={0}
            max={ceiling}
            value={draft}
            disabled={disabled}
            aria-label={t(`zones.titles.${zone.zone}`)}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && commit()}
          />
          <span className="u-unit">{t('common.mmhg')}</span>
          <span className="vnode__sep">|</span>
          <span className="vnode__label">{t('device.vnodes.actual')}</span>
          <span className={`vnode__actual ${statusClass}`}>
            {zone.actual_mmhg == null
              ? t('common.emDash')
              : t('units.pressure', { value: zone.actual_mmhg })}
          </span>
        </div>

        {!serviceMode && (
          <div className="vnode__line vnode__line--sub">
            <span className="vnode__label">{t('device.vnodes.trim')}</span>
            <span className={trim.meaningful ? '' : 'vnode__trim--muted'}>
              {trim.label ?? t('common.emDash')}
              {trim.deltaLabel && ` ${trim.deltaLabel}`}
              {trim.label && !trim.meaningful && ` · ${t('device.vnodes.belowDeadband')}`}
            </span>
            <span className="vnode__sep">|</span>
            <span className="vnode__label">{t('device.vnodes.effective')}</span>
            <span className="vnode__effective">
              {t('units.pressure', { value: zone.effective_mmhg })}
            </span>
          </div>
        )}

        <div className="vnode__line vnode__line--fsr">
          <span className="vnode__label">{t('device.vnodes.fsrLeft')}</span>
          {renderFsr(left)}
          <span className="vnode__sep">|</span>
          <span className="vnode__label">{t('device.vnodes.fsrRight')}</span>
          {renderFsr(right)}
        </div>
      </div>
    </article>
  );
}
