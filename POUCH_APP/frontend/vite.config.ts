import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const src = fileURLToPath(new URL('./src', import.meta.url));
const sharedAssets = fileURLToPath(new URL('../../SHARED_ASSETS', import.meta.url));

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      // Same artwork the console uses. Vite resolves straight out of SHARED_ASSETS —
      // unlike Metro, it has no problem with files above the project root, so the web
      // app needs no synced copy. See ../../SHARED_ASSETS/README.md.
      '@shared-assets': sharedAssets,
      '@': src,
    },
  },

  css: {
    preprocessorOptions: {
      scss: {
        // Design tokens and mixins are available in every stylesheet without each
        // one repeating the same two @use lines. Component .scss files therefore
        // must NOT @use these themselves.
        additionalData: `@use "@/styles/tokens" as *;\n@use "@/styles/mixins" as *;\n`,
      },
    },
  },

  server: {
    port: 5173,
    fs: {
      // The dev server refuses to serve files outside the project root unless they
      // are explicitly allowed.
      allow: ['..', sharedAssets],
    },
    // SSE and REST both go to the FastAPI backend. Proxying keeps the frontend
    // origin-relative so no CORS handling is needed in the browser.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
});
