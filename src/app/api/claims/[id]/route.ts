import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, internalError, NOT_FOUND_MESSAGE } from "@/lib/api/errors";
import { isClaimId } from "@/lib/api/params";
import { currentUserId } from "@/lib/api/session";
import { toClaimView } from "@/lib/api/view";
import { isCurrentlyVerified } from "@/lib/claim-state";
import {
  DatabaseError,
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

function claimLocked(currentlyVerified: boolean) {
  return apiError(
    "claim_locked",
    currentlyVerified
      ? "This domain is already verified, so it can't be edited. Delete it and add the correct domain instead."
      : "This domain moved to another account, so it can't be edited. Delete it and add the correct domain instead.",
  );
}

function duplicateDomain() {
  return apiError(
    "invalid_domain",
    "You've already added that domain. Open it from your domains list.",
  );
}

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
      return claimLocked(isCurrentlyVerified(existing.claim));
    }

    if (normalized.domain === existing.claim.normalizedDomain) {
      return NextResponse.json(toClaimView(existing));
    }

    const collision = await findClaimByDomain(ownerId, normalized.domain);
    if (collision) {
      return duplicateDomain();
    }

    const now = new Date();
    const updated = await updateClaimDomain({
      id,
      ownerId,
      normalizedDomain: normalized.domain,
      token: createVerificationToken(),
      tokenExpiresAt: tokenExpiryFrom(now),
    });
    if (!updated) {
      // The conditional write can lose to verification or deletion.
      const current = await getClaim(id, ownerId);
      if (!current) return apiError("not_found", NOT_FOUND_MESSAGE);
      if (current.claim.verifiedAt !== null) {
        return claimLocked(isCurrentlyVerified(current.claim));
      }
      throw new Error("Domain edit returned no row for an editable claim.");
    }

    return NextResponse.json(toClaimView(updated, now));
  } catch (error) {
    if (error instanceof DatabaseError && error.code === "23505") {
      // A competing create/edit may have claimed the target after our check.
      // Confirm the collision belongs to this account before naming it.
      try {
        const collision = await findClaimByDomain(ownerId, normalized.domain);
        if (collision && collision.claim.id !== id) return duplicateDomain();
      } catch (reloadError) {
        return internalError("PATCH /api/claims/:id", reloadError);
      }
    }
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
