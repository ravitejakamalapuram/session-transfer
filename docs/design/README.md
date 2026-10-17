# Session Transfer design reference

The popup's visual language, written down so new screens match the old ones. Source of truth for values is
`extension/src/popup/index.css`; this file explains them and records the rules. If the two disagree, fix one in the
same PR.

## Principles

1. **One primary action per screen.** Home has Transfer and Receive; every other view has exactly one green button.
2. **Say what happened, in plain words.** Every state the user can reach has a sentence that says what is going on and
   what to do next. No spinner without a label, no error without a next step.
3. **Honest over reassuring.** Never imply encryption, success or safety that did not happen (see
   `product-facts.yaml`). Partial results are amber, not green.
4. **Fits in 380 px.** The popup is 380 px wide and closes on focus loss, so anything the user must keep (a package,
   a code) is saved before they switch windows.

## Tokens

All colours are CSS custom properties on `:root`. Dark theme only (the popup has no light mode; do not add one
without a reason from users).

| Token | Value | Use | Contrast on `--surface` |
|---|---|---|---|
| `--bg` | `#080b11` | page background | |
| `--surface` | `#0f1523` | cards, rows, radios | |
| `--surface-2` | `#111827` | nested surface | |
| `--code-bg` | `#05070b` | inputs, package/code boxes | |
| `--border` | emerald 18% | default borders | |
| `--border-strong` | emerald 50% | selected/focused borders | |
| `--text` | `#f3f4f6` | primary text | 16.6 : 1 |
| `--text-2` | `#9ca3af` | secondary text, values | 7.2 : 1 |
| `--text-3` | `#8b93a1` (set by #31; `#6b7280` until it merges) | hints, captions, footer | 5.9 : 1 (3.8 : 1 before #31) |
| `--accent` | `#10b981` | primary button, success | 7.2 : 1 |
| `--accent-2` | `#34d399` | hover, success text | 9.5 : 1 |
| `--cyan` | `#22d3ee` | running / info | |
| `--amber` | `#fbbf24` | partial / warning | 10.9 : 1 |
| `--rose` | `#f43f5e` | failure / danger | 5.0 : 1 |

Rule: body text needs 4.5 : 1 against the surface it sits on. `--text-3` is `#6b7280` on `main` (3.8 : 1, fails AA
at 10 px); PR #31 lightens it to `#8b93a1`. Do not go darker.

Status colours always pair with a glyph (✓ ⚠ ✗ — ○) so colour is never the only signal.

### Type

| Role | Family | Size | Weight |
|---|---|---|---|
| Header title, buttons, section titles, data (hosts, counts, codes) | `--mono` | 11–13 px | 700 |
| Origin host | `--mono` | 16 px | 700 |
| Transfer code | `--mono` | 18–22 px, tracking 0.12–0.14em | 800 |
| Hints, callouts | `--mono` | 11 px minimum | 400 |

Minimum text size is **11 px**. Do not add new `style={{ fontSize: 10 }}` overrides; use `.hint` or `.callout`.

### Space and shape

- Body padding 16 px, vertical rhythm 14 px between blocks (`.body` gap), 10 px inside groups (`.gap`), 6 px tight
  (`.gap-sm`).
- Radius: 12 px cards and steps, 10 px buttons/inputs/callouts/radios, 8 px rows, 999 px badges.
- Motion: `.fade-in` (0.25 s) on view change, 0.12–0.2 s on hover/press. Nothing loops except the spinner.

## Components

| Component | Class / React | When to use |
|---|---|---|
| Button | `<Button variant="primary\|ghost\|danger" testid>` | Primary = the one main action. Ghost = secondary. Danger = destructive (Replace, Clear). Always full width in a column; side by side only inside `.step-actions`. |
| Link button | `.link-btn` | Tertiary actions (Back, Cancel) under the buttons. |
| Origin card | `.origin-card` + `.badge.ok\|none\|warn` | The site being acted on, at the top of Home. |
| Section title | `.section-title` | Uppercase label above a group. One per group. |
| Rows | `.rows` + `<ComponentRow>` | Per-component progress and results (cookies, storage…). |
| Step | `.step` (`.done`) | Numbered things the user must do in order (copy package, copy code). |
| Callout | `.callout.info\|warn\|danger\|ok` | One short paragraph of context. Danger = something failed; warn = the user should know before continuing. |
| Hint | `.hint` | One-line caption under a control. |
| Radio list | `.radio-list` + `.radio` (`.sel`) | Mutually exclusive choice with a description (Replace / Merge / Cancel). |
| Check row | `.check-row` | A single on/off setting. |
| Disclosure | `<details className="more">` | Power-user options (extra domains, Playwright export). |
| Big check | `.big-check` (`.warn`) | Result screen icon only. |
| Spinner + label | `<Loading label>` | Any wait over ~300 ms. The label says what is happening. |

## Patterns

- **Loading:** spinner plus a verb phrase ("Restoring and verifying…"). If it can exceed a few seconds, say so.
- **Errors:** `.callout.danger` with what failed in plain words, then a ghost "Try again" or "Back". Never show raw
  exception text alone.
- **Empty / unsupported page** (chrome://, the Web Store, a blank tab): explain why it cannot work here and what page
  to open instead.
- **Destructive choice:** a radio list with the safe option selected by default; the confirm button says the action
  ("Replace session"), not "OK".
- **Copy-to-clipboard:** the button text changes to "Copied ✓" for ~2 s and the step gets `.done`.

## Accessibility checklist (every UI PR)

- [ ] Every interactive element is reachable by Tab and has a visible `:focus-visible` ring
      (`box-shadow: 0 0 0 3px rgba(16,185,129,0.35)`).
- [ ] Every input has a `<label>`; icon-only controls have `aria-label`.
- [ ] Status changes that appear without a click (progress, results, errors) are in an `aria-live="polite"` region.
- [ ] Text meets 4.5 : 1; no text under 11 px.
- [ ] Nothing relies on colour alone.

## UX audit: open items

Tracked in [`docs/plans/2026-10-17-roadmap.md`](../plans/2026-10-17-roadmap.md). `--text-3` contrast, a focus ring on buttons, links and summaries, and the 11 px
minimum are fixed in PR #31.
