import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, internalError, NOT_FOUND_MESSAGE } from "@/lib/api/errors";
import { isClaimId } from "@/lib/api/params";
import { currentUserId } from "@/lib/api/session";
import { toClaimView } from "@/lib/api/view";
import { isCurrentlyVerified } from "@/lib/claim-state";
import {
  deleteClaim,
  findClaimByDomain,
  getClaim,
  updateClaimDomain,
} from "@/lib/db/claims";
import { normalizeDomain } from "@/lib/domain";
import { createVerificationToken, tokenExpiryFrom } from "@/lib/token";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const ownerId = await currentUserId();
  if (!ownerId) return apiError("unauthenticated", "Sign in to continue.");

  const { id } = await params;
  if (!isClaimId(id)) return apiError("not_found", NOT_FOUND_MESSAGE);

  try {
    const record = await getClaim(id, ownerId);
    // Another account's claim is 404, never 403: a 403 would confirm it exists.
    if (!record) return apiError("not_found", NOT_FOUND_MESSAGE);
    return NextResponse.json(toClaimView(record));
  } catch (error) {
    return internalError("GET /api/claims/:id", error);
  }
}

const patchBody = z.object({ domain: z.string() });

export async function PATCH(request: Request, { params }: Context) {
  const ownerId = await currentUserId();
  if (!ownerId) return apiError("unauthenticated", "Sign in to continue.");

  const { id } = await params;
  if (!isClaimId(id)) return apiError("not_found", NOT_FOUND_MESSAGE);

  const parsed = patchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError("invalid_domain", "Enter a domain to verify.");
  }

  const normalized = normalizeDomain(parsed.data.domain);
  if (!normalized.ok) return apiError("invalid_domain", normalized.message);

  try {
    const existing = await getClaim(id, ownerId);
    if (!existing) return apiError("not_found", NOT_FOUND_MESSAGE);

    // Only a never-verified claim can be edited: a verified claim's proof belongs
    // to its domain, and a superseded claim's history describes the old one.
    if (existing.claim.verifiedAt !== null) {
      return apiError(
        "claim_locked",
        isCurrentlyVerified(existing.claim)
          ? "This domain is already verified, so it can't be edited. Delete it and add the correct domain instead."
          : "This domain moved to another account, so it can't be edited. Delete it and add the correct domain instead.",
      );
    }

    if (normalized.domain === existing.claim.normalizedDomain) {
      return NextResponse.json(toClaimView(existing));
    }

    const collision = await findClaimByDomain(ownerId, normalized.domain);
    if (collision) {
      return apiError(
        "invalid_domain",
        "You've already added that domain. Open it from your domains list.",
      );
    }

    const now = new Date();
    const updated = await updateClaimDomain({
      id,
      ownerId,
      normalizedDomain: normalized.domain,
      token: createVerificationToken(),
      tokenExpiresAt: tokenExpiryFrom(now),
    });
    if (!updated) return apiError("not_found", NOT_FOUND_MESSAGE);

    return NextResponse.json(toClaimView(updated, now));
  } catch (error) {
    return internalError("PATCH /api/claims/:id", error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const ownerId = await currentUserId();
  if (!ownerId) return apiError("unauthenticated", "Sign in to continue.");

  const { id } = await params;
  if (!isClaimId(id)) return apiError("not_found", NOT_FOUND_MESSAGE);

  try {
    // Hard delete. If this was the verified claim, the domain is free again.
    const deleted = await deleteClaim(id, ownerId);
    if (!deleted) return apiError("not_found", NOT_FOUND_MESSAGE);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return internalError("DELETE /api/claims/:id", error);
  }
}
