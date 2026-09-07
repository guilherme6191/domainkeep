"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";
import { claimsApi } from "@/lib/api/client";
import type { PageSize } from "@/lib/pagination";
import type { ClaimPage, ClaimView } from "@/lib/types";

const claimsKey = ["claims"] as const;
// "list" separates page envelopes from the bare ClaimView held under an id,
// so a write across every cached page can't reach a detail entry.
const claimListPrefix = ["claims", "list"] as const;
const claimListKey = (page: number, pageSize: PageSize) =>
  ["claims", "list", page, pageSize] as const;
const claimKey = (id: string) => ["claims", id] as const;

export function useClaims(page: number, pageSize: PageSize) {
  return useQuery({
    queryKey: claimListKey(page, pageSize),
    queryFn: () => claimsApi.list(page, pageSize),
    // Keep the rows on screen while the next page loads.
    placeholderData: keepPreviousData,
  });
}

export function useClaim(id: string) {
  return useQuery({ queryKey: claimKey(id), queryFn: () => claimsApi.get(id) });
}

// Replace only: a new claim belongs to whichever page the server puts it on,
// which this cache cannot know. An unfetched page stays unfetched.
function replaceClaim(page: ClaimPage | undefined, claim: ClaimView) {
  if (!page) return page;

  const index = page.items.findIndex((existing) => existing.id === claim.id);
  if (index === -1) return page;

  const items = page.items.slice();
  items[index] = claim;
  return { ...page, items };
}

/** Drops rows from every cached page and keeps `total` honest. */
export function evictClaims(queryClient: QueryClient, ids: string[]) {
  for (const id of ids) queryClient.removeQueries({ queryKey: claimKey(id) });

  queryClient.setQueriesData<ClaimPage>({ queryKey: claimListPrefix }, (page) => {
    if (!page) return page;
    // The rows are gone everywhere, so every cached page's total drops.
    const items = page.items.filter((claim) => !ids.includes(claim.id));
    return { ...page, items, total: Math.max(0, page.total - ids.length) };
  });
}

type ClaimMutationOptions<TVariables> = Omit<
  UseMutationOptions<ClaimView, Error, TVariables>,
  "mutationFn"
> & {
  /** Whether the server's answer is also written into the cached list. */
  syncList?: boolean;
};

/** The cache is replaced with the server's answer, never patched optimistically. */
function useClaimMutation<TVariables>(
  mutationFn: (variables: TVariables) => Promise<ClaimView>,
  { syncList = true, ...options }: ClaimMutationOptions<TVariables> = {},
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    ...options,
    onSuccess: (claim, variables, context, mutation) => {
      // Seed the detail cache so navigation renders without a skeleton.
      queryClient.setQueryData(claimKey(claim.id), claim);

      if (syncList) {
        queryClient.setQueriesData<ClaimPage>(
          { queryKey: claimListPrefix },
          (page) => replaceClaim(page, claim),
        );
      }

      // Mark stale without refetching, so a response can't land mid-navigation.
      void queryClient.invalidateQueries({
        queryKey: claimsKey,
        refetchType: "none",
      });

      options?.onSuccess?.(claim, variables, context, mutation);
    },
  });
}

export function useAddDomain(options?: ClaimMutationOptions<string>) {
  // The list is visible behind the dialog while the route change is in flight;
  // writing the row now would animate it into a list the user is leaving.
  return useClaimMutation((domain: string) => claimsApi.create(domain), {
    ...options,
    syncList: false,
  });
}

export function useVerifyClaim(id: string) {
  return useClaimMutation(() => claimsApi.verify(id));
}

export function useReplaceToken(id: string) {
  return useClaimMutation(() => claimsApi.replaceToken(id));
}

export function useEditDomain(
  id: string,
  options?: ClaimMutationOptions<string>,
) {
  return useClaimMutation(
    (domain: string) => claimsApi.updateDomain(id, domain),
    options,
  );
}

export function useDeleteClaim(options?: { onSuccess?: () => void }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => claimsApi.remove(id),
    onSuccess: (_data, id) => {
      // Deleting from the detail page returns to the list, which must not paint
      // the removed row first.
      evictClaims(queryClient, [id]);
      void queryClient.invalidateQueries({
        queryKey: claimsKey,
        refetchType: "none",
      });

      options?.onSuccess?.();
    },
  });
}
