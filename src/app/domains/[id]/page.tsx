"use client";

import { use } from "react";
import { AppHeader } from "@/components/app-header";
import { ClaimDetail } from "@/components/domains/claim-detail";

export default function DomainDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
        <ClaimDetail claimId={id} />
      </main>
    </>
  );
}
