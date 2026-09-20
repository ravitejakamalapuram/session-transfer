# Chrome Web Store — Preparation Checklist

## Build & package
- [x] `yarn build` produces a clean `dist/` (strict TypeScript, no errors).
- [x] `yarn zip` produces `session-transfer-vX.Y.Z.zip` from `dist/`.
- [x] Manifest V3, `manifest_version: 3`.
- [x] Strict CSP (`script-src 'self'`), no `eval` / `new Function` / remote scripts / inline scripts.

## Permissions
- [x] Minimal permission set: `cookies`, `scripting`, `tabs`, `storage`.
- [x] `host_permissions` limited to `http://*/*`, `https://*/*` (no `<all_urls>` content scripts).
- [x] Each permission justified in `README.md` and `manifest.config.ts`.
- [ ] Prepare a clear **permission justification** paragraph for the store review form
      (copy from README "Permissions" table).

## Privacy
- [x] No remote code, no analytics, no external network calls, no accounts.
- [ ] Provide a **Privacy Policy URL** (data is processed locally, nothing collected).
- [ ] Complete the **Data usage** disclosures: select "Does not collect user data".

## Listing assets
- [x] Icons: 16 / 32 / 48 / 128 px (`icons/`).
- [ ] Screenshots (1280×800 or 640×400): home, transfer-ready, receive, verification.
- [ ] Small promo tile (440×280) and marquee (optional).
- [ ] Short description (≤132 chars) + detailed description (from README).

## Quality / policy
- [x] Single clear purpose (session transfer) — no unrelated functionality.
- [x] No misleading claims; non-transferable state disclosed in-product and in docs.
- [x] Sensitive values never logged, displayed, or transmitted.
- [ ] Test on a fresh profile: install from zip, run a full transfer, confirm verification.
- [ ] Version bump in `package.json` (drives manifest version + zip name).

## Submission
- [ ] Register/verify a Chrome Web Store developer account (one-time fee).
- [ ] Upload the zip, fill listing, set visibility, submit for review.
