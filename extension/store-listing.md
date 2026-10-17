# Chrome Web Store — Submission Playbook

Everything below is ready to paste. Estimated total time: **~30–45 minutes** (plus Google's
review, typically 1–3 days for a new extension with host permissions).

---

## STEP 0 — One manual smoke test (5 min, strongly recommended)

Reviewers will install and run the extension, so do this first:

1. Build the zip with `cd extension && npm run zip` (it writes `session-transfer-v<version>.zip`, named from `extension/package.json`), unzip it → `chrome://extensions` → Developer mode → **Load unpacked**.
2. Log into any site (e.g. GitHub) in the tab → click extension → **Transfer Session** → download the package (and note the transfer code if you turned on "Encrypt with a transfer code").
3. Open a second Chrome profile with the extension → **Receive Session** → load the package (+ code, if one was shown) → **Import Session** → confirm you're logged in and the verification report passes.

---

## STEP 1 — Developer account (5 min, one-time)

1. Go to <https://chrome.google.com/webstore/devconsole>.
2. Sign in with a Google account and pay the **one-time $5** registration fee.
3. (Recommended) Add a publisher website/contact email in **Account** settings.

## STEP 2 — Create the item & upload

1. Developer Dashboard → **New Item** → upload the zip that `npm run zip` writes to the `extension/` root (`session-transfer-v<version>.zip`).
2. The version shows automatically from the manifest (taken from `extension/package.json`).

## STEP 3 — Store listing tab (copy-paste ready)

**Name:** Session Transfer – Copy Login to Another Chrome Profile

**Summary (short description, ≤132 chars):**
> Move your login (cookies + storage) to another Chrome profile or computer, or export it as Playwright storageState. Local only.

**Description (detailed):**
> Move your login to another browser or profile: Session Transfer copies a logged-in website session (cookies, localStorage, sessionStorage, IndexedDB and Cache Storage) to another Chrome profile, Chrome browser or computer. Use it to transfer cookies between Chrome profiles, or to save a site's login as a Playwright storageState file for automated tests.
>
> No servers, no account, no analytics: the extension makes no network requests. Privacy policy: https://ravitejakamalapuram.github.io/session-transfer.html
>
> HOW IT WORKS
> 1. In the source browser, open the site, click the extension and press "Transfer Session".
> 2. The extension packs the site's cookies (including HttpOnly), localStorage, sessionStorage, IndexedDB and Cache Storage into one package that you copy or download.
> 3. In the destination browser, press "Receive Session" and paste or load the package (and enter the transfer code if the package asks for one). The session is restored, the page reloads, and the popup shows a verification report of what was written.
>
> PRIVACY AND LIMITS
> • Not encrypted by default: anyone with the copied text or file can restore the session, so treat it like a password. Turn on "Encrypt with a transfer code" to encrypt it with AES-256-GCM, using a key derived from a code you send on another channel (PBKDF2-SHA256, 600,000 iterations).
> • The extension refuses packages older than 5 minutes.
> • A package restores only into the website origin it was exported from.
> • If the destination already has a session, you choose Replace, Merge or Cancel; nothing is overwritten silently.
> • Passkeys/WebAuthn, hardware-backed credentials and TLS-bound state cannot be transferred, and the popup says so. Some sites tie a session to a device and may still ask you to sign in.
>
> FOR DEVELOPERS AND QA
> • "Export for Playwright" (under More options) saves the current site's cookies (except partitioned CHIPS cookies) and localStorage as a Playwright storageState .json file, so automated tests can start already logged in. sessionStorage and IndexedDB are not included, and the file holds live logins.
> • Signing in through another site? Add its host name (up to 5) under More options and its cookies are added to the package.
>
> IDEAL FOR
> • Moving a session between Chrome profiles for the same site.
> • Switching to a new computer or Chrome browser.
> • QA teams reproducing logged-in states.
>
> Threat model (what the extension protects against and what it does not): https://github.com/ravitejakamalapuram/session-transfer/blob/main/extension/docs/threat-model.md

