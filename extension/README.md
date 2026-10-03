# Session Transfer — Chrome Extension

Securely move an **authenticated browser session** (cookies, localStorage,
sessionStorage, IndexedDB and Cache Storage) from one Chrome profile / instance /
device to another with a near one-click experience.

> **Export Session → Transfer → Import → Restore → Verify → Reload → you're logged in.**

- **Manifest V3**, TypeScript (strict), React popup, Vite build.
- **Plain by default, encrypted on request.** By default the package is not
  encrypted, so treat the copied text or downloaded file like a password. The
  setting **Encrypt with a transfer code (more secure)** encrypts it
  (AES-256-GCM, key derived from a code you send on a second channel,
  PBKDF2-SHA256, 600,000 iterations).
- **Fully local** — no server, no account, no telemetry. Packages are only
  accepted by the extension for 5 minutes.
- **Honest** about what cannot be transferred (WebAuthn/passkeys, hardware credentials, TLS state).

## How it works

**Source browser** → open the site → click the extension → **Transfer Session**.
The extension collects state, serializes it (structured-clone-aware), and
gives you one package to **copy** or **download** (a `.stpkg` file). With
the *Encrypt with a transfer code* setting on, the package is encrypted and you also get a **transfer code** (new for each export) to send
on a different channel. By default there is no encryption and no code: anyone with the text can restore it until it expires after 5 minutes.

**Destination browser** → click the extension → **Receive Session** → paste the package or
load the file → **Import Session** (enter the code only if the package asks for it). State is validated, restored into the site's own
origin, the tab reloads, and a verification report is shown.

See [`docs/browser-state-capabilities.md`](docs/browser-state-capabilities.md) and
[`docs/threat-model.md`](docs/threat-model.md).

## Architecture

```
src/
├── core/            # shared, browser-agnostic logic
│   ├── types.ts             # domain types + package format
│   ├── crypto.ts            # AES-GCM + PBKDF2 + code generation (Web Crypto only)
│   ├── serializer inline    # structured-clone tagging lives in background/injected.ts
│   ├── secret-detection.ts  # classify sensitive keys (never display/log values)
│   ├── logger.ts            # value-scrubbing safe logger
│   ├── encoding.ts          # base64 helpers
│   └── messages.ts          # popup <-> background port protocol
├── background/      # service worker (all heavy work happens here)
│   ├── service-worker.ts    # orchestration: detect / collect / inspect / restore
│   ├── cookie-manager.ts    # chrome.cookies collect + restore
│   ├── injected.ts          # self-contained page functions (collect/restore/detect)
│   └── tab-utils.ts         # active/destination tab resolution
└── popup/           # React UI (no business logic)
    ├── App.tsx              # screen state machine
    ├── port.ts              # streaming port client
    └── components/ui.tsx    # presentational components
```

State collectors/restorers share a common shape so new mechanisms can be added without
touching the transfer engine.

## Permissions (justified)

| Permission | Why |
|-----------|-----|
| `cookies` | Read/write HttpOnly & Secure cookies for the selected origin. |
| `scripting` | Inject on-demand collect/restore functions into the active tab (page-context storage). |
| `storage` | Keep the on-device setting and the short-lived "ready" result while the popup is closed. |
| `host_permissions: http/https` | The user may transfer *any* origin's session, so a fixed host list is impossible. No `<all_urls>` content scripts run automatically — injection is on-demand and user-initiated only, and state is strictly origin-bound. |

CSP: `script-src 'self'; object-src 'self'; base-uri 'self'` — no `eval`, no remote code.

## Development

```bash
cd extension
npm ci
npm run dev    # HMR dev build (loads dist/ into Chrome)
npm run build  # type-check + production build -> dist/
npm run zip    # build + package -> session-transfer-vX.Y.Z.zip
```

## Extras (popup → More options)

- **Export for Playwright (.json)** saves the active site's cookies and localStorage as a Playwright `storageState`
  file (`browser.newContext({ storageState })`). sessionStorage and IndexedDB are not part of that format and
  partitioned cookies are left out. The file holds live logins.
- **Cookies from other sites**: up to 5 plain host names whose cookies are added to the transfer, for sites that sign
  you in through another host. Nothing is added unless typed.

## Tests

```bash
npm test            # unit tests (node:test)
npm run test:e2e    # Playwright acceptance tests (two separate Chrome profiles)
```

In CI the Playwright suite runs from `release.yaml` (`e2e`, `e2e_in_release`): after the Chrome build on every
pull request and again before packaging in a release.

## Load in Chrome

1. `npm run build` (or unzip the released `.zip`).
2. Open `chrome://extensions`.
3. Enable **Developer mode** (top-right).
4. **Load unpacked** → select the `extension/dist` folder (or the unzipped folder).
5. Pin **Session Transfer** to the toolbar.

## Try it end-to-end

1. Log into any site in Chrome **Profile A**.
2. Click the extension → **Transfer Session** → **Copy** the text or **Download file**. (With *Require a separate transfer code* on, also note the code and send it on another channel.)
3. Switch to **Profile B** (same or different machine) with the extension installed.
4. Click the extension → **Receive Session** → paste the package or load the file (+ enter the code if asked) → **Import Session**.
5. The site tab opens/reloads authenticated. A verification report confirms the counts.

## Roadmap (post-MVP)

- Transport abstraction implementations (QR pairing, code relay, WebRTC).
- `test-app/` fixture site + Playwright E2E across cookie/localStorage/IDB apps.
- Merge-conflict field-level diffing.

## Security

This handles data equivalent to passwords. Read the
[threat model](docs/threat-model.md). In the default mode, anyone who has the copied
text or file can restore your session, so do not share it and delete the file after
you import it. With the separate-code setting on, never send the code over the same
channel as the package.
