# Screenshots

Every screen a user can reach, for anyone who would rather look than sign up. Captured from a local build on 2026-09-15.

## The domains list

Badges collapse the claim states by next action: Verified, Unchecked, Needs attention, Held elsewhere, Superseded. The name opens the domain; one menu per row holds Manage and Delete. Rows can be selected and deleted together; the page size and page number live in the URL.

![The domains list](images/domains-list.jpg)

## Adding a domain

Validation runs the same normalization the server uses, so the feedback is instant and specific. Adding never runs a DNS lookup.

![The add-domain dialog rejecting a URL](images/add-domain-validation.jpg)

## The record card

A domain that has never been checked. The domain is the page title, the check stands beside it, and the code's expiry is the one timestamp that can turn amber. Type, Name, Value, and TTL are laid out the way a DNS provider asks for them: Name is the provider-style label, the full hostname is spelled out underneath, and every value is copyable.

![An unchecked domain with its DNS record card](images/unchecked-record-card.jpg)

## Record not found

The first miss is usually propagation, so the copy says "yet", the code stays valid, and the checklist stays folded until opened. It stays open across a re-check.

![Record not found, with the troubleshooting checklist open](images/record-not-found.jpg)

## Value mismatch

The record exists but no value matches. The expected value sits beside what DNS actually returned, so the fix is a comparison rather than a guess.

![Value mismatch, expected versus found](images/value-mismatch.jpg)

## DNS did not respond

A lookup that timed out or was refused. Nothing needs changing; the user retries.

![Temporary DNS error](images/temporary-dns-error.jpg)

## Expired

A code past its seven days. The previous record is shown struck through for reference, and the only way forward is a new code.

![An expired code with its previous record](images/expired.jpg)

## Verified

Verification is point in time. The record card is gone and the user is told the TXT value can be removed.

![A verified domain](images/verified.jpg)

## Superseded

The previous holder's view after another account proved control: the row in their list, and the claim itself with the date, the invalidated code, and the way back.

![The domains list, with recomendei.me marked Superseded](images/superseded-in-list.jpg)

![The superseded claim's detail page](images/superseded-detail.jpg)

## Deleting a verified domain

The confirmation says what deletion means: the domain is free for anyone who controls its DNS.

![The delete confirmation for a verified domain](images/delete-confirmation.jpg)

## Not pictured

Held elsewhere with its Take over dialog, and the notice email the previous holder receives.
