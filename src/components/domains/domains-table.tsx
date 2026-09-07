"use client";

import Link from "next/link";
import { toast } from "sonner";
import { DeleteDomainDialog } from "@/components/domains/delete-domain-dialog";
import { StatusBadge } from "@/components/domains/status-badge";
import { TablePagination } from "@/components/domains/table-pagination";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { PAGE_SIZES, type PageSize } from "@/lib/pagination";
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

export function DomainsTable({ page }: { page: ClaimPage }) {
  const claims = page.items;
  const pageSize = page.pageSize as PageSize;
  const pageCount = Math.max(1, Math.ceil(page.total / pageSize));
  // The bar carries the size control, so it stays while a smaller size would
  // still paginate — otherwise 80 rows at size 120 could never go back to 40.
  const showPagination = page.total > PAGE_SIZES[0];

  return (
    <div className="overflow-hidden rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
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
            <TableRow key={claim.id}>
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

      {showPagination && (
        <TablePagination
          page={page.page}
          pageSize={pageSize}
          pageCount={pageCount}
          total={page.total}
        />
      )}
    </div>
  );
}
