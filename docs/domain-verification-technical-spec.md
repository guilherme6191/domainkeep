# Domain Ownership Verification

## Technical specification

**Status:** Complete, open to iteration
**Date:** September 4, 2026
**Related documents:** [Product brief](domain-verification-product-brief.md) · [Challenge description](challenge-description.md)

This document is the engineering counterpart to the product brief. The brief owns the user problem, principles, priorities, scope, and product decisions. This document owns architecture, API contracts, state modeling, persistence, and security. Where the two overlap, this document is authoritative on mechanism and the brief is authoritative on intent.

## Implementation Decisions

### Chosen stack

- **Application:** Next.js App Router, React, and TypeScript.
- **Client data:** TanStack Query for server-state reads, mutations, cache invalidation, and request feedback.
- **Backend:** Next.js route handlers. Server actions are not used for the claim workflow, so the verification surface stays a plain, testable HTTP boundary.
- **Identity:** Clerk.
- **Persistence:** Supabase Postgres, reached only from backend code through Supabase's Data API. Every query carries the caller's Clerk session token, which Supabase verifies as a third-party auth provider, and row-level security policies on the table decide what that request may read or write.
- **DNS:** A small adapter around `node:dns/promises`, keeping product-level result classification separate from resolver details.
- **UI:** Tailwind CSS and stock shadcn/ui components. No bespoke design system; see the [Claude Design prompt](claude-design-prompt.md).
- **Deployment:** One Vercel deployment containing the frontend and route-handler backend, with Supabase as persistent storage.

### Terminology

- **Domain verification:** The complete journey from entering a domain to creating a persistent verified association.
- **DNS setup:** The user action of publishing the generated TXT challenge.
- **Verification check:** One backend DNS lookup requested by the client.
- **Latest check result:** The most recent failed verification check, persisted only to guide the next user action.
- **Verified domain:** A domain persistently associated with an account after a successful check.
- **Superseded claim:** A claim that was verified once but whose association was ended by a later proof from another account.

### Component responsibilities

**Clerk** authenticates the user, maintains the session, and supplies the stable user identifier the backend uses. It stores no domain-claim state.

**Frontend** collects the domain and displays validation feedback, presents one copyable DNS instruction, requests verification / correction / deliberate token replacement, and renders the derived claim state and latest check result. It never decides that a domain is verified. It reads and mutates exclusively through TanStack Query against the route-handler API.

**Backend** derives the user identifier from the authenticated session and never trusts a client-supplied owner ID. It normalizes and validates domains, creates and expires challenges, performs public DNS TXT lookups, classifies DNS results into product-level outcomes, atomically creates the verified association, and authorizes every claim read and mutation.

**Database** persists the pending challenge, latest check result, and verified association; enforces exclusivity for verified normalized domains; and provides the authoritative state after concurrent verification attempts.

### HTTP boundary

The frontend communicates only with authenticated Next.js route handlers.

### The wire type

Every route that returns a claim returns the same `ClaimView`. It is a deliberate projection of `DomainClaim`, not the row itself:

```ts
interface ClaimView {
  id: string;
  domain: string;                  // normalized, ASCII
  verificationHostname: string;    // _resend-verify.<domain>, precomputed
  token: string;
  tokenExpiresAt: string;          // ISO 8601
  verifiedAt: string | null;
  supersededAt: string | null;
  lastCheck: LastCheckView | null; // same union, checkedAt as ISO 8601
  state: ClaimViewState;           // derived on the server
  tookOverFromAnotherAccount: boolean;
  createdAt: string;
}
```

Three things about that shape are load-bearing.

**`ownerId` is absent.** It is never sent to a client, so no response can leak who holds or held a domain.

**`state` is computed on the server** by `getClaimViewState`, not recomputed in the browser. The client renders what it is told. Two implementations of the same priority ladder would eventually disagree, and the one in the browser would be the wrong one to trust.

**`tookOverFromAnotherAccount` is computed per request, not stored.** There is no stored column: `DomainClaim` is the persisted row and does not carry it, while `ClaimView` is a response projection that does. It is included because it cannot be derived from the caller's own row — see below.

### Takeover disclosure

