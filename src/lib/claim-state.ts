import type { ClaimView, ClaimViewState, DomainClaim } from "@/lib/types";

/**
 * Mirrors `is_currently_verified()` in SQL. Both checks matter: a superseded
 * row keeps its historical `verifiedAt`.
 */
export function isCurrentlyVerified(
  claim: Pick<DomainClaim, "verifiedAt" | "supersededAt">,
): boolean {
  return claim.verifiedAt !== null && claim.supersededAt === null;
}

/**
 * True while the claim still holds the token the takeover killed. Supersession
 * stamps `supersededAt` and `tokenExpiresAt` with the same instant, so any
 * token issued later expires after it.
 */
export function holdsSupersededToken(
  claim: Pick<DomainClaim, "supersededAt" | "tokenExpiresAt">,
): boolean {
  return (
    claim.supersededAt !== null && claim.tokenExpiresAt <= claim.supersededAt
  );
}

/**
 * Derived from durable facts in priority order. `superseded` is transitional:
 * it wins only while the claim still holds the killed token. Once the owner
 * generates a new code the claim is an ordinary pending one, and
 * `supersededAt` stays on the row as history.
 */
export function getClaimViewState(
  claim: Pick<
    DomainClaim,
    "verifiedAt" | "supersededAt" | "tokenExpiresAt" | "lastCheck"
  >,
  now: Date,
): ClaimViewState {
  if (holdsSupersededToken(claim)) return "superseded";
  if (isCurrentlyVerified(claim)) return "verified";
  if (claim.tokenExpiresAt <= now) return "expired";
  if (!claim.lastCheck) return "setup_required";
  return claim.lastCheck.result;
}

/**
 * The instant the list and the detail page both call "last checked". A
 * verified claim's last check that mattered is the one that verified it;
 * `lastCheck` only ever holds a check that did not.
 */
export function lastCheckedAt(
  claim: Pick<ClaimView, "state" | "verifiedAt" | "lastCheck">,
): string | null {
  if (claim.state === "verified" && claim.verifiedAt) return claim.verifiedAt;
  return claim.lastCheck?.checkedAt ?? null;
}
