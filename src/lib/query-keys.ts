import type { PageSize } from "@/lib/pagination";

/**
 * Shared by the client hooks and the server page that prefetches for them, so
 * hydrated data lands under the key the hook will ask for. No directive on
 * purpose: this file must be importable from both sides.
 */
export const claimsKey = ["claims"] as const;

// "list" separates page envelopes from the bare ClaimView held under an id,
// so a write across every cached page can't reach a detail entry.
export const claimListPrefix = ["claims", "list"] as const;

export const claimListKey = (page: number, pageSize: PageSize) =>
  ["claims", "list", page, pageSize] as const;

export const claimKey = (id: string) => ["claims", id] as const;
