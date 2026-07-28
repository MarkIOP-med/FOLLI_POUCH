import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';

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
