import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import type { AdminActionsProps, AdminConfirmKind } from './AdminActions.types';
import './AdminActions.scss';

/** Right column of the overview: destructive and prescription-level actions. */
export function AdminActions({
  disabled,
  onResetDefaults,
  onSetCurrentDefault,
  onOpenVibration,
  onOpenDefaults,
}: AdminActionsProps) {
  const { t } = useTranslation();
  const [confirm, setConfirm] = useState<AdminConfirmKind | null>(null);

  const run = (action: () => void) => {
    setConfirm(null);
    action();
  };

  return (
    <section className="admin">
      <h2 className="admin__title">{t('device.admin.title')}</h2>

      <button
        type="button"
        className="admin__action"
        disabled={disabled}
        onClick={() => setConfirm('reset')}
      >
        {t('device.admin.resetDefaults')}
        <small>{t('device.admin.resetDefaultsHint')}</small>
      </button>

      <button
        type="button"
        className="admin__action"
        disabled={disabled}
        onClick={() => setConfirm('promote')}
      >
        {t('device.admin.setCurrentDefault')}
        <small>{t('device.admin.setCurrentDefaultHint')}</small>
      </button>

      <button
        type="button"
        className="admin__action"
        disabled={disabled}
        onClick={onOpenVibration}
      >
        {t('device.admin.setVibration')}
        <small>{t('device.admin.setVibrationHint')}</small>
      </button>

      <button
        type="button"
        className="admin__action"
        disabled={disabled}
        onClick={onOpenDefaults}
      >
        {t('device.admin.changeDefaults')}
        <small>{t('device.admin.changeDefaultsHint')}</small>
      </button>

      {confirm === 'reset' && (
        <div className="admin__confirm">
          <p>{t('device.admin.confirmReset')}</p>
          <div className="admin__confirm-actions">
            <button type="button" className="btn" onClick={() => run(onResetDefaults)}>
              {t('device.admin.confirmResetAction')}
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setConfirm(null)}
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      {confirm === 'promote' && (
        <div className="admin__confirm admin__confirm--warn">
          {/*
            The ratchet, made explicit. Promoting effective into Rx consumes the trim;
            doing it every session is how 40 becomes 70 with nobody at fault.
          */}
          <p>
            <Trans i18nKey="device.admin.confirmPromoteLead" components={{ 1: <strong /> }} />
          </p>
          <p className="u-note">{t('device.admin.confirmPromoteNote')}</p>
          <div className="admin__confirm-actions">
            <button
              type="button"
              className="btn"
              onClick={() => run(onSetCurrentDefault)}
            >
              {t('device.admin.confirmPromoteAction')}
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setConfirm(null)}
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
