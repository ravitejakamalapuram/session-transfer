# Edge Add-ons submission checklist

Manual steps in Partner Center (Microsoft Edge program). All copy to paste is in
[`edge-store/listing.md`](../edge-store/listing.md). Microsoft's reference:
<https://learn.microsoft.com/microsoft-edge/extensions/publish/publish-extension>.

## Before you start

- [ ] Build the package: `cd extension && npm ci && npm run zip`. It builds `extension/dist` and zips
      it to `extension/session-transfer-v<version>.zip` (manifest at the zip root). Upload that zip, not
      the Chrome Web Store download.
- [ ] Smoke test in Edge (the repo's tests run in Chromium, not Edge): `edge://extensions` →
      Developer mode → **Load unpacked** → `extension/dist`. Sign in to a site in one Edge profile,
      **Transfer Session**, then **Receive Session** in a second Edge profile and check the report passes.
      Try **Export for Playwright** once.

## Partner Center

1. [ ] Partner Center → **Edge** workspace → **Create new extension** → drop the zip. Fix any
       validation error and upload again.
2. [ ] **Availability**: Visibility **Public** (or **Hidden** for a link-only soft launch; flip later).
       Markets: leave **all markets**.
3. [ ] **Properties**: category, website, support contact and mature content from the listing file.
4. [ ] **Privacy**: single purpose, the five permission justifications, "No" to remote code,
       "Authentication information" as the only data-collection box, all certification boxes,
       privacy policy URL.
5. [ ] **Store listings** → English (United States) → **Edit details**:
       - Description and search terms from the listing file. Skip the AI-generated description; it
         invents claims the facts file forbids.
       - Logo `extension/icons/icon128.png`; tiles and the four screenshots from
         `extension/store-assets/` (same files as the Chrome listing, in the same order).
       - Name and short description come from the manifest and cannot be edited here.
6. [ ] **Submit**: paste the **Notes for certification** from the listing file, then submit.
7. [ ] After it is published, copy the Edge listing URL and ID from the extension **Overview** page into
       `app-metadata.json` (a new module entry) so the next change can use them.

## Updates

Each release is a separate upload here. After the release workflow bumps the version, run
`npm run zip` on that commit, upload the zip under **Packages**, and submit again.
Existing Edge users update automatically.

## Known Edge differences (no code change in this PR)

- **Rate link points to the Chrome Web Store.** `FEEDBACK_URL` in `extension/src/popup/App.tsx`
  (popup footer, "Rate or report a problem") is the Chrome Web Store reviews page. An Edge user
  lands on the Chrome store. Once Edge assigns the ID, the fix is small: pick the URL by
  `chrome.runtime.id` (Chrome ID `fnfmlchbfofjdfeibgdkcibfjjlfcefc`, otherwise
  `https://microsoftedge.microsoft.com/addons/detail/<edge-id>`), so one build serves both stores.
- **Name and short description say "Chrome".** They come from `extension/manifest.config.ts` and are
  read-only in Partner Center. Accurate, but odd on the Edge store. Changing them for Edge only needs
  a build flavor (a second manifest name/description); decide before the first submission, since the
  name is what Edge users search and see.
- **Packages record `browser: 'Chrome'`.** `extension/src/background/service-worker.ts` writes it into
  each package's source metadata; nothing reads it, so it is harmless.
- Everything else works unchanged: the extension uses only the `cookies`, `scripting`, `storage`,
  `tabs`, `windows` and `runtime` APIs, all supported in Edge, no `chrome.storage.managed`, no Chrome-only
  APIs, and no welcome page. Partitioned-cookie reads fall back if the browser rejects the option.

## Later option: automated Edge publishing

Microsoft has an Edge Add-ons Publish API (API key from Partner Center → **Publish API**) that
uploads a zip and submits it for an existing listing. It cannot create the first listing or edit
listing text, so it only pays off once updates are routine. It would be a second target in
`release.yaml` / the shared release-platform workflow, with the client ID and API key as repo
secrets. Not set up now.
