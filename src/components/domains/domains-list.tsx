"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AddDomainDialog } from "@/components/domains/add-domain-dialog";
import { AddDomainForm } from "@/components/domains/add-domain-form";
import { DeleteDomainsDialog } from "@/components/domains/delete-domains-dialog";
import { DomainsActionsMenu } from "@/components/domains/domains-actions-menu";
import { DomainsTable } from "@/components/domains/domains-table";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useClaims } from "@/hooks/use-claims";
import { ApiRequestError } from "@/lib/api/client";
import { pageHref, type PageSize } from "@/lib/pagination";

/**
 * The page and size come from the server page, which read them from the URL
 * and prefetched the matching page, so the first render already has rows.
 */
export function DomainsList({
  page,
  pageSize,
}: {
  page: number;
  pageSize: PageSize;
}) {
  const router = useRouter();

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data, isPending, isError, error, refetch, isFetching, isPlaceholderData } =
    useClaims(page, pageSize);
  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  // Selection belongs to the rows on screen, so it is narrowed to them rather
  // than stored that way: a page change or a row deleted elsewhere drops out on
  // its own, with no state to keep in step.
  const selectedClaims = data?.items.filter((claim) => selected.has(claim.id)) ?? [];
  const selectedHere = new Set(selectedClaims.map((claim) => claim.id));

  // Deleting the last row of the last page leaves the URL past the end.
  useEffect(() => {
    if (data && !isPlaceholderData && page > pageCount) {
      router.replace(pageHref(pageCount, pageSize));
    }
  }, [data, isPlaceholderData, page, pageCount, pageSize, router]);

  // Same bones as the loaded page: the title block, the two controls, then
  // a table-shaped frame with a header band and a few rows, so nothing jumps
  // when the data lands.
  if (isPending) {
    return (
      <div className="space-y-6" aria-busy>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-4 w-80" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-28" />
            <Skeleton className="size-8" />
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border">
          <div className="border-b px-4 py-3">
            <Skeleton className="h-4 w-1/3" />
          </div>
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="flex items-center gap-6 border-b px-4 py-4 last:border-0">
              <Skeleton className="size-4" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-5 w-20 rounded-4xl" />
              <Skeleton className="ml-auto h-4 w-24" />
            </div>
          ))}
          <div className="flex items-center justify-between border-t px-4 py-3">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
      </div>
    );
  }

  // Same shape as the detail page's failure: a plain message, the request
  // reference when the API gave one, and a retry that keeps the page in place.
  if (isError) {
    return (
      <div className="space-y-4">
        <p className="text-sm" role="alert">
          We couldn&rsquo;t load your domains. Try again.
        </p>
        {error instanceof ApiRequestError && error.requestId ? (
          <p className="text-muted-foreground text-sm">
            Reference: {error.requestId}
          </p>
        ) : null}
        <Button size="sm" onClick={() => void refetch()} disabled={isFetching}>
          {isFetching ? "Retrying…" : "Retry"}
        </Button>
      </div>
    );
  }

  if (data.total === 0) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-10">
        <Card>
          <CardHeader>
            <CardTitle>Add a domain</CardTitle>
            <CardDescription>
              Verify that you control a domain by adding one DNS record.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AddDomainForm />
          </CardContent>
        </Card>
        <p className="text-muted-foreground px-1 text-[13px]">
          We&rsquo;ll only ask you to add one TXT record. Nothing about your
          website or existing email changes.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Domains</h1>
          <p className="text-muted-foreground text-sm">
            Each one is proven by a single TXT record, checked when you ask.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AddDomainDialog />
          <DomainsActionsMenu
            selectedCount={selectedHere.size}
            onDeleteSelected={() => setConfirmOpen(true)}
          />
        </div>
      </div>
      {/* Dimmed, not replaced: the previous page stays put while the next loads. */}
      <div className={isPlaceholderData ? "opacity-60 transition-opacity" : undefined}>
        <DomainsTable
          page={data}
          selected={selectedHere}
          onSelectedChange={setSelected}
        />
      </div>

      <DeleteDomainsDialog
        claims={selectedClaims}
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onDeleted={(deleted) => {
          setSelected(new Set());
          toast.success(
            `${deleted.length} ${deleted.length === 1 ? "domain" : "domains"} deleted.`,
          );
        }}
      />
    </div>
  );
}
