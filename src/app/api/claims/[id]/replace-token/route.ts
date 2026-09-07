import { NextResponse } from "next/server";
import { apiError, internalError, NOT_FOUND_MESSAGE } from "@/lib/api/errors";
import { isClaimId } from "@/lib/api/params";
import { currentUserId } from "@/lib/api/session";
import { toClaimView } from "@/lib/api/view";
import { isCurrentlyVerified } from "@/lib/claim-state";
import { getClaim, replaceToken } from "@/lib/db/claims";
import { createVerificationToken, tokenExpiryFrom } from "@/lib/token";

type Context = { params: Promise<{ id: string }> };

/**
 * A superseded claim must obtain a new token before it can verify again; this
 * is its way back.
 */
export async function POST(_request: Request, { params }: Context) {
  const ownerId = await currentUserId();
  if (!ownerId) return apiError("unauthenticated", "Sign in to continue.");

  const { id } = await params;
  if (!isClaimId(id)) return apiError("not_found", NOT_FOUND_MESSAGE);

  try {
    const record = await getClaim(id, ownerId);
    if (!record) return apiError("not_found", NOT_FOUND_MESSAGE);

    // Nothing to prove; rotating would invalidate a record already published.
    if (isCurrentlyVerified(record.claim)) {
      return NextResponse.json(toClaimView(record));
    }

    const now = new Date();
    const updated = await replaceToken({
      id,
      ownerId,
      token: createVerificationToken(),
      tokenExpiresAt: tokenExpiryFrom(now),
    });
    if (!updated) {
      // The write refuses a claim that verified after the read above, or one
      // that was deleted. Show whichever is now true.
      const current = await getClaim(id, ownerId);
      if (!current) return apiError("not_found", NOT_FOUND_MESSAGE);
      return NextResponse.json(toClaimView(current));
    }

    return NextResponse.json(toClaimView(updated, now));
  } catch (error) {
    return internalError("POST /api/claims/:id/replace-token", error);
  }
}
