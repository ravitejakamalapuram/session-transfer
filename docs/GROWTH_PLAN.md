# Growth plan: marketing and adoption

Rules for everything below: use only claims marked **safe** or **narrow** in [`product-facts.yaml`](../product-facts.yaml),
with the wording given there. No install numbers, ratings, speed claims or "secure" claims without a source. The
extension makes no network requests and has no analytics (a promise in the privacy policy), so progress is measured
from public numbers, not from in-product tracking.

## 1. Who we are for, in order

1. **Developers and QA** (recurring need, will tell others): move a logged-in session between profiles, and start
   Playwright tests already logged in (*Export for Playwright*, new in 1.4.0).
2. **People changing browser or computer** (one-off need, large audience): move a logged-in site without signing in
   again.
3. **Support and success teams** reproducing a customer's logged-in state in a clean profile (only with the user's
   own sessions; say so).

One line for each, all within the checked facts:

- Developers: "Carry a logged-in session between Chrome profiles, or save it as a Playwright storageState file."
- Everyone: "Move a logged-in website to another Chrome profile or computer. Local only, no account."

## 2. Store listing (the biggest lever)

The listing text is in `extension/store-listing.md` (copied into `CHROMEWEBSTORE.md`, `chrome-store/store.config.json`
and `app-metadata.json`). Already done in 1.4.0: a *For developers and QA* block and the smaller permission list.

To do by hand in the Chrome Web Store dashboard (the API cannot edit listings, the `listing` workflow opens a checklist
issue):

- [ ] Captions on the five screenshots: what the user sees and the result ("Press Transfer", "Paste on the other
      browser", "Verification report"). The current images have none.
- [ ] A 30 to 60 second demo video (script below). Listings with a video are easier to trust for a tool that touches
      logins.
- [ ] Search wording in the first two sentences of the description: "move your login to another browser", "transfer
      cookies between Chrome profiles", "export session", "Playwright storageState". Keep the summary under 132 chars.
- [ ] Put the privacy policy link and "no servers, no account, no analytics" in the first screen of the description.
- [ ] Reply to every review for the first 90 days.

**Demo video script (45 s, no voice needed, captions only)**
1. 0 to 8 s: logged-in site in Profile A. Caption: "Logged in here."
2. 8 to 18 s: click the extension, *Transfer Session*, *Copy*. Caption: "One package, nothing leaves the computer."
3. 18 to 35 s: Profile B (logged out), *Receive Session*, paste, *Import*. Verification report shows. Caption: "Restored and checked."
4. 35 to 45 s: More options, *Export for Playwright*, run a 3-line test that opens a logged-in page. Caption: "Tests start logged in."

## 3. Trust (a tool that handles logins is judged on this)

- [ ] Keep the permission list at the minimum and justify each one in plain words (done for 1.4.0: `tabs` dropped).
- [ ] Publish the threat model link on the store page and README (it is already in `extension/docs/threat-model.md`).
- [ ] Say plainly that the default package is not encrypted and the encrypt option exists (done in the listing).
- [ ] Ask one outside reviewer (a security-minded developer) to read the code and say so publicly, if they agree.
- [ ] Never claim: "secure", "one-time", "self-destructs", "works with every site" (see `product-facts.yaml`).

## 4. Where to post (drafts below), in order

| When | Where | Audience | Angle |
|---|---|---|---|
| Launch week | Show HN | developers | the Playwright storageState export and the local-only design |
| Launch week | r/QualityAssurance, r/webdev | QA, developers | start tests logged in without scripting a login |
| Launch week | dev.to or Hashnode post | developers | "How to move a logged-in session between Chrome profiles" (also a search page) |
| Week 2 | r/chrome, r/browsers | everyone | switching browsers without logging in again |
| Week 2 | Playwright and testing newsletters, Discord/Slack communities | QA | the export feature |
| Ongoing | answer existing questions ("how do I copy my login to another profile") with the tool, where the rules allow | everyone | direct help |

Read each community's self-promotion rules first; post once, answer every comment, do not cross-post the same text.

**Show HN draft**
> Show HN: Session Transfer, move a logged-in Chrome session between profiles (open source)
>
> I kept re-logging into the same sites when switching Chrome profiles and computers, so I built a Manifest V3
> extension that copies a site's cookies, localStorage, sessionStorage, IndexedDB and Cache Storage to another
> profile and checks the result. It runs locally: no server, no account, no analytics. The package is not encrypted
> by default (anyone with it can use the session), and there is an option to encrypt it with a code you send
> separately. For test automation it can also save the current site's cookies and localStorage as a Playwright
> storageState file. Honest limits: passkeys, hardware keys and TLS-bound state cannot be moved. Code and threat model:
> https://github.com/ravitejakamalapuram/session-transfer

**Reddit (QA) draft**
> Tired of scripting a login at the start of every test? I made a free, open-source Chrome extension that saves the
> logged-in site's cookies and localStorage as a Playwright storageState file (More options → Export for Playwright).
> sessionStorage and IndexedDB are not part of that format. It is local only, no account. Feedback welcome, especially
> on sites where it does not work.

## 5. Pages that bring search traffic (GitHub Pages site)

Each page is short, answers one question, shows the steps, and links to the extension:

1. "How to transfer a logged-in session to another Chrome profile"
2. "How to stay logged in when you switch browsers or computers"
3. "Start Playwright tests already logged in (storageState from a real browser session)"
4. "What cannot be copied between browsers (passkeys, hardware keys) and why"

## 6. Other browsers

- **Edge**: the extension is Manifest V3 on Chromium. Submit the same build to Microsoft Edge Add-ons (free, manual
  submission); test the Playwright suite with Edge's Chromium channel first. Do not say "works in Edge" until that has
  been run.
- **Brave, Opera, Vivaldi**: allow loading from the Chrome Web Store; test once each and note results in the README.
- **Firefox**: needs a port (different background and scripting APIs). Scope it only if Edge and Chrome numbers justify
  it.

## 7. Product ideas that raise adoption (not built yet)

- **Saved environments** (dev, staging, prod) for developers: name a package and restore it in one click.
- **A command-line helper** that turns a package into storageState without opening the popup.
- **File drop on the Receive screen** to cut one step.
- **Optional review prompt** shown once, only after a verified restore, using a local counter (no tracking).

## 8. Measuring without tracking

| Signal | Where | Goal for the first 90 days |
|---|---|---|
| Store impressions to installs | Chrome Web Store dashboard | rising week over week |
| Rating and review text | Store page | 4.5 or higher, with review text read monthly |
| Issues and questions | GitHub issues | every one answered within 3 days |
| Stars and referrers | GitHub traffic page | which post sent people |
| Uninstall reasons | Store dashboard survey | fix the top reason |

## 9. 30 / 60 / 90 days

- **Days 1 to 30**: ship 1.4.0, caption the screenshots, record the video, write search pages 1 and 3, post Show HN and
  the QA post, answer every comment.
- **Days 31 to 60**: Edge submission, search pages 2 and 4, post in the other communities, read the first reviews and fix
  the top complaint.
- **Days 61 to 90**: decide on saved environments and the command-line helper from the issues received; decide on Firefox.

## 10. Risks

- **Store policy**: tools that read cookies are scrutinised. Keep permissions minimal, the privacy policy current, and every
  listing claim checked against `product-facts.yaml`.
- **Misuse**: a session file is as powerful as a password. The popup says so on every save; keep it that way and do
  not market it for use on accounts that are not the user's own.
- **One-off use**: consumers use it once. Developer and QA features (Playwright export, saved environments) are what
  bring people back.
