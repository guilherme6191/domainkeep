import { createElement, type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "@/lib/api/client";

const { toastError, deleteMutation } = vi.hoisted(() => ({
  toastError: vi.fn(),
  deleteMutation: vi.fn<(
    id: string,
    options: { onError: (error: Error) => void },
  ) => void>(),
}));

let copyClick: (() => Promise<void>) | undefined;
let deleteClick: (() => void) | undefined;

vi.mock("sonner", () => ({ toast: { error: toastError } }));
vi.mock("@/hooks/use-claims", () => ({
  useDeleteClaim: () => ({ mutate: deleteMutation, isPending: false }),
}));
vi.mock("@/components/ui/button", () => ({
  Button: (props: PropsWithChildren<{ onClick: () => Promise<void> }>) => {
    copyClick = props.onClick;
    return createElement("button", null, props.children);
  },
}));
vi.mock("@/components/ui/alert-dialog", () => {
  const Container = ({ children }: PropsWithChildren) =>
    createElement("div", null, children);
  return {
    AlertDialog: Container,
    AlertDialogContent: Container,
    AlertDialogHeader: Container,
    AlertDialogTitle: Container,
    AlertDialogDescription: Container,
    AlertDialogFooter: Container,
    AlertDialogCancel: Container,
    AlertDialogTrigger: Container,
    AlertDialogAction: (props: PropsWithChildren<{ onClick: () => void }>) => {
      deleteClick = props.onClick;
      return createElement("button", null, props.children);
    },
  };
});

const { CopyButton } = await import("@/components/domains/copy-button");
const { DnsRecordCard } = await import("@/components/domains/dns-record-card");
const { DeleteDomainDialog } = await import("@/components/domains/delete-domain-dialog");
const VALUE = `resend-verify=${"a".repeat(64)}`;

beforeEach(() => {
  vi.clearAllMocks();
  copyClick = undefined;
  deleteClick = undefined;
});
afterEach(() => vi.unstubAllGlobals());

describe("copy recovery", () => {
  it("shows a short form of the value and keeps the full one on the copy button", () => {
    const html = renderToStaticMarkup(createElement(DnsRecordCard, {
      value: VALUE,
      hostname: "example.com",
    }));
    expect(html).toContain(`>resend-verify=${"a".repeat(10)}<span`);
    expect(html).toContain(`>[…]</span>${"a".repeat(10)}</span>`);
    expect(html).toContain(`title="${VALUE}"`);
  });

  // The manual-selection popover that a rejected clipboard opens is component
  // state, which this environment cannot observe: the suite renders to static
  // markup and there is no DOM. Covered by hand instead.
  it("hands the clipboard the whole value, never the truncated one", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    renderToStaticMarkup(createElement(CopyButton, { value: VALUE, label: "value" }));
    expect(copyClick).toBeDefined();
    await copyClick!();
    expect(writeText).toHaveBeenCalledWith(VALUE);
    expect(toastError).not.toHaveBeenCalled();
  });

  it("shows an error toast when clipboard access fails", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("Denied")) },
    });
    renderToStaticMarkup(createElement(CopyButton, { value: VALUE, label: "value" }));
    expect(copyClick).toBeDefined();
    await copyClick!();
    expect(toastError).toHaveBeenCalledWith(
      "Couldn't copy. Select the value to copy it manually.",
    );
  });
});

describe("delete recovery", () => {
  it.each([
    [new ApiRequestError("internal_error", "Server error", "request-id"), "Server error", "Reference: request-id"],
    [new TypeError("Failed to fetch"), "Couldn't delete the domain. Please try again.", undefined],
  ])("shows an actionable toast for %s", (error, message, description) => {
    renderToStaticMarkup(createElement(DeleteDomainDialog, {
      claimId: "claim-id",
      domain: "example.com",
      isVerified: false,
      trigger: createElement("button", null, "Delete"),
    }));
    expect(deleteClick).toBeDefined();
    deleteClick!();
    const [id, options] = deleteMutation.mock.calls[0];
    expect(id).toBe("claim-id");
    options.onError(error);
    expect(toastError).toHaveBeenCalledWith(message, { description });
  });
});
