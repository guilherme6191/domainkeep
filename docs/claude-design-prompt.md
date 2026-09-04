# Claude Design prompt — Domain verification flow

> Paste everything below the divider into Claude Design (`/design`). It describes one
> canvas of artboards covering every state of the main domain-verification page.

---

Create a design canvas for the **main domain-verification page** of a product that lets a
user claim a domain and prove they control its DNS by publishing a TXT record.

Use **stock shadcn/ui components with their default styling** — this is a one-week
take-home, not a design-system exercise. Do not invent a bespoke visual language. The
craft should show up in the *copy, the state coverage, and the information hierarchy*, not
in custom chrome.

Draw the artboards at **1440×900** desktop unless noted, laid out left-to-right in flow
order.

## Product context

The flow has **two clearly separated stages, and the separation should be visible in the
design.**

**Stage one — claim.** The user enters a domain (e.g. `recomendei.me`). It is saved to
their account and a 64-character hex token is generated. **No DNS lookup happens yet.**
The screen's job here is purely instructional: here is the one record to publish.

**Stage two — prove.** The user publishes a TXT record at `_resend-verify.recomendei.me`,
then clicks **Verify domain**. The backend does a single lookup and returns one of:
verified, record not found, value mismatch, temporary DNS error, or expired challenge.

Two consequences that shape the UI:

- The user never sees a failure state before they've had a chance to configure anything.
  The state right after adding a domain is *"not checked yet,"* not *"failed."* Design it
  as a neutral, instructional state — no destructive colors, no alarm, no empty error slot.
- **There is no background sync.** The first check happens only when the user clicks the
  button. After a "not found yet" or "DNS didn't respond" answer, the page rechecks every
  ten seconds for ten minutes *while it stays open*, says so in one muted line with a
  countdown and a **Stop checking** link, and stops on its own when the answer changes or the
  window runs out. Closing the tab ends it; coming back shows the last result and waits
  for a click. So the design still has to carry what a live dashboard would: state the
  last-checked time plainly, explain that DNS propagation can take minutes to hours, and
  make clicking **Check again** feel like the normal, cost-free next move rather than an
  admission of failure.

The whole point of the product is that **failure states are as designed as the happy
path** — the user must always know whether to fix something, wait, or retry.

Copy must say *control of DNS*, never *legal ownership*.

## Visual approach

**Theme.** shadcn/ui **dark mode defaults** — the zinc/neutral palette, `background`
`#09090B`, `card` slightly raised, `border` `#27272A`, `muted-foreground` for secondary
text. Default `--radius` of `0.5rem`. Inter (or the shadcn default sans). No gradients, no
glows, no custom shadows.

**Semantic color, used sparingly.** Only four signals exist on this page:
- Success → green, on the `Verified` badge and the success alert only.
- Needs attention / waiting → the default `secondary` or `outline` badge and a neutral
  alert. **Failures that might just be propagation must not use `destructive`.**
- Warning → amber, reserved for the superseded state: something happened to the user,
  not something they did wrong.
- Hard error → shadcn `destructive`, reserved for the expired-challenge state alone.

**Components to use, straight from shadcn:**
- `Card` + `CardHeader` / `CardTitle` / `CardDescription` / `CardContent` for each section.
- `Input` + `Label` for the domain field, `Button` for actions (`default` for primary,
  `outline` or `secondary` for secondary, `disabled` + spinner for loading).
- `Badge` for status (`Verified`, `Pending`, `Not started`).
- `Alert` + `AlertTitle` + `AlertDescription` for every result state.
- `Table` for the DNS record.
- `Separator`, `Skeleton`, and `Tooltip` where they naturally apply.
- Monospace (`font-mono`, `text-sm`) for every DNS value — hostname, token, observed
  values. This is the one typographic decision that matters.

**Layout.** A single centered column, `max-width: 768px`, generous vertical rhythm. A
minimal top bar with the product name on the left and an avatar on the right is enough —
**no sidebar**. This product has one real surface; don't build navigation around it.

## Artboards

Produce these, in order, each labeled:

**1 · Add domain (empty)**
A single `Card`: title "Add a domain", description "Verify that you control a domain by
adding one DNS record." Inside, a `Label` + `Input` with placeholder `example.com` and
helper text "Enter the exact domain or subdomain you want to verify." Primary `Button`
reading `Add domain`. Below the card, one muted line: "We'll only ask you to add one TXT
record. Nothing about your website or existing email changes."

**2 · Setup required**
Two stacked cards. The first is a compact summary: the domain in `font-mono`, a `Pending`
badge, and a metadata row of muted label/value pairs — `Added`, `Challenge expires`.

The second card is the instruction: title "Add this DNS record", description "Add the
following record at your DNS provider." Inside, a `Table` with columns
`Type · Name · Value · TTL` and one row: `TXT` / `_resend-verify` / the hex token
(truncated as `a1b2c3d4…9f8e7d6c`) / `Auto`. A copy button on the value cell. Below the
table, a muted note: "Your provider may append your domain automatically — the full
hostname should end up as `_resend-verify.recomendei.me`. If a verification value already
exists, replace it with this token or add this token as another TXT value if your provider
supports multiple values." Card footer holds the primary
`Button`: `Verify domain`.

**No alert region and no error styling anywhere on this artboard.**

**3 · Checking**
Identical to 2, but the button is `disabled` with a spinner and the label `Checking DNS…`.

