import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn<typeof fetch>() }));

vi.mock("@/lib/db/client", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient("https://database.example.com", "test-key", {
    global: { fetch: fetchMock },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { dbAdmin: () => client, db: () => client };
});

const { updateClaimDomain } = await import("@/lib/db/claims");

beforeEach(() => {
  fetchMock.mockReset();
});

describe("updateClaimDomain", () => {
  it("puts the owner and never-verified guards in the actual database request", async () => {
    // No row matches if verification or deletion completed before the write.
    fetchMock.mockResolvedValue(new Response("[]", {
      status: 200,
      headers: { "content-type": "application/json" },
    }));

    const result = await updateClaimDomain({
      id: "claim-id",
      ownerId: "user-owner",
      normalizedDomain: "example.com",
      token: "a".repeat(64),
      tokenExpiresAt: new Date("2026-09-14T00:00:00Z"),
    });

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    const query = new URL(String(url)).searchParams;
    expect(init?.method).toBe("PATCH");
    expect(query.get("id")).toBe("eq.claim-id");
    expect(query.get("owner_id")).toBe("eq.user-owner");
    expect(query.get("verified_at")).toBe("is.null");
    const body = JSON.parse(String(init?.body));
    expect(body.normalized_domain).toBe("example.com");
    expect(body).not.toHaveProperty("verified_at");
    expect(body).not.toHaveProperty("superseded_at");
  });
});
