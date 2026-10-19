# Signalling Worker

A Cloudflare Worker that lets two copies of the extension swap WebRTC offer and answer SDP for
live transfer. It never sees the transfer secret, the package or any cookie.

## What it stores

One Durable Object per room holds the offer and the answer as opaque strings. The room is deleted
as soon as the answer is read, or 5 minutes after the offer was written (an alarm deletes it even
if nobody comes back). A second Durable Object per client IP holds a write counter, which is
deleted when its 10-minute window ends. Nothing else is stored, and the code logs nothing.

## API

All paths are `/room/:roomId/offer` or `/room/:roomId/answer`, where `roomId` matches
`^[a-z2-7]{6,8}$`.

| Request | Result |
| :--- | :--- |
| `PUT .../offer` | 201, or 409 if the room already has an offer |
| `PUT .../answer` | 201, or 409 if there is no offer yet or an answer is already set |
| `GET .../offer` | 200 with the body, or 404 |
| `GET .../answer` | 200 with the body and the room is deleted, or 404 |
| `OPTIONS ...` | 204 preflight |

Other responses: 400 for a bad `roomId` or an empty body, 404 for any other path, 405 for other
methods, 413 for a body over 16 KB, 415 unless the body is `text/plain` or `application/json`,
and 429 (with `Retry-After`) after 30 writes from one IP in 10 minutes. Reads are not rate limited.
CORS headers are sent only for `chrome-extension://<32-letter id>` origins, which are reflected.

## Tests

```sh
cd signal && npm test
```

Node 20 or later, no dependencies. The tests drive the real fetch handler against in-memory
fakes of the two Durable Objects (`src/logic.js` has no Cloudflare imports).

## Deploy

Run the **signal-deploy** workflow by hand from the Actions tab. It needs the repository secret
`CLOUDFLARE_API_TOKEN` (a token with the "Edit Cloudflare Workers" template) and, if the token can
reach more than one account, `CLOUDFLARE_ACCOUNT_ID`. The Worker is served at
`https://session-transfer-signal.<account-subdomain>.workers.dev`.

## After the first deploy

`wrangler.toml` turns Workers Logs and traces off, but check the dashboard before PRIVACY.md
says no request data is kept:

1. Workers & Pages, then `session-transfer-signal`, then Settings, then Observability: Workers
   Logs and Traces are both off, and no Logpush job or Tail Worker is attached.
2. The Logs tab shows no stored invocation logs after a test transfer. Live `wrangler tail` only
   streams while someone is watching and stores nothing.
3. The Metrics tab shows only aggregate counts, not URLs or room ids. If anything in the
   dashboard does keep request URLs, IPs or room ids, write down what and for how long, and put
   that in PRIVACY.md instead of "nothing is kept".