A pending claim never reveals whether another account holds the domain; otherwise authenticated users could enumerate customer domains without proving control. A held and an unheld domain therefore return the same `setup_required` view. A successful proof may disclose that an association moved, but never identifies either account.

`supersededAt` records that the caller's own claim lost the association. `tookOverFromAnotherAccount` tells a currently verified caller that its proof replaced another account's association. The latter cannot be derived from the caller's row, so the database computes it per request:

```sql
create function took_over_from_another_account(c domain_claims)
returns boolean language sql stable security definer as $$
  select is_currently_verified(c.verified_at, c.superseded_at)
     and exists (
       select 1 from domain_claims other
        where other.normalized_domain = c.normalized_domain
          and other.owner_id <> c.owner_id
          and other.superseded_at is not null
     );
$$;
```

The outer `is_currently_verified` predicate keeps the value false for every pending claim. The function runs as the table owner so it can inspect rows hidden by row-level security, but it returns only a boolean. It is presentational only and must never gate claim creation or verification; exclusivity remains the transaction and partial unique index's responsibility.

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

A missing record, a mismatched value, and a resolver timeout are all **successful checks with negative results**, not failed requests. They return `200` with the updated `ClaimView`, and the client replaces its cache entry with the response. Only an unclassified failure is a `5xx`.

This keeps a large ambiguity out of the client: it never has to decide whether a non-2xx means "your DNS is wrong" or "our server is broken." An expired token is also `200` — the request is rejected before any DNS lookup, and the returned view simply carries `state: "expired"`, which is the state the UI already knows how to render.

`POST /api/claims/:id/verify` is the only route that performs a DNS lookup, and it performs exactly one per request. There is no polling endpoint, no background job, and no scheduled revalidation.

### On-page rechecks

When a user-initiated check returns `record_not_found` or `temporary_dns_error`, the client opens a ten-minute recheck window anchored on that click. It calls the same verify route every ten seconds while the tab is visible; any other result or an explicit stop ends the window. **Check again** remains available and may start a fresh window.

The deadline is stored in `sessionStorage` by claim, so it survives reloads in the same tab but is not a background process. The server cannot distinguish rechecks from clicks and stores no scheduling state. `RECHECK_INTERVAL_MS` and `RECHECK_WINDOW_MS` are the only configuration.

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
  | "claim_verified"
  | "internal_error";
```

| Code | Status | Raised by | Meaning |
| --- | --- | --- | --- |
| `unauthenticated` | `401` | all | No valid session. |
| `not_found` | `404` | `:id` routes | No such claim, **or** it belongs to someone else. |
| `invalid_domain` | `400` | `POST`, `PATCH` | Failed normalization or eligibility. `message` carries the specific reason. |
| `claim_verified` | `409` | `PATCH` | The domain of a currently verified claim cannot be edited. |
| `internal_error` | `500` | all | Unclassified. `message` is generic; detail goes to logs under `requestId`. |

Another account's claim returns `404`, never `403`. A `403` would confirm the claim exists, which is a disclosure in its own right.

`message` is always safe to render. Resolver codes are reduced to product outcomes inside the DNS adapter and discarded. Unexpected database and application errors are logged against `requestId`; stack traces and account identities never reach the response.

### DNS challenge

For `recomendei.me`, the product instructs the user to publish:

```text
Type:  TXT
Name:  _resend-verify
FQDN:  _resend-verify.recomendei.me
Value: <64-character lowercase hexadecimal token>
TTL:   Auto or provider default
```

The dedicated name avoids unrelated TXT records at the root `@`, which commonly already carries SPF, site-verification, and other values. Because `_resend-verify` already communicates the record's purpose, the value contains only the random token with no `resend-verify=` prefix. The leading underscore signals that the name holds service metadata rather than a host.

The resolver always appends `_resend-verify` to the exact normalized domain being claimed, with no fallback to the parent. A claim for `news.recomendei.me` therefore queries `_resend-verify.news.recomendei.me`. The full hostname is canonical and is always shown alongside the record name, so the user can confirm what their provider produced.

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
  lastCheck: LastCheck | null;
  createdAt: Date;
  updatedAt: Date;
}
```

