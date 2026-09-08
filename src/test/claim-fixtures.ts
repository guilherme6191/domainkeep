// Shared claim shapes for tests. A change to the claim's fields is one edit here.
import type { ClaimRecord } from "@/lib/db/claims";
import type { ClaimView } from "@/lib/types";

export const SESSION_USER = "user_owner";
export const CLAIM_ID = "6f1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b";
export const TOKEN = "b".repeat(64);

export const NOW = new Date();
export const IN_A_WEEK = new Date(NOW.getTime() + 7 * 24 * 3600 * 1000);
export const YESTERDAY = new Date(NOW.getTime() - 24 * 3600 * 1000);

/** A pending claim owned by the session user, as the database module returns it. */
export function record(
  overrides: Partial<ClaimRecord["claim"]> = {},
): ClaimRecord {
  return {
    claim: {
      id: CLAIM_ID,
      normalizedDomain: "recomendei.me",
      ownerId: SESSION_USER,
      verificationToken: TOKEN,
      tokenExpiresAt: IN_A_WEEK,
      verifiedAt: null,
      supersededAt: null,
      tookOverAt: null,
      lastCheck: null,
      createdAt: YESTERDAY,
      updatedAt: YESTERDAY,
      ...overrides,
    },
  };
}

/** A pending claim as the API serves it to the browser. */
export function claimView(overrides: Partial<ClaimView> = {}): ClaimView {
  return {
    id: "claim-id",
    domain: "example.com",
    verificationHostname: "example.com",
    token: "a".repeat(64),
    recordValue: `resend-verify=${"a".repeat(64)}`,
    tokenExpiresAt: IN_A_WEEK.toISOString(),
    verifiedAt: null,
    supersededAt: null,
    tookOverAt: null,
    state: "setup_required",
    lastCheck: null,
    createdAt: YESTERDAY.toISOString(),
    ...overrides,
  };
}
