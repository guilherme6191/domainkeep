# How this was built

Domainkeep started as a one-week build. This page narrates the sequence: what the problem is, how it was scoped, how the design fell out of that, and what changed once the thing was real. The two documents it links to, the [product brief](docs/domain-verification-product-brief.md) and the [technical specification](docs/domain-verification-technical-spec.md), were written before the code and are the artifacts of that process.

## The problem

Proving that someone controls a domain is a small feature with a large failure surface. The proof itself is simple: publish one TXT record with a value only this product could have issued, and look it up. Everything around it is hard, for three reasons.

- **DNS is asynchronous and eventually consistent.** A record that was published a minute ago may not be visible yet, and a lookup that fails now may succeed on the next try. A product that reports the first miss as an error is telling the user they made a mistake when they may have done everything right.
- **DNS is outside the product's control.** The user edits it in someone else's system, through a provider interface that differs from every other provider's, and the product only ever sees the result. It cannot fix a typo for them; it can only describe what it saw clearly enough for them to find it.
- **Users make mistakes in someone else's system.** The wrong name, a value pasted with quotes, a record placed at the zone root instead of the subdomain, a CNAME already at that name. Each has a different fix, and a generic "verification failed" hides which one applies.

What is proven also needs care. A DNS check establishes control of the zone at that moment, not legal ownership, and the copy says so throughout.

## Scoping

The work was timeboxed to a week. The brief identified the hard part as the failure and recovery path, not the CRUD around it: each check has to produce a distinct, actionable outcome, and propagation must never look like user error. That shaped what was cut.

The brief's [scope section](docs/domain-verification-product-brief.md#scope) records the decisions as a core release, a recovery-and-polish tier, and an out-of-scope list. In short:

- **In:** claim an exact name, receive one copyable TXT instruction, check on demand, get a diagnosis with a next action, replace an expired or compromised code deliberately, let a newer proof take a domain over from another account after the prover confirms, correct a never-verified domain, and email the previous holder after a takeover.
- **Out:** editing DNS, provider integrations, SPF and DKIM setup, legal ownership, and organization administration. Alongside those sit the pieces of production work that were deferred on purpose: background verification and automatic rechecks, transfer cooldowns and dispute handling, rate limiting, attempt history, and durable notification retries. None of them changes whether a user can understand and recover from a failed check, and the README's tradeoffs take each one up in turn.

Authentication stayed in scope even though a session-only prototype would have been faster. A claim is an account/domain association, and competing claims only mean something when accounts are durable. See the [README's tradeoffs](README.md#tradeoffs-and-limitations) for the reasoning.

## Technical design

The [technical specification](docs/domain-verification-technical-spec.md) owns the mechanisms, and the README's [Architecture](README.md#architecture) section summarizes them. Rather than restate either, here is where each design question is answered:

- **The state model.** There is no stored status column; the view state is derived on the server from durable fields in a strict priority order. The [state ladder](docs/domain-verification-technical-spec.md#state-behavior) explains why superseded outranks expired and why `held_by_another` needs no rung of its own.
- **The exclusivity rule.** It lives in Postgres, as a partial unique index and one transfer function. The [reassignment section](docs/domain-verification-technical-spec.md#reassignment-and-atomicity) walks through the races that transaction closes.
- **Where verification runs.** Only in a request the user started, with at most one lookup each; nothing polls. The [DNS routes section](docs/domain-verification-technical-spec.md#the-dns-routes-return-200-for-every-classified-outcome) covers why verifying and taking over are separate requests and why the second one resolves DNS again.
- **What DNS is trusted to say.** Nothing, until it is classified. [DNS lookup and matching](docs/domain-verification-technical-spec.md#dns-lookup-and-matching) bounds what is kept and shown.

## Decisions and tradeoffs

The README's [Tradeoffs and limitations](README.md#tradeoffs-and-limitations) section states each decision with its cost: required authentication, exact-name verification, takeovers that neither side can attribute, point-in-time verification, confirmation before a transfer, narrow correction and final deletion, and no rate limiting. It is not repeated here.

## Building and iterating

The brief and spec came first and were revised before any application code, settling the root TXT record, click-only checks, the list labels, and the takeover email. The application landed on the third day, and most of the remaining time went to what running it against live DNS taught.

- **The record Name field.** Every claim first showed `@` in the Name column. For a subdomain, someone editing the parent zone pastes that, publishes at the apex, and gets record-not-found. Most providers take the label relative to the registrable domain and append the rest themselves, so the card now shows that label, with the full hostname spelled out underneath as the invariant to check against for the delegated zones where it is not.
- **Copying the value.** The table shows a short form of the token, and the clipboard sometimes refuses. The copy button carries the full value, a refused copy raises a toast, and a popover exposes the whole value for manual selection.
- **Verified claims dropped the record card.** Once the proof is complete the TXT value has no ongoing job, so the verified panel tells the user they may remove it instead of showing it. Decisions moved from token age to the derived state, so the client never reads the expiry to decide anything.
- **Takeover became a question.** The latest design change was to stop a matching proof from moving a held domain by itself. Verifying now reports that the domain is held elsewhere, and the transfer waits for an explicit confirmation and a fresh lookup. The brief, spec, and README were updated to match.
- **The list grew up.** Pagination from the URL, row selection, and bulk delete arrived, along with server rendering of the first page and the same retry path the detail page already had.
- **Copy was trimmed** to one idea per state, and red was reserved for superseded claims so the previous holder's signal stands out.

[TODO: owner] Anything the commit history does not show: what surprised you, what you would do differently, and what you would build next.
