# Privacy Policy — Session Transfer

Published policy: https://ravitejakamalapuram.github.io/session-transfer.html

**Effective date:** September 21, 2026 · **Publisher:** Raviteja Kamalapuram

Session Transfer is a utility for moving the session state of a website the
user is logged into between browser profiles or devices. Transfers happen
through a user-saved package (optionally encrypted) or, with the opt-in live
transfer beta, directly between two browsers. No session data is ever collected,
received, or logged by the developer.

## Single purpose

Export and import the session state (cookies and site storage) of a
user-selected website between browser environments.

## Data collection and usage

- **User-initiated only.** Data is read only for the site the user selects,
  plus cookies for up to 5 extra sign-in sites the user lists under "Also
  include cookies from other sites", and only when the user presses Transfer,
  Receive or "Export for Playwright" in the popup.
- **Local, encrypted by default.** Captured state is built on the device and
  saved by the user as a file or copied as text. By default it is encrypted
  with AES-256-GCM, with a key derived with PBKDF2-SHA256 from a transfer code
  (new for each export) that is not in the package. If the user turns on
  "Skip the code (same computer only)", the package is **not encrypted**:
  anyone with the text or file can restore the session, so treat it like a
  password. The
  extension refuses to import a package more than 5 minutes after it was
  made; this is a check made by the extension, not a cryptographic limit. The
  extension does not keep backups of destination state.
- **No network transmission, unless you use live transfer.** Copy and file
  transfer contact no servers; nothing is sent to the developer or any third
  party. The live transfer beta contacts one signalling server, described
  below.
- **No analytics.** No analytics or tracking libraries are included.

## Live transfer (beta)

"Send to another computer (beta)", under More options, runs only when the user
starts it. It connects the two browsers with WebRTC, paired through a small
signalling server the developer runs on Cloudflare Workers.

- **What the signalling server sees:** a random room id, the connection offer
  and answer of the two browsers (SDP, which holds their IP addresses, ports
  and DTLS fingerprints), each browser's IP address and user agent, and when
  the requests were made.
- **What it keeps:** only the room, for at most 5 minutes; the room is deleted
  as soon as the answer is read. To limit abuse it also keeps a request
  counter per IP address for at most 10 minutes. Request logging is turned
  off in the Worker.
- **What it never sees:** the transfer code, the session package or any
  cookie. The package goes browser to browser over a WebRTC data channel,
  encrypted with AES-256-GCM under a key derived from the transfer code.
- **Cloudflare:** Cloudflare runs the platform and may hold standard request
  metadata (such as IP addresses and timestamps) under its own privacy policy,
  https://www.cloudflare.com/privacypolicy/. The developer does not control
  that.
- **Address lookup (STUN):** each browser asks Cloudflare's public STUN server
  (stun.cloudflare.com) for its own public IP address, which is how WebRTC finds
  a direct path. That server sees the browser's IP address and nothing else.
- **No relay:** there is no TURN relay, so the connection fails on some
  networks, such as some corporate ones. Copy or file transfer then works with
  the same code.

## Permissions

- `cookies` — read and restore cookies for the selected site.
- `scripting` — run a one-time, user-initiated collect/restore function in the
  selected tab for localStorage, sessionStorage, IndexedDB and Cache Storage.
- `storage` — hold the on-device "Skip the code" setting and
  the short-lived "ready" result while the popup is closed.
- Host access (all `http://` and `https://` sites) — declared so sessions can
  be transferred for any site the user is logged into. Data is read only on
  demand, for the selected origin and any extra sign-in sites the user lists.

## Contact

Raviteja Kamalapuram — raviteja369.k@gmail.com
