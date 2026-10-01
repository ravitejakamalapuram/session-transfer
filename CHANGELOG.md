# Changelog

All notable changes to Session Transfer are documented here. The extension
version comes from `extension/package.json` and is written into the built
manifest.

## [Unreleased]

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
