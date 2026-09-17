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
 * The instant the list and the detail page both call "last checked": the most
 * recent check that ran, whether it verified the claim or not. `lastCheck`
 * only ever holds a check that did not; `verifiedAt` is the one that did, and
 * it survives supersession, so a superseded claim still says when it was last
 * checked rather than pretending it never was.
 */
export function lastCheckedAt(
  claim: Pick<ClaimView, "verifiedAt" | "lastCheck">,
): string | null {
  const candidates = [claim.verifiedAt, claim.lastCheck?.checkedAt ?? null]
    .filter((iso): iso is string => iso !== null);
  if (candidates.length === 0) return null;
  return candidates.reduce((latest, iso) => (iso > latest ? iso : latest));
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The code can no longer verify anything; only a replacement can. */
export function codeIsDead(claim: Pick<ClaimView, "state">): boolean {
  return claim.state === "expired" || claim.state === "superseded";
}

/**
 * Whether the code deserves the user's attention now: already dead, or
 * inside its last day, when a record published today may stop counting
 * before DNS has finished propagating it.
 */
export function codeExpiryIsUrgent(
  claim: Pick<ClaimView, "state" | "tokenExpiresAt">,
  now: Date = new Date(),
): boolean {
  if (codeIsDead(claim)) return true;
  return new Date(claim.tokenExpiresAt).getTime() - now.getTime() < DAY_MS;
}

/**
 * Everything the list and the page derive from a state, in one table, so a new
 * state cannot be added without answering all three questions.
 *
 * `nextStep` is the one thing to do about it, in the words the list row, the
 * page's progress cue and the outcome panel all use; verified asks for
 * nothing. `checkable` says whether another lookup could still change the
 * answer: a dead code has to be replaced first, a held domain is waiting on a
 * decision rather than on DNS, and a verified one is done. `recordFound` says
 * whether a check has actually seen the record, whatever it then said about
 * the value — found but wrong is further along than not found at all.
 */
const BY_STATE: Record<
  ClaimViewState,
  { nextStep: string; checkable: boolean; recordFound: boolean }
> = {
  setup_required: {
    nextStep: "Add the record, then verify",
    checkable: true,
    recordFound: false,
  },
  record_not_found: {
    nextStep: "Wait, then check again",
    checkable: true,
    recordFound: false,
  },
  value_mismatch: {
    nextStep: "Fix the value, then check again",
    checkable: true,
    recordFound: true,
  },
  temporary_dns_error: {
    nextStep: "Check again",
    checkable: true,
    recordFound: false,
  },
  held_by_another: {
    nextStep: "Take over, or leave it",
    checkable: false,
    recordFound: true,
  },
  expired: {
    nextStep: "Get a new code",
    checkable: false,
    recordFound: false,
  },
  superseded: {
    nextStep: "Get a new code to reclaim",
    checkable: false,
    recordFound: false,
  },
  verified: { nextStep: "", checkable: false, recordFound: true },
};

export function nextStep(state: ClaimViewState): string {
  return BY_STATE[state].nextStep;
}

export function canCheck(state: ClaimViewState): boolean {
  return BY_STATE[state].checkable;
}

export function recordWasFound(state: ClaimViewState): boolean {
  return BY_STATE[state].recordFound;
}
