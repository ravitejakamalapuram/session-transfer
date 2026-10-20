# Chrome Web Store Listing & Publishing Record

*Last Updated: 2026-10-17 (listing copy only; the status, version and release history below are not re-checked)*

---

## 1. Extension Information
- **Name**: Session Transfer
- **Extension ID**: `fnfmlchbfofjdfeibgdkcibfjjlfcefc`
- **Publisher ID**: `9637cb78-fa33-49dd-a4cb-91066ff182e3`
- **Version**: `1.2.1`
- **Manifest Version**: `MV3`
- **Language**: `English`
- **Category**: `Productivity`
- **Status**: `Pending review`

---

## 2. Store Listing Copy

### Title (max 75 characters)
> Session Transfer – Copy Login to Another Chrome Profile

Chosen by the owner on 2026-10-17 so the title carries the words people search for. The toolbar tooltip and the popup header still say `Session Transfer`. Keep `name` in `extension/manifest.config.ts`, `chrome-store/store.config.json` and `app-metadata.json` the same.

### Short Description (max 132 characters)
> Move your login (cookies + storage) to another Chrome profile or computer, encrypted. Or export a plain Playwright storageState.

### Detailed Description
```markdown
Move your login to another browser or profile: Session Transfer copies a logged-in website session (cookies, localStorage, sessionStorage, IndexedDB and Cache Storage) to another Chrome profile, Chrome browser or computer. Use it to transfer cookies between Chrome profiles, or to save a site's login as a Playwright storageState file for automated tests.

No servers unless you use the live transfer beta, no account, no analytics. Copy and file transfer make no network requests. Live transfer pairs the two browsers through a signalling server that sees your IP address, browser user agent and connection details (SDP), never the session or the code. Privacy policy: https://ravitejakamalapuram.github.io/session-transfer.html

HOW IT WORKS
1. In the source browser, open the site, click the extension and press "Transfer Session".
2. The extension packs the site's cookies (including HttpOnly), localStorage, sessionStorage, IndexedDB and Cache Storage into one package that you copy or download, encrypted with a transfer code by default.
3. In the destination browser, press "Receive Session" paste or load the package and enter the transfer code if it asks for one. The session is restored, the page reloads, and the popup shows a verification report of what was written.

PRIVACY AND LIMITS
• Encrypted by default with AES-256-GCM, using a key derived from a transfer code you send on another channel (PBKDF2-SHA256, 600,000 iterations). "Skip the code (same computer only)" makes a plain package instead; treat that like a password.
• Packages expire 5 minutes after export. The receiver allows up to 1 extra minute for clock differences between computers.
• Encrypted packages restore only into the website origin they were exported from (the origin is bound as AEAD authenticated data). A "Skip the code" package has no tamper detection; the extension still checks its origin before restoring.
• If the destination already has a session, you choose Replace, Merge or Cancel; nothing is overwritten silently.
• Passkeys/WebAuthn, hardware-backed credentials and TLS-bound state cannot be transferred, and the popup says so. Some sites tie a session to a device and may still ask you to sign in.

FOR DEVELOPERS AND QA
• "Export for Playwright" (under More options) saves the current site's cookies (except partitioned CHIPS cookies) and localStorage as a plain (unencrypted) Playwright storageState .json file, so automated tests can start already logged in. sessionStorage and IndexedDB are not included, and the file holds live logins.
• Signing in through another site? Add its host name (up to 5) under More options and its cookies are added to the package.

IDEAL FOR
• Moving a session between Chrome profiles for the same site.
• Switching to a new computer or Chrome browser.
• QA teams reproducing logged-in states.

Threat model (what the extension protects against and what it does not): https://github.com/ravitejakamalapuram/session-transfer/blob/main/extension/docs/threat-model.md
```

---

## 3. Permissions Justifications (Required for Review)

Google review requires specific plain-English justification for each declared permission:

