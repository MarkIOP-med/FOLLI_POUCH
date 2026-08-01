import { useEffect, useState } from 'react';

import './MockupOverlay.scss';

/**
 * Development-only comparison layer: pins the designer's render for the current
 * screen on top of the live canvas so any drift shows up as a ghost.
 *
 * Enabled with `?overlay=1`; `&op=` sets opacity and `&diff=1` switches to
 * difference blending, where a perfect match renders pure black. The mockups are
 * fetched straight off disk through Vite's /@fs route (see __MOCKUP_DIR__ in
 * vite.config.ts) so none of these 2MB renders reach a production build.
 *
 * Press `o` to toggle, `d` to switch blend mode, `[` / `]` to change opacity.
 */
const PAGES: Record<string, string> = {
  '/': 'diagnostics_ui_04_PAGE_01.jpeg',
  '/home': 'diagnostics_ui_04_PAGE_01.jpeg',
  '/diagnostics': 'diagnostics_ui_04_PAGE_02.png',
  '/users': 'diagnostics_ui_04_PAGE_03.png',
  '/admin': 'diagnostics_ui_04_PAGE_04.png',
};

function mockupFor(pathname: string): string | null {
  const base = '/' + (pathname.split('/')[1] ?? '');
  return PAGES[pathname] ?? PAGES[base] ?? null;
}

export function MockupOverlay() {
  const params = new URLSearchParams(window.location.search);
  const [on, setOn] = useState(params.get('overlay') === '1');
  const [diff, setDiff] = useState(params.get('diff') === '1');
  const [opacity, setOpacity] = useState(Number(params.get('op') ?? 0.5));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'o') setOn((v) => !v);
      if (e.key === 'd') setDiff((v) => !v);
      if (e.key === '[') setOpacity((v) => Math.max(0, v - 0.1));
      if (e.key === ']') setOpacity((v) => Math.min(1, v + 0.1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const file = mockupFor(window.location.pathname);
  if (!on || !file) return null;

  return (
    <img
      className={`mockup-overlay${diff ? ' mockup-overlay--diff' : ''}`}
      src={`${__MOCKUP_DIR__}/${file}`}
      style={{ opacity: diff ? 1 : opacity }}
      alt=""
    />
  );
}
