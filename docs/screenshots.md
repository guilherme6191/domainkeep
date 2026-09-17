# Screenshots

Every screen a user can reach, for anyone who would rather look than sign up. Captured from a local build on 2026-09-15.

## The domains list

Every state names itself, and the next step sits beside it, so the list reads as a to-do list: the domains that still need something sort above the verified ones. The name opens the domain; one menu per row holds Manage and Delete, and the rows another lookup could still change add a Check to the menu and show one under the pointer. Rows can be selected and deleted together; the page size and page number live in the URL.

![The domains list](images/domains-list.jpg)

## Adding a domain

Validation runs the same normalization the server uses, so the feedback is instant and specific. Adding never runs a DNS lookup.

![The add-domain dialog rejecting a URL](images/add-domain-validation.jpg)

## The record and its check

A domain that has never been checked. The domain is the page title, the line under it says which of add record, check and verified the domain is at, and the code's expiry is the one timestamp that can turn amber. The record and the button that checks it share one card, so reading the page top to bottom ends at the action. Type, Name, Value, and TTL are laid out the way a DNS provider asks for them: Name is the provider-style label, the full hostname is spelled out underneath, and every value is copyable.

![An unchecked domain with its DNS record card](images/unchecked-record-card.jpg)

## Record not found

The first miss is usually propagation, so the copy says "yet", the code stays valid, and the checklist stays folded until opened. It stays open across a re-check.

![Record not found, with the troubleshooting checklist open](images/record-not-found.jpg)

## Value mismatch

The record exists but no value matches. The panel opens with the fix, and the expected value sits beside what DNS actually returned, so correcting it is a comparison rather than a guess.

![Value mismatch, expected versus found](images/value-mismatch.jpg)

## DNS did not respond

A lookup that timed out or was refused. Nothing needs changing; the user retries.

![Temporary DNS error](images/temporary-dns-error.jpg)

## Expired

A code past its seven days. The previous record is shown struck through for reference, and the only way forward is a new code.

![An expired code with its previous record](images/expired.jpg)

## Held elsewhere

The record matched, but another account holds the domain. Nothing has moved and nobody has been told; the transfer runs only on an explicit Take over. This one is the previous holder taking their domain back after being superseded, so the note above the alert names when it moved.

![Held elsewhere, with the Take over button](images/held-elsewhere.jpg)

The confirmation that follows. Cancelling sends nothing; the other account learns of the transfer only if the user goes ahead.

![The Take over confirmation dialog](images/takeover-dialog.jpg)

## Verified

Verification is point in time. The record card is gone and the user is told the TXT value can be removed.

![A verified domain](images/verified.jpg)

## Moved away

The previous holder's view after another account proved control: the row in their list, and the claim itself with the date, the invalidated code, and the way back.

![The domains list, with recomendei.me marked Moved away](images/superseded-in-list.jpg)

![The moved-away claim's detail page](images/superseded-detail.jpg)

## Deleting a verified domain

The confirmation says what deletion means: the domain is free for anyone who controls its DNS.

![The delete confirmation for a verified domain](images/delete-confirmation.jpg)

## Not pictured

The notice email the previous holder receives after a takeover.
