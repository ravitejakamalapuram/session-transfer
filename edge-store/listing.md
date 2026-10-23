# Microsoft Edge Add-ons — listing copy

Paste-ready values for Partner Center (Microsoft Edge program). Every fact below comes from
`extension/store-listing.md`, `app-metadata.json` and `product-facts.yaml`; if one of those changes,
change this file in the same PR. Audience for this listing: QA engineers and testers.

The steps for using this file are in [`docs/edge-submission.md`](../docs/edge-submission.md).

## Fields taken from the package (read-only in Partner Center)

Partner Center reads these from `manifest.json` in the uploaded zip. To change them, change
`extension/manifest.config.ts`, rebuild and upload a new zip.

| Partner Center field | Value (from the manifest) |
|---|---|
| Extension name | Session Transfer – Copy Login to Another Chrome Profile |
| Short description | Move your login (cookies + storage) to another Chrome profile or computer, encrypted. Or export a plain Playwright storageState. |

Both say "Chrome". They are accurate for the package but read oddly on the Edge store. Changing them
means an Edge-specific manifest (a build flavor), which this repo does not have yet; see
"Known Edge differences" in `docs/edge-submission.md`.

## Properties page

| Field | Value |
|---|---|
| Category | Productivity |
| Website | https://github.com/ravitejakamalapuram/session-transfer |
| Support contact detail | https://github.com/ravitejakamalapuram/session-transfer/issues |
| Mature content | Unchecked |

## Privacy page

**Single Purpose Description**
> Session Transfer exports and imports the session state of a user-selected website (cookies and origin storage) so the user can continue a logged-in session in another browser profile or device. Packages are encrypted with a transfer code by default.

**Permission justification** (Partner Center lists the manifest permissions: `cookies`, `offscreen`,
`scripting`, `storage`, and the `http://*/*` and `https://*/*` host access)

- **cookies**: Reading and restoring cookies (including HttpOnly/Secure) is the core mechanism for transferring authenticated sessions. Cookies are accessed only for the selected origin and for up to 5 host names the user adds under More options.
- **offscreen**: Used only for the "Send to another computer" live transfer. Chrome extensions cannot hold a WebRTC connection in the service worker, so when the user starts a live send or receive from the popup, the extension opens a hidden offscreen document (reason WEB_RTC) that holds the peer-to-peer connection until the transfer finishes or is cancelled. It is never created on page load or automatically; once the user starts a transfer it can stay open after the popup closes, until that transfer finishes, times out or is cancelled. No page content is read through it and no code is loaded remotely.
- **scripting**: Used to run an on-demand, user-initiated collect/restore function in the active tab to read/write that origin's localStorage, sessionStorage, IndexedDB and Cache Storage. No code runs automatically on page load.
- **storage**: Keeps the on-device setting and a short-lived ready result while the popup is closed. Never synced, never transmitted.
- **Host permissions (http/https)**: The product's purpose is transferring sessions for any website the user is logged into, so a fixed host list is impossible. Access is on-demand (user clicks the toolbar action), page scripting is limited to the selected origin, cookie reads also cover up to 5 host names the user adds under More options, and restore targets the package's own origin: encrypted packages bind that origin as AEAD authenticated data, while plain ("Skip the code") packages have no tamper detection and rely on an extension-side origin check.

**Are you using remote code?** No, I am not using remote code. (All scripts are bundled into the
package at build time, and the extension contacts no servers.)

**Data usage**: tick **Authentication information** (cookies and site storage are read for the
site the user selects, only when they click Transfer, and stored only in the package they
download). Leave every other category unticked. This matches the Chrome Web Store disclosure in
CHROMEWEBSTORE.md section 4: local-only handling is still declared, but nothing is sent to the
developer or any third party. Then tick each certification checkbox, which matches PRIVACY.md.

**Privacy Policy URL**: https://ravitejakamalapuram.github.io/session-transfer.html

## Store listing: Details for English (United States)

### Description

The Chrome description with the same facts, reordered so the testing use comes first. Paste
between the lines:

---

Start your tests already logged in: Session Transfer copies a logged-in website session (cookies, localStorage, sessionStorage, IndexedDB and Cache Storage) to another browser profile or computer, or saves a site's login as a Playwright storageState file for automated tests.

No servers, no account, no analytics: the extension makes no network requests. Privacy policy: https://ravitejakamalapuram.github.io/session-transfer.html