There is deliberately **no stored `status` column**. Every state the UI renders is derived from these durable facts, which removes the entire class of bugs where a denormalized status drifts out of sync with the data it summarizes.

The database enforces one row per `(ownerId, normalizedDomain)` pair and a partial unique index on `normalizedDomain` where `verifiedAt IS NOT NULL AND supersededAt IS NULL`.

**Both predicates matter.** A superseded row keeps its historical `verifiedAt`, so without the `supersededAt IS NULL` clause the index would block the very takeover it exists to permit. Multiple accounts may hold pending proofs for the same domain, but only one active verified association may exist. Claim creation returns the user's existing claim for that domain rather than creating a duplicate.

`verifiedAt` and `supersededAt` are not redundant. `verifiedAt` records the historical fact that this account proved DNS control at that moment, and stays true even after the domain moves. `supersededAt` records that a later proof by another account ended the association. **A claim is currently verified only when `verifiedAt` is set and `supersededAt` is null.** A row carrying both is superseded, and superseded is not verified.

`verifiedAt` remains set after supersession because it records a historical event. The database enforces that only a previously verified claim can be superseded:

```sql
CHECK (superseded_at IS NULL OR verified_at IS NOT NULL)
```

The compound definition of "currently verified" lives in one named SQL function and one TypeScript helper rather than being repeated at call sites.

The database may represent `lastCheck` as separate typed columns rather than JSON; the application exposes it as the discriminated union above. Observed values must be size- and count-limited before storage. Raw infrastructure details must never enter stored DNS observations or user-visible fields.

### Domain validation

Before creating a challenge, the backend:

1. Converts the input to the canonical ASCII DNS representation (IDNA) and lowercase.
2. Removes a trailing DNS dot.
3. Rejects schemes, paths, queries, fragments, ports, IP addresses, local names such as `localhost`, malformed labels, and public suffixes that cannot be privately controlled. When a URL prefix is present, return: "Please enter the domain without the URL prefix (e.g., example.com instead of https://example.com)."
4. Preserves the exact registrable domain or subdomain the user intends to claim.

Normalization is implemented **once** in shared TypeScript rather than independently in the browser and backend. The frontend may provide early feedback, but the backend performs authoritative validation using the same module.

If the user corrects a misspelled domain, `PATCH` **edits the existing row in place**: it writes the new normalized domain, issues a fresh token and expiry, and clears `lastCheck`. The claim keeps its id, so the page the user is on stays the page they are on, and a typo does not leave an abandoned row behind in their domain list.

Editing is refused with `claim_verified` when the claim is currently verified, because silently repointing a verified association at a different domain would grant control the user never proved. Such a user deletes the claim and adds the correct domain instead. If the corrected domain is one the user already has a claim for, the edit is refused as `invalid_domain` with a message saying so, rather than creating a second row that would violate the `(ownerId, normalizedDomain)` constraint.

### DNS lookup and matching

The backend queries TXT records at `_resend-verify.<normalized-domain>` through the DNS adapter. It never interpolates user input into a shell command such as `dig`.

A TXT lookup can return multiple records, and a single record can be divided into 255-byte chunks. Reconstruct each record independently, then look for an exact match:

```ts
const observedValues = records.map((chunks) => chunks.join(""));
const matched = observedValues.includes(expectedToken);
```

Verification succeeds when **any** reconstructed record exactly matches the active challenge. Additional values are tolerated but do not contribute to verification. This tolerates provider behavior, propagation overlap, and deliberate token replacement without weakening exact-match verification. If the verification hostname already has a TXT value, the user may replace it or add the active token as another value when their provider supports multiple values. The UI may recommend removing obsolete `_resend-verify` values, but cleanup is never required for a successful active challenge.

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

Verification success is represented by `verifiedAt` together with a null `supersededAt`; it takes precedence over token expiry and does not depend on the TXT record remaining in DNS. A successful match does not also need to be written to `lastCheck`. No attempt counter or attempt history is persisted.

### Reassignment and atomicity

After DNS matches, the route calls one Postgres function. The function completes the transfer in a single transaction:

