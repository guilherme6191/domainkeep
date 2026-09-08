import { beforeEach, describe, expect, it, vi } from "vitest";
import { PostgrestError } from "@supabase/supabase-js";
import { DatabaseError, type ClaimRecord } from "@/lib/db/claims";
import type { ApiError, ClaimView } from "@/lib/types";
import {
  CLAIM_ID,
  IN_A_WEEK,
  NOW,
  SESSION_USER,
  YESTERDAY,
  record,
} from "@/test/claim-fixtures";

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

  // One guard, `verifiedAt !== null`: a verified claim's proof belongs to its
  // domain, and a superseded claim's history describes the old one. The message
  // is the only thing that differs, so it is what each row pins.
  it.each([
    ["verified", { verifiedAt: YESTERDAY }, "already verified"],
    [
      "superseded",
      { verifiedAt: YESTERDAY, supersededAt: NOW, tokenExpiresAt: NOW },
      "moved to another account",
    ],
    [
      "superseded with a fresh token",
      { verifiedAt: YESTERDAY, supersededAt: NOW, tokenExpiresAt: IN_A_WEEK },
      "moved to another account",
    ],
  ])("refuses to edit a %s claim", async (_name, facts, message) => {
    getClaim.mockResolvedValue(record(facts));

    const response = await patch("recomendei.com");
    const body = (await response.json()) as ApiError;

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("claim_locked");
    expect(body.error.message).toContain(message);
    expect(updateClaimDomain).not.toHaveBeenCalled();
  });

  it("returns a locked response when verification wins the race with editing", async () => {
    getClaim
      .mockResolvedValueOnce(record())
      .mockResolvedValueOnce(record({ verifiedAt: NOW }));
    updateClaimDomain.mockResolvedValue(null);

    const response = await patch("example.com");
    const body = (await response.json()) as ApiError;

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("claim_locked");
    expect(body.error.message).toContain("already verified");
    expect(getClaim).toHaveBeenLastCalledWith(CLAIM_ID, SESSION_USER);
    expect(updateClaimDomain).toHaveBeenCalledOnce();
  });

  it("returns 404 when deletion wins the race with editing", async () => {
    getClaim.mockResolvedValueOnce(record()).mockResolvedValueOnce(null);
    updateClaimDomain.mockResolvedValue(null);

    const response = await patch("example.com");

    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("not_found");
  });

  it("returns the normal duplicate message when another create wins the race", async () => {
    getClaim.mockResolvedValue(record());
    findClaimByDomain
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(record({ id: "another-claim", normalizedDomain: "example.com" }));
    updateClaimDomain.mockRejectedValue(new DatabaseError(new PostgrestError({
      code: "23505", message: "unique constraint violation", details: "", hint: "",
    })));

    const response = await patch("example.com");
    const body = (await response.json()) as ApiError;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("invalid_domain");
    expect(body.error.message).toBe("You've already added that domain. Open it from your domains list.");
    expect(findClaimByDomain).toHaveBeenLastCalledWith(SESSION_USER, "example.com");
  });

  it("does not describe an unconfirmed uniqueness failure as an owned duplicate", async () => {
    getClaim.mockResolvedValue(record());
    updateClaimDomain.mockRejectedValue(new DatabaseError(new PostgrestError({
      code: "23505", message: "unique constraint violation", details: "", hint: "",
    })));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await patch("example.com");
      expect(response.status).toBe(500);
      expect((await response.json()).error.code).toBe("internal_error");
    } finally {
      logged.mockRestore();
    }
  });
});
