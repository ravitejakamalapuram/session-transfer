# Plan: bugs, roadmap and suggestions

Goal: 1,000 users (33 on 2026-10-17, store version 1.2.3, rating 5.0 from 1 review). Items are ranked by expected
effect on installs or retention against effort. Anything that is not worth its cost is listed at the end with the
reason, so it is not picked up again by accident. Design rules for UI work: [`design/README.md`](design/README.md).

## Status of the store (checked 2026-10-17)

- The store still serves **1.2.3**. The 1.3.0 release on 2026-10-02 failed because 1.2.3 was still in review
  ("A new version cannot be uploaded until that review completes"). Nothing has been released since, so 1.3.0, 1.4.0
  (Playwright export, extra cookie domains, fewer permissions) and the unreleased fixes are not in users' hands.
- `release.yml` now releases on every merge to `main` that changes the shipped extension, so the next code merge ships
  everything above as one patch release.
- The live description still says packages are "encrypted with a one-time code", which is true for 1.2.3 and false
  once 1.3.0+ ships. The listing must be updated in the dashboard on the same day as that release.

## Now (in progress, one small PR each)

| # | Item | Why it matters | Effort |
|---|---|---|---|
| 1 | Design reference, contrast and focus fixes, CodeRabbit approval gate | Hints were 3.8 : 1 at 10 px (fails WCAG AA); buttons had no keyboard focus ring. | S |
| 2 | **Restore report lost when the destination tab opens** | Restoring from a New Tab page (the normal case on a fresh profile) switches tabs, which closes the popup, so the user never sees the result. "Open Website" only closed the popup. This is the moment that earns a review. | S |
| 3 | **Store listing: keywords and honest copy** | Title and summary do not contain what people search for ("copy login", "cookies", "Chrome profile", "Playwright"). The manifest says "Securely", which `product-facts.yaml` forbids. Listing text still names the 1.2.0 zip and promises dev/staging/prod moves the origin check refuses. | S |
| 4 | **Ask for a review once, after a verified restore** | Ratings drive store ranking and trust; there is 1 rating. Direct competitors have none, so 10 to 20 reviews would put this ahead of them. Local counter only, no tracking. | S |
| 5 | Receive errors keep the form; plain message for non-package text; clock skew allowance | A wrong code or pasted junk sends the user back to Home and clears the package (in the receive tab it closes the tab). Raw `SyntaxError` text is shown. A receiver clock a few minutes fast rejects fresh packages. | S |

## Next

| # | Item | Why | Effort |
|---|---|---|---|
| 6 | Welcome page on first install (three steps, pin the icon, the 5-minute window) | Most installs that never transfer anything are lost users; the two-browser flow is not obvious. | S |
| 7 | Ready screen warns when collection was partial or empty | It shows a green ✓ even when cookies failed or nothing was found. | S |
| 8 | Hard timeout and Cancel on Inspect and Restore; IndexedDB delete timeout | An app that holds its database open can leave "Restoring…" spinning forever with no way out. | M |
| 9 | Packages over ~8 MB are not kept when the popup closes | `storage.session` holds 10 MB; larger results are silently dropped and the user loses the package. Warn and keep the popup open, or keep the result in the receive tab. | M |
| 10 | Keyboard-reachable file picker, labels on package/code fields, `aria-live` on progress | Accessibility checklist in the design reference. | S |
| 11 | Submit the same build to Microsoft Edge Add-ons | Free second store, same Chromium build; Edge users search for the same thing. Run the Playwright suite on Edge first. | S (user) |
| 12 | One how-to page per search question on the GitHub Pages site (see `GROWTH_PLAN.md` section 5) | Search traffic that ends on the store page. | M |

## Later (only if the numbers justify it)

- Saved environments (name a package, restore later). Needs packages kept beyond 5 minutes, which weakens the safety
  story; only if users ask.
- File drop on the Receive screen.
- Firefox port (different background and scripting APIs).

## Not worth it (decided, do not reopen without new evidence)

- **Cloud sync or accounts.** Contradicts the local-only promise that is the product's trust advantage, and adds a
  server to secure and pay for.
- **General cookie editor.** Cookie-Editor owns that market; it dilutes the "move a whole session" position.
- **Chasing the Featured badge.** Google is not taking requests and the criteria are not published.
- **Live laptop-to-laptop transfer over WebRTC** (`extension/docs/cross-device-transfer-plan.md`, already parked).
  Needs a signalling Worker to run and secure, and copy/paste already works. Keep it parked until users ask for it.
- **In-product analytics.** The privacy policy promises none; measure with store and GitHub numbers instead.

## Needs the owner

Tracked on the "Waiting on you" page linked from the project thread.
