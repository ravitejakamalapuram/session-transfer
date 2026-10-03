# Chrome Web Store — Submission Playbook

Everything below is ready to paste. Estimated total time: **~30–45 minutes** (plus Google's
review, typically 1–3 days for a new extension with host permissions).

---

## STEP 0 — One manual smoke test (5 min, strongly recommended)

Reviewers will install and run the extension, so do this first:

1. Unzip `session-transfer-v1.2.0.zip` → `chrome://extensions` → Developer mode → **Load unpacked**.
2. Log into any site (e.g. GitHub) in the tab → click extension → **Transfer Session** → download package + note code.
3. Open a second Chrome profile with the extension → **Receive Session** → load package + code → **Import Session** → confirm you're logged in and the verification report passes.

---

## STEP 1 — Developer account (5 min, one-time)

1. Go to <https://chrome.google.com/webstore/devconsole>.
2. Sign in with a Google account and pay the **one-time $5** registration fee.
3. (Recommended) Add a publisher website/contact email in **Account** settings.

## STEP 2 — Create the item & upload

1. Developer Dashboard → **New Item** → upload **`session-transfer-v1.2.0.zip`** (built, in `extension/` root).
2. Version shows 1.2.0 automatically from the manifest.

## STEP 3 — Store listing tab (copy-paste ready)

**Name:** Session Transfer

**Summary (short description, ≤132 chars):**
> Move logged-in browser sessions between Chrome profiles or devices. Optional encryption, fully local. Optional extra code. No cloud.

**Description (detailed):**
> Session Transfer moves an authenticated website session from one Chrome browser, profile, or computer to another in a couple of clicks — no re-login, no MFA loop.
>
> HOW IT WORKS
> 1. On the source browser, open the site, click the extension and press "Transfer Session".
> 2. The extension captures cookies (including HttpOnly), localStorage, sessionStorage, IndexedDB and Cache Storage, into one package that you copy or download (optionally encrypted with a transfer code).
> 3. On the destination browser, press "Receive Session", paste or load the package (and enter the transfer code if the package asks for one). State is restored, the page reloads, and a verification report confirms the result.
>
> SECURITY & PRIVACY BY DESIGN
> • 100% local — no servers, no accounts, no analytics, no tracking.
> • Not encrypted by default, so treat the copied text or file like a password. Turn on "Encrypt with a transfer code" to encrypt it with AES-256-GCM, using a key derived from a code you send on another channel (PBKDF2-SHA256, 600,000 iterations).
> • The extension refuses packages older than 5 minutes.
> • Strict origin isolation — a package can only ever be restored into its own website origin.
> • Existing destination sessions are never silently overwritten: choose Replace, Merge or Cancel.
> • Honest about limits: WebAuthn/passkeys, hardware credentials and TLS-bound state cannot be transferred by any extension, and we say so in-product instead of faking success.
>
> FOR DEVELOPERS AND QA
> • "Export for Playwright" saves the current site's cookies and localStorage as a Playwright storageState file, so automated tests can start already logged in.
> • Signing in through another site? Add its host name (up to 5) under More options and its cookies travel too.
>
> IDEAL FOR
> • Developers moving authenticated sessions between dev/staging/prod profiles.
> • Switching computers or browsers without logging in again.
> • QA teams reproducing authenticated states quickly.
>
> Full capability table and threat model are published in the GitHub repository.

**Category:** Productivity
**Language:** English

**Screenshots (1280×800)** — upload in this order, from `extension/store-assets/`:
1. `screenshot-home.png` — "Session detected — one click to export"
2. `screenshot-transfer.png` — "Copy or download, optional encryption, 5-minute expiry"
3. `screenshot-receive.png` — "Paste or load the package"
4. `screenshot-restored.png` — "Logged in & verified"

**Small promo tile (440×280):** `store-assets/tile-small-440x280.png`
**Marquee (1400×560, optional):** `store-assets/tile-marquee-1400x560.png`

**Store icon:** `icons/icon128.png` (also inside the zip)

**Official URL / Homepage:** `https://github.com/ravitejakamalapuram/session-transfer`
**Privacy policy URL (required):** `https://ravitejakamalapuram.github.io/session-transfer.html`
**Support site:** `https://github.com/ravitejakamalapuram/session-transfer/issues`

## STEP 4 — Privacy practices tab (important — answer exactly like this)

**Single purpose description:**
> Session Transfer securely exports and imports a website's authenticated browser state (cookies and origin storage) between Chrome browsers/profiles/devices, with optional client-side encryption.

**Permission justifications:**
- **cookies** — "Reading and restoring cookies (including HttpOnly/Secure) is the core mechanism for transferring authenticated sessions. Cookies are only accessed for the origin the user explicitly selects."
- **scripting** — "Used to run a one-time, user-initiated collect/restore function in the active tab to read/write that origin's localStorage, sessionStorage, IndexedDB and Cache Storage. No code runs automatically on page load."
- **storage** — "Keeps the on-device setting and a short-lived ready result while the popup is closed. Never synced, never transmitted."
- **host_permissions (http/https)** — "The product's purpose is transferring sessions for any website the user is logged into, so a fixed host list is impossible. Access is on-demand (user clicks the toolbar action), strictly limited to the selected origin, and cross-origin mixing is cryptographically prevented (origin bound as AEAD authenticated data)."

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
- Keep the zip you submitted; for updates, bump `version` in `extension/package.json`, run `yarn zip`, and upload the new zip — existing users auto-update.
- If rejected, the dashboard states the exact policy section; the most common fix for this type of extension is expanding the host-permission justification (already drafted above).

## Files you'll need (all in this repo)

| Store field | File |
|---|---|
| Extension package | `session-transfer-v1.2.0.zip` |
| Screenshots ×4 | `store-assets/screenshot-{home,transfer,receive,restored}.png` |
| Small promo tile | `store-assets/tile-small-440x280.png` |
| Marquee tile | `store-assets/tile-marquee-1400x560.png` |
| Privacy policy | https://ravitejakamalapuram.github.io/session-transfer.html |
