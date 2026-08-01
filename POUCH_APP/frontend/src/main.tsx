import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';

// The design is set in Source Sans. Bundled as a dependency rather than linked
// from a CDN: the tablets run on an isolated network, where a webfont fetch would
// silently fall back to a system face and break the design everywhere at once.
import '@fontsource-variable/source-sans-3';

import { router } from './app/routes';
import './i18n';
import './styles/global.scss';

const container = document.getElementById('root');
if (!container) throw new Error('#root not found');

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