**Category:** Productivity
**Language:** English

**Screenshots (1280×800)** — upload in this order, from `extension/store-assets/`:
1. `screenshot-home.png` — "Open the site. Press Transfer."
2. `screenshot-transfer.png` — "Copy it. Lock it if you want." (plain by default, optional encryption, 5-minute limit)
3. `screenshot-receive.png` — "Paste it. Check what moves."
4. `screenshot-restored.png` — "Restored. Then checked."

The four screenshots are made from the real popup: `cd extension && npm run build && STORE_ASSETS=1 TZ=UTC npx playwright test e2e/store-shots.spec.ts`. Captions live in that spec. The two tiles are rendered from `store-assets/tiles.html` (instructions in its first lines).

**Small promo tile (440×280):** `store-assets/tile-small-440x280.png`
**Marquee (1400×560, optional):** `store-assets/tile-marquee-1400x560.png`

**Store icon:** `icons/icon128.png` (also inside the zip)

**Official URL / Homepage:** `https://github.com/ravitejakamalapuram/session-transfer`
**Privacy policy URL (required):** `https://ravitejakamalapuram.github.io/session-transfer.html`
**Support site:** `https://github.com/ravitejakamalapuram/session-transfer/issues`

## STEP 4 — Privacy practices tab (important — answer exactly like this)

**Single purpose description:**
> Session Transfer exports and imports the session state of a user-selected website (cookies and origin storage) so the user can continue a logged-in session in another Chrome profile or device. Encryption with a transfer code is optional and off by default.

**Permission justifications:**
- **cookies** — "Reading and restoring cookies (including HttpOnly/Secure) is the core mechanism for transferring authenticated sessions. Cookies are accessed only for the selected origin and for up to 5 host names the user adds under More options."
- **scripting** — "Used to run an on-demand, user-initiated collect/restore function in the active tab to read/write that origin's localStorage, sessionStorage, IndexedDB and Cache Storage. No code runs automatically on page load."
- **storage** — "Keeps the on-device setting and a short-lived ready result while the popup is closed. Never synced, never transmitted."
- **host_permissions (http/https)** — "The product's purpose is transferring sessions for any website the user is logged into, so a fixed host list is impossible. Access is on-demand (user clicks the toolbar action), page scripting is limited to the selected origin, cookie reads also cover up to 5 host names the user adds under More options, and cross-origin mixing is cryptographically prevented (origin bound as AEAD authenticated data)."

**Remote code:** "No — this extension does not use remote code."

**Data usage disclosures:**
- "Does NOT collect or transmit user data."
- If any checkbox insists on data handling: all processing is local; "not used or transferred for purposes unrelated to the item's single purpose"; "not sold"; "not used for creditworthiness or lending".
- Certify the compliance checkbox and save.

## STEP 5 — Submit for review

1. Fix any red validation errors shown at the top of the dashboard.
2. Set visibility: **Public** (or Unlisted if you want a link-only launch first — fastest way to "publish" safely).
3. **Submit for review.**

## Fastest-path tips

- **Unlisted visibility** publishes instantly after review without appearing in search — good for a soft launch; flip to Public later.
- Review for extensions with broad host permissions takes 1–3 days (occasionally up to a week). Everything in Step 4 above is written to preempt the usual rejection reasons.
- Keep the zip you submitted; for updates, bump `version` in `extension/package.json`, run `npm run zip`, and upload the new zip — existing users auto-update.
- If rejected, the dashboard states the exact policy section; the most common fix for this type of extension is expanding the host-permission justification (already drafted above).

## Files you'll need (all in this repo)

| Store field | File |
|---|---|
| Extension package | `session-transfer-v<version>.zip` (from `npm run zip`) |
| Screenshots ×4 | `store-assets/screenshot-{home,transfer,receive,restored}.png` |
| Small promo tile | `store-assets/tile-small-440x280.png` |
| Marquee tile | `store-assets/tile-marquee-1400x560.png` |
| Privacy policy | https://ravitejakamalapuram.github.io/session-transfer.html |
