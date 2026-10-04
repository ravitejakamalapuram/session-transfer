#!/usr/bin/env bash
# Builds the extension and shoots the real popup into src/ (needs `npm ci` in ../../extension).
set -euo pipefail
cd "$(dirname "$0")"
(cd ../../extension && npx vite build >/dev/null)
../../extension/node_modules/.bin/playwright test -c playwright.config.cjs
