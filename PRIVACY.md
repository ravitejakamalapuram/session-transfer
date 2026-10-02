# Privacy Policy — Session Transfer

Published policy: https://ravitejakamalapuram.github.io/session-transfer.html

**Effective date:** September 21, 2026 · **Publisher:** Raviteja Kamalapuram

Session Transfer is a utility for moving the session state of a website the
user is logged into between browser profiles or devices. Transfers happen
through a user-saved package (optionally encrypted). No session data is ever collected,
received, or logged by the developer.

## Single purpose

Export and import the session state (cookies and site storage) of a
user-selected website between browser environments.

## Data collection and usage

- **User-initiated only.** Data is read only for the site the user selects,
  and only when the user presses Transfer or Receive in the popup.
- **Local, optionally encrypted.** Captured state is built on the device and
  saved by the user as a file or copied as text. By default it is **not
  encrypted**: anyone with the text or file can restore the session, so treat
  it like a password. If the user turns on "Encrypt with a transfer code", it
  is encrypted with AES-256-GCM, with a key derived with PBKDF2-SHA256 from a
  transfer code (new for each export) that is not in the package. The
  extension refuses to import a package more than 5 minutes after it was
  made; this is a check made by the extension, not a cryptographic limit. The
  extension does not keep backups of destination state.
- **No network transmission.** The extension contacts no servers; nothing is
  sent to the developer or any third party.
- **No analytics.** No analytics or tracking libraries are included.

## Permissions

- `cookies` — read and restore cookies for the selected site.
- `scripting` — run a one-time, user-initiated collect/restore function in the
  selected tab for localStorage, sessionStorage, IndexedDB and Cache Storage.
- `storage` — hold the on-device "Encrypt with a transfer code" setting and
  the short-lived "ready" result while the popup is closed.
- Host access — sessions can be transferred for any site the user is logged
  into; access is on demand and limited to the selected origin.

## Contact

Raviteja Kamalapuram — raviteja369.k@gmail.com
