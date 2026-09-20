# Session Transfer — Chrome Extension

Securely move an **authenticated browser session** (cookies, localStorage,
sessionStorage, IndexedDB and Cache Storage) from one Chrome profile / instance /
device to another with a near one-click experience.

> **Export Session → Encrypt → Transfer → Import → Restore → Verify → Reload → you're logged in.**

- **Manifest V3**, TypeScript (strict), React popup, Vite build.
- **AES-256-GCM** encryption with a one-time transfer code (PBKDF2-SHA256 key derivation).
- **Fully local** — no server, no account, no telemetry. The package is just an
  encrypted file; the code is required to decrypt it.
- **Honest** about what cannot be transferred (WebAuthn/passkeys, hardware credentials, TLS state).

## How it works

**Source browser** → open the site → click the extension → **Transfer Session**.
The extension collects state, serializes it (structured-clone-aware), encrypts it, and
gives you a one-time **code** + a downloadable **`.stpkg`** package.

**Destination browser** → click the extension → **Receive Session** → load the package
+ enter the code → **Import Session**. State is validated, restored into the site's own
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
│   ├── tab-utils.ts         # active/destination tab resolution
│   └── extension-storage.ts # encrypted, auto-expiring destination backups
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
| `tabs` | Resolve the active tab and open/navigate the destination tab. |
| `storage` | Store encrypted, auto-expiring local backups before an overwrite. |
| `host_permissions: http/https` | The user may transfer *any* origin's session, so a fixed host list is impossible. No `<all_urls>` content scripts run automatically — injection is on-demand and user-initiated only, and state is strictly origin-bound. |

CSP: `script-src 'self'; object-src 'self'; base-uri 'self'` — no `eval`, no remote code.

## Development

```bash
cd extension
yarn install
yarn dev        # HMR dev build (loads dist/ into Chrome)
yarn build      # type-check + production build -> dist/
yarn zip        # build + package -> session-transfer-vX.Y.Z.zip
```

## Load in Chrome

1. `yarn build` (or unzip the released `.zip`).
2. Open `chrome://extensions`.
3. Enable **Developer mode** (top-right).
4. **Load unpacked** → select the `extension/dist` folder (or the unzipped folder).
5. Pin **Session Transfer** to the toolbar.

## Try it end-to-end

1. Log into any site in Chrome **Profile A**.
2. Click the extension → **Transfer Session** → note the code, download the package.
3. Switch to **Profile B** (same or different machine) with the extension installed.
4. Click the extension → **Receive Session** → load the package + enter the code → **Import Session**.
5. The site tab opens/reloads authenticated. A verification report confirms the counts.

## Roadmap (post-MVP)

- Transport abstraction implementations (QR pairing, one-time code relay, WebRTC).
- `test-app/` fixture site + Playwright E2E across cookie/localStorage/IDB apps.
- Merge-conflict field-level diffing.

## Security

This handles data equivalent to passwords. Read the
[threat model](docs/threat-model.md). Never share your transfer code over the same
channel as the package.
