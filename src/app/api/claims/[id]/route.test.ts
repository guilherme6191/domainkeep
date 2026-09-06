import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClaimRecord } from "@/lib/db/claims";
import type { ApiError, ClaimView } from "@/lib/types";

const SESSION_USER = "user_owner";
const CLAIM_ID = "6f1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b";
const TOKEN = "b".repeat(64);

let sessionUserId: string | null = SESSION_USER;

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: sessionUserId }),
}));

const getClaim = vi.fn<(id: string, ownerId: string) => Promise<ClaimRecord | null>>();
const findClaimByDomain = vi.fn();
const updateClaimDomain = vi.fn();

vi.mock("@/lib/db/claims", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/claims")>();
  return {
    ...actual,
    getClaim: (...args: Parameters<typeof getClaim>) => getClaim(...args),
    findClaimByDomain: (...args: unknown[]) => findClaimByDomain(...args),
    updateClaimDomain: (...args: unknown[]) => updateClaimDomain(...args),
  };
});

const { PATCH } = await import("@/app/api/claims/[id]/route");

const NOW = new Date();
const IN_A_WEEK = new Date(NOW.getTime() + 7 * 24 * 3600 * 1000);
const YESTERDAY = new Date(NOW.getTime() - 24 * 3600 * 1000);

function record(overrides: Partial<ClaimRecord["claim"]> = {}): ClaimRecord {
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

function patch(domain: string, id = CLAIM_ID) {
  return PATCH(
    new Request("http://localhost/claim", {
      method: "PATCH",
      body: JSON.stringify({ domain }),
    }),
    { params: Promise.resolve({ id }) },
  );
}

beforeEach(() => {
  sessionUserId = SESSION_USER;
  getClaim.mockReset();
  findClaimByDomain.mockReset();
  updateClaimDomain.mockReset();
  findClaimByDomain.mockResolvedValue(null);
});

describe("PATCH /api/claims/:id", () => {
  it("edits a claim that has never verified", async () => {
    getClaim.mockResolvedValue(record());
    updateClaimDomain.mockImplementation(
      async ({ normalizedDomain }: { normalizedDomain: string }) =>
        record({ normalizedDomain }),
    );

    const response = await patch("recomendei.com");
    const view = (await response.json()) as ClaimView;

    expect(response.status).toBe(200);
    expect(view.domain).toBe("recomendei.com");
    expect(updateClaimDomain).toHaveBeenCalledTimes(1);
  });

  it("refuses to edit a verified claim", async () => {
    getClaim.mockResolvedValue(record({ verifiedAt: YESTERDAY }));

    const response = await patch("recomendei.com");
    const body = (await response.json()) as ApiError;

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("claim_locked");
    expect(updateClaimDomain).not.toHaveBeenCalled();
  });

  it("refuses to edit a superseded claim, so its history never describes another domain", async () => {
    getClaim.mockResolvedValue(
      record({ verifiedAt: YESTERDAY, supersededAt: NOW, tokenExpiresAt: NOW }),
    );

    const response = await patch("recomendei.com");
    const body = (await response.json()) as ApiError;

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("claim_locked");
    expect(updateClaimDomain).not.toHaveBeenCalled();
  });
});