1. Lock and reload the winning claim.
2. Confirm its owner, token, and expiry still match what the route checked.
3. Mark the current active claim as superseded and expire its token.
4. Mark the winning claim as verified.
5. Return the committed claim.

If any step fails, every write rolls back. The application never makes separate “remove old owner” and “add new owner” requests.

The token is checked again because it could be replaced while the DNS lookup is running. Pending claims held by other accounts are left unchanged. A superseded claim keeps its history but must generate a new token before it can verify again.

The database also enforces one active claim per domain:

```sql
CREATE UNIQUE INDEX one_active_claim_per_domain
ON domain_claims (normalized_domain)
WHERE verified_at IS NOT NULL
  AND superseded_at IS NULL;
```

The `WHERE` clause excludes pending and superseded rows. Among the remaining active rows, each normalized domain may appear only once. If concurrent requests would break that rule, Postgres rejects one transaction. The losing route reloads the authoritative claim and returns it as an ordinary `200` — the claim is genuinely still pending, and looks like any other pending claim. No new error code is introduced, and the raw database error is never exposed.

The transaction performs the transfer; the unique index is the final safety net. An advisory lock is not required for the MVP.

### Token expiry

The token remains stable across retries but expires after seven days, preventing an abandoned published value from becoming valid evidence years later. Pending claims grant no exclusivity. Reassignment sets the previous claim's `tokenExpiresAt` to the transaction time, so the same guard also prevents reuse of its old DNS value.

### Releasing a domain

`DELETE /api/claims/:id` hard-deletes the caller's row and token. Deleting the active claim releases the domain immediately; it does not modify DNS, and the leftover TXT value is inert because its token no longer exists. The UI confirms deletion and explains that the association will end.

### Failure classification

Every outcome maps to one user decision. Messages are product surface, not debug output.

| Outcome | Condition | User guidance and recovery |
| --- | --- | --- |
| Invalid input | The submitted value is not eligible | Explain the specific problem; issue no challenge |
| `record_not_found` | No hostname or TXT record is visible | Check the name, account for provider auto-appending, wait, and retry with the same token; never assert misconfiguration |
| `value_mismatch` | TXT records exist but none exactly matches | Show bounded expected and observed values, correct DNS, and retry with the same token |
| `temporary_dns_error` | The resolver times out, refuses, or temporarily fails | Say the record may be correct and retry without changing DNS |
| `expired` | Seven days elapsed on a pending challenge | Deliberately generate a replacement and explain that the old value is invalid |
| Existing association | Another account currently holds the domain | Disclose nothing before proof; proceed like an unheld claim |
| Successful takeover | A different account completes a valid proof | Show verified plus a privacy-safe explanation; supersede the old association and expire its token |
| `superseded` | Another account later proved control | Show when it moved and offer a fresh challenge; never identify the winner |
| Unexpected failure | An outcome cannot be classified | Show the generic API message and request ID; preserve the claim and token for retry |

Starting or failing a competing claim never affects the current association. A successful takeover leaves other pending claims untouched. The previous holder learns of the change on its next visit; notifications and grace periods are out of scope.

### Authorization

- Every Data API query carries the Clerk session token. Row-level security compares the token's `sub` to `owner_id` for reads and mutations; route handlers also filter by owner.
- `verify_domain_claim` and `took_over_from_another_account` run as the table owner because takeover requires narrowly scoped cross-account access. They derive the caller from the session token and never accept a caller-supplied owner ID.
- Foreign and missing claims both return `404`. No API response identifies another account.
- Pending or failed claims grant no authority. Only a valid DNS proof may atomically move an active association; a superseded row remains readable by its owner but confers no control.
- Database access uses the Data API query builder rather than string-built SQL.

### Observability and privacy

- Log unexpected server failures against the response's request ID.
- Persist only the latest classified check on the claim; there is no attempt history or audit log.
- Never log Clerk session tokens or authentication secrets.
- Bound and sanitize DNS values before logging, storing, or displaying them. Treat DNS observations as untrusted, potentially large input.
- Never expose raw resolver codes, database errors, stack traces, or another account's identity.
- Never claim that DNS control establishes legal ownership.
