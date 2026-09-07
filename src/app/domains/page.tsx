"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { AddDomainDialog } from "@/components/domains/add-domain-dialog";
import { AddDomainForm } from "@/components/domains/add-domain-form";
import { DeleteDomainsDialog } from "@/components/domains/delete-domains-dialog";
import { DomainsActionsMenu } from "@/components/domains/domains-actions-menu";
import { DomainsTable } from "@/components/domains/domains-table";
import { AppHeader } from "@/components/app-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useClaims } from "@/hooks/use-claims";
import { pageHref, parsePage, parsePageSize } from "@/lib/pagination";

export default function DomainsPage() {
  // No Suspense boundary: this route is dynamic because its layout awaits
  // auth.protect(), and only statically prerendered pages need one.
  const searchParams = useSearchParams();
  const router = useRouter();
  const page = parsePage(searchParams.get("page"));
  const pageSize = parsePageSize(searchParams.get("pageSize"));

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data, isPending, isError, isPlaceholderData } = useClaims(page, pageSize);
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

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        {isPending ? (
          <div className="space-y-4">
            <Skeleton className="h-9 w-40" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : isError ? (
          <p className="text-sm">
            We couldn&rsquo;t load your domains. Please refresh and try again.
          </p>
        ) : data.total === 0 ? (
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
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-semibold tracking-tight">Domains</h1>
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
        )}
      </main>
    </>
  );
}
