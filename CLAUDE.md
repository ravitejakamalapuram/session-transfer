# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Session Transfer is a Manifest V3 Chrome extension that moves one site's login (cookies, localStorage,
sessionStorage, IndexedDB, Cache Storage) to another browser as an encrypted package, or exports it as a
Playwright `storageState`. `signal/` is a small Cloudflare Worker used only by the live WebRTC transfer.

## Commands

All extension work happens in `extension/` (Node 20).

```bash
cd extension
npm ci
npm run build        # tsc --noEmit + vite build -> dist/ (load unpacked from here)
npm run dev          # HMR dev build
npm run zip          # build + package session-transfer-vX.Y.Z.zip
npm test             # builds tests with vite.test.config.ts into test-dist/, then node --test
node --test test-dist/crypto.test.js                     # one unit test file (after npm test has built it)
npm run test:e2e     # Playwright acceptance suite; builds dist/ with VITE_SIGNAL_URL=http://127.0.0.1:8787 first
npx playwright test e2e/send-flow.spec.ts -g "<name>"    # one e2e test (dist/ must already be built)
npm run build && STORE_ASSETS=1 TZ=UTC npx playwright test e2e/store-shots.spec.ts   # regenerate store screenshots

cd ../signal && npm test   # Worker tests, node --test, no dependencies
```

Unit tests are not discovered by glob: a new `*.test.ts(x)` file must be added to `rollupOptions.input` in
`extension/vite.test.config.ts` or it never runs. There is no linter; `tsc --noEmit` (strict) is the check.

## Architecture

- `src/core/` is browser-agnostic shared logic: package format and types (`types.ts`), AES-256-GCM +
  PBKDF2 (600k iterations) and transfer-code generation using Web Crypto only (`crypto.ts`), sensitive-key
  classification (`secret-detection.ts`), a value-scrubbing logger (`logger.ts`), Playwright export
  (`storage-state.ts`), and the popup <-> background protocol (`messages.ts`).
- `src/background/service-worker.ts` does all the work: detect, collect, inspect, restore. The popup talks
  to it over a long-lived Port (`PORT_NAME`) that streams progress. Packages above the 64 MiB port limit
  are sent as `packageChunk` messages (`CIPHERTEXT_CHUNK_CHARS`) before the `inspect`/`restore` request.
- `src/background/injected.ts` holds self-contained functions injected on demand via `chrome.scripting`
  into the page to collect/restore page-context storage (structured-clone tagging lives here). They must
  not import or close over anything, since they are serialized into the page.
- `src/background/cookie-manager.ts` handles `chrome.cookies` (HttpOnly/Secure/partitioned).
- `src/popup/` is the React UI with no business logic: `App.tsx` is a screen state machine; `port.ts` and
  `live-port.ts` are the port clients; `ready.tsx` keeps the last result in `chrome.storage` while the popup
  is closed.
- Live transfer ("Send to another computer"): `src/offscreen/offscreen.ts` owns the `RTCPeerConnection`
  (the service worker has no WebRTC, and the popup closes on blur). `core/live.ts` frames the package
  over the data channel; `core/signal-client.ts` swaps SDP through `signal/`. The feature is dormant unless
  `SIGNAL_URL` (from `VITE_SIGNAL_URL` at build time) is set.
- `manifest.config.ts` (crxjs) generates the manifest; the version comes from `extension/package.json`.
  Each permission is justified in a comment there, and CSP forbids eval and remote code.

Invariants to keep: packages are origin-bound and accepted for only 5 minutes; encryption is on by default
("Skip the code" is the opt-in plain mode); nothing is sent off-device except the opt-in live transfer's
SDP; secret values are never displayed or logged (use `logger.ts`). Passkeys/WebAuthn, hardware-backed and
TLS-bound state cannot be moved, and the UI must say so. See `extension/docs/threat-model.md` and
`extension/docs/browser-state-capabilities.md`.

## Release and CI

- CI and releases are reusable workflows from `ravitejakamalapuram/release-platform@v2`, configured by
  `release.yaml` (test, e2e, build, Chrome target). Merging to `main` auto-publishes to the Chrome Web Store.
- Store listing copy lives in `chrome-store/store.config.json`, `extension/store-listing.md`,
  `CHROMEWEBSTORE.md` and `edge-store/`. `PRIVACY.md` is the source of the public privacy policy.
- Never commit locally rendered store screenshots: CI compares them and renderer differences fail it.
  Dispatch `.github/workflows/store-screenshots.yml` on the branch instead.
- Plans go in `docs/plans/YYYY-MM-DD-slug.md` as their own docs PR; implementation follows separately.
- Changes to crypto, cookie/session handling, manifest permissions, the release workflow or `PRIVACY.md`
  need a formal CodeRabbit approval (`.coderabbit.yaml`) before merge; never self-merge them.
