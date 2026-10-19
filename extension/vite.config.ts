import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.config';

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  build: {
    target: 'es2022',
    sourcemap: false,
    // The offscreen page is opened at runtime, so the manifest does not list it.
    rollupOptions: { input: { offscreen: 'offscreen.html' } },
  },
  server: {
    cors: { origin: [/chrome-extension:\/\//] },
  },
});
