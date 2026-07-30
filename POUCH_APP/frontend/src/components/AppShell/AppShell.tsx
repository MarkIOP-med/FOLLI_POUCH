import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import './AppShell.scss';

/** Chrome shared by every route: brand, primary navigation, content outlet. */
export function AppShell() {
  const { t } = useTranslation();

  return (
    <div className="app-shell">
      <nav className="app-shell__nav">
        <span className="app-shell__brand">{t('app.brand')}</span>
        <NavLink className="app-shell__link" to="/" end>
          {t('app.nav.board')}
        </NavLink>
        <NavLink className="app-shell__link" to="/patients">
          {t('app.nav.patients')}
        </NavLink>
        <NavLink className="app-shell__link" to="/settings">
          {t('app.nav.settings')}
        </NavLink>
      </nav>

      <main>
        <Outlet />
      </main>
    </div>
  );
}
