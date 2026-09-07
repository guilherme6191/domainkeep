import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "@/lib/api/client";
import type { ClaimView } from "@/lib/types";

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
  it("shows not-found without a retry for a missing or foreign claim", () => {
    useClaimMock.mockReturnValue({
      isError: true,
      error: new ApiRequestError("not_found", "Not found", "reference-id"),
    });
    const html = render();
    expect(html).toContain("find that domain");
    expect(html).not.toContain(">Retry</button>");
  });

  it("offers retry and a request reference for server failures", () => {
    useClaimMock.mockReturnValue({
      isError: true,
      error: new ApiRequestError("internal_error", "Server error", "reference-id"),
    });
    const html = render();
    expect(html).toContain("load this domain");
    expect(html).toContain(">Retry</button>");
    expect(html).toContain("reference-id");
    expect(html).not.toContain("find that domain");
  });

  it("offers retry for network failures without inventing a request reference", () => {
    useClaimMock.mockReturnValue({ isError: true, error: new TypeError("Failed to fetch") });
    const html = render();
    expect(html).toContain("load this domain");
    expect(html).toContain(">Retry</button>");
    expect(html).not.toContain("Reference:");
  });

  it("disables the retry action while reloading", () => {
    useClaimMock.mockReturnValue({ isError: true, error: new Error(), isFetching: true });
    expect(render()).toMatch(/<button[^>]*disabled[^>]*>Retrying…<\/button>/);
  });
});

describe("claim detail verified view", () => {
  it("shows no record and no struck-through value once the token has aged out", () => {
    const claim: ClaimView = {
      id: "claim-id",
      domain: "example.com",
      verificationHostname: "example.com",
      token: "a".repeat(64),
      recordValue: `resend-verify=${"a".repeat(64)}`,
      // Long past: verification outlives the challenge, and the view must not
      // read the token's age as "needs a new code".
      tokenExpiresAt: "2026-08-01T00:00:00Z",
      verifiedAt: "2026-07-25T00:00:00Z",
      supersededAt: null,
      tookOverAt: null,
      state: "verified",
      lastCheck: null,
      createdAt: "2026-07-24T00:00:00Z",
    };
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
      const claim: ClaimView = {
        id: "claim-id",
        domain: "example.com",
        verificationHostname: "example.com",
        token: "a".repeat(64),
        recordValue: `resend-verify=${"a".repeat(64)}`,
        tokenExpiresAt: new Date(Date.now() + 86400000).toISOString(),
        verifiedAt,
        supersededAt: verifiedAt ? "2026-09-06T00:00:00Z" : null,
        tookOverAt: null,
        state: "setup_required",
        lastCheck: null,
        createdAt: "2026-09-04T00:00:00Z",
      };
      useClaimMock.mockReturnValue({ data: claim });
      const html = render();
      expect(html.includes("Edit domain control")).toBe(verifiedAt === null);
      if (verifiedAt) expect(html).toContain("moved to another account");
    },
  );
});
