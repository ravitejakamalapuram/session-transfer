# Chrome Web Store Listing & Publishing Record

*Last Updated: 2026-09-20*

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

### Short Description (max 132 characters)
> Move logged-in browser sessions between Chrome profiles or devices. Optional encryption, fully local. Optional extra code. No cloud.

### Detailed Description
```markdown
Session Transfer moves an authenticated website session from one Chrome browser, profile, or computer to another in a couple of clicks — no re-login, no MFA loop.

HOW IT WORKS
1. On the source browser, open the site, click the extension and press "Transfer Session".
2. The extension captures cookies (including HttpOnly), localStorage, sessionStorage, IndexedDB and Cache Storage, into one package that you copy or download (optionally encrypted with a transfer code).
3. On the destination browser, press "Receive Session", paste or load the package (and enter the transfer code if the package asks for one). State is restored, the page reloads, and a verification report confirms the result.

SECURITY & PRIVACY BY DESIGN
• 100% local — no servers, no accounts, no analytics, no tracking.
• Not encrypted by default, so treat the copied text or file like a password. Turn on "Encrypt with a transfer code" to encrypt it with AES-256-GCM, using a key derived from a code you send on another channel (PBKDF2-SHA256, 600,000 iterations).
• The extension refuses packages older than 5 minutes.
• Strict origin isolation — a package can only ever be restored into its own website origin.
• Existing destination sessions are never silently overwritten: choose Replace, Merge or Cancel.
• Honest about limits: WebAuthn/passkeys, hardware credentials and TLS-bound state cannot be transferred by any extension, and we say so in-product instead of faking success.

IDEAL FOR
• Developers moving authenticated sessions between dev/staging/prod profiles.
• Switching computers or browsers without logging in again.
• QA teams reproducing authenticated states quickly.

Full capability table and threat model are published in the GitHub repository.
```

---

## 3. Permissions Justifications (Required for Review)

Google review requires specific plain-English justification for each declared permission:

| Permission | Used in Code? | Sample Evidence | Required? | Risk | Plain-English Review Justification |
| :--- | :---: | :--- | :---: | :---: | :--- |
| `cookies` | Yes | assets/service-worker.ts-JeVUT3mP.js:1 | Yes | HIGH | Reading and restoring cookies (including HttpOnly/Secure) is the core mechanism for transferring authenticated sessions. Cookies are only accessed for the origin the user explicitly selects. |
| `scripting` | Yes | assets/service-worker.ts-JeVUT3mP.js:1 | Yes | MEDIUM | Used to run a one-time, user-initiated collect/restore function in the active tab to read/write that origin's localStorage, sessionStorage, IndexedDB and Cache Storage. No code runs automatically on page load. |
| `tabs` | Yes | assets/service-worker.ts-JeVUT3mP.js:1 | Yes | MEDIUM | Used to identify the active tab's origin for collection and to open/reload the destination tab during restore. |
| `storage` | Yes | assets/service-worker.ts-JeVUT3mP.js:1 | Yes | LOW | Keeps the on-device setting and a short-lived ready result while the popup is closed. Never synced, never transmitted. |
| `host_permissions` | Yes | http://*/* | Yes | HIGH | The product's purpose is transferring sessions for any website the user is logged into, so a fixed host list is impossible. Access is on-demand (user clicks the toolbar action), strictly limited to the selected origin, and cross-origin mixing is cryptographically prevented (origin bound as AEAD authenticated data). |

---

## 4. Privacy & Data Use Disclosure

- **Data Flow**:
  User clicks the toolbar action (Transfer / Receive)
  ⬇
  Popup UI ↔ background service worker (on-demand, user-initiated injection into the selected tab only)
  ⬇
  Cookies + origin storage for the selected site are packaged locally (optionally encrypted: AES-256-GCM, PBKDF2-SHA256)
  ⬇
  `.stpkg` file saved by the user
  ⬇
  No network transmission — the extension contacts no servers

- **Data Handling Summary**:
  - **Authentication information (cookies, site storage)**: Collected: Yes, only for the site the user selects and only when the user clicks Transfer | Stored: Only inside the user-downloaded package (encrypted if the user turns that on) | Purpose: Move the user's own logged-in session to another browser/profile. Never transmitted to the developer or any third party.
  - **Website content**: Collected: No | Stored: No | Purpose: None — page content is not read beyond the selected origin's storage.
  - **Analytics & Telemetry**: Collected: No | Stored: No | Purpose: None collected.

- **Privacy Policy URL**: `https://ravitejakamalapuram.github.io/session-transfer.html`

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
