import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClaimRecord } from "@/lib/db/claims";
import { setResolver } from "@/lib/dns";
import type { TxtLookup } from "@/lib/dns/resolver";
import type { ClaimView, LastCheckResult } from "@/lib/types";
import {
  CLAIM_ID,
  NOW,
  SESSION_USER,
  TOKEN,
  YESTERDAY,
  record,
} from "@/test/claim-fixtures";

let sessionUserId: string | null = SESSION_USER;

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: sessionUserId }),
}));

// Real `after` needs a request scope; running the callback inline also makes
// the notification assertions deterministic.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (callback: () => unknown) => callback(),
}));

const notifyTakeover = vi.fn();

vi.mock("@/lib/mail/notify", () => ({
  notifyTakeover: (...args: unknown[]) => notifyTakeover(...args),
}));

const getClaim = vi.fn<(id: string, ownerId: string) => Promise<ClaimRecord | null>>();
const recordCheckFailure = vi.fn();
const verifyClaimAtomically = vi.fn();

vi.mock("@/lib/db/claims", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/claims")>();
  return {
    ...actual,
    getClaim: (...args: Parameters<typeof getClaim>) => getClaim(...args),
    recordCheckFailure: (...args: unknown[]) => recordCheckFailure(...args),
    verifyClaimAtomically: (...args: unknown[]) => verifyClaimAtomically(...args),
  };
});

const { POST } = await import("@/app/api/claims/[id]/verify/route");

function fakeDns(lookup: TxtLookup) {
  setResolver({ resolveTxt: async () => lookup });
}

