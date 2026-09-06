import { describe, expect, it } from "vitest";
import {
  getClaimViewState,
  isCurrentlyVerified,
  lastCheckedAt,
} from "@/lib/claim-state";
import type { DomainClaim } from "@/lib/types";

const NOW = new Date("2026-09-02T12:00:00Z");
const FUTURE = new Date("2026-09-09T12:00:00Z");
const PAST = new Date("2026-08-26T12:00:00Z");

type Facts = Pick<
  DomainClaim,
  "verifiedAt" | "supersededAt" | "tokenExpiresAt" | "lastCheck"
>;

function claim(overrides: Partial<Facts> = {}): Facts {
  return {
    verifiedAt: null,
    supersededAt: null,
    tokenExpiresAt: FUTURE,
    lastCheck: null,
    ...overrides,
  };
}

describe("getClaimViewState", () => {
  it("is setup_required before the first check", () => {
    expect(getClaimViewState(claim(), NOW)).toBe("setup_required");
  });

  it("reports the latest failure result", () => {
    expect(
      getClaimViewState(
        claim({ lastCheck: { result: "record_not_found", checkedAt: NOW } }),
        NOW,
      ),
    ).toBe("record_not_found");
  });

  it("is expired once the token's expiry has passed", () => {
    expect(getClaimViewState(claim({ tokenExpiresAt: PAST }), NOW)).toBe(
      "expired",
    );
  });

  it("is verified when verifiedAt is set and nothing superseded it", () => {
    expect(getClaimViewState(claim({ verifiedAt: PAST }), NOW)).toBe("verified");
  });

  it("prefers superseded over verified and expired, because the newer fact wins", () => {
    // A takeover expires the loser's token at the same instant it supersedes.
    expect(
      getClaimViewState(
        claim({ verifiedAt: PAST, supersededAt: NOW, tokenExpiresAt: NOW }),
        NOW,
      ),
    ).toBe("superseded");
  });

  describe("after a superseded owner generates a new code", () => {
    const recovering = { verifiedAt: PAST, supersededAt: PAST, tokenExpiresAt: FUTURE };

    it("is an ordinary pending claim, not still superseded", () => {
      expect(getClaimViewState(claim(recovering), NOW)).toBe("setup_required");
    });

    it("gets the ordinary diagnostics on a failed check", () => {
      expect(
        getClaimViewState(
          claim({
            ...recovering,
            lastCheck: { result: "value_mismatch", observedValues: ["x"], checkedAt: NOW },
          }),
          NOW,
        ),
      ).toBe("value_mismatch");
    });

    it("expires like any other challenge if the new code goes unused", () => {
      const LATER = new Date("2026-09-20T12:00:00Z");
      expect(getClaimViewState(claim(recovering), LATER)).toBe("expired");
    });
  });
});

describe("isCurrentlyVerified", () => {
  it("requires both a verification and the absence of a supersession", () => {
    expect(isCurrentlyVerified({ verifiedAt: PAST, supersededAt: null })).toBe(true);
    expect(isCurrentlyVerified({ verifiedAt: PAST, supersededAt: NOW })).toBe(false);
    expect(isCurrentlyVerified({ verifiedAt: null, supersededAt: null })).toBe(false);
  });
});

describe("lastCheckedAt", () => {
  const VERIFIED = "2026-09-01T10:00:00Z";
  const CHECKED = "2026-09-02T09:00:00Z";
  const failed = { result: "record_not_found" as const, checkedAt: CHECKED };

  it.each([
    ["verified", { state: "verified", verifiedAt: VERIFIED, lastCheck: null }, VERIFIED],
    ["failed check", { state: "record_not_found", verifiedAt: null, lastCheck: failed }, CHECKED],
    ["never checked", { state: "setup_required", verifiedAt: null, lastCheck: null }, null],
    ["superseded with a later failed check", { state: "superseded", verifiedAt: VERIFIED, lastCheck: failed }, CHECKED],
  ] as const)("%s", (_name, view, expected) => {
    expect(lastCheckedAt(view)).toBe(expected);
  });
});
