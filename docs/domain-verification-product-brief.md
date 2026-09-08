# Domain Ownership Verification

## Product brief

**Status:** Complete, open to iteration
**Date:** September 7, 2026
**Delivery window:** One week
**Related documents:** [README](../README.md) · [Technical specification](domain-verification-technical-spec.md) · [Challenge description](https://resend.notion.site/Product-engineer-36dc40d6c4ef80d5a962f37bbd39c153)

This brief owns the user problem, product rules, and scope. Mechanisms live in the [technical specification](domain-verification-technical-spec.md); tradeoff reasoning lives in the [README](../README.md#tradeoffs-and-limitations).

## Summary

Help users prove DNS control with one TXT challenge at the claimed name. Explain the setup and provide recovery for missing records, mismatched values, and temporary DNS failures. A missing record may reflect propagation or a configuration mistake.

The experience proves control of DNS at the time of verification. It does not establish legal ownership of a domain.

## Objective

Enable a user to complete domain verification confidently without needing to understand DNS internals or contact support.

## User and job to be done

The primary user owns or administers a domain but may have limited DNS experience.

> When I need to connect my domain to a service, help me prove that I control it, understand exactly what to change, and recover from mistakes without putting my existing DNS configuration at risk.

The second job is a self-service transfer after a sale, agency handoff, or account migration. A new DNS proof moves the association and informs the previous holder. This resolves control, not disagreements about who should hold the claim; dispute handling is out of scope.

> When my domain is already verified under someone else's account, let me prove control, decide whether to take it over, and tell the other account what happened.

Here, *claim* names every account/domain association, including one not yet verified. A *takeover* moves a verified association to another account.

## Product principles

1. **Say what is actually proven.** Use "control" in explanatory copy rather than implying legal ownership.
2. **Give users one safe change to make.** One TXT record with a self-identifying value, added beside whatever the name already carries, never replacing it.
3. **Make failures diagnostic.** Distinguish a missing record, mismatched value, and temporary DNS failure.
4. **Never make propagation look like user error.** Explain that DNS changes can take time and make retries safe.
5. **Keep infrastructure details private.** Show actionable messages to users, discard classified resolver details, and correlate unexpected server failures with a request ID.
6. **Make verification authoritative on the backend.** Authorize each operation, generate unpredictable challenges server-side, and treat DNS observations as untrusted input. Browser credentials cannot write directly to the database.

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
- **A newer proof of DNS control moves the domain, once its owner confirms.** Verifying proves control; it never transfers by itself. The previous holder sees a superseded claim and can recover with a new challenge — also by confirming. Guidance asks both to check with whoever manages the domain first, since shared DNS access permits transfers in either direction.
- **Disclose a holder only after proof, never an identity, and never transfer without asking.** Before a matching proof, a held domain is indistinguishable from a free one. A matching proof establishes control of the DNS, whether the prover holds it alone or shares access with the current holder — so telling them the domain is held elsewhere discloses nothing the proof did not already earn, and lets them stop. The winner sees a ten-minute transfer note; the previous holder's superseded explanation persists.
- **Verification is point-in-time.** Nothing re-checks a verified domain in the background. After success, the TXT record may be removed; the association remains until the user deletes it or a newer proof supersedes it.
- **Every check starts with a click.** Adding a domain issues instructions without a lookup. There is no polling; retries reuse the same code until its seven-day expiry or deliberate replacement.

The transfer flow is inspired by [Resend Domain Claim](https://resend.com/docs/dashboard/domains/claim), but deliberately omits its grace-period and activity-based safety blocks. This product associates accounts with domains; it does not operate a sending service that a transfer could interrupt.

## Scope

### P0 — core release

- Authenticated users can claim an eligible domain or subdomain and receive one copyable TXT instruction
- Verification applies only to the exact claimed name and is decided by the backend
- Each check produces a distinct, actionable outcome and preserves the challenge across retries
- Expired or compromised challenges can be deliberately replaced
- A successful proof creates one active account association; a newer proof, confirmed by the account that made it, atomically supersedes it, explains the change to both accounts, and never exposes either account's identity
- Verification is point-in-time: the TXT record is not required after success
- The complete flow is accessible and deployed at [https://domainkeep.vercel.app](https://domainkeep.vercel.app)

### P1 — recovery and polish

- Correct a domain only if it has never verified; otherwise delete it and add the corrected domain. Deletion is permanent and does not change DNS
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

## User flow and feedback

Enter a domain (e.g. `example.com`), publish the supplied TXT record, and click **Verify domain**. The instructions show type, name (`@` for a root, the relative label for a subdomain), required full hostname, value, and TTL. Copy failures offer manual selection; failed deletion shows an error toast. A DNS check returns success, a diagnosis with a next action, or — when the record matches a domain another account holds — a dialog naming the situation and offering **Take over** or **Cancel**. Cancelling sends nothing and leaves both accounts as they were; the domain stays held, with the same choice available later. Users can correct DNS and retry with the same code, or deliberately replace it and publish the new value.

The list groups outcomes by next action; the detail page gives the diagnosis. The spec owns the [state ladder](domain-verification-technical-spec.md#state-behavior) and [field transitions](domain-verification-technical-spec.md#reassignment-and-atomicity).

| Label | States | What the user does |
| --- | --- | --- |
| Verified | `verified` | Nothing |
| Unchecked | `setup_required` | Publish the record and run the first check |
| Needs attention | `record_not_found`, `value_mismatch`, `temporary_dns_error`, `expired` | Open the domain; the detail page names the fix |
| Held elsewhere | `held_by_another` | Open the domain; decide whether to take it over |
| Superseded | `superseded` | Open the domain; another account took it |

"Needs attention" avoids treating possible propagation as failure. "Superseded" remains distinct as the previous holder's in-app signal.

## Success criterion

A user can complete the deployed flow without explanation, understand and recover from each result, and never create two active verified associations for the same domain.
