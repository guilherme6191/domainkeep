import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, internalError } from "@/lib/api/errors";
import { currentUserId } from "@/lib/api/session";
import { toClaimView } from "@/lib/api/view";
import {
  DatabaseError,
  findClaimByDomain,
  insertClaim,
  listClaims,
} from "@/lib/db/claims";
import { normalizeDomain } from "@/lib/domain";
import { createVerificationToken, tokenExpiryFrom } from "@/lib/token";

const createBody = z.object({ domain: z.string() });

export async function GET() {
  const ownerId = await currentUserId();
  if (!ownerId) return apiError("unauthenticated", "Sign in to continue.");

  try {
    const records = await listClaims(ownerId);
    const now = new Date();
    return NextResponse.json(records.map((record) => toClaimView(record, now)));
  } catch (error) {
    return internalError("GET /api/claims", error);
  }
}

export async function POST(request: Request) {
  const ownerId = await currentUserId();
  if (!ownerId) return apiError("unauthenticated", "Sign in to continue.");

  const parsed = createBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError("invalid_domain", "Enter a domain to verify.");
  }

  const normalized = normalizeDomain(parsed.data.domain);
  if (!normalized.ok) {
    return apiError("invalid_domain", normalized.message);
  }

  try {
    // Idempotent: re-adding a domain you already have returns it.
    const existing = await findClaimByDomain(ownerId, normalized.domain);
    if (existing) {
      return NextResponse.json(toClaimView(existing), { status: 200 });
    }

    const now = new Date();
    const created = await insertClaim({
      ownerId,
      normalizedDomain: normalized.domain,
      token: createVerificationToken(),
      tokenExpiresAt: tokenExpiryFrom(now),
    });

    // Another account holding the domain is not an error and is not disclosed
    // here. Disclosure happens only after a successful proof.
    return NextResponse.json(toClaimView(created, now), { status: 201 });
  } catch (error) {
    // Lost a race with a concurrent create of the same claim.
    if (error instanceof DatabaseError && error.code === "23505") {
      try {
        const existing = await findClaimByDomain(ownerId, normalized.domain);
        if (existing) {
          return NextResponse.json(toClaimView(existing), { status: 200 });
        }
      } catch (reloadError) {
        return internalError("POST /api/claims", reloadError);
      }
    }

    return internalError("POST /api/claims", error);
  }
}
