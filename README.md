# Session Transfer

A Manifest V3 Chrome extension that securely moves an **authenticated browser
session** (cookies, localStorage, sessionStorage, IndexedDB and Cache Storage)
from one Chrome profile, browser or device to another.

> Export Session → Transfer → Import → Restore → Verify → Reload → you're logged in.

- **Plain by default, encrypted on request.** By default the package is not
  encrypted, so treat the copied text or downloaded file like a password. The
  setting **Encrypt with a transfer code (more secure)** encrypts it
  (AES-256-GCM, key derived from a code you send on a second channel,
  PBKDF2-SHA256, 600,000 iterations).
- **Fully local** — no server, no account, no telemetry. Packages are only
  accepted by the extension for 5 minutes.
- **Origin-bound** — a package can only be restored into its own website origin.
- **Honest** about what cannot be transferred (WebAuthn/passkeys, hardware credentials, TLS state).

## Who it is for

- **Switching browsers or computers.** Move a logged-in site without signing in and clearing MFA again.
- **Developers.** Carry a dev, staging or prod session between Chrome profiles.
- **QA and test automation.** Reproduce a logged-in state in a clean profile, or save it for tests with *Export for Playwright* (below).

## Extras (popup → More options)

- **Export for Playwright (.json).** Saves the current site's cookies and localStorage as a Playwright
  `storageState` file, so a test can start already logged in:
  `browser.newContext({ storageState: 'storageState-example.com.json' })`. sessionStorage and IndexedDB are not
  part of that format, and partitioned cookies are left out. The file holds live logins: treat it like a password.
- **Cookies from other sites.** If the site signs you in through another host (for example `accounts.example.com`),
  type its host name (up to 5) and those cookies are added to the transfer. Nothing is added unless you type it.

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
npm ci
npm run build   # type-check + production build -> extension/dist
npm run zip     # build + package -> session-transfer-vX.Y.Z.zip
```

Then open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**
and select `extension/dist`.

## Privacy

Privacy policy: <https://ravitejakamalapuram.github.io/session-transfer.html>

Session Transfer handles data equivalent to passwords. Never share the transfer
code over the same channel as the package.
