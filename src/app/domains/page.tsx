"use client";

import { AddDomainDialog } from "@/components/domains/add-domain-dialog";
import { AddDomainForm } from "@/components/domains/add-domain-form";
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

export default function DomainsPage() {
  const { data: claims, isPending, isError } = useClaims();

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
        ) : claims.length === 0 ? (
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
              <AddDomainDialog />
            </div>
            <DomainsTable claims={claims} />
          </div>
        )}
      </main>
    </>
  );
}
