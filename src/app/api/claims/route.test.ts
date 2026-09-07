import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClaimRecord } from "@/lib/db/claims";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import type { ApiError, ClaimPage } from "@/lib/types";

const SESSION_USER = "user_owner";

let sessionUserId: string | null = SESSION_USER;

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: sessionUserId }),
}));

const deleteClaims = vi.fn<(ids: string[], ownerId: string) => Promise<string[]>>();
const listClaims = vi.fn<
  (ownerId: string, page: number, pageSize: number) => Promise<{ records: ClaimRecord[]; total: number }>
>();

vi.mock("@/lib/db/claims", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/claims")>();
  return {
    ...actual,
    listClaims: (...args: Parameters<typeof listClaims>) => listClaims(...args),
    deleteClaims: (...args: Parameters<typeof deleteClaims>) => deleteClaims(...args),
  };
});

const { DELETE, GET } = await import("@/app/api/claims/route");

const ID_A = "6f1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b";
const ID_B = "7a2b3c4d-5e6f-4071-9b0c-1d2e3f4a5b6c";

function get(query = "") {
  return GET(new Request(`http://localhost/api/claims${query}`));
}

function del(body: unknown) {
  return DELETE(
    new Request("http://localhost/api/claims", {
      method: "DELETE",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  sessionUserId = SESSION_USER;
  listClaims.mockReset();
  listClaims.mockResolvedValue({ records: [], total: 83 });
  deleteClaims.mockReset();
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

describe("DELETE /api/claims", () => {
  it("deletes the well-formed ids and reports back what the database removed", async () => {
    deleteClaims.mockResolvedValue([ID_A]);

    const response = await del({ ids: [ID_A, ID_B, "not-an-id"] });

    // Malformed ids never reach the query, and someone else's id is simply absent.
    expect(deleteClaims).toHaveBeenCalledWith([ID_A, ID_B], SESSION_USER);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: [ID_A] });
  });

  it("answers an unusable body with an empty deletion rather than an error", async () => {
    const bodies = [{ ids: [] }, { ids: ["not-an-id"] }, { ids: Array(121).fill(ID_A) }, {}, "{"];

    for (const body of bodies) {
      const response = await del(body);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ deleted: [] });
    }
    expect(deleteClaims).not.toHaveBeenCalled();
  });

  it("refuses an unauthenticated caller", async () => {
    sessionUserId = null;

    const response = await del({ ids: [ID_A] });

    expect(response.status).toBe(401);
    expect(deleteClaims).not.toHaveBeenCalled();
  });
});
