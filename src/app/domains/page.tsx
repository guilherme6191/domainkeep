import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { AppHeader } from "@/components/app-header";
import { DomainsList } from "@/components/domains/domains-list";
import { currentUserId } from "@/lib/api/session";
import { loadClaimPage } from "@/lib/claims-page";
import { parsePage, parsePageSize } from "@/lib/pagination";
import { claimListKey } from "@/lib/query-keys";

function first(value: string | string[] | undefined): string | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

/**
 * Reads the page from the URL and fetches it on the server, so the first paint
 * is the table rather than a skeleton. The rows are handed to the client cache
 * under the key `useClaims` asks for; a prefetch that fails is dropped
 * silently and the hook fetches on mount, reaching the same error state as
 * before. Every later page change still goes through the API.
 */
export default async function DomainsPage({ searchParams }: PageProps<"/domains">) {
  const query = await searchParams;
  const page = parsePage(first(query.page));
  const pageSize = parsePageSize(first(query.pageSize));

  const queryClient = new QueryClient();
  // The layout has already redirected a signed-out visitor; this only guards
  // the type. A missing id means no prefetch, not an error.
  const ownerId = await currentUserId();
  if (ownerId) {
    await queryClient.prefetchQuery({
      queryKey: claimListKey(page, pageSize),
      queryFn: () => loadClaimPage(ownerId, page, pageSize),
    });
  }

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
        <HydrationBoundary state={dehydrate(queryClient)}>
          <DomainsList page={page} pageSize={pageSize} />
        </HydrationBoundary>
      </main>
    </>
  );
}
