import "server-only";
import { toClaimView } from "@/lib/api/view";
import { getClaim, listClaims } from "@/lib/db/claims";
import type { PageSize } from "@/lib/pagination";
import type { ClaimPage, ClaimView } from "@/lib/types";

/**
 * One page of the caller's claims as the API answers it. The list route and
 * the server-rendered list page both go through here, so a prefetched page is
 * byte-for-byte what a later fetch would return.
 */
export async function loadClaimPage(
  ownerId: string,
  page: number,
  pageSize: PageSize,
): Promise<ClaimPage> {
  // A page past the end is empty but still reports the true total; the
  // client clamps its own URL rather than being redirected.
  const { records, total } = await listClaims(ownerId, page, pageSize);
  const now = new Date();
  return {
    items: records.map((record) => toClaimView(record, now)),
    page,
    pageSize,
    total,
  };
}

/**
 * One claim as `GET /api/claims/:id` answers it, or null when it does not
 * exist for this owner. The detail page reads it on the server for the tab
 * title and hands the same object to the client cache.
 */
export async function loadClaim(
  ownerId: string,
  id: string,
): Promise<ClaimView | null> {
  const record = await getClaim(id, ownerId);
  return record ? toClaimView(record) : null;
}
