import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DomainClaim } from "@/lib/types";

const claimTakeoverNotification = vi.fn();
const primaryEmailFor = vi.fn();
const sendTakeoverNotice = vi.fn();

vi.mock("@/lib/db/claims", () => ({ claimTakeoverNotification }));
vi.mock("@/lib/users", () => ({ primaryEmailFor }));
vi.mock("@/lib/mail/takeover", () => ({ sendTakeoverNotice }));

const { notifyTakeover } = await import("@/lib/mail/notify");

const TOOK_OVER_AT = new Date("2026-09-06T14:03:00Z");
const ORIGIN = "https://app.example.com";

function winner(overrides: Partial<DomainClaim> = {}): DomainClaim {
  return {
    id: "winner-claim",
    normalizedDomain: "recomendei.me",
    ownerId: "user_winner",
    verificationToken: "b".repeat(64),
    tokenExpiresAt: TOOK_OVER_AT,
    verifiedAt: TOOK_OVER_AT,
    supersededAt: null,
    tookOverAt: TOOK_OVER_AT,
    lastCheck: null,
    createdAt: TOOK_OVER_AT,
    updatedAt: TOOK_OVER_AT,
    ...overrides,
  };
}

beforeEach(() => {
  claimTakeoverNotification.mockReset().mockResolvedValue(null);
  primaryEmailFor.mockReset().mockResolvedValue("previous@example.com");
  sendTakeoverNotice.mockReset();
});

describe("notifyTakeover", () => {
  it("does nothing for a first verification, which displaced nobody", async () => {
    await notifyTakeover(winner({ tookOverAt: null }), ORIGIN);
    expect(claimTakeoverNotification).not.toHaveBeenCalled();
    expect(sendTakeoverNotice).not.toHaveBeenCalled();
  });

  it("sends nothing when another request already claimed the notice", async () => {
    await notifyTakeover(winner(), ORIGIN);
    expect(primaryEmailFor).not.toHaveBeenCalled();
    expect(sendTakeoverNotice).not.toHaveBeenCalled();
  });

  it("sends nothing when the displaced account has no primary email", async () => {
    claimTakeoverNotification.mockResolvedValue({
      id: "loser-claim",
      ownerId: "user_loser",
    });
    primaryEmailFor.mockResolvedValue(null);

    await notifyTakeover(winner(), ORIGIN);

    expect(sendTakeoverNotice).not.toHaveBeenCalled();
  });

  it("emails the displaced holder a link to their own claim, and nothing about the winner", async () => {
    claimTakeoverNotification.mockResolvedValue({
      id: "loser-claim",
      ownerId: "user_loser",
    });

    await notifyTakeover(winner(), ORIGIN);

    expect(claimTakeoverNotification).toHaveBeenCalledWith({
      normalizedDomain: "recomendei.me",
      tookOverAt: TOOK_OVER_AT,
      winnerId: "winner-claim",
    });
    expect(sendTakeoverNotice).toHaveBeenCalledWith({
      to: "previous@example.com",
      domain: "recomendei.me",
      tookOverAt: TOOK_OVER_AT,
      claimUrl: "https://app.example.com/domains/loser-claim",
    });
    // The winner's row never reaches the message.
    expect(JSON.stringify(sendTakeoverNotice.mock.calls)).not.toContain("winner");
  });
});
