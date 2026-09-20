# Session Transfer — PRD

## Original problem statement
Build a production-quality Manifest V3 Chrome extension that transfers the authenticated
state of a web app (cookies, localStorage, sessionStorage, IndexedDB, Cache Storage) from
one Chrome browser/profile/device to another with a near one-click experience:
Export → Encrypt → Transfer → Import → Restore → Verify → Reload → authenticated.
Security-first (AES-GCM, ephemeral keys, no cloud/telemetry, origin isolation), honest
about non-transferable state (WebAuthn/passkeys, hardware creds, TLS).

## User choices (gathered)
- Transport (MVP): one-time code + encrypted file/copy-paste package. Prove the hard part
  first (collect ↔ restore real state); transport is a separate later problem.
- Storage scope: FULL — cookies + localStorage + sessionStorage + IndexedDB + Cache Storage.
- Local test-app (`test-app/`): defer to after Chrome Web Store push.
- Testing: minimal, build & work manually.
- Delivery: source + build instructions + hosted demo page (fully published package w/ demo).

## Architecture
- **Extension** (`/app/extension`): Vite + TypeScript (strict) + React 18, Manifest V3,
  built with `@crxjs/vite-plugin`. Web Crypto only.
  - `src/core`: types, crypto (AES-256-GCM + PBKDF2-SHA256 + code gen), messages, logger
    (value-scrubbing), secret-detection, encoding.
  - `src/background`: service-worker (orchestration over a streaming Port), cookie-manager,
    injected page functions (self-contained collect/restore/detect with structured-clone
    serializer), tab-utils, extension-storage (encrypted auto-expiring backups).
  - `src/popup`: React screen state machine (home → collect → ready / receive → inspect →
    conflict/origin-mismatch → restore → verify), port client, UI components.
  - `docs/`: browser-state-capabilities.md, threat-model.md. README + Web Store checklist.
- **Hosted demo** (`/app/frontend`, CRA): dark security-themed landing page + a genuine
  interactive simulator that runs the real Web Crypto pipeline in-page; serves the packed
  `session-transfer-v1.2.0.zip` for download from `/public`.
- **Backend** (`/app/backend`): unchanged starter (not required for this product).

## Implemented (2026-06)
- Full collect→serialize→encrypt→package→decrypt→validate→restore→verify→reload pipeline.
- All 5 storage mechanisms, structured-clone-aware IndexedDB serializer (Date/ArrayBuffer/
  TypedArray/Blob/Map/Set/nested) — verified via standalone Node roundtrip.
- AES-256-GCM + PBKDF2 with origin bound as AAD; wrong-code & tampered-origin rejected
  (verified). One-time code, 5-min expiry, encrypted auto-expiring backups.
- Origin isolation + explicit origin-mismatch confirmation, conflict handling
  (replace/merge/cancel + backup), post-import verification report.
- Popup UI with progress, details, unsupported-state disclosure. data-testids throughout.
- Extension builds (`yarn build`) and packs (`yarn zip` → ~80 KB zip).
- Hosted landing/demo page with working AES-GCM simulator + zip download.
- **Chrome Web Store prep (done)**: 4 store screenshots (1280×800), small promo tile
  (440×280) + marquee (1400×560) in `extension/store-assets/` (rendered via local headless
  Chrome from faithful popup UI replicas); hosted **Privacy Policy** page at `/privacy`;
  complete submission playbook with all copy + permission justifications in
  `extension/store-listing.md`. Checklist updated in `CHROME_WEB_STORE_CHECKLIST.md`.

## Backlog (P1/P2)
- P1: `test-app/` fixture site (Set Cookie/LS/SS/IDB/Cache) + Playwright E2E across apps.
- P1: Transport implementations behind `TransferTransport` (QR pairing, one-time-code relay, WebRTC).
- P2: Chunked protocol for very large payloads; field-level merge diffing.
- P2: Cross-Chromium (Edge/Brave/Arc) adapter validation.
- P2: Chrome Web Store listing assets (screenshots, promo tiles) + submission.

## Notes
- No auth, no backend dependency, no telemetry. Sensitive values never logged/displayed.
- Extension cannot be automated in this pod (needs Chrome extension runtime) — manual load-unpacked test expected.
