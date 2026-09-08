import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "@/lib/api/client";
import { claimView } from "@/test/claim-fixtures";

const { useClaimMock } = vi.hoisted(() => ({ useClaimMock: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/hooks/use-claims", () => ({
  useClaim: useClaimMock,
  useVerifyClaim: () => ({ mutate: vi.fn(), isPending: false }),
  useReplaceToken: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/components/domains/edit-domain-dialog", () => ({
  EditDomainDialog: () => "Edit domain control",
}));
vi.mock("@/components/domains/delete-domain-dialog", () => ({
  DeleteDomainDialog: () => "Delete domain control",
}));

const { ClaimDetail } = await import("@/components/domains/claim-detail");

function render() {
  return renderToStaticMarkup(createElement(ClaimDetail, { claimId: "claim-id" }));
}

beforeEach(() => {
  useClaimMock.mockReset();
});

describe("claim detail loading errors", () => {
  // Not found gets no retry: a missing or foreign claim will not appear on a
  // second try. Other failures retry, and only a server error has a reference.
  it.each([
    [
      "a missing or foreign claim",
      new ApiRequestError("not_found", "Not found", "reference-id"),
      { copy: "find that domain", retry: false, reference: false },
    ],
    [
      "a server failure",
      new ApiRequestError("internal_error", "Server error", "reference-id"),
      { copy: "load this domain", retry: true, reference: true },
    ],
    [
      "a network failure",
      new TypeError("Failed to fetch"),
      { copy: "load this domain", retry: true, reference: false },
    ],
  ])("explains %s", (_name, error, expected) => {
    useClaimMock.mockReturnValue({ isError: true, error });
    const html = render();
    expect(html).toContain(expected.copy);
    expect(html.includes(">Retry</button>")).toBe(expected.retry);
    expect(html.includes("Reference: reference-id")).toBe(expected.reference);
  });

  it("disables the retry action while reloading", () => {
    useClaimMock.mockReturnValue({ isError: true, error: new Error(), isFetching: true });
    expect(render()).toMatch(/<button[^>]*disabled[^>]*>Retrying…<\/button>/);
  });
});

describe("claim detail verified view", () => {
  it("shows no record and no struck-through value once the token has aged out", () => {
    const claim = claimView({
      // Long past: verification outlives the challenge, and the view must not
      // read the token's age as "needs a new code".
      tokenExpiresAt: "2026-08-01T00:00:00Z",
      verifiedAt: "2026-07-25T00:00:00Z",
      state: "verified",
      createdAt: "2026-07-24T00:00:00Z",
    });
    useClaimMock.mockReturnValue({ data: claim });
    const html = render();
    expect(html).not.toContain(claim.recordValue);
    expect(html).not.toContain("line-through");
    expect(html).not.toContain("Generate a new code");
    expect(html).toContain("Delete domain control");
    expect(html).toContain("You can remove the");
  });
});

describe("claim detail edit eligibility", () => {
  it.each([null, "2026-09-05T00:00:00Z"])(
    "uses verification history (%s), even when the current state is setup_required",
    (verifiedAt) => {
      const claim = claimView({
        verifiedAt,
        supersededAt: verifiedAt ? "2026-09-06T00:00:00Z" : null,
      });
      useClaimMock.mockReturnValue({ data: claim });
      const html = render();
      expect(html.includes("Edit domain control")).toBe(verifiedAt === null);
      if (verifiedAt) expect(html).toContain("moved to another account");
    },
  );
});
