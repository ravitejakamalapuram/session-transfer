# Changelog

All notable changes to Session Transfer are documented here. Released versions come from the release
tag (release-platform stamps it into the built manifest), so the numbers below may run ahead of it.

## [Unreleased]

### Fixed
- Replace no longer removes cookies of an unrelated subdomain, and now removes leftover partitioned cookies from their
  own partition.
- The popup header said "AES-256-GCM · local only" even for the default plain package. It now reads "Move a logged-in
  session".

### Changed
- Store screenshots are generated from the real popup (`e2e/store-shots.spec.ts`) and the promo tiles no longer claim
  encryption by default; the old images still showed backups and an always-required code.
- Release and listing automation drafts: `docs/release-automation/`.

## [1.4.0]

### Added
- **Export for Playwright (.json)** under More options: the active site's cookies and localStorage as a Playwright
  `storageState` file for tests. Partitioned cookies are left out and counted; sessionStorage and IndexedDB are not
  part of that format.
- **Cookies from other sites**: type up to 5 plain host names (for example `accounts.example.com`) and their cookies
  are added to the transfer. Nothing is added unless typed; anything that is not a plain host name is refused.
- **Partitioned (CHIPS) cookies** are now transferred together with their partition (Chrome 119 or later).
- Playwright acceptance tests for all of the above, and unit tests for the storageState mapping and the host-name
  check. The Playwright suite now runs from `release.yaml`, in pull-request checks and in the release pipeline.

### Changed
- Cookie verification looks each cookie up by its own domain, so cookies from other sites are checked too.
- **The `tabs` permission is no longer requested.** The http/https host access already exposes each tab's address.
- All time and size limits live in `src/core/limits.ts`, with the reason for each value.
- Developer docs use `npm` (the repo has a `package-lock.json` and CI runs `npm ci`), not `yarn`.

## [1.3.0]

### Changed
- **Packages are plain by default; encryption is the opt-in setting.** The
  setting is now "Encrypt with a transfer code (more secure)". Off (default):
  one unencrypted package, no code. On: AES-256-GCM with a key derived from a
  code shown after export (PBKDF2-SHA256, now 600,000 iterations). **Update
  both browsers**: an older receiver cannot read a plain package. Packages
  from 1.2.x and earlier still import.
- Restore now checks the real result: after writing, it reads back each
  cookie and storage key and compares values, so existing data no longer
  makes a failed restore look successful. Each part reports success, partial
  or failed from what was actually written.
- Replace writes the new state first and then removes leftovers, so a failure
  halfway no longer leaves the site empty. The page only reloads if something
  was written.
- IndexedDB: circular values no longer abort the whole capture, databases
  that could not be read are named in the result, and restore no longer opens
  a database below its existing version. Writes count only once committed.
- The 100 MB limit is now measured on the finished package.

### Removed
- The destination backup before Replace (it stored its own decryption code and
  could not be restored). Backups left by 1.2.x are deleted on update.

## [1.2.2 / 1.2.3]

Superseded by 1.3.0: packages are plain by default and the setting is now "Encrypt with a transfer code". Kept as
written at the time.

### Changed
- **The transfer code is now optional and off by default.** Packages are still
  always AES-256-GCM encrypted, but by default the key is inside the copied
  text or downloaded file: one step, no second channel. Anyone who has that
  text can restore your session until it expires (5 minutes, checked by the
  extension) and can still decrypt it afterwards, so do not share it and delete
  the file after you import it. Turn on **Require a separate transfer code
  (more secure)** on the home screen for the previous two-channel behaviour.
  Done clears the clipboard if you copied. Packages are now version 2; version
  1 packages still import. **Update the extension in both browsers**: an older
  receiver cannot read a default-mode package (APP-315).
- Receive no longer asks for a code unless the package needs one. Expired or
  too-long-lived packages are refused before anything is decrypted.
- The "Ready to transfer" screen shows the encrypted package and the transfer
  code as numbered steps ① and ② of equal weight, says you need both, ticks
  each one once it is downloaded or copied, and counts down to expiry. Done
  warns before you leave without the package (APP-299).
- Closing the popup no longer loses a finished transfer: it reopens on the
  Ready screen until Done or expiry (5 min), held in memory only (APP-299).
- The home screen says Transfer creates two things, the receive screen
  numbers and ticks both fields, and the store caption now reads "Load the
  package + enter the code" (APP-299).

### Fixed
- Extension icon (16/32/48/128 px) no longer has white square corners: the
  area outside the rounded tile is now transparent, so the icon blends into
  dark toolbars (APP-300).

## [1.2.1] - 2026-09-22

### Changed
- Privacy policy URL moved to the dedicated GitHub Pages site
  (https://ravitejakamalapuram.github.io/session-transfer.html) and the
  extension was resubmitted to the Chrome Web Store.
- Onboarded to the shared CI/CD workflows; Chrome Web Store listing copy and
  store assets added.

## [1.2.0] - 2026-09-20

### Added
- Transfer an authenticated session (cookies including HttpOnly,
  localStorage, sessionStorage, IndexedDB, Cache Storage) between Chrome
  profiles or devices as an AES-256-GCM encrypted package protected by a
  one-time code (PBKDF2-SHA256, 210,000 iterations; packages expire after
  5 minutes).
- Replace / Merge / Cancel choices on restore with an optional encrypted,
  auto-expiring local backup, plus a post-restore verification report.
