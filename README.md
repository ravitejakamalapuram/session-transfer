# Session Transfer

A Manifest V3 Chrome extension that securely moves an **authenticated browser
session** (cookies, localStorage, sessionStorage, IndexedDB and Cache Storage)
from one Chrome profile, browser or device to another.

> Export Session → Encrypt → Transfer → Import → Restore → Verify → Reload → you're logged in.

- **AES-256-GCM** encryption with a one-time transfer code (PBKDF2-SHA256 key derivation).
- **Fully local** — no server, no account, no telemetry. The package is an
  encrypted file; the code is required to decrypt it.
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
