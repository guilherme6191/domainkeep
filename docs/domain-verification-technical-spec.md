# Domain Ownership Verification

## Technical specification

**Status:** Complete, open to iteration
**Date:** September 5, 2026
**Related documents:** [Product brief](domain-verification-product-brief.md) · [Challenge description](https://resend.notion.site/Product-engineer-36dc40d6c4ef80d5a962f37bbd39c153)

This document is the engineering counterpart to the product brief. The brief owns the user problem, principles, priorities, scope, and product decisions. This document owns architecture, API contracts, state modeling, persistence, and security. Where the two overlap, this document is authoritative on mechanism and the brief is authoritative on intent.

## Implementation Decisions

### Chosen stack

- **Application:** Next.js App Router, React, and TypeScript.
- **Client data:** TanStack Query for server-state reads, mutations, cache invalidation, and request feedback.
- **Backend:** Next.js route handlers. Server actions are not used for the claim workflow, so the verification surface stays a plain, testable HTTP boundary.
- **Identity:** Clerk.
- **Persistence:** Supabase Postgres, reached only from backend code through Supabase's Data API. Reads use the user's Clerk session token; writes use a separate client holding the server's secret key. See [Authorization](#authorization).
- **DNS:** A small adapter around `node:dns/promises`, keeping product-level result classification separate from resolver details.
- **UI:** Tailwind CSS and stock shadcn/ui components. No bespoke design system.
- **Deployment:** One Vercel deployment containing the frontend and route-handler backend, with Supabase as persistent storage.

### Terminology

- **Claim:** One account's association with one domain, from creation through verification. Every row is a claim. Resend uses the same word for the narrower act of taking a domain from another team; here that is a takeover.
- **Domain verification:** The complete journey from entering a domain to creating a persistent verified association.
- **DNS setup:** The user action of publishing the generated TXT challenge.
- **Verification check:** One backend DNS lookup requested by the client.
- **Latest check result:** The most recent check that did not complete verification, persisted only to guide the next user action.
- **Verified domain:** A domain persistently associated with an account after a successful check.
- **Superseded claim:** A claim that was verified once but whose association was ended by a later proof from another account.
- **Takeover:** A successful proof by one account that ends another account's current association with the same domain.

### Component responsibilities

**Clerk** authenticates the user, maintains the session, and supplies the stable user identifier the backend uses. It stores no domain-claim state.

**Frontend** collects the domain and displays validation feedback, presents one copyable DNS instruction, requests verification / correction / deliberate token replacement, and renders the derived claim state and latest check result. It never decides that a domain is verified. It reads and mutates exclusively through TanStack Query against the route-handler API.

**Backend** derives the user identifier from the authenticated session and never trusts a client-supplied owner ID. It normalizes and validates domains, creates and expires challenges, performs public DNS TXT lookups, classifies DNS results into product-level outcomes, atomically creates the verified association, and authorizes every claim read and mutation. It is the only holder of the credential that can write to the database.

**Database** persists the pending challenge, latest check result, and verified association; enforces exclusivity for verified normalized domains; and provides the authoritative state after concurrent verification attempts.

### HTTP boundary

The frontend communicates only with authenticated Next.js route handlers.

### The wire type

Every route that returns a claim returns the same `ClaimView`. It is a deliberate projection of `DomainClaim`, not the row itself:

```ts
interface ClaimView {
  id: string;
  domain: string;                  // normalized, ASCII
  verificationHostname: string;    // the claimed domain itself, precomputed
  token: string;
  recordValue: string;             // resend-verify=<token>, composed server-side
  tokenExpiresAt: string;          // ISO 8601
  verifiedAt: string | null;
  supersededAt: string | null;
  lastCheck: LastCheckView | null; // same union, dates as ISO 8601
  state: ClaimViewState;           // derived on the server
  tookOverAt: string | null;       // set when this proof displaced another account
  createdAt: string;
}
```

Three things about that shape are load-bearing.

**`ownerId` is absent.** It is never sent to a client, so no response can leak who holds or held a domain.

**`state` is computed on the server** by `getClaimViewState`, not recomputed in the browser. The client renders what it is told. Two implementations of the same priority ladder would eventually disagree, and the one in the browser would be the wrong one to trust.

**`tookOverAt` is stored on the winner's row**, written by the transfer transaction itself. It is the only fact about another account that a claim carries, and it is a timestamp rather than a reference, so it survives the other account deleting its row and needs no privileged read — see below.

### Takeover disclosure

The verified view shows the new holder's takeover note only during the ten minutes after `tookOverAt`. A client timer hides it while the page remains open, and a return visit uses the original timestamp rather than restarting the window. This is presentation only: it changes neither the stored timestamp nor transfer eligibility. The previous holder's superseded explanation does not expire on this timer.

Nothing about another account's claim is disclosed before a valid proof; otherwise authenticated users could enumerate customer domains without proving control. A held and an unheld domain therefore return the same `setup_required` view, and every pending check returns the same diagnoses. After a valid proof the response may say that the domain moved, but never identifies any account.

`supersededAt` records that the caller's own claim lost the association. `tookOverAt` records that the caller's proof ended another account's association, and when. The transfer transaction writes it on the winning row in the same statement that supersedes the loser: the transaction time if a holder was displaced, otherwise null. The same transaction clears it on the loser's row, so a claim carries at most one of the two facts: `tookOverAt` means this claim displaced someone and still holds the domain, `supersededAt` means someone displaced this claim. The database enforces that they are never both set.

Every pending claim carries the same unconditional line beside its verify action: verifying takes the domain over if another account currently holds it, which is the intended path for a purchase or an account migration, and otherwise a reason to check with whoever manages the domain first. It is deliberately not conditional on the domain actually being held — showing it only for held domains would answer "is this domain taken?" for anyone who typed one in, which is the disclosure this section exists to withhold. Unconditional, it reveals nothing, and it is true of every claim.

Resend's own Domain Claim discloses the conflict before proof, because its claim flow uses different records from its ordinary add flow and the user has to be routed. Here both paths are the same instruction, so a pending claimant loses nothing by not knowing.

### Routes

| Method and route | Success | Body in | Body out |
| --- | --- | --- | --- |
| `GET /api/claims` | `200` | — | `ClaimView[]`, newest first |
| `POST /api/claims` | `201` new, `200` existing | `{ domain: string }` | `ClaimView` |
| `GET /api/claims/:id` | `200` | — | `ClaimView` |
| `PATCH /api/claims/:id` | `200` | `{ domain: string }` | `ClaimView` |
| `POST /api/claims/:id/verify` | `200` | — | `ClaimView` |
| `POST /api/claims/:id/replace-token` | `200` | — | `ClaimView` |
| `DELETE /api/claims/:id` | `204` | — | — |

All ownership comes from the server session. Request bodies never accept an `ownerId`, a `token`, a `state`, or any timestamp — the only field a client ever sends is a domain string. Dates cross the boundary as ISO 8601 strings, even though backend domain types use `Date`.

`POST /api/claims` is idempotent per `(session user, normalized domain)`: it returns the caller's existing claim with `200` rather than creating a duplicate. It is never an error for another account to hold the domain; that returns a normal `201` that is indistinguishable from a claim on a free domain.

### `POST /verify` returns 200 for every classified outcome

A missing record, a mismatched value, and a resolver timeout are all **successful checks that did not complete verification**, not failed requests. They return `200` with the updated `ClaimView`, and the client replaces its cache entry with the response. Only an unclassified failure is a `5xx`.

This keeps a large ambiguity out of the client: it never has to decide whether a non-2xx means "your DNS is wrong" or "our server is broken." An expired token is also `200` — the request is rejected before any DNS lookup, and the returned view simply carries `state: "expired"`, which is the state the UI already knows how to render.

`POST /api/claims/:id/verify` is the only route that performs a DNS lookup, and it performs at most one per request. Already-verified claims and expired challenges return without a lookup. There is no polling endpoint, no background job, and no scheduled revalidation. The client does not poll either: a lookup happens only when the user clicks **Verify domain** or **Check again**, and the copy explains that DNS can take time rather than treating a missing record as an error.

### Errors

```ts
interface ApiError {
  error: {
    code: ErrorCode;
    message: string;   // safe, user-presentable
    requestId: string; // correlates with server logs
  };
}

type ErrorCode =
  | "unauthenticated"
  | "not_found"
  | "invalid_domain"
  | "claim_locked"
  | "internal_error";
```

| Code | Status | Raised by | Meaning |
| --- | --- | --- | --- |
| `unauthenticated` | `401` | all | No valid session. |
| `not_found` | `404` | `:id` routes | No such claim, **or** it belongs to someone else. |
| `invalid_domain` | `400` | `POST`, `PATCH` | Failed normalization or eligibility. `message` carries the specific reason. |
| `claim_locked` | `409` | `PATCH` | The claim is verified or superseded, so its domain cannot be edited. |
| `internal_error` | `500` | all | Unclassified. `message` is generic; detail goes to logs under `requestId`. |

Another account's claim returns `404`, never `403`. A `403` would confirm the claim exists, which is a disclosure in its own right.

`message` is always safe to render. Resolver codes are reduced to product outcomes inside the DNS adapter and discarded. Unexpected database and application errors are logged against `requestId`; stack traces and account identities never reach the response.

### DNS challenge

For `example.com`, the product instructs the user to publish:

```text
Type:  TXT
Name:  @
FQDN:  example.com
Value: resend-verify=<64-character lowercase hexadecimal token>
TTL:   Auto or provider default
```

The record lives at the claimed name itself, with a `resend-verify=` prefix on the value. This is the shape Resend, Google, and Microsoft use, so anyone who has verified a domain for another service recognizes it, and the prefix is what makes the value findable and matchable among the SPF and site-verification values a root commonly already carries. Only prefixed values are considered; a bare token does not verify, which is what keeps SPF out of both the match and the diagnostics. The costs are real: a name that is already a CNAME cannot carry a TXT record at all, and the user is editing the record set that holds SPF, so the copy tells them to add beside, never replace.

The name field shows `@` for every claim, root or subdomain. `@` is not a name but the near-universal provider shorthand for the apex of the zone being edited, and the product cannot know where the zone cut falls: a Public Suffix List gives the registrable boundary, not the zone boundary, and nothing in a TXT lookup reveals it. Rather than guess a relative label, the UI shows `@` and states the one unambiguous fact beside it — the record's full name has to end up as the claimed domain. Someone claiming `promo.acme.com` from inside the `acme.com` zone therefore enters `promo`, and someone administering `promo.acme.com` as a delegated zone enters `@`; the note is what tells them which they are.

The alternative was `@` for a root and a computed relative label for a subdomain. It is right more often for the majority case, but it is still a guess about the zone cut, it needs a Public Suffix List the product does not otherwise carry, and it produces `promo.promo.acme.com` for the delegated administrator. Showing `@` everywhere assumes some working knowledge of DNS zones instead. That is an assumption worth making here: the person editing a zone file to prove domain control is not a first-time computer user, and the `record_not_found` checklist names this specific mistake.

The resolver queries that exact normalized domain, with no fallback to the parent: a claim for `news.example.com` queries `news.example.com`. The value the user must publish is composed on the server and returned as `recordValue`; the browser never assembles it.

### Token generation

Generate 32 bytes from a cryptographically secure random source on the backend and represent them as lowercase hexadecimal, producing a DNS-safe 64-character token carrying 256 bits of entropy:

```ts
import { randomBytes } from "node:crypto";

export function createVerificationToken(): string {
  return randomBytes(32).toString("hex");
}
```

The token is never derived from the domain, account, email address, or current time. It is bound in persistent storage to one pending claim, one normalized domain, one authenticated user, and one expiration time. It is stored so the same instruction survives a page reload or a return visit days later. Retrying a check reuses it; deliberate replacement invalidates it.

DNS records are public, so the token needs no confidentiality after publication. It must only be unpredictable before publication and unique to the claim.

### Data model

```ts
type LastCheck =
  | {
      result: "record_not_found";
      checkedAt: Date;
    }
  | {
      result: "value_mismatch";
      observedValues: string[];
      checkedAt: Date;
    }
  | {
      result: "temporary_dns_error";
      checkedAt: Date;
    };

interface DomainClaim {
  id: string;
  normalizedDomain: string;
  ownerId: string;
  verificationToken: string;
  tokenExpiresAt: Date;
  verifiedAt: Date | null;
  supersededAt: Date | null;
  tookOverAt: Date | null;
  lastCheck: LastCheck | null;
  createdAt: Date;
  updatedAt: Date;
}
```

There is deliberately **no stored `status` column**. Every state the UI renders is derived from these durable facts, which removes the entire class of bugs where a denormalized status drifts out of sync with the data it summarizes.

The database enforces one row per `(ownerId, normalizedDomain)` pair and a partial unique index on `normalizedDomain` where `verifiedAt IS NOT NULL AND supersededAt IS NULL`.

**Both predicates matter.** A superseded row keeps its historical `verifiedAt`, so without the `supersededAt IS NULL` clause the index would block the very takeover it exists to permit. Multiple accounts may hold pending proofs for the same domain, but only one active verified association may exist. Claim creation returns the user's existing claim for that domain rather than creating a duplicate.

`verifiedAt` and `supersededAt` are not redundant. `verifiedAt` records the historical fact that this account proved DNS control at that moment, and stays true even after the domain moves. `supersededAt` records that a later proof by another account ended the association. **A claim is currently verified only when `verifiedAt` is set and `supersededAt` is null.** A row carrying both is superseded, and superseded is not verified.

`verifiedAt` remains set after supersession because it records a historical event. `tookOverAt` and `supersededAt` are the two sides of one event and are mutually exclusive: winning sets the first and clears the second, losing sets the second and clears the first. The database enforces all three rules:

```sql
CHECK (superseded_at IS NULL OR verified_at IS NOT NULL)
CHECK (took_over_at IS NULL OR verified_at IS NOT NULL)
CHECK (took_over_at IS NULL OR superseded_at IS NULL)
```

The compound definition of "currently verified" lives in one named SQL function and one TypeScript helper rather than being repeated at call sites.

The database may represent `lastCheck` as separate typed columns rather than JSON; the application exposes it as the discriminated union above. Observed values must be size- and count-limited before storage. Raw infrastructure details must never enter stored DNS observations or user-visible fields.

### Domain validation

Before creating a challenge, the backend:

1. Converts the input to the canonical ASCII DNS representation (IDNA) and lowercase.
2. Removes a trailing DNS dot.
3. Rejects schemes, paths, queries, fragments, ports, IP addresses, local names such as `localhost`, malformed labels, and a pragmatic set of common public suffixes that cannot be privately controlled. This set is deliberately limited rather than a complete implementation of the Public Suffix List. When a URL prefix is present, return: "Please enter the domain without the URL prefix (e.g., example.com instead of https://example.com)."
4. Preserves the exact registrable domain or subdomain the user intends to claim.

Exact-name verification is what makes delegated subdomains safe. Corporate IT can run `acme.com` on Route 53 and delegate `promo.acme.com` to an agency's Cloudflare zone with an NS record; the agency can then add records there and IT cannot without pulling the delegation back. The product never needs to know the delegation exists: the DNS tree decides who answers at `promo.acme.com`, and a parent can always reclaim a subdomain by changing the tree, which is the ordinary takeover path.

Normalization is implemented **once** in shared TypeScript rather than independently in the browser and backend. The frontend may provide early feedback, but the backend performs authoritative validation using the same module.

If the user corrects a misspelled domain, `PATCH` **edits the existing row in place**: it writes the new normalized domain, issues a fresh token and expiry, and clears `lastCheck`. The claim keeps its id, so the page the user is on stays the page they are on, and a typo does not leave an abandoned row behind in their domain list.

Editing is refused with `claim_locked` whenever `verifiedAt` is set, including after a superseded claim receives a fresh challenge. Its proof and history belong to the original domain. Both the UI and the database update use this guard; if verification wins a race with editing, the route reloads the claim and returns `claim_locked`. The user deletes the claim and adds the correct domain instead. If the corrected domain is one the user already has a claim for, the edit is refused as `invalid_domain`, including when a concurrent create or edit wins the race for that name.

### DNS lookup and matching

The backend queries TXT records at the exact `<normalized-domain>` through the DNS adapter. It never interpolates user input into a shell command such as `dig`.

A TXT lookup can return multiple records, and a single record can be divided into 255-byte chunks. Reconstruct each record independently, then look for an exact match:

```ts
const observedValues = records
  .map((chunks) => chunks.join(""))
  .filter((value) => value.startsWith("resend-verify="));
const matched = observedValues.includes(`resend-verify=${expectedToken}`);
```

Verification succeeds when **any** reconstructed record exactly matches the active challenge value. Additional values are tolerated but do not contribute to verification. This tolerates provider behavior, propagation overlap, and deliberate token replacement without weakening exact-match verification. The prefix filter runs first and does double duty: a name carrying only SPF and other verifiers reads as `record_not_found` rather than a mismatch, and the values reported back to the user contain nothing but this product's own, so an SPF record is never echoed into the UI or the stored `observedValues`. Since the record shares a name with whatever else lives there, the user adds the value beside the existing ones rather than replacing them. The UI may recommend removing obsolete `resend-verify=` values, but cleanup is never required for a successful active challenge.

Quotes printed by command-line tools such as `dig` are presentation syntax and are not part of the value a DNS library returns.

### State behavior

The view state is derived in strict priority order:

```ts
type ClaimViewState =
  | "verified"
  | "superseded"
  | "expired"
  | "setup_required"
  | "record_not_found"
  | "value_mismatch"
  | "temporary_dns_error";

function getClaimViewState(claim: DomainClaim, now: Date): ClaimViewState {
  if (holdsSupersededToken(claim)) return "superseded";
  if (isCurrentlyVerified(claim)) return "verified";
  if (claim.tokenExpiresAt <= now) return "expired";
  if (!claim.lastCheck) return "setup_required";
  return claim.lastCheck.result;
}
```

`superseded` outranks `expired` because reassignment sets `supersededAt` and expires the old token at the same instant. It is transitional: replacing that token returns the claim to the ordinary pending states while retaining `supersededAt` as historical context; only a successful re-proof clears it.

`setup_required` means only that the current challenge has not been checked and must not render as an error. `checking` is transient frontend request state and is never persisted.

**List presentation.** The status badge maps the seven states to four labels: `verified` → Verified, `setup_required` → Unchecked, `record_not_found` / `value_mismatch` / `temporary_dns_error` / `expired` → Needs attention, `superseded` → Superseded. The mapping is presentation only, lives in one component, and never feeds back into state derivation; the same badge appears on the detail page beside the panel that names the exact state. The four diagnostic states share one neutral label, not a red "Failed", because a missing record may still be propagating. `superseded` keeps a distinct label because the list is the previous holder's in-app notification of a takeover; the takeover email links to the claim.

Verification success is represented by `verifiedAt` together with a null `supersededAt`; it takes precedence over token expiry and does not depend on the TXT record remaining in DNS. A successful verification clears `lastCheck`. No attempt counter or attempt history is persisted.

### Reassignment and atomicity

After DNS matches, the route calls one Postgres function, `verify_domain_claim(claim_id, owner_id, token)`, through the server-only client. The function completes the transfer in a single transaction, on the database clock:

1. Lock and reload the winning claim by id and owner.
2. Confirm its token and expiry still match what the route checked.
3. Lock the domain's current active holder, if there is one.
4. Mark any other current holder as superseded, clear its `tookOverAt`, and expire its token.
5. Mark the winning claim as verified, clear `supersededAt` and `lastCheck`, and set `tookOverAt` to the transaction time if a holder was displaced and null otherwise.
6. Return the committed claim.

If any step fails, every write rolls back. The application never makes separate “remove old owner” and “add new owner” requests.

What each row ends up with after a successful takeover:

| Field | Winner's row | Previous holder's row |
| --- | --- | --- |
| `verifiedAt` | now | kept, as history |
| `supersededAt` | cleared | now |
| `tookOverAt` | now | cleared |
| `tokenExpiresAt` | unchanged | now, so the old TXT value is dead |
| `lastCheck` | cleared | unchanged |
| Resulting state | `verified` | `superseded` |

Every other account's pending claim for the same domain is untouched. A plain first verification, with no holder to displace, is the first column with `tookOverAt` left null and no second row.

The token is checked again because it could be replaced while the DNS lookup is running. Pending claims held by other accounts are left unchanged. A superseded claim keeps its history but must generate a new token before it can verify again.

The database also enforces one active claim per domain:

```sql
CREATE UNIQUE INDEX one_active_claim_per_domain
ON domain_claims (normalized_domain)
WHERE verified_at IS NOT NULL
  AND superseded_at IS NULL;
```

The `WHERE` clause excludes pending and superseded rows. Among the remaining active rows, each normalized domain may appear only once. If concurrent requests would break that rule, Postgres rejects one transaction. The losing route reloads the authoritative claim and returns it as an ordinary `200` — the claim is genuinely still pending, and looks like any other pending claim. No new error code is introduced, and the raw database error is never exposed.

The transaction performs the transfer; the unique index is the final safety net. An advisory lock is not required for the MVP. A later check performs a new DNS lookup and may transfer the domain again if its active token matches.

### Notifying the displaced holder

Losing a domain is the most consequential event in the product, and the list alone only reaches someone who happens to open the app. When configured, the backend attempts an email through Resend after a transfer displaces a holder. Delivery is best-effort; the superseded claim remains the in-app signal. Durable retries for failed emails are out of scope.

**Trigger.** The route already returns early for a claim that was verified when the request began, so reaching `verify_domain_claim` means this request was a candidate to perform the takeover. A returned row with `tookOverAt` set means it did.

**Finding the displaced row.** The transfer stamps the loser's `supersededAt` and the winner's `tookOverAt` with the same `now()` inside one transaction, so the displaced row is the one carrying the winner's `normalizedDomain`, a different id, and `supersededAt` at that instant. The unique index guarantees at most one. The lookup uses a one-millisecond window rather than an equality because Postgres keeps microseconds and JavaScript `Date` truncates them; the upper bound matters, since a later takeover of the same domain would satisfy an open-ended comparison. Nothing about `verify_domain_claim` changes, and its return type stays as it is.

**At most once per takeover, enforced by the database.** `domain_claims` gains a nullable `takeover_notified_at`. Claiming the notice is a single conditional update — set the column where the row matches the predicate above *and* `takeover_notified_at` is either null or earlier than this takeover's instant, returning the id and owner. The comparison is against the instant rather than a plain null check because a claim can be lost, won back, and lost again: a row that was notified about an earlier takeover must still be notified about this one. A notice already claimed for the *current* takeover was stamped after it and so fails the comparison, which is what stops a duplicate. Zero rows means another request already claimed it, or there was no displaced holder; nothing is sent. Marking precedes sending, and a failure after marking is logged and not retried: for a notice the list also carries, one missed email is a better trade than a duplicate on the double-click path.

**Off the response path.** The whole step runs inside Next's `after()`, so it cannot add latency to the new holder's request, and every error inside is caught and logged against the claim id. A send failure never changes the verification result. When `RESEND_API_KEY` or `RESEND_FROM` is unset the mailer is a no-op, which keeps local development free of mail configuration.

**Privacy.** The recipient address is read from Clerk by user id at send time and never stored on the claim, so it cannot go stale. It appears in the success log line, which is what makes a delivery question answerable after the fact; nothing else about either account does. The message names the domain, the time, and a link to the recipient's own claim; it never carries the new holder's identity, account id, or any request id. The reverse holds too: the new holder learns nothing about who was displaced.

**Link base.** The absolute base comes from `NEXT_PUBLIC_APP_URL`, then `VERCEL_PROJECT_PRODUCTION_URL`, and only then the request's origin. Configuration comes first deliberately: the request that triggers the email belongs to the new holder, so trusting its origin would let them aim the previous holder's "recover your domain" link at a host they control.

### Token expiry

The token remains stable across retries but expires after seven days, preventing an abandoned published value from becoming valid evidence years later. Pending claims grant no exclusivity. Reassignment sets the previous claim's `tokenExpiresAt` to the transaction time, so the same guard also prevents reuse of its old DNS value.

### Releasing a domain

`DELETE /api/claims/:id` hard-deletes the caller's row and token. Deleting the active claim releases the domain immediately; it does not modify DNS, and the leftover TXT value is inert because its token no longer exists. The UI confirms deletion and explains that the association will end.

### Failure classification

Every outcome maps to one user decision. Messages are product surface, not debug output.

| Outcome | Condition | User guidance and recovery |
| --- | --- | --- |
| Invalid input | The submitted value is not eligible | Explain the specific problem; issue no challenge |
| `record_not_found` | No `resend-verify=` value is visible at the name, whatever else is | Check the value carries the prefix, check `@` resolved to the intended zone rather than a parent, check the name is not a CNAME, wait, and retry with the same token; never assert misconfiguration |
| `value_mismatch` | `resend-verify=` values exist but none exactly matches | Show bounded expected and observed values, prefixed values only, correct DNS, and retry with the same token |
| `temporary_dns_error` | The resolver times out, refuses, or temporarily fails | Say the record may be correct and retry without changing DNS |
| `expired` | Seven days elapsed on a pending challenge | Deliberately generate a replacement and explain that the old value is invalid |
| Existing association | Another account currently holds the domain | Disclose nothing before proof; proceed like an unheld claim |
| Successful takeover | A different account completes a valid proof | Show verified plus a privacy-safe explanation; supersede the old association and expire its token |
| `superseded` | Another account later proved control | Show when it moved and offer a fresh challenge; never identify the winner |
| Unexpected failure | An outcome cannot be classified | Show the generic API message and request ID; preserve the claim and token for retry |

Starting or failing a competing claim never affects the current association. A successful takeover leaves other pending claims untouched. A best-effort email to the previous holder is attempted after the response when configured; regardless of delivery, they find the superseded claim in the list on the next visit.

### Authorization

- Reads use the user's Clerk session token. The database grants that role select only, and row-level security limits it to the caller's own rows.
- Writes use a separate client holding the server's secret key, and route handlers filter every write by the session's owner. The route handlers are therefore the only thing that can create, update, or verify a claim; `verify_domain_claim` is executable only by that role.
- Foreign and missing claims both return `404`. No API response identifies another account.
- Pending or failed claims grant no authority. Only a valid DNS proof may atomically move an active association; a superseded row remains readable by its owner but confers no control.
- Database access uses the Data API query builder rather than string-built SQL.

### Observability and privacy

- Log unexpected server failures against the response's request ID.
- Persist only the latest classified check on the claim; there is no attempt history or audit log.
- Never log Clerk session tokens, the Supabase secret key, or other authentication secrets.
- Bound and sanitize DNS values before logging, storing, or displaying them. Treat DNS observations as untrusted, potentially large input.
- Never expose raw resolver codes, database errors, stack traces, or another account's identity.
- Never claim that DNS control establishes legal ownership.
