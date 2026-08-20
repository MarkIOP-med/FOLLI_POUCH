import { useTranslation } from 'react-i18next';

import { CanvasSelect } from '@/components/CanvasSelect';
import { batteryArt } from '@/domain/diagnosticsAssets';
import { formatClockDuration } from '@/domain/status';
import type { HeaderBandProps } from './HeaderBand.types';
import './HeaderBand.scss';

/** Title, user selector, unit power, link state and session runtime. */
export function HeaderBand({
  version,
  users,
  selectedUserId,
  onSelectUser,
  selectDisabled = false,
  consoleId,
  pouchId,
  connected,
  sessionElapsedS,
  pouchBatteryPercent = null,
  consoleBatteryPercent = null,
}: HeaderBandProps) {
  const { t } = useTranslation();

  const selected = users.find((u) => u.id === selectedUserId) ?? null;
  const runtime = formatClockDuration(sessionElapsedS);

  const renderBattery = (
    kind: 'pouch' | 'console',
    percent: number | null,
    labelKey: string,
    id: string | null,
  ) => {
    const art = batteryArt(percent);
    return (
      <div className={`header-band__unit header-band__unit--${kind}`}>
        <div className="header-band__level">
          {percent == null ? (
            <>
              <span className="header-band__muted">{t('diagnostics.noData')}</span>
              <span
                className="header-band__battery-none"
                aria-label={t('common.notReported')}
              />
            </>
          ) : (
            <>
              <span>{percent}%</span>
              <img className="header-band__battery-icon" src={art ?? undefined} alt="" />
            </>
          )}
        </div>
        <div className="header-band__id-line">
          {t(labelKey, { id: id ?? t('diagnostics.noData') })}
        </div>
      </div>
    );
  };

  return (
    <section className="header-band">
      <h1 className="header-band__title">
        {t('diagnostics.title')}
        <span className="header-band__version">
          {t('diagnostics.version', { version })}
        </span>
      </h1>

      {/* The link state sits on the title row in the mockup, not beside the user
          selector below it. */}
      <div className="header-band__link">
        <span
          className={`header-band__dot${connected ? '' : ' header-band__dot--off'}`}
          aria-hidden="true"
        />
        {connected
          ? t('diagnostics.header.connected')
          : t('diagnostics.header.disconnected')}
      </div>

      <label className="header-band__user-label" htmlFor="header-user">
        {t('diagnostics.header.user')}
      </label>
      {/* In-canvas dropdown: a native select popup ignores the canvas's
          transform scale and renders at OS-scaled design pixels — on the bench
          that meant a full-screen menu. */}
      <CanvasSelect
        id="header-user"
        className="header-band__select"
        disabled={selectDisabled}
        value={selectedUserId != null ? String(selectedUserId) : ''}
        placeholder={t('diagnostics.noData')}
        ariaLabel={t('diagnostics.header.user')}
        options={users.map((user) => ({ value: String(user.id), label: user.name }))}
        onChange={(v) => onSelectUser(v === '' ? null : Number(v))}
      />

      <div className="header-band__id">
        <span>{t('diagnostics.header.id')}</span>
        <span>{selected?.nationalId ?? t('diagnostics.noData')}</span>
      </div>

      {renderBattery('pouch', pouchBatteryPercent, 'diagnostics.header.pouch', pouchId)}
      {renderBattery(
        'console',
        consoleBatteryPercent,
        'diagnostics.header.console',
        consoleId,
      )}

      <div className="header-band__user-large">
        <span>{t('diagnostics.header.userLarge')} </span>
        {selected?.name ?? t('diagnostics.noData')}
      </div>

      <div className="header-band__runtime">
        {t('diagnostics.header.sessionRuntime', {
          value: runtime ?? t('diagnostics.noData'),
        })}
      </div>
    </section>
  );
}