**4 · Record not found**
The state the user will hit most often, and the one most likely to be mis-designed. A
default (non-destructive) `Alert` above the record card: title "We couldn't find the
verification record yet." Description: "It may not have propagated yet, or it may be
published at a different name. DNS changes can take anywhere from a few minutes to a few
hours."

Inside the alert, a four-item list — "A few things worth checking" — each one muted line:
- The record name is exactly `_resend-verify` — some providers append your domain
  automatically, so check it didn't become `_resend-verify.recomendei.me.recomendei.me`.
- The value was pasted, not retyped. A single wrong character in 64 will fail.
- The record was added to the zone for `recomendei.me`, not a different domain.
- The record type is TXT, not A or CNAME.

Then, after a `Separator`, a closing line: "If everything above looks right, it's almost
certainly propagation. Come back and check again in a little while — your code stays
valid and retrying is free."

The metadata row now includes `Last checked · Seconds ago`. Button reads `Check again`.
Below the record card, one muted line: "Checking again in 7s. We'll keep trying for
another 9 minutes while this page is open, then stop. Click Check again any time you'd
rather not wait, or come back later — your code stays valid. Stop checking" with
`Stop checking` as an inline text link. `Check again` stays enabled throughout. **Do not use `destructive`, and do not
add a spinner or a live status dot** — the line is the whole indicator, and it must be
honest about being bounded to this page. Also draw the variant after the window has run
out: the line reads "We stopped checking after ten minutes. Your code is still valid —
click Check again whenever you're ready. DNS can occasionally take a few hours."

**5 · Value mismatch**
The most important artboard. A default `Alert`: "We found the record, but its value
doesn't match." Below it, inside the card, a two-column comparison. Left column labeled
`Expected`, the token in `font-mono` with a copy button. Right column labeled `Found at
this name`, listing the observed value(s) in `font-mono` `muted-foreground`, each with a
small `×`. Truncate long values safely. Closing line: "Replace the value at
`_resend-verify.recomendei.me` with the expected token, or add the expected token as
another TXT value if your provider supports multiple values, then check again."

**6 · Temporary DNS error**
A default `Alert`, deliberately calmer than 4 and 5: "DNS didn't respond. Your record may
still be correct." Description: "This is a problem on the lookup side, not your
configuration. There's nothing to change — try again in a moment." The only action is
`Check again`.

**7 · Expired challenge**
The one place `destructive` appears. `Alert variant="destructive"`: "This verification
code has expired." Description: "Codes are valid for seven days." The record table is
dimmed to ~40% with the token struck through. Primary button `Generate a new code`, with a
muted warning beneath: "The previous value will stop working. You'll need to update the
TXT record at your provider."

**8 · Verified**
Green success `Alert`: "You control recomendei.me." Description: "Verified on Aug 29, 2026
at 1:04 PM. This confirms DNS control at the time of the check — it doesn't establish
legal ownership." The summary card's badge now reads `Verified` in green. A quiet muted
line: "You can remove the `_resend-verify` TXT record now if you'd like." Secondary
`outline` button: `Remove domain`, which opens a stock `AlertDialog` confirming by name that
the association will end and the domain will become available to other accounts. Draw the
dialog as an overlay on this artboard rather than a separate one.

**9 · Verified after a takeover**
Artboard 8 with one extra line in the success alert: "This domain was verified on another
account before now. Your proof of DNS control moved it to yours." This is the **only**
place the product ever mentions another account, and only after the proof. A claim on a
domain someone else holds looks exactly like artboard 2 before that — no banner, no hint.

**10 · Superseded**
This account had the domain verified, and another account has since proved DNS control. An
amber warning `Alert`: "Another account proved control of recomendei.me." Description:
"You verified this domain on Aug 29, 2026, and it has since moved. The code you published
no longer proves anything. If you still control its DNS, generate a new code and verify
again to take it back." The badge reads `Superseded` in amber. Below, the record card
dimmed exactly as in artboard 7 — the old token is dead — with the primary button
`Generate a new code`. Do not name or hint at the other account, and do not style this as
the user's mistake.

**11 · Domains list**
Secondary artboard. Page heading `Domains` with a primary `Button` `Add domain` on the
right. A shadcn `Table`: columns `Domain · Status · Added`. Three rows using `Badge` —
one `Verified` (green), one `Pending`, one `Not started`. Keep it plain; no search or
filters needed at this scope.

**12 · Mobile — setup required** (`390×844`)
Artboard 2 reflowed for mobile: the record `Table` becomes stacked label/value pairs, each
with its own copy button, and `Verify domain` is a full-width button.

## Rules

- Use shadcn defaults. If a decision can be made by a stock component, let it be.
- Dark theme only — pick one and commit.
- **Nothing runs in the background.** The only automatic behaviour is the bounded
  on-page recheck described in artboard 4, and it is always announced in words with a way
  to stop it. No spinners for it, no live status dots. Every window starts with a click,
  and a visible `Last checked` timestamp does the work that a live indicator would.
- The gap between adding a domain and the first check must never look like a failure.
  Artboard 2 has no error affordance at all.
- Every failure state keeps the token visible and copyable. Never hide the user's progress
  behind an error.
- Retry always reuses the same token. Only artboard 7 offers a new code, and it warns
  first.
- Never show raw resolver codes, stack traces, or another account's identity.
- Show a visible focus ring on at least one artboard.
