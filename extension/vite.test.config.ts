import { defineConfig } from 'vite';

// Builds the tests for `node --test` (npm test). Kept apart from vite.config.ts so the crx
// plugin stays out, and uses only tooling already in package.json.
export default defineConfig({
  build: {
    ssr: 'src/popup/ready.test.tsx',
    outDir: 'test-dist',
    emptyOutDir: true,
    target: 'node20',
  },
  logLevel: 'warn',
});
