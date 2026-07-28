import { useTranslation } from 'react-i18next';

import { GAUGE, arcGeometry } from './Gauge.lib';
import type { GaugeProps } from './Gauge.types';
import './Gauge.scss';

/** Arc dial used by the Manifold Diagnostic block. */
export function Gauge({ label, value, max, fault = false }: GaugeProps) {
  const { t } = useTranslation();
  const { track, fill, needle } = arcGeometry(value, max, fault);

  return (
    <div className={`gauge${fault ? ' gauge--fault' : ''}`}>
      <svg viewBox="0 0 90 78" width="90" height="78" role="img" aria-label={label}>
        <path className="gauge__track" d={track} />
        {fill && <path className="gauge__fill" d={fill} />}
        <line
          className="gauge__needle"
          x1={GAUGE.cx}
          y1={GAUGE.cy}
          x2={needle[0]}
          y2={needle[1]}
        />
        <circle className="gauge__hub" cx={GAUGE.cx} cy={GAUGE.cy} r="3" />
        <text className="gauge__value" x={GAUGE.cx} y={70} textAnchor="middle">
          {fault || value == null ? t('common.emDash') : value}
        </text>
      </svg>
      <div className="gauge__label">{label}</div>
    </div>
  );
}
