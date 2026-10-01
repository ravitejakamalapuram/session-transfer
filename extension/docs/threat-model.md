# Threat Model

Session data is treated as equivalent to passwords/access tokens.

| # | Threat | Mitigation |
|---|--------|-----------|
| 1 | Malicious extension reading a transfer | Package is AES-256-GCM encrypted; the decryption code never touches disk in plaintext and is shown once in the popup. Backups in `chrome.storage.local` are also encrypted. |
| 2 | Interception of a transfer code | The code alone is useless without the encrypted package; the package alone is useless without the code (two-channel). Transfers expire in 5 minutes. |
| 3 | Malicious webpage triggering a transfer | No page-facing API. All operations are initiated only from the extension popup by the user; content scripts are never auto-injected. |
| 4 | Accidental transfer to the wrong origin | The origin is bound as AES-GCM AAD; a tampered header fails decryption. Restore always targets the package's own origin, and the popup shows an explicit origin-mismatch confirmation. |
| 5 | Session package left on disk | Packages are created in-memory; the user chooses to download/copy. Encrypted backups auto-expire (30 min) and are purged on install/startup. |
| 6 | Clipboard leakage | Copy is opt-in. Clipboard holds ciphertext (package) or the one-time code — never plaintext session values. |
| 7 | Screenshots containing secrets | The popup never renders cookie/token/storage values; only counts and non-sensitive metadata are shown. |
| 8 | Replay attacks | Short expiry (5 min) + a random `transferId`. Codes are single-use in practice (freshly generated per export). AAD binds origin. |
| 9 | Ready result kept while the popup is closed | So that closing the popup (e.g. to write the code down) does not lose the transfer, the encrypted package and its code are kept **together** in `chrome.storage.session` until Done or expiry (5 min). That area is in memory only (never written to disk), readable only by the extension's own pages, and emptied when the browser or extension restarts. It is deleted on Done, when the countdown reaches zero with the popup open, or the next time the popup opens after expiry. If the popup is never reopened, an expired record stays in memory until the browser closes; an alarm to delete it at exactly 5 min would need the `alarms` permission, which is not requested. |

## Cryptographic design

```
code (one-time)  ──PBKDF2-SHA256(210k, random salt)──▶  AES-256-GCM key
payload (JSON) ──AES-256-GCM(iv, AAD = origin)──▶ ciphertext
package = { salt, iv, origin, createdAt, expiresAt, transferId, ciphertext }
```

- Only Web Crypto primitives; no custom cryptography.
- Ephemeral key: derived per-export from a fresh random code + salt, never stored.
- Origin binding via AAD prevents cross-origin confusion.

## Secret handling

- Heuristic secret detection (`secret-detection.ts`) classifies sensitive keys so they
  are never displayed. It never blocks a transfer and never inspects values.
- The logger (`logger.ts`) scrubs any field whose name looks value-bearing and forbids
  passing raw values. Nothing sensitive reaches `console`, UI, errors, or storage.
