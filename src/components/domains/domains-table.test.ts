import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { claimView } from "@/test/claim-fixtures";
import type { ClaimPage, ClaimViewState } from "@/lib/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const { verifying } = vi.hoisted(() => ({ verifying: { value: false } }));

vi.mock("@/hooks/use-claims", () => ({
  useVerifyClaim: () => ({ mutate: vi.fn(), isPending: verifying.value }),
}));
vi.mock("@/components/domains/delete-domain-dialog", () => ({
  DeleteDomainDialog: () => "Delete domain control",
}));

const { DomainsTable } = await import("@/components/domains/domains-table");

function rowFor(state: ClaimViewState) {
  const page: ClaimPage = {
    items: [claimView({ state })],
    page: 1,
    pageSize: 20,
    total: 1,
  };
  return renderToStaticMarkup(
    createElement(DomainsTable, {
      page,
      selected: new Set<string>(),
      onSelectedChange: () => {},
    }),
  );
}

// Four states used to share one "Needs attention" badge, so a list of four
// rows said the same thing four times. Each one now names itself.
describe("the list names every state", () => {
  it.each([
    ["setup_required", "Unchecked"],
    ["record_not_found", "Record not found"],
    ["value_mismatch", "Wrong value"],
    ["temporary_dns_error", "DNS didn’t answer"],
    ["held_by_another", "Held elsewhere"],
    ["expired", "Code expired"],
    ["superseded", "Moved away"],
    ["verified", "Verified"],
  ] as const)("labels %s as %s", (state, label) => {
    const html = rowFor(state);
    expect(html).toContain(label);
    expect(html).not.toContain("Needs attention");
  });
});

describe("the list shows what to do next", () => {
  it.each([
    ["setup_required", "Add the record, then verify"],
    ["record_not_found", "Wait, then check again"],
    ["value_mismatch", "Fix the value, then check again"],
    ["temporary_dns_error", "Check again"],
    ["held_by_another", "Take over, or leave it"],
    ["expired", "Get a new code"],
    ["superseded", "Get a new code to reclaim"],
  ] as const)("asks a %s domain to %s", (state, step) => {
    expect(rowFor(state)).toContain(step);
  });

  // Finished work should read as finished.
  it("asks nothing of a verified domain", () => {
    const html = rowFor("verified");
    expect(html).not.toContain("check again");
    expect(html).not.toContain("Get a new code");
  });
});

// "Has it propagated yet" is the commonest question in the list, and it should
// not cost a page visit. Where another lookup cannot change the answer, the
// list offers nothing rather than a dead action.
describe("checking from the list", () => {
  it.each([
    ["setup_required", true],
    ["record_not_found", true],
    ["value_mismatch", true],
    ["temporary_dns_error", true],
    ["held_by_another", false],
    ["expired", false],
    ["superseded", false],
    ["verified", false],
  ] as const)("offers a check on a %s domain: %s", (state, offered) => {
    expect(rowFor(state).includes('aria-label="Check example.com"')).toBe(
      offered,
    );
  });
});

describe("a check in flight", () => {
  // The row says it is working, wherever the check was started from: the
  // spinner replaces the control even at the width where the menu item is
  // the only way to reach it.
  it("marks the row busy and shows the check running", () => {
    verifying.value = true;
    try {
      const html = rowFor("record_not_found");
      expect(html).toContain('aria-busy="true"');
      expect(html).toContain("animate-spin");
      expect(html).not.toContain(">Check</button>");
    } finally {
      verifying.value = false;
    }
  });

  it("leaves a settled row unmarked", () => {
    expect(rowFor("record_not_found")).not.toContain("aria-busy");
  });
});