FOR QA AND TESTERS
• "Export for Playwright" (under More options) saves the current site's cookies, plus cookies from any extra sign-in sites you list under More options (except partitioned CHIPS cookies), and the current site's localStorage as a plain (unencrypted) Playwright storageState .json file, so automated tests can start already logged in. sessionStorage and IndexedDB are not included, and the file holds live logins.
• Reproduce logged-in states on another test profile or computer.
• Signing in through another site? Add its host name (up to 5) under More options and its cookies are added to the package.

HOW IT WORKS
1. In the source browser, open the site, click the extension and press "Transfer Session".
2. The extension packs the site's cookies (including HttpOnly), localStorage, sessionStorage, IndexedDB and Cache Storage into one package that you copy or download, encrypted with a transfer code by default.
3. In the destination browser, press "Receive Session", paste or load the package and enter the transfer code if it asks for one. The session is restored, the page reloads, and the popup shows a verification report of what was written.

PRIVACY AND LIMITS
• Encrypted by default with AES-256-GCM, using a key derived from a transfer code you send on another channel (PBKDF2-SHA256, 600,000 iterations). "Skip the code (same computer only)" makes a plain package instead; treat that like a password.
• Packages expire 5 minutes after export (the extension allows up to 1 extra minute for clock differences between computers).
• Encrypted packages restore only into the website origin they were exported from (the origin is bound as AEAD authenticated data). A "Skip the code" package has no tamper detection; the extension still checks its origin before restoring.
• If the destination already has a session, you choose Replace, Merge or Cancel; nothing is overwritten silently.
• Passkeys/WebAuthn, hardware-backed credentials and TLS-bound state cannot be transferred, and the popup says so. Some sites tie a session to a device and may still ask you to sign in.

The full capability table and threat model are in the GitHub repository.

---

Do not add: "free", install or rating counts, "works on every site", "always encrypted",
"never leaves your device", or support for Puppeteer, Selenium or Cypress (see `do_not_claim` in
`product-facts.yaml`).

### Search terms

Partner Center limits: at most 7 terms, 30 characters each, 21 words in total. These are 7 terms,
14 words:

1. playwright storageState
2. QA testing
3. test automation login
4. copy cookies
5. session transfer
6. export cookies
7. logged in test state

### Store assets

All files are in `extension/store-assets/` (screenshots and tiles) and `extension/icons/` and meet
the Edge sizes. Use **Duplicate** to copy them to any other language you add.

| Partner Center field | Required? | Edge size | File |
|---|---|---|---|
| Extension logo | Required | 1:1, 300×300 recommended, 128×128 minimum | `extension/icons/icon128.png` (128×128, meets the minimum) |
| Small promotional tile | Optional | 440×280 | `extension/store-assets/tile-small-440x280.png` |
| Large promotional tile | Optional | 1400×560 | `extension/store-assets/tile-marquee-1400x560.png` |
| Screenshots (up to 6) | Optional | 1280×800 or 640×480 | in this order: `screenshot-home.png`, `screenshot-transfer.png`, `screenshot-receive.png`, `screenshot-restored.png` (all 1280×800) |
| YouTube video URL | Optional | — | none yet |

The screenshots show the popup as rendered in Chromium; nothing in them names Chrome.

## Notes for certification

Paste into **Notes for certification** on the submit page:

> Session Transfer moves one website's session (cookies, localStorage, sessionStorage, IndexedDB, Cache Storage) between browser profiles, and can export a Playwright storageState file for test automation. It makes no network requests and needs no account or test credentials of ours.
>
> To test: (1) In Edge profile A, sign in to any site (for example github.com) and open it in the active tab. (2) Click the toolbar icon, leave "Skip the code" unchecked, press "Transfer Session", then download the package and note the transfer code shown. (3) In Edge profile B (or another computer) with the extension installed, open the same site, click the icon, press "Receive Session", load the package, enter the code and press "Import Session". The page reloads signed in and the popup shows a verification report. Packages expire 5 minutes after export, so do step 3 within 5 minutes.
>
> Playwright export: under "More options", press "Export for Playwright"; a storageState .json file is downloaded.
>
> Permissions: cookies and host access are needed to read and restore the session of whichever site the user picks; scripting runs the collect/restore function only when the user presses a button; storage holds one setting and a short-lived result. Passkeys and device-bound sessions cannot be moved, by design.
