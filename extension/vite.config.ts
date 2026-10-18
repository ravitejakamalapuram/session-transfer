import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.config';

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  build: {
    target: 'es2022',
    sourcemap: false,
    // Pages the manifest does not name (the first-install welcome page) must be listed here to be bundled.
    rollupOptions: { input: { welcome: 'welcome.html' } },
  },
  server: {
    cors: { origin: [/chrome-extension:\/\//] },
  },
});
