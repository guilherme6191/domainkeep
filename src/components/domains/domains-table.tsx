"use client";

import { useState } from "react";
import { Loader2, MoreHorizontalIcon } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { DeleteDomainDialog } from "@/components/domains/delete-domain-dialog";
import { StatusBadge } from "@/components/domains/status-badge";
import { TablePagination } from "@/components/domains/table-pagination";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useVerifyClaim } from "@/hooks/use-claims";
import { toastApiError } from "@/lib/api/toast-error";
import { canCheck, lastCheckedAt, nextStep } from "@/lib/claim-state";
import { formatDateTime, formatRelative } from "@/lib/format";
import { type PageSize } from "@/lib/pagination";
import { cn } from "@/lib/utils";
import type { ClaimPage, ClaimView, ClaimViewState } from "@/lib/types";

// Column headings sit a step below the data in size and colour, so the eye
// lands on the rows, not the labels.
const HEAD = "text-muted-foreground text-xs font-medium";

// On a phone the table keeps the name, the status and the menu; the next step
// rides under the badge there and claims a column of its own once there is
// room, and the two timestamps return as the viewport widens, most recent
// first. Nothing scrolls sideways.
const LAST_CHECKED = "hidden sm:table-cell";
const ADDED = "hidden md:table-cell";
const NEXT_STEP = "hidden md:table-cell";

function LastCheckedCell({ iso }: { iso: string | null }) {
  if (!iso) {
    return (
      <TableCell
        className={cn(LAST_CHECKED, "text-muted-foreground/60")}
        aria-label="Never checked"
      >
        Never
      </TableCell>
    );
  }
  return (
    <TableCell className={LAST_CHECKED} title={formatDateTime(iso)}>
      {formatRelative(iso)}
    </TableCell>
  );
}

/**
 * The state and, below the medium breakpoint, what to do about it. A phone has
 * no room for a column of its own, and guidance that scrolls off the side is
 * guidance the user never reads.
 */
function StatusCell({ state }: { state: ClaimViewState }) {
  const step = nextStep(state);

  return (
    <TableCell className="align-top">
      <StatusBadge state={state} />
      {step ? (
        <div className="text-muted-foreground mt-1 text-xs whitespace-normal md:hidden">
          {step}
        </div>
      ) : null}
    </TableCell>
  );
}

/**
 * Opening the domain is the row's primary action and lives on the name; the
 * menu holds the rest, with delete set apart from navigation. The check is in
 * both places: a quiet button that surfaces when the row is under the pointer
 * or holds keyboard focus, and a menu item, which is the only one of the two a
 * phone can reach.
 *
 * A menu item closes the menu on click, so the dialog is opened by state here
 * rather than by a trigger inside the item.
 */
