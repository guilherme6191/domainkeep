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

const { deleteClaims, listClaims, recordCheckFailure, replaceToken, updateClaimDomain } =
  await import("@/lib/db/claims");

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

describe("listClaims", () => {
  it("asks the database for one page and the true total", async () => {
    fetchMock.mockResolvedValue(new Response("[]", {
      status: 200,
      headers: { "content-type": "application/json", "content-range": "80-82/83" },
    }));

    const { records, total } = await listClaims("user-owner", 3, 40);

    expect(records).toEqual([]);
    expect(total).toBe(83);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    const query = new URL(String(url)).searchParams;
    expect(query.get("owner_id")).toBe("eq.user-owner");
    // id breaks created_at ties, so offsets stay deterministic across pages.
    expect(query.get("order")).toBe("created_at.desc,id.asc");
    expect(query.get("offset")).toBe("80");
    expect(query.get("limit")).toBe("40");
    expect(String(new Headers(init?.headers).get("prefer"))).toContain("count=exact");
  });
});

describe("deleteClaims", () => {
  it("filters by owner and reports only the rows the database removed", async () => {
    fetchMock.mockResolvedValue(new Response('[{"id":"claim-a"}]', {
      status: 200,
      headers: { "content-type": "application/json" },
    }));

    const deleted = await deleteClaims(["claim-a", "claim-b"], "user-owner");

    // Never the requested ids: one belonged to someone else or was already gone.
    expect(deleted).toEqual(["claim-a"]);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    const query = new URL(String(url)).searchParams;
    expect(init?.method).toBe("DELETE");
    expect(query.get("id")).toBe("in.(claim-a,claim-b)");
    expect(query.get("owner_id")).toBe("eq.user-owner");
  });
});

describe("listClaims past the last page", () => {
  it("reports an empty page and the true total instead of failing", async () => {
    // PostgREST answers an out-of-range offset with 416, never an empty page.
    fetchMock.mockResolvedValueOnce(new Response(
      '{"code":"PGRST103","message":"Requested range not satisfiable","details":"","hint":null}',
      { status: 416, headers: { "content-type": "application/json" } },
    ));
    fetchMock.mockResolvedValueOnce(new Response(null, {
      status: 200,
      headers: { "content-type": "application/json", "content-range": "*/5" },
    }));

    const { records, total } = await listClaims("user-owner", 2, 40);

    expect(records).toEqual([]);
    expect(total).toBe(5);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1]?.method).toBe("HEAD");
  });
});

// Both writes only make sense on a pending claim, so they carry the negation of
// `is_currently_verified` and let the database refuse a claim that verified
// after the route's read. A superseded claim (verified once, then displaced)
// still passes, because it is exactly the one that needs a new challenge.
describe("writes that require a pending claim", () => {
  const NOT_CURRENTLY_VERIFIED = "(verified_at.is.null,superseded_at.not.is.null)";

  function refused() {
    fetchMock.mockResolvedValue(new Response("[]", {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
  }

  it("replaceToken refuses a claim that is currently verified", async () => {
    refused();

    const result = await replaceToken({
      id: "claim-id",
      ownerId: "user-owner",
      token: "b".repeat(64),
      tokenExpiresAt: new Date("2026-09-14T00:00:00Z"),
    });

    expect(result).toBeNull();
    const [url, init] = fetchMock.mock.calls[0];
    const query = new URL(String(url)).searchParams;
    expect(init?.method).toBe("PATCH");
    expect(query.get("id")).toBe("eq.claim-id");
    expect(query.get("owner_id")).toBe("eq.user-owner");
    expect(query.get("or")).toBe(NOT_CURRENTLY_VERIFIED);
  });

  it("recordCheckFailure never writes a failure over a proof that landed meanwhile", async () => {
    refused();

    const result = await recordCheckFailure({
      id: "claim-id",
      ownerId: "user-owner",
      expectedToken: "a".repeat(64),
      result: "record_not_found",
      observedValues: null,
      checkedAt: new Date("2026-09-07T00:00:00Z"),
    });

    expect(result).toBeNull();
    const [url, init] = fetchMock.mock.calls[0];
    const query = new URL(String(url)).searchParams;
    expect(init?.method).toBe("PATCH");
    expect(query.get("verification_token")).toBe(`eq.${"a".repeat(64)}`);
    expect(query.get("or")).toBe(NOT_CURRENTLY_VERIFIED);
    const body = JSON.parse(String(init?.body));
    expect(body).not.toHaveProperty("verified_at");
  });
});
