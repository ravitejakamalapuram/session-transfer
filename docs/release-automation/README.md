# Release and store-listing automation (install by hand)

All three workflows are installed in `.github/workflows/` and call release-platform.

| File | Install as | What it does |
| --- | --- | --- |
| `release.yml` | installed | Releases to the Chrome Web Store on every merge to `main` that changes shipped extension files (not tests, docs, CI, listing or store images). Push runs are a patch bump and publish when Google approves (`publish_type: default`). "Run workflow" still offers minor/major, `staged` and dry run. |
| `store-screenshots.yml` | installed | On a PR that touches popup code, regenerates the store screenshots and fails if `extension/store-assets/` would change. "Run workflow" on the PR branch commits the refreshed images. |
| `listing.yml` | installed | On a merge that changes `chrome-store/` or `extension/store-assets/`, validates the listing and opens one checklist issue. A person pastes the text and uploads the images in the Developer Dashboard (the store API cannot edit listings). |

## What counts as a change

- Shipped code changed: release, no listing work.
- Popup code changed and the screenshots differ: refresh the images (one click), merge, and the listing workflow opens one checklist issue.
- Listing text or image bytes changed: one checklist issue. Wording, claims (`product-facts.yaml`), the promo video and permission changes stay a person's decision.

## Order to install

1. Chrome Web Store dashboard: make sure the version in review (1.2.3 at the time of writing) is published or cancelled. With `staged` it would never go live by itself.
2. Settings: protect `main` (pull request required, plus the `ci / Validate and test` and `ci / Build chrome` checks). Releases now go live without a human step.
3. `store-screenshots.yml` (installed): open any PR that touches `extension/src`, and if the check is red run the workflow on that branch once. Do not make it a required check.
4. `listing.yml` (installed): Actions > listing > Run workflow (not a dry run) once, so the first checklist issue covers the refreshed images. Do the one dashboard upload from that issue.
5. `release.yml` (installed): run it once with "dry run", then leave it. To pause automatic releases: Actions > release > Disable workflow.

The platform also opens a "Demo video needed" issue while `promoVideo` is empty in `chrome-store/store.config.json`. The store accepts only a YouTube link for it; close the issue or add the link when there is one.
