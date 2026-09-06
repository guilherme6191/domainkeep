"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";
import { claimsApi } from "@/lib/api/client";
import type { ClaimView } from "@/lib/types";

const claimsKey = ["claims"] as const;
const claimKey = (id: string) => ["claims", id] as const;

export function useClaims() {
  return useQuery({ queryKey: claimsKey, queryFn: claimsApi.list });
}

export function useClaim(id: string) {
  return useQuery({ queryKey: claimKey(id), queryFn: () => claimsApi.get(id) });
}

// Replace if present, prepend if new (the list is newest-first). An unfetched
// list stays unfetched rather than becoming a partial one.
function upsertClaim(claims: ClaimView[] | undefined, claim: ClaimView) {
  if (!claims) return claims;

  const index = claims.findIndex((existing) => existing.id === claim.id);
  if (index === -1) return [claim, ...claims];

  const next = claims.slice();
  next[index] = claim;
  return next;
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
        queryClient.setQueryData<ClaimView[]>(claimsKey, (claims) =>
          upsertClaim(claims, claim),
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
      queryClient.removeQueries({ queryKey: claimKey(id) });

      // Deleting from the detail page returns to the list, which must not paint
      // the removed row first.
      queryClient.setQueryData<ClaimView[]>(claimsKey, (claims) =>
        claims?.filter((claim) => claim.id !== id),
      );
      void queryClient.invalidateQueries({
        queryKey: claimsKey,
        refetchType: "none",
      });

      options?.onSuccess?.();
    },
  });
}