function RowActions({
  claim,
  checking,
  onCheck,
}: {
  claim: ClaimView;
  checking: boolean;
  onCheck: () => void;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const checkable = canCheck(claim.state);

  return (
    <div className="flex items-center justify-end gap-0.5">
      {checkable ? (
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Check ${claim.domain}`}
          onClick={onCheck}
          className={cn(
            "text-muted-foreground hover:text-foreground hidden transition-opacity md:inline-flex",
            // Out of sight until the row is wanted, but never out of reach:
            // keyboard focus brings it back, and so does a check in flight.
            "opacity-0 focus-visible:opacity-100 group-hover/row:opacity-100 group-focus-within/row:opacity-100",
            checking && "opacity-100",
          )}
        >
          {checking ? <Loader2 className="animate-spin" /> : "Check"}
        </Button>
      ) : null}

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-foreground"
              aria-label={`Actions for ${claim.domain}`}
            />
          }
        >
          <MoreHorizontalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {checkable ? (
            <DropdownMenuItem onClick={onCheck}>Check</DropdownMenuItem>
          ) : null}
          <DropdownMenuItem render={<Link href={`/domains/${claim.id}`} />}>
            Manage
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setDeleteOpen(true)}
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DeleteDomainDialog
        claimId={claim.id}
        domain={claim.domain}
        isVerified={claim.state === "verified"}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={() => toast.success(`${claim.domain} deleted.`)}
      />
    </div>
  );
}

/**
 * The check runs where the user asked for it. The mutation replaces this
 * claim in every cached page with the server's answer, so the badge and the
 * next step settle in place; only a request that never reached an answer is
 * worth a toast. A domain that turns out to be held elsewhere changes its row
 * and nothing more: a transfer should never be one click away from a list
 * someone is scanning.
 */
function DomainRow({
  claim,
  selected,
  onSelectedChange,
}: {
  claim: ClaimView;
  selected: boolean;
  onSelectedChange: (checked: boolean) => void;
}) {
  const verify = useVerifyClaim(claim.id);

  // Neither control is disabled while the check runs: a disabled button drops
  // the keyboard focus that is holding it on screen. A second press during the
  // round trip is simply ignored.
  function runCheck() {
    if (verify.isPending) return;
    verify.mutate(undefined, { onError: (error) => toastApiError(error) });
  }

  return (
    <TableRow
      data-state={selected ? "selected" : undefined}
      aria-busy={verify.isPending || undefined}
      className="group/row"
    >
      <TableCell>
        <Checkbox
          checked={selected}
          onCheckedChange={onSelectedChange}
          aria-label={`Select ${claim.domain}`}
        />
      </TableCell>
      <TableCell className="w-full max-w-0 font-mono text-[13px]">
        {/* Takes whatever width the other columns leave; a long name
            truncates and keeps its full text on hover. */}
        <Link
          href={`/domains/${claim.id}`}
          title={claim.domain}
          className="focus-visible:ring-ring/50 block truncate rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-3"
        >
          {claim.domain}
        </Link>
      </TableCell>
      <StatusCell state={claim.state} />
      <TableCell className={cn(NEXT_STEP, "text-muted-foreground")}>
        {nextStep(claim.state)}
      </TableCell>
      <LastCheckedCell iso={lastCheckedAt(claim)} />
      <TableCell
        className={cn(ADDED, "text-muted-foreground")}
        title={formatDateTime(claim.createdAt)}
      >
        {formatRelative(claim.createdAt)}
      </TableCell>
      <TableCell className="text-right">
        <RowActions
          claim={claim}
          checking={verify.isPending}
          onCheck={runCheck}
        />
      </TableCell>
    </TableRow>
  );
}

export function DomainsTable({
  page,
  selected,
  onSelectedChange,
}: {
  page: ClaimPage;
  selected: ReadonlySet<string>;
  onSelectedChange: (selected: ReadonlySet<string>) => void;
}) {
  const claims = page.items;
  const pageSize = page.pageSize as PageSize;
  const pageCount = Math.max(1, Math.ceil(page.total / pageSize));
  const selectedHere = claims.filter((claim) => selected.has(claim.id)).length;

  // Selection is scoped to the page, so "all" means all of the rows on screen.
  function toggleAll(checked: boolean) {
    onSelectedChange(new Set(checked ? claims.map((claim) => claim.id) : []));
  }

  function toggleOne(id: string, checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(id);
    else next.delete(id);
    onSelectedChange(next);
  }

  return (
    <div className="overflow-hidden rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">
              <Checkbox
                checked={selectedHere > 0 && selectedHere === claims.length}
                indeterminate={selectedHere > 0 && selectedHere < claims.length}
                onCheckedChange={toggleAll}
                aria-label="Select all on this page"
              />
            </TableHead>
            <TableHead className={cn(HEAD, "w-full")}>Domain</TableHead>
            <TableHead className={HEAD}>Status</TableHead>
            <TableHead className={cn(HEAD, NEXT_STEP)}>Next step</TableHead>
            <TableHead className={cn(HEAD, LAST_CHECKED)}>Last checked</TableHead>
            <TableHead className={cn(HEAD, ADDED)}>Added</TableHead>
            <TableHead className="w-12 text-right">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {claims.map((claim) => (
            <DomainRow
              key={claim.id}
              claim={claim}
              selected={selected.has(claim.id)}
              onSelectedChange={(checked) => toggleOne(claim.id, checked)}
            />
          ))}
        </TableBody>
      </Table>

      {/* Always shown: the count and the size control are useful on one page too. */}
      <TablePagination
        page={page.page}
        pageSize={pageSize}
        pageCount={pageCount}
        total={page.total}
      />
    </div>
  );
}