function call(id = CLAIM_ID) {
  return POST(new Request("http://localhost/verify", { method: "POST" }), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  sessionUserId = SESSION_USER;
  getClaim.mockReset();
  recordCheckFailure.mockReset();
  verifyClaimAtomically.mockReset();
  notifyTakeover.mockReset();
  // Unset in the test environment, so the email link falls back to the request.
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
  vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
  recordCheckFailure.mockImplementation(
    async ({ result, observedValues }: {
      result: LastCheckResult;
      observedValues: string[] | null;
    }) => record({
      lastCheck: result === "value_mismatch"
        ? { result, observedValues: observedValues ?? [], checkedAt: NOW }
        : { result, checkedAt: NOW },
    }),
  );
  fakeDns({ outcome: "not_found" });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/claims/:id/verify", () => {
  it("requires a session", async () => {
    sessionUserId = null;
    const response = await call();
    expect(response.status).toBe(401);
  });

  it("returns 404 for a claim that is not the caller's", async () => {
    getClaim.mockResolvedValue(null);
    const response = await call();
    expect(response.status).toBe(404);
    // Never 403 — that would confirm the claim exists.
    expect((await response.json()).error.code).toBe("not_found");
  });

  it("returns 404 for an id that isn't a claim id, without touching the database", async () => {
    const response = await call("not-a-uuid");
    expect(response.status).toBe(404);
    expect(getClaim).not.toHaveBeenCalled();
  });

  it("verifies on a matching record, exposing the takeover time but never the owner", async () => {
    getClaim.mockResolvedValue(record());
    fakeDns({ outcome: "records", records: [[`resend-verify=${TOKEN}`]] });
    verifyClaimAtomically.mockResolvedValue(
      record({ verifiedAt: NOW, tookOverAt: NOW }),
    );

    const response = await call();
    const body: ClaimView = await response.json();

    expect(response.status).toBe(200);
    expect(body.state).toBe("verified");
    expect(body.tookOverAt).toBe(NOW.toISOString());
    expect(body.recordValue).toBe(`resend-verify=${TOKEN}`);
    expect(body).not.toHaveProperty("ownerId");
    expect(verifyClaimAtomically).toHaveBeenCalledOnce();
    expect(notifyTakeover).toHaveBeenCalledWith(
      expect.objectContaining({ tookOverAt: NOW }),
      "http://localhost",
    );
  });

  it("tells nobody when the verification displaced nobody", async () => {
    getClaim.mockResolvedValue(record());
    fakeDns({ outcome: "records", records: [[`resend-verify=${TOKEN}`]] });
    verifyClaimAtomically.mockResolvedValue(record({ verifiedAt: NOW }));

    const body: ClaimView = await (await call()).json();

    expect(body.state).toBe("verified");
    expect(notifyTakeover).not.toHaveBeenCalled();
  });

  it("still verifies when the takeover notice fails to send", async () => {
    getClaim.mockResolvedValue(record());
    fakeDns({ outcome: "records", records: [[`resend-verify=${TOKEN}`]] });
    verifyClaimAtomically.mockResolvedValue(
      record({ verifiedAt: NOW, tookOverAt: NOW }),
    );
    notifyTakeover.mockRejectedValue(new Error("resend is down"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await call();

    expect(response.status).toBe(200);
    expect((await response.json()).state).toBe("verified");
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it.each([
    [{ outcome: "not_found" } as TxtLookup, "record_not_found"],
    [
      {
        outcome: "records",
        records: [["resend-verify=something-else"]],
      } as TxtLookup,
      "value_mismatch",
    ],
    [{ outcome: "temporary_failure" } as TxtLookup, "temporary_dns_error"],
  ])("returns 200 with %s classified as %s", async (lookup, expected) => {
    getClaim.mockResolvedValue(record());
    fakeDns(lookup);

    const response = await call();
    const body: ClaimView = await response.json();

    // A negative result is a successful check, not a failed request.
    expect(response.status).toBe(200);
    expect(body.state).toBe(expected);
    if (expected === "value_mismatch") {
      expect(body.lastCheck).toMatchObject({
        result: "value_mismatch",
        observedValues: ["resend-verify=something-else"],
      });
    }
    expect(verifyClaimAtomically).not.toHaveBeenCalled();
  });

  it("does not attach token A's failed check to replacement token B", async () => {
    const replacementToken = "c".repeat(64);
    getClaim
      .mockResolvedValueOnce(record({ verificationToken: TOKEN }))
      .mockResolvedValueOnce(
        record({ verificationToken: replacementToken, lastCheck: null }),
      );
    recordCheckFailure.mockResolvedValue(null);

    const response = await call();
    const body: ClaimView = await response.json();

    expect(response.status).toBe(200);
    expect(recordCheckFailure).toHaveBeenCalledWith(
      expect.objectContaining({ expectedToken: TOKEN }),
    );
    expect(body.token).toBe(replacementToken);
    expect(body.lastCheck).toBeNull();
    expect(body.state).toBe("setup_required");
  });

  // One guard, `tokenExpiresAt <= now`. Supersession expires the loser's token
  // in the same transaction, so this is also what stops the previous holder
  // from re-verifying against its leftover record.
  it.each([
    ["expired", { tokenExpiresAt: YESTERDAY }, "expired"],
    [
      "superseded",
      { verifiedAt: YESTERDAY, supersededAt: NOW, tokenExpiresAt: NOW },
      "superseded",
    ],
  ])("answers a %s challenge without a lookup", async (_name, facts, state) => {
    getClaim.mockResolvedValue(record(facts));
    const resolveTxt = vi.fn();
    setResolver({ resolveTxt });

    const response = await call();
    const body: ClaimView = await response.json();

    expect(response.status).toBe(200);
    expect(body.state).toBe(state);
    expect(body.tookOverAt).toBeNull();
    expect(resolveTxt).not.toHaveBeenCalled();
    expect(verifyClaimAtomically).not.toHaveBeenCalled();
  });

  it("does nothing for a claim that is already verified", async () => {
    getClaim.mockResolvedValue(
      record({ verifiedAt: YESTERDAY, tookOverAt: YESTERDAY }),
    );
    const resolveTxt = vi.fn();
    setResolver({ resolveTxt });

    const body: ClaimView = await (await call()).json();

    expect(body.state).toBe("verified");
    expect(body.tookOverAt).toBe(YESTERDAY.toISOString());
    expect(resolveTxt).not.toHaveBeenCalled();
  });
});
