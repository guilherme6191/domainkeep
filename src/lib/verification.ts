import "server-only";
import { NextResponse, after } from "next/server";
import { apiError, internalError, NOT_FOUND_MESSAGE } from "@/lib/api/errors";
import { appOrigin } from "@/lib/api/origin";
import { isClaimId } from "@/lib/api/params";
import { currentUserId } from "@/lib/api/session";
import { toClaimView } from "@/lib/api/view";
import { isCurrentlyVerified } from "@/lib/claim-state";
import {
  ChallengeInactiveError,
  ClaimNotFoundError,
  VerificationConflictError,
  getClaim,
  recordCheckFailure,
  verifyClaimAtomically,
} from "@/lib/db/claims";
import { classifyTxtLookup } from "@/lib/dns/classify";
import { getResolver } from "@/lib/dns";
import { verificationHostname } from "@/lib/domain";
import { notifyTakeover } from "@/lib/mail/notify";

/**
 * One DNS lookup, one classified outcome. Shared by the two routes that check
 * a domain, which differ only in what a matching proof is allowed to do:
 * `/verify` never moves a domain, `/take-over` may.
 *
 * Both prove control in the same request that acts on it. A held claim is a
 * record of the last check, never standing permission: taking over re-resolves
 * DNS rather than trusting what an earlier check found.
 *
 * Every classified outcome, negative ones included, is a 200 with the updated
 * view; only an unclassified failure is a 5xx.
 */
export async function runVerification(
  request: Request,
  id: string,
  { allowTakeover }: { allowTakeover: boolean },
): Promise<Response> {
  const route = allowTakeover
    ? "POST /api/claims/:id/take-over"
    : "POST /api/claims/:id/verify";

  const ownerId = await currentUserId();
  if (!ownerId) return apiError("unauthenticated", "Sign in to continue.");

  if (!isClaimId(id)) return apiError("not_found", NOT_FOUND_MESSAGE);

  try {
    const record = await getClaim(id, ownerId);
    if (!record) return apiError("not_found", NOT_FOUND_MESSAGE);

    const { claim } = record;
    const now = new Date();

    if (isCurrentlyVerified(claim)) {
      return NextResponse.json(toClaimView(record, now));
    }

    // Rejected before any lookup. Supersession expires the loser's token in the
    // same transaction, so this guard is what stops a superseded claim from
    // re-verifying against its leftover record.
    if (claim.tokenExpiresAt <= now) {
      return NextResponse.json(toClaimView(record, now));
    }

    const lookup = await getResolver().resolveTxt(
      verificationHostname(claim.normalizedDomain),
    );
    const outcome = classifyTxtLookup(lookup, claim.verificationToken);

    if (outcome.result !== "verified") {
      const updated = await recordCheckFailure({
        id,
        ownerId,
        expectedToken: claim.verificationToken,
        result: outcome.result,
        observedValues:
          outcome.result === "value_mismatch" ? outcome.observedValues : null,
        checkedAt: now,
      });
      if (!updated) {
        // Token A changed while its DNS lookup was in flight. Return token B's
        // untouched claim instead of attaching A's result to it.
        const current = await getClaim(id, ownerId);
        if (!current) return apiError("not_found", NOT_FOUND_MESSAGE);
        return NextResponse.json(toClaimView(current));
      }
      return NextResponse.json(toClaimView(updated, now));
    }

    // The proof matched. Whether that verifies the claim, moves the domain, or
    // stops at `held_by_another` is decided inside the transaction, which is
    // the only place that can read the holder under a lock.
    const verified = await verifyClaimAtomically({
      id,
      ownerId,
      token: claim.verificationToken,
      allowTakeover,
    });

    // Losing a domain is the one event worth telling someone about out of band.
    // It runs after the response and swallows everything: the new holder's
    // check must not slow down or fail because mail did.
    if (verified.claim.tookOverAt) {
      const origin = appOrigin(request);
      after(async () => {
        try {
          await notifyTakeover(verified.claim, origin);
        } catch (error) {
          console.error(`[takeover-notice] claim ${id}`, error);
        }
      });
    }

    return NextResponse.json(toClaimView(verified, now));
  } catch (error) {
    if (error instanceof ClaimNotFoundError) {
      return apiError("not_found", NOT_FOUND_MESSAGE);
    }

    // The challenge changed or another account verified first while the lookup
    // was in flight. Both are renderable states: reload and show the truth.
    if (
      error instanceof ChallengeInactiveError ||
      error instanceof VerificationConflictError
    ) {
      try {
        const reloaded = await getClaim(id, ownerId);
        if (reloaded) return NextResponse.json(toClaimView(reloaded));
      } catch {
        // fall through to the generic failure below
      }
    }

    return internalError(route, error);
  }
}
