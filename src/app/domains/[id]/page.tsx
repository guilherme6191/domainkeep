import type { Metadata } from "next";
import { cache } from "react";
import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { AppHeader } from "@/components/app-header";
import { ClaimDetail } from "@/components/domains/claim-detail";
import { isClaimId } from "@/lib/api/params";
import { currentUserId } from "@/lib/api/session";
import { loadClaim } from "@/lib/claims-page";
import { claimKey } from "@/lib/query-keys";

/**
 * Read once per request and shared by the title and the page. Null covers a
 * malformed id, another account's claim, and a database that didn't answer:
 * the client then fetches on mount and lands in the same not-found or retry
 * state it always had.
 */
const claimForRequest = cache(async (id: string) => {
  const ownerId = await currentUserId();
  if (!ownerId || !isClaimId(id)) return null;
  return loadClaim(ownerId, id).catch(() => null);
});

export async function generateMetadata({
  params,
}: PageProps<"/domains/[id]">): Promise<Metadata> {
  const { id } = await params;
  const claim = await claimForRequest(id);
  return { title: claim?.domain ?? "Domain" };
}

/**
 * The claim is seeded into the client cache under the key `useClaim` asks
 * for, so the first paint is the detail rather than a skeleton. Every later
 * refetch still goes through the API.
 */
export default async function DomainDetailPage({
  params,
}: PageProps<"/domains/[id]">) {
  const { id } = await params;
  const claim = await claimForRequest(id);

  const queryClient = new QueryClient();
  if (claim) queryClient.setQueryData(claimKey(id), claim);

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
        <HydrationBoundary state={dehydrate(queryClient)}>
          <ClaimDetail claimId={id} />
        </HydrationBoundary>
      </main>
    </>
  );
}
