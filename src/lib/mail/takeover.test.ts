import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface Message {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}

const send = vi.fn<(message: Message) => Promise<{ error: null }>>(async () => ({
  error: null,
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));

const { sendTakeoverNotice } = await import("@/lib/mail/takeover");

const NOTICE = {
  to: "previous@example.com",
  domain: "recomendei.me",
  tookOverAt: new Date("2026-09-06T14:03:00Z"),
  claimUrl: "https://app.example.com/domains/claim-1",
};

beforeEach(() => {
  send.mockClear();
  vi.stubEnv("RESEND_FROM", "notices@example.com");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sendTakeoverNotice", () => {
  it("sends nothing when Resend is not configured, so local setup stays optional", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    await expect(sendTakeoverNotice(NOTICE)).resolves.toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("sends one message naming the domain and the time, never the new holder", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");

    await sendTakeoverNotice(NOTICE);

    expect(send).toHaveBeenCalledOnce();
    const message = send.mock.calls[0][0];
    expect(message.from).toBe("notices@example.com");
    expect(message.to).toBe("previous@example.com");
    expect(message.subject).toBe(
      "Your domain recomendei.me was claimed by another account",
    );
    expect(message.text).toContain("6 September 2026 at 14:03 UTC");
    expect(message.text).toContain(NOTICE.claimUrl);
    expect(message.html).toContain(`href="${NOTICE.claimUrl}"`);
  });
});
