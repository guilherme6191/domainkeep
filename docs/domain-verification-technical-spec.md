# Domain Ownership Verification

## Technical specification

**Status:** Complete, open to iteration
**Date:** September 7, 2026
**Related documents:** [Product brief](domain-verification-product-brief.md) · [Challenge description](https://resend.notion.site/Product-engineer-36dc40d6c4ef80d5a962f37bbd39c153)

This spec owns architecture, contracts, persistence, and security. The [brief](domain-verification-product-brief.md) owns product intent and scope; the [README](../README.md#tradeoffs-and-limitations) explains tradeoffs.

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

- **Claim:** One account/domain association, pending or verified.
- **Check:** A user-requested DNS lookup; `lastCheck` stores only a diagnostic outcome.
- **Takeover:** A valid proof that transfers an active association. The previous holder's claim is superseded.

### Component responsibilities

- **Clerk:** session and stable user ID, no claim state.
- **Frontend:** inputs, DNS instructions, request feedback, and server-derived state, through TanStack Query and authenticated route handlers.
- **Backend:** authoritative validation, challenge generation, DNS classification, and authorization.
- **Database:** durable facts, exclusivity, and atomic transfer.

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

The list route wraps that projection in a page envelope, so the client never hardcodes a page size:

```ts
interface ClaimPage {
  items: ClaimView[];  // newest first, then id ascending
  page: number;
  pageSize: number;    // 40, 80, or 120; anything else is read as 40
  total: number;       // all of the caller's claims, not this page
}
```

The projection omits `ownerId`, serializes dates, and derives `state` on the server. Transfer timestamps describe the caller's association without identifying another account. Their meaning and constraints are defined in [Data model](#data-model).

### Takeover disclosure

The verified view shows the new holder's takeover note only during the ten minutes after `tookOverAt`. The window is decided once when the view mounts: a page left open keeps the note, and a later load uses the original timestamp rather than restarting the window. This is presentation only: it changes neither the stored timestamp nor transfer eligibility. The previous holder's superseded explanation does not expire on this timer.

A domain held elsewhere produces the same creation response and DNS diagnoses as an unheld domain. Every active pending claim has the same warning beside its verify action: verification transfers any existing association, so check with whoever manages the domain first. Conditional warnings would disclose associations before proof. After proof, explain the transfer without identifying either account.

### Routes

| Method and route | Success | Body in | Body out |
| --- | --- | --- | --- |
| `GET /api/claims?page=N&pageSize=M` | `200` | — | `ClaimPage`, newest first |
| `POST /api/claims` | `201` new, `200` existing | `{ domain: string }` | `ClaimView` |
| `GET /api/claims/:id` | `200` | — | `ClaimView` |
| `PATCH /api/claims/:id` | `200` | `{ domain: string }` | `ClaimView` |
| `POST /api/claims/:id/verify` | `200` | — | `ClaimView` |
| `POST /api/claims/:id/replace-token` | `200` | — | `ClaimView` |
| `DELETE /api/claims/:id` | `204` | — | — |
| `DELETE /api/claims` | `200` | `{ ids: string[] }` | `{ deleted: string[] }` |

A page past the end returns an empty `items` with the true `total`; the client clamps its own URL rather than being redirected. A malformed `page` or an unoffered `pageSize` is read as the default rather than rejected.

Ownership comes from the server session. The only meaningful request-body field is `domain`; callers cannot supply ownership, proof tokens, state, or timestamps.

Creation is idempotent per `(session user, normalized domain)`, including concurrent requests: return the existing claim with `200`, otherwise create it with `201`.

### `POST /verify` returns 200 for every classified outcome

Missing records, mismatches, and resolver failures return `200` with a diagnostic `ClaimView`, not an HTTP error. The client replaces its cached claim with that response. Unexpected failures return `500`.

This is the only DNS route, with at most one lookup per request. Already-verified claims and expired challenges return their current view without a lookup. Neither client nor server polls: checks require **Verify domain** or **Check again**.

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
| `claim_locked` | `409` | `PATCH` | The claim has verified at least once, so its domain cannot be edited. |
| `internal_error` | `500` | all | Unclassified. `message` is generic; detail goes to logs under `requestId`. |

Messages are safe to render; raw errors stay in server logs. Failed deletion closes its confirmation dialog and shows an error toast, with the request reference when available.

### DNS challenge

For `example.com`, the product instructs the user to publish:

```text
Type:  TXT
Name:  @
FQDN:  example.com
Value: resend-verify=<64-character lowercase hexadecimal token>
TTL:   Auto or provider default
```

The backend composes `recordValue` and queries the exact normalized hostname, with no parent fallback. The prefix distinguishes this proof from unrelated TXT records; instructions say to add beside existing values, never replace them. A name already carrying a CNAME cannot also carry TXT.

The name field shows `@` alongside the required full hostname. `@` means the apex of the zone being edited, which the app cannot infer. For `news.example.com`, someone editing the `example.com` zone enters `news`; someone editing a delegated `news.example.com` zone enters `@`.

The full value remains selectable text even when visually truncated. The copy action uses the complete value; clipboard failure shows a toast directing the user to select it manually.

### Token generation

Generate 32 bytes from a cryptographically secure random source on the backend and represent them as lowercase hexadecimal, producing a DNS-safe 64-character token carrying 256 bits of entropy:

```ts
import { randomBytes } from "node:crypto";

export function createVerificationToken(): string {
  return randomBytes(32).toString("hex");
}
```

Persist the token with its claim, normalized domain, owner, and seven-day expiry. It survives reloads and retries; deliberate replacement invalidates it. DNS is public, so unpredictability before publication—not confidentiality afterward—is the requirement.

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

There is no stored `status`: [State behavior](#state-behavior) defines the server-derived view. The database allows one row per `(ownerId, normalizedDomain)` and one active verified holder per domain.

`verifiedAt` records the latest successful proof and survives supersession. A claim is currently verified only when it is set and `supersededAt` is null; SQL and TypeScript each have a named helper for this definition.

`supersededAt` records losing the association; `tookOverAt` records displacing another holder. They are mutually exclusive, and both require verification history:

```sql
CHECK (superseded_at IS NULL OR verified_at IS NOT NULL)
CHECK (took_over_at IS NULL OR verified_at IS NOT NULL)
CHECK (took_over_at IS NULL OR superseded_at IS NULL)
```

The database stores `lastCheck` in separate columns, projected as the discriminated union above. Observations are bounded as specified under [DNS lookup and matching](#dns-lookup-and-matching).

### Domain validation

Before creating a challenge, the backend:

1. Converts the input to the canonical ASCII DNS representation (IDNA) and lowercase.
2. Removes a trailing DNS dot.
3. Rejects schemes, paths, queries, fragments, ports, IP addresses, local names such as `localhost`, malformed labels, and a pragmatic set of common public suffixes that cannot be privately controlled. This set is deliberately limited rather than a complete implementation of the Public Suffix List. When a URL prefix is present, return: "Please enter the domain without the URL prefix (e.g., example.com instead of https://example.com)."
4. Preserves the exact registrable domain or subdomain the user intends to claim.

Normalization is shared TypeScript, with early browser feedback and authoritative server validation. Known limitation: URL-based IDNA parsing currently accepts a backslash path such as `example.com\path` as `example.com`; strict rejection remains to be fixed.

`PATCH` edits the existing row: update the normalized domain, issue a fresh token and expiry, and clear `lastCheck`. Its ID and page URL remain unchanged.

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

Any exact match succeeds, even alongside old tokens. Only prefixed values contribute to diagnostics; unrelated SPF or verifier records are neither returned nor stored. Mismatches retain at most five values, truncated to 255 characters each. Matching happens before truncation. Observations render as text, not HTML.

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

`holdsSupersededToken` means `supersededAt` is set and `tokenExpiresAt <= supersededAt`. It outranks expiry so the previous holder sees the transfer rather than ordinary expiration. Replacing the token restores pending states while retaining the loss as context; successful re-proof clears it.

`setup_required` means only that the current challenge has not been checked and must not render as an error. `checking` is transient frontend request state and is never persisted.

**List presentation.** One badge component maps `verified` → Verified, `setup_required` → Unchecked, diagnostic states and `expired` → Needs attention, and `superseded` → Superseded. The detail panel names the precise outcome. This mapping never affects state derivation.

Verified associations outlive token expiry and TXT removal. Successful verification clears `lastCheck`. Known implementation gaps: replacement checks verified status before, but not during, its write; failed-check writes guard the token but not verified status. Concurrent requests can therefore replace a just-verified token or repopulate `lastCheck` after success. Neither grants an unproven association. These gaps do not change the intended rules above.

Token lifetime is a property of a pending challenge. The client never reads `tokenExpiresAt` to decide anything; it displays the instant and takes every decision from `state`. A verified claim shows no record at all, since the proof is complete and the TXT value has no ongoing job; the verified panel tells the user they may remove it.

### Reassignment and atomicity

After DNS matches, the route calls one Postgres function, `verify_domain_claim(claim_id, owner_id, token)`, through the server-only client. The function completes the transfer in a single transaction, on the database clock:

1. Lock and reload the winning claim by id and owner.
2. Return unchanged if already verified; otherwise confirm the checked token is still current and unexpired.
3. Lock and supersede any current holder through an update.
4. Clear that holder's `tookOverAt` and expire its token in the same update.
5. Mark the winning claim as verified, clear `supersededAt` and `lastCheck`, and set `tookOverAt` to the transaction time if a holder was displaced and null otherwise.
6. Return the winning row. The repository then reloads it through the user-scoped read client.

Winner and loser updates are separate statements in the same transaction. A failure rolls back all writes.

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

The database also enforces one active claim per domain:

```sql
CREATE UNIQUE INDEX one_active_claim_per_domain
ON domain_claims (normalized_domain)
WHERE verified_at IS NOT NULL
  AND superseded_at IS NULL;
```

The index excludes pending and superseded rows. Its actual migration uses the equivalent `is_currently_verified` helper. A uniqueness conflict or an inactive challenge causes the route to reload and return the current claim with `200`; missing claims return `404`. No advisory lock or automatic retry is used. A later user-requested check can transfer the domain again with valid proof.

### Notifying the displaced holder

When configured, Resend email supplements the superseded claim in the list. Delivery is best-effort; durable retries are out of scope.

**Trigger.** After a successful verification RPC, a reloaded claim with `tookOverAt` set schedules notification. Concurrent requests may observe the same takeover, so this is not proof that this request performed it.

**Finding the displaced row.** Match the domain, a different claim ID, and `supersededAt` within `[tookOverAt, tookOverAt + 1ms)`. The window accommodates JavaScript truncating Postgres microseconds. The active-holder index does not guarantee uniqueness among historical losses in that window; later transfers or deletion can also make the displaced row unavailable.

**Duplicate suppression.** A conditional update sets `takeover_notified_at` where it is null or earlier than the takeover, returning the recipient's claim ID and owner. Later losses remain eligible. The marker records an attempt claimed before sending, not delivery. It currently uses application time against database event time: suppression assumes the application clock is not behind the takeover. This is not an unconditional at-most-once guarantee. Failed attempts are logged and not retried.

**Off the response path.** Notification runs in Next's `after()`; errors are caught and logged against the claim ID without changing verification. Missing `RESEND_API_KEY` or `RESEND_FROM` skips sending.

**Recipient and content.** Read the current primary email from Clerk at send time; do not store it on the claim. Successful send logs include that address and the claim ID. The message contains the domain, transfer time, and a link to the recipient's claim, never the winner's identity.

**Link base.** The absolute base comes from `NEXT_PUBLIC_APP_URL`, then `VERCEL_PROJECT_PRODUCTION_URL`, and only then the request's origin. Configuration comes first deliberately: the request that triggers the email belongs to the new holder, so trusting its origin would let them aim the previous holder's "recover your domain" link at a host they control.

### Token expiry

The seven-day limit prevents abandoned challenges from remaining usable indefinitely. Supersession expires the old token immediately; the previous holder must generate a new one before re-proving control. Pending challenges grant no exclusivity.

### Releasing a domain

`DELETE /api/claims/:id` hard-deletes the caller's row and token. Deleting the active claim releases the domain immediately; it does not modify DNS, and the leftover TXT value is inert because its token no longer exists. The UI confirms deletion and explains that the association will end.

`DELETE /api/claims` applies that same hard delete to each id in one owner-filtered statement, and answers with the ids it actually removed. An id belonging to another account, an id that no longer exists, and a malformed id are all simply absent from `deleted` — the same non-disclosure as the single route's "404, never 403". A body with no usable ids is answered with an empty `deleted` rather than an error, as is one carrying more than 120 ids — the largest page, and so the most the UI can select — which is rejected whole rather than truncated, so a caller is never told it deleted a prefix of what it asked for.

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

Starting or failing a competing claim never affects the current association.

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
- Bound DNS observations and render them as text, never HTML. The classifier truncates values; it does not strip control characters.
- Never expose raw resolver codes, database errors, stack traces, or another account's identity.
- Never claim that DNS control establishes legal ownership.
