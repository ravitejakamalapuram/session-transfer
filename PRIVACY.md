# Privacy Policy — Session Transfer

Published policy: https://ravitejakamalapuram.github.io/session-transfer.html

**Effective date:** September 21, 2026 · **Publisher:** Raviteja Kamalapuram

Session Transfer is a utility for moving the session state of a website the
user is logged into between browser profiles or devices. Transfers happen
through a user-saved, encrypted package. No session data is ever collected,
received, or logged by the developer.

## Single purpose

Export and import the session state (cookies and site storage) of a
user-selected website between browser environments.

## Data collection and usage

- **User-initiated only.** Data is read only for the site the user selects,
  and only when the user presses Transfer or Receive in the popup.
- **Encrypted and local.** Captured state is encrypted on the device
  (AES-256-GCM) and saved by the user as a file or copied as text. By default
  the key is random for each export and is inside the package; if the user
  turns on "Require a separate transfer code", the key is derived with
  PBKDF2-SHA256 from a one-time code that is not in the package. The
  extension refuses to import a package more than 5 minutes after it was
  made; in the default mode this is a check made by the extension, because
  the key is inside the package. An optional encrypted backup of destination
  state is kept in `chrome.storage.local` and expires after 30 minutes.
- **No network transmission.** The extension contacts no servers; nothing is
  sent to the developer or any third party.
- **No analytics.** No analytics or tracking libraries are included.

## Permissions

- `cookies` — read and restore cookies for the selected site.
- `scripting` — run a one-time, user-initiated collect/restore function in the
  selected tab for localStorage, sessionStorage, IndexedDB and Cache Storage.
- `tabs` — identify the active tab's origin and reload the destination tab.
- `storage` — hold the optional encrypted, auto-expiring backup and the
  on-device "Require a separate transfer code" setting.
- Host access — sessions can be transferred for any site the user is logged
  into; access is on demand and limited to the selected origin.

## Contact

Raviteja Kamalapuram — raviteja369.k@gmail.com
