# Browser State Transfer Capabilities

This document records what the extension can and cannot do for each browser-state
mechanism, verified against current Chrome (Manifest V3) APIs. It is mandatory
reading before trusting a transfer.

## Capability matrix

| State            | Read | Write | API / Mechanism                         | Cross-profile | Cross-device¹ | Needs page context | Limitations |
| ---------------- | ---- | ----- | --------------------------------------- | ------------- | ------------- | ------------------ | ----------- |
| Cookies          | ✓    | ✓     | `chrome.cookies` (getAll/set/remove)    | ✓             | ✓             | No                 | Requires `cookies` + host permission. HttpOnly & Secure readable. `__Host-`/`__Secure-` prefixes re-validated on set. |
| localStorage     | ✓    | ✓     | Page context via `chrome.scripting`     | ✓             | ✓             | Yes                | Origin-bound. Strings only. |
| sessionStorage   | ✓    | ✓     | Page context via `chrome.scripting`     | ✓             | ✓             | Yes                | Tab/session-scoped. Restored then page reloaded (persists across reload → available at next init). True pre-navigation injection is not possible from MV3. |
| IndexedDB        | ✓    | ✓     | Page `indexedDB` + structured serializer| ✓             | ✓             | Yes                | Schema (stores/indexes/keyPath) + records preserved. Blobs/ArrayBuffers/TypedArrays/Map/Set/Date supported via tagged serialization. Very large DBs bounded by package size limit. |
| Cache Storage    | ✓    | ✓     | Page `caches` (CacheStorage API)        | ✓             | ✓             | Yes                | Only GET, non-opaque responses restorable. Opaque/cross-origin responses reported as unsupported, never faked. |
| WebAuthn/passkeys| ✗    | ✗     | Browser/OS managed (TPM/Secure Enclave) | ✗             | ✗             | —                  | Non-extractable by design. |
| OS credential store | ✗ | ✗     | OS managed                              | ✗             | ✗             | —                  | Outside browser reach. |
| TLS / channel-bound session | ✗ | ✗ | Network layer                        | ✗             | ✗             | —                  | Cannot be cloned. |
| Service-worker runtime memory | ✗ | ✗ | In-process                          | ✗             | ✗             | —                  | Ephemeral; not addressable. |
| Active JS memory | ✗    | ✗     | In-process                              | ✗             | ✗             | —                  | Ephemeral. |

¹ Cross-device works because the encrypted package is a portable file; move it by
any channel (the code is required to decrypt).

## Why these API choices

- **Cookies** must go through `chrome.cookies` — it is the only surface that can read
  `HttpOnly`/`Secure` cookies, which are exactly where session tokens usually live.
  `document.cookie` from a page cannot see them.
- **localStorage / sessionStorage / IndexedDB / Cache Storage** are origin-partitioned
  web-platform storage. They are reached by injecting a self-contained function into
  the tab with `chrome.scripting.executeScript`. Injection is **on-demand only**
  (triggered by the user clicking the popup) — no content script runs automatically.
- We deliberately use the default (ISOLATED) execution world. Web-platform storage is
  partitioned by **origin**, not by world, so the injected function sees the exact same
  `localStorage`/`indexedDB`/`caches` as the page, while remaining insulated from the
  page's own JavaScript.

## sessionStorage honesty note

MV3 has no reliable hook to write `sessionStorage` *before* a document's scripts run on
first navigation. Our approach: navigate the destination tab to the origin, write
`sessionStorage`, then **reload**. `sessionStorage` survives a same-tab reload, so the
application observes it at initialization on that reload. This is the most reliable
method available and is documented rather than hidden.