| Permission | Used in Code? | Sample Evidence | Required? | Risk | Plain-English Review Justification |
| :--- | :---: | :--- | :---: | :---: | :--- |
| `cookies` | Yes | assets/service-worker.ts-JeVUT3mP.js:1 | Yes | HIGH | Reading and restoring cookies (including HttpOnly/Secure) is the core mechanism for transferring authenticated sessions. Cookies are accessed only for the selected origin and for up to 5 host names the user adds under More options. |
| `scripting` | Yes | assets/service-worker.ts-JeVUT3mP.js:1 | Yes | MEDIUM | Used to run an on-demand, user-initiated collect/restore function in the active tab to read/write that origin's localStorage, sessionStorage, IndexedDB and Cache Storage. No code runs automatically on page load. |
| `storage` | Yes | assets/service-worker.ts-JeVUT3mP.js:1 | Yes | LOW | Keeps the on-device setting and a short-lived ready result while the popup is closed. Never synced, never transmitted. |
| `host_permissions` | Yes | http://*/* | Yes | HIGH | The product's purpose is transferring sessions for any website the user is logged into, so a fixed host list is impossible. Access is on-demand (user clicks the toolbar action), page scripting is limited to the selected origin, cookie reads also cover up to 5 host names the user adds under More options, and restore targets the package's own origin: encrypted packages bind that origin as AEAD authenticated data, while plain ("Skip the code") packages have no tamper detection and rely on an extension-side origin check. |

---

## 4. Privacy & Data Use Disclosure

- **Data Flow**:
  User clicks the toolbar action (Transfer / Receive)
  ⬇
  Popup UI ↔ background service worker (on-demand, user-initiated injection into the selected tab only)
  ⬇
  Cookies + origin storage for the selected site are packaged locally (encrypted by default: AES-256-GCM, PBKDF2-SHA256)
  ⬇
  `.stpkg` file saved by the user
  ⬇
  No network transmission for copy and file transfer. The live transfer beta sends only connection details (room id, SDP, IP addresses, user agents) to a signalling server; the package goes browser to browser, encrypted

- **Data Handling Summary**:
  - **Authentication information (cookies, site storage)**: Collected: Yes, only for the site the user selects and only when the user clicks Transfer | Stored: Only inside the user-downloaded package (encrypted by default; plain only if the user turns on "Skip the code") | Purpose: Move the user's own logged-in session to another browser/profile. Never transmitted to the developer or any third party.
  - **Website content**: Collected: No | Stored: No | Purpose: None — page content is not read beyond the selected origin's storage.
  - **Analytics & Telemetry**: Collected: No | Stored: No | Purpose: None collected.

- **Privacy Policy URL**: `https://ravitejakamalapuram.github.io/session-transfer.html`

### Live transfer beta: data disclosure

"Send to another computer (beta)" sends IP addresses, user agents and WebRTC connection details (SDP) to the developer's signalling Worker on Cloudflare; the Worker keeps a room for at most 5 minutes and never receives the package or code. Before submitting a build that includes it, re-review these Privacy-tab answers (not yet changed here, because they are unverified against the dashboard):

- "Does NOT collect or transmit user data" (`extension/store-listing.md`, Data usage disclosures) and "all processing is local".
- Whether IP address counts under the dashboard's data categories (check the Location and Personally identifiable information definitions on the day).
- The privacy policy URL must serve the updated PRIVACY.md first.

The Authentication information and Website content answers stay "not transmitted to the developer".

---

## 5. Store Assets Checklist

- [x] Extension Icon (128×128 PNG): `extension/icons/icon128.png`
- [ ] Primary Screenshot (1280×800 PNG): `extension/store-assets/screenshot-home.png`
- [ ] Promotional Tile (440×280 PNG): `extension/store-assets/tile-small-440x280.png`
- [ ] Marquee Promo (1400×560 PNG): `extension/store-assets/tile-marquee-1400x560.png`

---

## 6. Pre-Publish Checklist

- [x] Manifest V3 compliance verified
- [x] No `eval()` or remotely hosted code
- [x] No secrets, private keys, or API tokens in package
- [x] Distributable archive contains `manifest.json` at root
- [x] Extension registered in Chrome Web Store Developer Dashboard
- [x] Privacy policy hosted and validated on GitHub Pages
- [x] Final submission completed for review

---

## 7. Release History

| Version | Date | Status | Package ZIP | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `1.2.0` | 2026-09-20 | Rejected | `session-transfer-v1.2.0.zip` | Rejected under Purple Nickel due to third-party preview privacy URL |
| `1.2.1` | 2026-09-22 | Pending review | `session-transfer-v1.2.1.zip` | Fixed privacy policy URL to dedicated GitHub Pages site and resubmitted |
