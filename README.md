# Session Transfer

A Manifest V3 Chrome extension that securely moves an **authenticated browser
session** (cookies, localStorage, sessionStorage, IndexedDB and Cache Storage)
from one Chrome profile, browser or device to another.

> Export Session → Encrypt → Transfer → Import → Restore → Verify → Reload → you're logged in.

- **AES-256-GCM** encryption, always on. By default the key is inside the copied
  text or downloaded file, so treat it like a password. An optional setting,
  **Require a separate transfer code (more secure)**, derives the key from a
  code you send on a second channel (PBKDF2-SHA256).
- **Fully local** — no server, no account, no telemetry. Packages are only
  accepted by the extension for 5 minutes.
- **Origin-bound** — a package can only be restored into its own website origin.
- **Honest** about what cannot be transferred (WebAuthn/passkeys, hardware credentials, TLS state).

## Repository layout

| Path | Contents |
|------|----------|
| [`extension/`](extension/) | The extension source (TypeScript, React popup, Vite build). See [`extension/README.md`](extension/README.md) for architecture, permissions and development instructions. |
| [`extension/docs/`](extension/docs/) | [Browser state capabilities](extension/docs/browser-state-capabilities.md) and [threat model](extension/docs/threat-model.md). |
| [`extension/store-listing.md`](extension/store-listing.md), [`CHROMEWEBSTORE.md`](CHROMEWEBSTORE.md) | Chrome Web Store listing copy and publishing record. |
| `.github/workflows/` | CI/CD: builds `extension/dist` and publishes via the shared Chrome extension workflows. |

## Quick start

```bash
cd extension
yarn install
yarn build      # type-check + production build -> extension/dist
yarn zip        # build + package -> session-transfer-vX.Y.Z.zip
```

Then open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**
and select `extension/dist`.

## Privacy

Privacy policy: <https://ravitejakamalapuram.github.io/session-transfer.html>

Session Transfer handles data equivalent to passwords. Never share the transfer
code over the same channel as the package.
