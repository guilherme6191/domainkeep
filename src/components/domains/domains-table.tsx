"use client";

import Link from "next/link";
import { toast } from "sonner";
import { DeleteDomainDialog } from "@/components/domains/delete-domain-dialog";
import { StatusBadge } from "@/components/domains/status-badge";
import { TablePagination } from "@/components/domains/table-pagination";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { lastCheckedAt } from "@/lib/claim-state";
import { formatDateTime, formatRelative } from "@/lib/format";
import { type PageSize } from "@/lib/pagination";
import { cn } from "@/lib/utils";
import type { ClaimPage } from "@/lib/types";

function LastCheckedCell({ iso }: { iso: string | null }) {
  if (!iso) {
    return (
      <TableCell className="text-muted-foreground" aria-label="Never checked">
        —
      </TableCell>
    );
  }
  return (
    <TableCell className="text-muted-foreground" title={formatDateTime(iso)}>
      {formatRelative(iso)}
    </TableCell>
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
            <TableHead>Domain</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Last checked</TableHead>
            <TableHead>Added</TableHead>
            <TableHead className="w-40 text-right">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {claims.map((claim) => (
            <TableRow
              key={claim.id}
              data-state={selected.has(claim.id) ? "selected" : undefined}
            >
              <TableCell>
                <Checkbox
                  checked={selected.has(claim.id)}
                  onCheckedChange={(checked) => toggleOne(claim.id, checked)}
                  aria-label={`Select ${claim.domain}`}
                />
              </TableCell>
              <TableCell className="font-mono">
                <Link
                  href={`/domains/${claim.id}`}
                  className="underline-offset-4 hover:underline"
                >
                  {claim.domain}
                </Link>
              </TableCell>
              <TableCell>
                <StatusBadge state={claim.state} />
              </TableCell>
              <LastCheckedCell iso={lastCheckedAt(claim)} />
              <TableCell
                className="text-muted-foreground"
                title={formatDateTime(claim.createdAt)}
              >
                {formatRelative(claim.createdAt)}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Link
                    href={`/domains/${claim.id}`}
                    className={cn(
                      buttonVariants({ variant: "ghost", size: "sm" }),
                      "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Manage
                  </Link>

                  <DeleteDomainDialog
                    claimId={claim.id}
                    domain={claim.domain}
                    isVerified={claim.state === "verified"}
                    onDeleted={() => toast.success(`${claim.domain} deleted.`)}
                    trigger={
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-foreground"
                      >
                        Delete
                      </Button>
                    }
                  />
                </div>
              </TableCell>
            </TableRow>
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
