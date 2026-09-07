import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClaimRecord } from "@/lib/db/claims";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import type { ApiError, ClaimPage } from "@/lib/types";

const SESSION_USER = "user_owner";

let sessionUserId: string | null = SESSION_USER;

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: sessionUserId }),
}));

const listClaims = vi.fn<
  (ownerId: string, page: number, pageSize: number) => Promise<{ records: ClaimRecord[]; total: number }>
>();

vi.mock("@/lib/db/claims", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/claims")>();
  return {
    ...actual,
    listClaims: (...args: Parameters<typeof listClaims>) => listClaims(...args),
  };
});

const { GET } = await import("@/app/api/claims/route");

function get(query = "") {
  return GET(new Request(`http://localhost/api/claims${query}`));
}

beforeEach(() => {
  sessionUserId = SESSION_USER;
  listClaims.mockReset();
  listClaims.mockResolvedValue({ records: [], total: 83 });
});

describe("GET /api/claims", () => {
  it("defaults to the first page at the smallest offered size", async () => {
    await get();
    await get("?page=abc&pageSize=50");

    expect(listClaims.mock.calls).toEqual([
      [SESSION_USER, 1, DEFAULT_PAGE_SIZE],
      [SESSION_USER, 1, DEFAULT_PAGE_SIZE],
    ]);
  });

  it("returns the requested page and echoes what it used", async () => {
    const response = await get("?page=4&pageSize=80");
    const body = (await response.json()) as ClaimPage;

    expect(listClaims).toHaveBeenCalledWith(SESSION_USER, 4, 80);
    expect(body).toEqual({ items: [], page: 4, pageSize: 80, total: 83 });
  });

  it("refuses an unauthenticated caller", async () => {
    sessionUserId = null;

    const response = await get();

    expect(response.status).toBe(401);
    expect(((await response.json()) as ApiError).error.code).toBe("unauthenticated");
    expect(listClaims).not.toHaveBeenCalled();
  });
});
