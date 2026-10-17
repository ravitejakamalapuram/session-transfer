# Plan: WebRTC live transfer, first slice

Status: **approved to plan** by the owner on 2026-10-17 ("Build it now"), which reverses the 2026-10-05 decision to
park it. This plan comes first; building starts only after the plan is reviewed and the encryption-default release
has shipped.

This plan adds to `extension/docs/cross-device-transfer-plan.md` (PR #29). That plan already settles the protocol: a
signalling Worker that stores only SDP, a two-part code (`roomId` + 128-bit `secret`), app-layer AES-GCM, an HMAC
bound to the DTLS fingerprints, an offscreen document, no TURN in v1, and a fallback to copy or file. Everything
below covers the parts that plan left open.

## Why this costs more than it looks

The product's main trust claim is that the extension makes no network requests (README, PRIVACY.md, store listing
"No servers, no account, no analytics"). Live transfer ends that claim. The code is small. The real cost is the
privacy policy and listing rewrite, a new disclosure on the store's privacy tab, and a server we have to keep up.
The listing title targets another profile on the same computer, and that case gains nothing from WebRTC. Live
transfer only helps when the two browsers are on different computers.

## Signalling server

**Choice: one Cloudflare Worker with a Durable Object per room.**

- A Durable Object gives each room one consistent owner, so offer and answer cannot race. KV is eventually
  consistent and its free tier allows only about 1,000 writes a day, which caps us at roughly 300 transfers a day.
- Endpoints, unchanged from PR #29: `PUT/GET /room/:roomId/offer` and `PUT/GET /room/:roomId/answer`. The room is
  deleted once the answer is read, or after 5 minutes.
- Location: a new `signal/` folder in this repo, deployed with `wrangler` by a manual `workflow_dispatch` job. That
  follows the rule against costly automatic CI. It moves to release-platform only if a second app needs it.
- Origin: a `workers.dev` subdomain to start, so no domain purchase is needed.

**Monthly cost: $0 at expected volume.** The Workers free plan covers 100,000 requests a day. One transfer is
about 4 to 20 requests, depending on how long the sender polls, so 1,000 users each making a few transfers a day
stay far below that. The Workers Paid plan ($5 a month) is needed only if we pass the free limits or want longer
log retention. These figures come from Cloudflare's published plans; check them again on the day we deploy. A TURN
server is the only real cost (usage-billed, for example Cloudflare Realtime TURN) and v1 does without one.

## Abuse and privacy exposure

What the Worker sees: the `roomId`, two SDP blobs (which hold IP addresses, ports and DTLS fingerprints), each
side's IP and user agent, and timing. It never sees the `secret`, the package or any cookie.

| Risk | Mitigation in v1 |
| :--- | :--- |
| IP addresses of both laptops pass through our server | Store nothing beyond the 5-minute room; no request logging in the Worker; say so in PRIVACY.md |
| Someone guesses a `roomId` and joins first | 30-bit room space plus a 5-minute TTL and one answer per room; a wrong joiner still cannot decrypt, and the HMAC check aborts before any bytes are sent |
| The Worker is used as a free relay or for spam | Rate limit by IP (for example 30 room writes per 10 minutes), a 16 KB cap on each SDP body, CORS limited to the extension's origin |
| Whoever runs the Worker tampers with SDP to sit in the middle | App-layer AES-GCM plus the fingerprint HMAC from PR #29 |
| Corporate EDR or DLP flags session cookies moving between machines | Same as today: documented and not evaded. A live channel may look worse to DLP than a file does |
| A stolen session moves faster | Same as the copy flow: the code must reach the other laptop through a second channel |

## Changes the owner makes

These stay with the owner, per the working rules. Claude drafts each one as a PR for approval and does not merge it.

- **PRIVACY.md**: replace "no network requests" with a scoped statement. Live transfer contacts one signalling
  server, which sees IP addresses and connection metadata only, keeps nothing after 5 minutes, and never sees the
  session. Copy and file transfer still make no requests.
- **Store listing and privacy tab**: the "No servers" line becomes "No servers unless you use live transfer", and
  the data-disclosure answers need a fresh review. The website-content and authentication answers stay "not
  transmitted to the developer".
- **README**: the same scoping as PRIVACY.md.
- **Cloudflare account**: the owner creates the account and the Worker, and adds a deploy token as a repository
  secret.

## Smallest useful first slice

Ship live transfer as **"Send to another computer (beta)" under More options**, off the main buttons:

1. `signal/` Worker with the four endpoints, rate limit, size cap and TTL, plus unit tests run with
   `wrangler dev`.
2. Offscreen document (`offscreen` permission, reason `WEB_RTC`) that owns the `RTCPeerConnection`. The Worker
   origin is covered by the existing `https://*/*` host permission, so the install warning does not change.
3. Sender: build the package with `keyMode: 'code'`, show one 32-character code, and wait up to 2 minutes.
4. Receiver: a field on the Receive screen takes the code, and the existing import path runs unchanged.
5. Failure: after the timeout, offer the existing copy or file flow with the same code.
6. Tests: the list from PR #29, plus an end-to-end test that runs two browser contexts against a local Worker.

Left for later: TURN, short typeable codes (these need a PAKE), QR codes, and transfer without the popup open.

## Blockers for the owner

1. Create a Cloudflare account (free) and add `CLOUDFLARE_API_TOKEN` as a repository secret.
2. Approve the PRIVACY.md and listing wording PR when it is drafted.
3. Confirm the beta label and the More options placement.

## Order

1. This plan PR is reviewed and merged.
2. The encryption-default release ships (#35 and the release PR to main).
3. Build PR: the Worker and the offscreen slice, held until the PRIVACY.md PR is approved, then merged in the same
   release as that PR.
