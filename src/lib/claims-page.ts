import "server-only";
import { toClaimView } from "@/lib/api/view";
import { listClaims } from "@/lib/db/claims";
import type { PageSize } from "@/lib/pagination";
import type { ClaimPage } from "@/lib/types";

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
