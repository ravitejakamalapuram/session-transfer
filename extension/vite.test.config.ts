import { defineConfig } from 'vite';

// Builds the tests for `node --test` (npm test). Kept apart from vite.config.ts so the crx
// plugin stays out, and uses only tooling already in package.json.
export default defineConfig({
  build: {
    ssr: true,
    rollupOptions: { input: { 'ready.test': 'src/popup/ready.test.tsx', 'review-ask.test': 'src/popup/review-ask.test.tsx', 'crypto.test': 'src/core/crypto.test.ts', 'storage-state.test': 'src/core/storage-state.test.ts', 'welcome.test': 'src/background/welcome.test.ts', 'live.test': 'src/core/live.test.ts', 'signal-client.test': 'src/core/signal-client.test.ts' } },
    outDir: 'test-dist',
    emptyOutDir: true,
    target: 'node20',
  },
  logLevel: 'warn',
});
