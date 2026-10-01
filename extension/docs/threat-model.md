# Threat Model

Session data is treated as equivalent to passwords/access tokens.

| # | Threat | Mitigation |
|---|--------|-----------|
| 1 | Malicious extension reading a transfer | Package is AES-256-GCM encrypted, so no plaintext session values sit in the clipboard or file. **Default mode (code OFF): the key is inside the package, so anything that reads the package text can decrypt it.** Code mode: the transfer code never touches disk in plaintext and is shown in the popup. Backups in `chrome.storage.local` are also encrypted. |
| 2 | Interception of a transfer | **Code mode (setting "Require a separate transfer code" ON):** the code alone is useless without the package, and the package alone is useless without the code (two-channel). **Default mode (OFF):** the package alone is enough. Anyone who gets the copied text or file (clipboard history, chat, shared screen, Downloads folder, synced folder) can take over the logged-in session. The user is warned on the Ready screen. |
| 3 | Malicious webpage triggering a transfer | No page-facing API. All operations are initiated only from the extension popup by the user; content scripts are never auto-injected. |
| 4 | Accidental transfer to the wrong origin | The origin is bound as AES-GCM AAD; a tampered header fails decryption. Restore always targets the package's own origin, and the popup shows an explicit origin-mismatch confirmation. |
| 5 | Session package left on disk | Packages are created in-memory; the user chooses to download/copy. Encrypted backups auto-expire (30 min) and are purged on install/startup. |
| 6 | Clipboard leakage | Copy is opt-in. The clipboard holds ciphertext, never plaintext session values; in default mode the ciphertext includes its key, in code mode the key (code) is a separate copy. **Done** overwrites the clipboard with empty text if the user copied (the extension cannot read the clipboard to check it still holds the package). OS clipboard history (e.g. Windows Win+V, clipboard managers) can keep copies the extension cannot remove, and a clipboard left alone after the popup closes is not cleared. |
| 7 | Screenshots containing secrets | The popup never renders cookie/token/storage values; only counts and non-sensitive metadata are shown. |
| 8 | Replay attacks | Short expiry (5 min) + a random `transferId`. A package is not single-use: nothing marks it as used. The expiry is checked by the extension **before** anything is decrypted, and a package that claims a lifetime above 5 min 30 s is refused. **In default mode the expiry is not a cryptographic limit:** the key is inside the package, so anyone holding the text can still decrypt it after expiry with a short script, and the cookies stay valid until the site ends the session. In code mode the same applies to someone who has both the package and the code. The AAD binds origin, expiry and key mode. |
| 9 | Ready result kept while the popup is closed | So that closing the popup (e.g. to write the code down) does not lose the transfer, the encrypted package (and, in code mode, its code) are kept **together** in `chrome.storage.session` until Done or expiry (5 min). That area is in memory only (never written to disk), readable only by the extension's own pages, and emptied when the browser or extension restarts. It is deleted on Done, when the countdown reaches zero with the popup open, or the next time the popup opens after expiry. If the popup is never reopened, an expired record stays in memory until the browser closes; an alarm to delete it at exactly 5 min would need the `alarms` permission, which is not requested. |

## Cryptographic design

```
default (keyMode 'embedded'):  random 32-byte key per export ──▶ AES-256-GCM key  (key is in the package)
code    (keyMode 'code'):      code (one-time) ──PBKDF2-SHA256(210k, random salt)──▶ AES-256-GCM key
payload (JSON) ──AES-256-GCM(iv, AAD = canonical JSON of the header)──▶ ciphertext
header = { format, version: 2, keyMode, origin, createdAt, expiresAt, transferId }
package = header + { alg, iv, ciphertext } + { key } (embedded) or { kdf, iterations, salt } (code)
```

- Only Web Crypto primitives; no custom cryptography.
- Fresh key per export in both modes, never stored by the extension (apart from the Ready result in `chrome.storage.session`, #9).
- The header (origin, expiry, key mode) is bound via AAD, so changing it breaks decryption. This protects integrity; in default mode someone who holds the package can also re-encrypt their own, which is why the expiry is an extension check and not a secrecy guarantee.
- Version 1 packages (code only, AAD = origin) are still read. A version 1 receiver (older extension) cannot read a version 2 default-mode package: update the extension in both browsers.

## Secret handling

- Heuristic secret detection (`secret-detection.ts`) classifies sensitive keys so they
  are never displayed. It never blocks a transfer and never inspects values.
- The logger (`logger.ts`) scrubs any field whose name looks value-bearing and forbids
  passing raw values. Nothing sensitive reaches `console`, UI, errors, or storage.
