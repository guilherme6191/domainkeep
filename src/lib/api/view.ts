import "server-only";
import { getClaimViewState } from "@/lib/claim-state";
import { verificationHostname, verificationRecordValue } from "@/lib/domain";
import type { ClaimRecord } from "@/lib/db/claims";
import type { ClaimView, LastCheckView } from "@/lib/types";

function toLastCheckView(
  lastCheck: ClaimRecord["claim"]["lastCheck"],
): LastCheckView | null {
  if (!lastCheck) return null;
  if (lastCheck.result === "value_mismatch") {
    return {
      result: "value_mismatch",
      observedValues: lastCheck.observedValues,
      checkedAt: lastCheck.checkedAt.toISOString(),
    };
  }
  return {
    result: lastCheck.result,
    checkedAt: lastCheck.checkedAt.toISOString(),
  };
}

/**
 * `ownerId` is omitted so no response reveals who holds a domain. `state` is
 * derived here, never in the browser.
 */
export function toClaimView(record: ClaimRecord, now = new Date()): ClaimView {
  const { claim } = record;

  return {
    id: claim.id,
    domain: claim.normalizedDomain,
    verificationHostname: verificationHostname(claim.normalizedDomain),
    token: claim.verificationToken,
    recordValue: verificationRecordValue(claim.verificationToken),
    tokenExpiresAt: claim.tokenExpiresAt.toISOString(),
    verifiedAt: claim.verifiedAt?.toISOString() ?? null,
    supersededAt: claim.supersededAt?.toISOString() ?? null,
    lastCheck: toLastCheckView(claim.lastCheck),
    state: getClaimViewState(claim, now),
    tookOverAt: claim.tookOverAt?.toISOString() ?? null,
    createdAt: claim.createdAt.toISOString(),
  };
}
