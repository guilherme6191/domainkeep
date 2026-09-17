# Screenshots

Every screen a user can reach, for anyone who would rather look than sign up. Captured from a local build on 2026-09-17.

## The domains list

Eight states, eight labels, and beside each one the single next step it asks for — so the list reads as a to-do list rather than a status board. The domains with work left sort above the verified ones. The name opens the domain; one menu per row holds the rest.

![The domains list, each state with its next step](images/domains-list.jpg)

The menu is where a row acts. A check appears only on the states another lookup could still change, so the four that are waiting on DNS offer one and the four that are settled or need a decision do not. Delete is set apart from the two that navigate.

![A row's menu, with Check, Manage and Delete](images/row-menu.jpg)

Narrow enough and the two right-hand columns give up their space to the name, and the next step moves under the badge it belongs to. Guidance that scrolls off the side is guidance nobody reads.

![The list on a phone, the next step under each badge](images/domains-list-narrow.jpg)

Rows can be selected and deleted together; the page size and page number live in the URL.

## Adding a domain

Validation runs the same normalization the server uses, so the feedback is instant and specific. Adding never runs a DNS lookup.

![The add-domain dialog rejecting a URL](images/add-domain-validation.jpg)

## The record and its check

A domain that has never been checked. One card holds the whole step: the three-step strip at its head says where the domain is, the record follows, and the single button that acts on it closes the card, so reading top to bottom ends at the action. Type, Name, Value and TTL are laid out the way a DNS provider asks for them: Name is the provider-style label, the full hostname is spelled out underneath, and every value is copyable.

![An unchecked domain, at step one of three](images/unchecked-record-card.jpg)

## Record not found

The first miss is usually propagation, so the copy says "yet", the code stays valid, and the checklist stays folded until opened. It stays open across a re-check.

![Record not found, with the troubleshooting checklist open](images/record-not-found.jpg)

## Value mismatch

The record exists but no value matches — the one outcome that proves something was published, so the strip moves to step two. The panel opens with the fix, and the expected value sits beside what DNS actually returned, so correcting it is a comparison rather than a guess.

![Value mismatch at step two, expected versus found](images/value-mismatch.jpg)

## DNS did not respond

A lookup that timed out or was refused. Nothing needs changing and nothing was learned about the record, so the strip stays at step one and the user retries.

![A temporary DNS error, with nothing to change](images/temporary-dns-error.jpg)

## Expired

A code past its seven days. The first step renames itself and turns amber, because nothing can move until the code is replaced. The previous record is shown struck through for reference, and the only way forward is a new code.

![An expired code, its first step renamed](images/expired.jpg)

## Held elsewhere

The record matched, so the strip reaches step two — but another account holds the domain. Nothing has moved and nobody has been told; the transfer runs only on an explicit Take over, and leaving it alone is offered beside it as an answer in its own right.

![Held elsewhere, with Take over and Leave it](images/held-elsewhere.jpg)

The confirmation that follows. Cancelling sends nothing; the other account learns of the transfer only if the user goes ahead.

![The Take over confirmation dialog](images/takeover-dialog.jpg)

## Verified

Verification is point in time. All three steps are done, the record is gone from the page, and the user is told the TXT value can be removed.

![A verified domain, all three steps done](images/verified.jpg)

## Moved away

The previous holder's view after another account proved control. Their row is the first in the list above; the claim itself carries the date, the invalidated code, and the way back — a new code, which is again the first step.

![The moved-away claim's detail page](images/superseded-detail.jpg)

## Deleting a verified domain

The confirmation says what deletion means: the domain is free for anyone who controls its DNS.

![The delete confirmation for a verified domain](images/delete-confirmation.jpg)

## Not pictured

The notice email the previous holder receives after a takeover.
