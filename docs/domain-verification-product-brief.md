# Domain Ownership Verification

## Product brief

**Status:** Complete, open to iteration
**Date:** September 5, 2026
**Delivery window:** One week
**Related documents:** [README](../README.md) · [Technical specification](domain-verification-technical-spec.md) · [Challenge description](challenge-description.md)

This document states the user problem, principles, and decisions — the *why* and the *what*, kept terse. Mechanism lives in the [technical specification](domain-verification-technical-spec.md). Tradeoff reasoning already written up for a reader lives in the [README](../README.md#tradeoffs-and-limitations) and is not repeated here.

## Summary

Build a deployed, accessible product experience that allows a user to claim a domain and prove that they control its DNS. The core proof will use a unique TXT challenge published at a dedicated DNS name. The product will make the technical setup understandable, distinguish propagation from configuration mistakes, and give users a clear recovery path when verification fails.

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

## Product principles

1. **Say what is actually proven.** Use "control" in explanatory copy rather than implying legal ownership.
2. **Give users one safe change to make.** Keep the required DNS record isolated from existing root records.
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
- **A newer proof of DNS control moves the domain.** The previous holder is superseded, not blocked, and can win it back with a fresh proof. Nothing is disclosed before a valid proof; after a takeover, the new holder sees a transfer note for ten minutes, never the previous holder's identity. The previous holder's superseded explanation remains available. This is the shape of Resend's own Domain Claim feature; Clerk instead routes every dispute through support.
- **Verification is point-in-time.** Nothing re-checks a verified domain in the background. After success, the TXT record may be removed; the association remains until the user deletes it or a newer proof supersedes it.
- **Every recheck window starts with a click.** After a "wait for DNS" answer, the page rechecks itself for a bounded window while it stays open; there is no server-side polling or queue.
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
- The complete flow is accessible and deployed

### P1 — recovery and polish

- Recheck on the page for a bounded window after a user-initiated check, as a tradeoff for DNS propagation. Queued or any other long-lasting check is out of scope.
- Correct unfinished claims and delete existing claims. A domain can be edited only while it has never verified, to fix a typo before the record goes live; once it has verified at any point, its history belongs to that domain, so the user removes it and adds the corrected one
- Provide polished setup documentation and a short demo

### Out of scope

- Email-specific DNS configuration or email delivery, including SPF, DKIM, DMARC, MX, and CNAME records
- Editing DNS, direct DNS-provider integrations, or provider-specific setup instructions
- Legal ownership, domain registration, renewal, or registrar transfers
- Organization administration
- Durable verification after the user leaves through queues, scheduled jobs, or background workers; continuous revalidation, notifications, and a grace period before a lost verification takes effect
- Transfer cooldowns/grace periods, activity-based takeover blocks, and dispute handling, including support-run transfers
- Production hardening such as rate limiting, enterprise resolver infrastructure, soft deletion, and durable verification history

## Core user flow

An authenticated user claims a domain, receives one DNS instruction, runs a verification check, gets a specific diagnosis, and can correct or retry until the domain becomes persistently associated with their account. Mechanism for each step is in the [technical specification](domain-verification-technical-spec.md); the on-page recheck tradeoff is in the [README](../README.md#tradeoffs-and-limitations).

1. **Enter domain** — e.g. `recomendei.me`. No DNS is touched yet.
2. **Persist the claim.** The backend validates and stores it with a fresh token. State is `setup_required`, meaning only "not checked yet."
3. **Review DNS instructions** — type, name, full hostname, value, and TTL. The full hostname and token are copyable.
4. **Publish the record** at the DNS provider.
5. **Click Verify domain.** One DNS lookup runs; nothing looked up before this.
6. **See the result.** A match verifies; otherwise a specific diagnosis and next action.
7. **Wait on the page, or come back.** On "not found yet" or "DNS didn't respond," the page rechecks itself for a bounded window with a visible countdown and a stop control. **Check again** always works instead. Closing the tab ends it; a later visit shows the last result.
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
