# Plan: crash reports and a daily fix routine

Status: proposed, waiting on the owner's choice of crash source.

## What exists today (checked 2026-10-18)

- The extension sends no crash or usage data. There is no Sentry, Firebase,
  Crashlytics or analytics code, and PRIVACY.md promises "no network
  transmission" and "no analytics".
- The Chrome Web Store developer dashboard has no crash report and its API only
  covers publishing and item status, so there is nothing to fetch from the store.
- Firebase Crashlytics is for Android, iOS and Flutter apps; it does not cover
  browser extensions.
- On 2026-10-18 every unit test (47) and every end-to-end test (28 of 28 that run
  in this sandbox) passed on both `main` (the store version, 1.4.0) and the
  release branch. No crash reproduces from code.

So a routine that "fetches crashes" has no source until the extension gets one.

## Recommended source: user-sent reports as GitHub issues

1. Record errors on the device. The popup (`window.onerror`,
   `unhandledrejection`) and the service worker (`self.onerror`,
   `unhandledrejection`, failed message handlers) append an entry to a ring
   buffer of the last 20 errors in `chrome.storage.local`. Each entry holds the
   version, the step (send, receive, restore, export), the error name, the
   message and the stack. `core/logger.ts` only redacts metadata keys, so it is
   not enough for this text. Before an entry is stored, displayed or copied, a
   text-level sanitizer keeps only the error name from a fixed allowlist, cuts
   the message to a short length, replaces URLs, origins, email addresses and
   any long token-like string (20 or more letters, digits, `-`, `_` or `=`) with
   `[redacted]`, and reduces each stack frame to the extension's own file name
   and line number. It never holds cookie or storage values, origins or file
   contents. The sanitizer gets unit tests with cookie-, token- and URL-shaped
   input, and the report preview shows the already-sanitized text.
2. When an error is shown to the user, the error screen gets a
   "Report this problem" button. It first shows the report text (the entry,
   Chrome version and OS) in the popup; nothing leaves the device at this point.
   Only after the user presses "Copy and open GitHub" does the extension copy
   the text and open a blank
   `https://github.com/ravitejakamalapuram/session-transfer/issues/new?labels=crash`
   page, where the user pastes it and chooses whether to submit. Report
   contents are never placed in the URL, so opening the page transmits nothing.
   The extension itself still contacts no server, so the privacy promise holds;
   PRIVACY.md gets one line saying the user may choose to send an error report
   to GitHub.
3. The body starts with a fingerprint line `fp: <error name>@<top stack frame>`
   so duplicates can be grouped.

Why this over a crash service: a third-party error SDK would break the
"no network, no analytics" promise, adds a host permission, and makes the
extension look more like an infostealer to EDR and DLP tools, which is already
a known risk. The GitHub route costs no account, token or money.

## The fetch step the routine runs

No script is needed; the routine uses the GitHub tools already connected to
this project:

1. `search_issues` with `repo:ravitejakamalapuram/session-transfer is:issue
   is:open label:crash -label:triaged`.
2. Group by the `fp:` line; pick the group with the most reports.
3. Reproduce with a failing unit or Playwright test, fix, open a PR against the
   current release branch, then label the issues `triaged` and link the PR.
4. If no untriaged crash issue exists, end with no PR and no message.

## Routine prompt (created after this plan is accepted)

"Daily at 09:00 IST: run the fetch step in
docs/plans/2026-10-18-crash-reports.md. Fix the top new crash group with a
regression test that fails before the fix. Follow the merge gate in project
memory. Post in the thread only when a PR is opened or a fix is blocked."

## One-time setup for the owner

- None for GitHub; the connector already reaches the repository.
- Approve the PRIVACY.md line and the error-screen link (owner-only file).

## Not doing

- A crash service (Sentry, Firebase): breaks the privacy promise, see above.
- Store reviews scraping: no API, few reviews, and they rarely carry a stack.
