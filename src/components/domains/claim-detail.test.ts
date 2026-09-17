import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "@/lib/api/client";
import { nextStep } from "@/lib/claim-state";
import { NOW, claimView } from "@/test/claim-fixtures";
import type { ClaimView, ClaimViewState } from "@/lib/types";

const { useClaimMock } = vi.hoisted(() => ({ useClaimMock: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/hooks/use-claims", () => ({
  useClaim: useClaimMock,
  useVerifyClaim: () => ({ mutate: vi.fn(), isPending: false }),
  useTakeOver: () => ({ mutate: vi.fn(), isPending: false }),
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

// A filled button is the page's one primary action; everything else is a
// ghost, a link or a quiet control. The filled treatment has no accessible
// name of its own, so the count goes through the class the button component
// gives it — the alternative, a marker attribute, would put test scaffolding
// in the product.
function primaryCount(html: string) {
  return html.split("bg-primary text-primary-foreground").length - 1;
}

const CHECKED_AT = NOW.toISOString();

// The check history each state implies: a state that has never been checked,
// or whose code died before one landed, carries none.
const LAST_CHECK: Record<ClaimViewState, ClaimView["lastCheck"]> = {
  setup_required: null,
  expired: null,
  superseded: null,
  verified: null,
  record_not_found: { result: "record_not_found", checkedAt: CHECKED_AT },
  temporary_dns_error: { result: "temporary_dns_error", checkedAt: CHECKED_AT },
  held_by_another: { result: "held_by_another", checkedAt: CHECKED_AT },
  value_mismatch: {
    result: "value_mismatch",
    observedValues: ["wrong"],
    checkedAt: CHECKED_AT,
  },
};

function detailFor(state: ClaimViewState) {
  const everVerified = state === "verified" || state === "superseded";
  useClaimMock.mockReturnValue({
    data: claimView({
      state,
      lastCheck: LAST_CHECK[state],
      verifiedAt: everVerified ? CHECKED_AT : null,
      supersededAt: state === "superseded" ? CHECKED_AT : null,
    }),
  });
  return render();
}

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
    expect(html).not.toContain("Get a new code");
    expect(html).toContain("Delete domain control");
    expect(html).toContain("You can remove the");
  });
});

describe("claim detail announcements", () => {
  it("renders a polite live region for check outcomes", () => {
    useClaimMock.mockReturnValue({ data: claimView() });
    expect(render()).toMatch(/<p[^>]*role="status"[^>]*aria-live="polite"/);
  });
});

describe("claim detail held by another account", () => {
  // The proof already matched, so there is nothing left to check: the claim is
  // asked to decide instead. Nothing has moved and nobody has been told yet,
  // and leaving it alone is an answer, so it is offered — quietly.
  it("offers Take over instead of another check, and a way to leave it", () => {
    const html = detailFor("held_by_another");
    expect(html).toContain("Take over");
    expect(html).toContain("Leave it");
    expect(html).not.toContain("Check again");
    expect(html).not.toContain("Verify domain");
    expect(html).toContain("another account holds example.com");
  });
});

// The whole point of the page: at any moment there is one thing to press, and
// it is the thing that moves the domain towards verification.
describe("claim detail: one pending action", () => {
  it.each([
    ["setup_required", "Verify domain"],
    ["record_not_found", "Check again"],
    ["value_mismatch", "Check again"],
    ["temporary_dns_error", "Check again"],
    ["held_by_another", "Take over"],
    ["expired", "Get a new code"],
    ["superseded", "Get a new code"],
  ] as const)("a %s domain is asked to %s", (state, label) => {
    const html = detailFor(state);
    expect(primaryCount(html)).toBe(1);
    expect(html).toContain(label);
  });

  it("asks nothing of a verified domain", () => {
    expect(primaryCount(detailFor("verified"))).toBe(0);
  });

  // An escape hatch while the code still works, the only way out once it
  // doesn't. Never both, and never competing with the check.
  it("keeps a new code quiet while the current one is alive", () => {
    const html = detailFor("record_not_found");
    expect(html).toContain("Get a new code");
    expect(primaryCount(html)).toBe(1);
    expect(html).toContain("Check again");
  });
});

describe("claim detail progress cue", () => {
  it.each([
    ["setup_required", "Add record"],
    ["record_not_found", "Add record"],
    ["value_mismatch", "Check"],
    ["held_by_another", "Check"],
    ["verified", "Verified"],
    ["expired", "Get a new code"],
    ["superseded", "Get a new code"],
  ] as const)("puts a %s domain at %s", (state, step) => {
    const html = detailFor(state);
    const current = html.match(/<li[^>]*aria-current="step"[^>]*>(.*?)<\/li>/);
    expect(current).not.toBeNull();
    expect(current![1]).toContain(step);
    expect(html.split('aria-current="step"')).toHaveLength(2);
  });

  it("walks the three steps in order, as a list", () => {
    const html = detailFor("setup_required");
    expect(html).toMatch(
      /<ol[^>]*>[\s\S]*Add record[\s\S]*Check[\s\S]*Verified[\s\S]*<\/ol>/,
    );
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

// What the list promised is what the page asks for, word for word: the panel
// says what happened, then repeats the list's own next step before explaining
// anything.
describe("claim detail outcome panels", () => {
  it.each([
    "record_not_found",
    "value_mismatch",
    "temporary_dns_error",
    "held_by_another",
    "expired",
    "superseded",
  ] as const)("opens the %s panel with the list's next step", (state) => {
    expect(detailFor(state)).toContain(`${nextStep(state)}.</p>`);
  });
});
