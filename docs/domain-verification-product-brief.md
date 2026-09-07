# Domain Ownership Verification

## Product brief

**Status:** Complete, open to iteration
**Date:** September 5, 2026
**Delivery window:** One week
**Related documents:** [README](../README.md) · [Technical specification](domain-verification-technical-spec.md) · [Challenge description](https://resend.notion.site/Product-engineer-36dc40d6c4ef80d5a962f37bbd39c153)

This document states the user problem, principles, and decisions — the *why* and the *what*, kept terse. Mechanism lives in the [technical specification](domain-verification-technical-spec.md). Tradeoff reasoning already written up for a reader lives in the [README](../README.md#tradeoffs-and-limitations) and is not repeated here.

## Summary

Build a deployed, accessible product experience that allows a user to claim a domain and prove that they control its DNS. The core proof will use a unique TXT challenge published at the claimed name itself, carrying a self-identifying value prefix so it coexists with the records already there. The product will make the technical setup understandable, explain that a missing record may reflect propagation or a configuration mistake, and give users a clear recovery path when verification fails.

The experience proves control of DNS at the time of verification. It does not establish legal ownership of a domain.

## Objective

Enable a user to complete domain verification confidently without needing to understand DNS internals or contact support.

The product should demonstrate:

- Clear technical guidance for a trust-sensitive workflow
- Predictable state transitions and actionable failures
- Safe handling of competing claims and untrusted input
- Strong TypeScript modeling across the frontend and backend
- A focused scope that can be completed and polished within one week

## User and job to be done

The primary user owns or administers a domain but may have limited DNS experience.

> When I need to connect my domain to a service, help me prove that I control it, understand exactly what to change, and recover from mistakes without putting my existing DNS configuration at risk.

The second job is claim resolution. Resend uses *claim* for taking over a domain that another account has already verified — a former agency, a contractor, or a colleague's old account still holds it. This product serves that job with the same DNS proof: whoever can publish the challenge now takes the domain, and the previous holder is told, so no dispute needs a support ticket.

> When my domain is already verified under someone else's account, let me prove control and take it over myself, and tell the other account what happened.

In this document and the code, *claim* names every domain a user adds, whatever its state; the takeover is the real *claiming* case of it.

## Product principles

1. **Say what is actually proven.** Use "control" in explanatory copy rather than implying legal ownership.
2. **Give users one safe change to make.** One TXT record with a self-identifying value, added beside whatever the name already carries, never replacing it.
3. **Make failures diagnostic.** Distinguish a missing record, mismatched value, and temporary DNS failure.
4. **Never make propagation look like user error.** Explain that DNS changes can take time and make retries safe.
5. **Keep infrastructure details private.** Show actionable messages to users, discard classified resolver details, and correlate unexpected server failures with a request ID.
6. **Make verification authoritative on the backend.** The browser may request and display a check, but it cannot decide that a domain is verified, and it holds no credential that can change a claim.

## Assumptions

- A purpose-specific TXT challenge satisfies the ownership requirement; email-authentication records such as SPF and DKIM are not required.
- The user has access to the DNS provider responsible for the entered domain.
- DNS records are public, so the token needs no confidentiality after publication — only unpredictability before it.
- Provider-specific DNS interfaces differ. The core experience is provider-agnostic and treats the fully qualified hostname as canonical.
- The production deployment has a persistent database and a backend capable of performing public DNS TXT lookups.

## Decisions

- **There is a durable user identity (Clerk).** A claim is an account association (user/domain), not a browser session.
- **A domain is exclusive to one verified account at a time**, enforced atomically in the database.
- **The exact entered name is proven, never the parent.** A claim for `mail.example.com` does not verify `example.com` or any sibling.
- **A newer proof of DNS control moves the domain.** The previous holder is superseded, not blocked, and can win it back with a fresh proof. Nothing is disclosed before a valid proof; every pending claim is told unconditionally that verifying takes the domain over if another account holds it, which sets the expectation without revealing whether this particular one is held. After a takeover, the new holder sees a transfer note for ten minutes, never the previous holder's identity. The previous holder sees the superseded claim in their list; when configured, we also attempt a best-effort email through Resend after the response. Neither message names the new holder. Because anyone with DNS access can move a domain back the other way, both the email and the superseded claim point the reader at their team, or whoever manages the domain, before they take it back — the product resolves control, not intent. This is the shape of Resend's own Domain Claim feature; Clerk instead routes every dispute through support.
- **Verification is point-in-time.** Nothing re-checks a verified domain in the background. After success, the TXT record may be removed; the association remains until the user deletes it or a newer proof supersedes it.
- **Every check starts with a click.** There is no polling on the page or the server. After a "wait for DNS" answer the copy says DNS can take time, and the user checks again when ready.
- **Claim creation and verification are two separate steps in a strict order.** Adding a domain persists the claim and issues a token but never triggers a lookup.

Supporting reasoning lives in [README § Tradeoffs and limitations](../README.md#tradeoffs-and-limitations).

## Scope

### P0 — core release

- Authenticated users can claim an eligible domain or subdomain and receive one copyable TXT instruction
- Verification applies only to the exact claimed name and is decided by the backend
- Each check produces a distinct, actionable outcome and preserves the challenge across retries
- Expired or compromised challenges can be deliberately replaced
- A successful proof creates one active account association; a newer proof atomically supersedes it, explains the change to both accounts, and never exposes either account's identity
- Verification is point-in-time: the TXT record is not required after success
- The complete flow is accessible and deployed at [https://domainkeep.vercel.app](https://domainkeep.vercel.app)

### P1 — recovery and polish

- Correct unfinished claims and delete existing claims. A domain can be edited only while it has never verified, to fix a typo before the record goes live; once it has verified at any point, its history belongs to that domain, so the user removes it and adds the corrected one
- Attempt a privacy-safe email to the previous holder through Resend after each takeover, including repeat losses. Delivery is best-effort: missing configuration skips sending, and failed sends are not retried. The superseded claim remains the in-app signal
- Provide polished setup documentation and a short demo

### Out of scope

- SPF, DKIM, DMARC, MX, and CNAME setup for the claimed domain
- Editing DNS, direct DNS-provider integrations, or provider-specific setup instructions
- Legal ownership, domain registration, renewal, or registrar transfers
- Organization administration
- Background verification after the user leaves; automatic rechecks of verified domains, rules for ending claims when DNS control is lost, and success notifications
- Transfer cooldowns/grace periods, activity-based takeover blocks, and dispute handling, including support-run transfers
- Production hardening such as rate limiting, enterprise resolver infrastructure, soft deletion, durable verification history, and durable notification retries

## Core user flow

An authenticated user claims a domain, receives one DNS instruction, runs a verification check, gets a specific diagnosis, and can correct or retry until the domain becomes persistently associated with their account. Mechanism for each step is in the [technical specification](domain-verification-technical-spec.md).

1. **Enter domain** — e.g. `example.com`. No DNS is touched yet.
2. **Persist the claim.** The backend validates and stores it with a fresh token. State is `setup_required`, meaning only "not checked yet."
3. **Review DNS instructions** — type, name (`@`), full hostname, value, and TTL. The full hostname and value are copyable.
4. **Publish the record** at the DNS provider.
5. **Click Verify domain.** One DNS lookup runs; nothing looked up before this.
6. **See the result.** A match verifies; otherwise a specific diagnosis and next action.
7. **Come back or check again.** On "not found yet" or "DNS didn't respond," the page explains that DNS can take time and that the code stays valid. **Check again** runs one more lookup; a later visit shows the last result.
8. **Recover if needed.** Replacing the token is a separate, deliberate action; the previous value stops working.

## State transitions

The state model is derived from durable facts rather than a stored status. The technical specification defines the exact priority order and transaction behavior.

| Current state | Event | Guard | Durable change | Result |
| --- | --- | --- | --- | --- |
| — | Create claim | Valid, eligible domain | Store domain, token, and expiry | `setup_required` |
| Pending | Failed check | Active token | Replace latest check result only | Diagnostic failure state |
| Pending | Successful check | Active token, exact TXT match | Set `verifiedAt`; supersede any current holder and stamp `tookOverAt`, atomically | `verified` |
| Pending | Replace challenge | Authorized user | Replace token and expiry; clear latest check | `setup_required` |
| Pending | Seven days pass | — | No write; state is derived from expiry | `expired` |
| Verified | Newer proof by another account | Valid competing proof | Set `supersededAt`; clear `tookOverAt`; expire old token | `superseded` |
| Superseded | Replace challenge | Authorized previous holder | Issue a fresh token and expiry | `setup_required` with prior loss noted |
| Any state | Delete claim | Authorized user | Hard-delete the claim | Removed; domain released if verified |

The domains list does not show these seven states. It shows four labels grouped by what the user does next; the detail page names the exact state.

| Label | States | What the user does |
| --- | --- | --- |
| Verified | `verified` | Nothing |
| Unchecked | `setup_required` | Publish the record and run the first check |
| Needs attention | `record_not_found`, `value_mismatch`, `temporary_dns_error`, `expired` | Open the domain; the detail page names the fix |
| Superseded | `superseded` | Open the domain; another account took it |

The third label is "Needs attention" rather than "Failed" because a missing record may still be propagating, and principle 4 forbids making that look like a mistake. Superseded stays its own label because it is the previous holder's in-app signal; the takeover email points back to it.

## Trust and safety principles

- Generate challenges only on the backend, from a cryptographically secure source.
- Authorize every read, retry, replacement, and release action against the owning account.
- Treat DNS observations as untrusted input; bound stored and displayed values.
- Disclose nothing about other accounts' claims before a valid proof; after a takeover, say that the domain moved, never who held it.
- Never disclose the identity of an account currently or previously associated with a domain.
- Change claims only from the backend. The browser's session can read its own rows and nothing else.
- Never claim that DNS control establishes legal ownership.

Enforcement is defined under [authorization](domain-verification-technical-spec.md#authorization) and [observability and privacy](domain-verification-technical-spec.md#observability-and-privacy) in the technical specification.

## Success criterion

A user can complete the deployed flow without explanation, understand and recover from each result, and never create two active verified associations for the same domain.
