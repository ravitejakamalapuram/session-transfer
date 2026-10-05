# Plan: live laptop-to-laptop transfer (WebRTC)

Status: **parked**. Agreed direction from the 2026-10-05 design discussion; not scheduled.
Pick it up only after steps 1 and 2 below ship and QA users ask for direct transfer.

## Goal

Move a session package from Chrome on laptop A to Chrome on laptop B while both are open,
without copying a file or a block of text. Package bytes are never stored on a server; the
signaling Worker briefly holds only SDP/ICE for pairing. If either side is offline, the transfer
does not happen.

## Decisions

- **No cloud database or relay that stores packages.** It breaks the "fully local, no server"
  promise in the README and privacy policy, would trigger a Web Store data-disclosure review,
  and makes our server a place where live logins sit.
- **WebRTC data channel, with a tiny signaling Worker.** WebRTC still needs a rendezvous to swap
  offers/answers and ICE candidates. A Cloudflare Worker (Durable Object or KV with a short TTL)
  relays only that signaling, never package bytes, and forgets a room after `TRANSFER_TTL_MS`.
- **No TURN server in v1.** Without it, some corporate and symmetric-NAT networks will fail to
  connect. On failure the UI falls back to the existing encrypted file / copy flow. Revisit only
  if failure rates justify paying for TURN (all data through it is still end-to-end encrypted).
- **One transfer code drives both discovery and encryption**, split into two parts
  (magic-wormhole pattern):
  - `roomId`: ~30 random bits, sent to the Worker to pair the two browsers.
  - `secret`: 128 random bits, **never leaves the two laptops**. It derives the AES-256-GCM key
    for the package, exactly as `keyMode: 'code'` does today (`src/core/crypto.ts`).
  - Never derive `roomId` from `secret`, and never send a hash of the whole code to the Worker:
    a short code could then be brute-forced offline by whoever runs the Worker.
- **Encrypt at the app layer, not only with WebRTC's DTLS.** The Worker relays the SDP, so it could
  swap DTLS fingerprints and sit in the middle. AES-GCM with the code-derived key over the data
  channel means a middleman only ever sees ciphertext. v1 also binds the session: each side's first
  message is an HMAC (keyed from `secret`) over both DTLS fingerprints, and either side aborts on
  mismatch before any package bytes are sent.
- **Long generated code in v1, no PAKE.** The extension generates the code (about 32 base32
  characters) and the user copies it to the other laptop over a second channel. A short typeable
  code ("7-guitar-ocean") is only safe with a PAKE (SPAKE2 / CPace), which WebCrypto lacks; that
  means a new crypto dependency, so it is a later step.

## Order of work

1. **Encryption on by default.** Today `keyMode` defaults to `'none'` (`src/core/crypto.ts`,
   `src/popup/App.tsx` `requireCode` starts `false`). Flip the default, update README, listing and
   privacy copy. This is a bigger gain than any transport.
2. **Admin kill switch and honest listing.** Read a managed-policy key (`chrome.storage.managed`,
   with a `managed_schema`) so companies can disable export/import. State plainly in the listing
   that the tool is for the user's own accounts and for QA.
3. **WebRTC transfer** (this plan), only once there is demand:
   1. Signaling Worker, rate-limited per IP, TTL = 5 min, stores nothing but SDP. ICE uses
      non-trickle gathering: each side waits for `iceGatheringState === 'complete'` and sends one
      SDP that already carries its candidates, so there is no separate ICE endpoint.
      - Sender: `PUT /room/:roomId/offer` with its SDP, then polls `GET /room/:roomId/answer`.
      - Receiver: `GET /room/:roomId/offer`, then `PUT /room/:roomId/answer` with its SDP.
      - The room is deleted once the answer is read, or at TTL.
      - Repo location to decide (likely a reusable worker in release-platform or appforge-kit if
        another app can share it).
   2. Offscreen document (`chrome.offscreen`, reason `WEB_RTC`) owns the `RTCPeerConnection`,
      because the service worker has no WebRTC and the popup closes when it loses focus.
      Adds the `offscreen` permission (no install warning) and the Worker origin.
   3. Sender: build the package as today with `keyMode: 'code'`, show the combined code, open the
      room, exchange the fingerprint-binding HMAC, then send ciphertext in chunks over the data
      channel.
   4. Receiver: "Receive from another laptop" field takes the code, joins the room, reassembles,
      then runs the existing import/restore path unchanged (origin binding, expiry checks).
   5. Failure path: after a connect timeout, offer the encrypted file / copy flow with the same code.

## Tests to write first

- Code parsing: split, checksum, reject malformed codes.
- `roomId` and `secret` are independent (secret never appears in any signaling request; assert on
  a mocked fetch).
- Package round-trip over a mocked data channel, including chunking and a tampered chunk failing.
- Fingerprint-binding HMAC mismatch aborts before any package bytes are sent.
- Expired room and expired package are both rejected.
- Managed policy set: export and import are refused with a clear message.

## Risks that do not go away

- Copying session cookies between machines is what infostealers do. Corporate EDR/DLP may flag it
  whatever the transport, and Chrome's Device Bound Session Credentials will make some sessions
  fail on the second machine by design. Document this; do not try to evade it.
- The Worker is new infrastructure (small, free tier), so it needs monitoring and an abuse limit.
- Adding a network endpoint changes the privacy policy and store disclosures. Today's README,
  PRIVACY.md and listing say "fully local, no server"; keep those claims until launch, then
  rewrite them (and scope any "nothing is stored" wording to package bytes) in the same release.
