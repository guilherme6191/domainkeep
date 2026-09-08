"use client";

import { useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ClaimStatePanel,
  ExpectedVsFoundCard,
} from "@/components/domains/claim-state-panel";
import { CopyButton } from "@/components/domains/copy-button";
import { DeleteDomainDialog } from "@/components/domains/delete-domain-dialog";
import { DnsRecordCard } from "@/components/domains/dns-record-card";
import { EditDomainDialog } from "@/components/domains/edit-domain-dialog";
import { StatusBadge } from "@/components/domains/status-badge";
import { TakeoverDialog } from "@/components/domains/takeover-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useClaim, useReplaceToken, useVerifyClaim } from "@/hooks/use-claims";
import { ApiRequestError } from "@/lib/api/client";
import { toastApiError } from "@/lib/api/toast-error";
import { lastCheckedAt } from "@/lib/claim-state";
import { formatDateTime, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

// Relative time, with the exact instant on hover.
function Meta({ label, iso }: { label: string; iso: string }) {
  return (
    <div className="space-y-1">
      <div className="text-muted-foreground text-sm">{label}</div>
      <div className="text-sm" title={formatDateTime(iso)}>
        {formatRelative(iso)}
      </div>
    </div>
  );
}

export function ClaimDetail({ claimId }: { claimId: string }) {
  const router = useRouter();
  const { data: claim, isPending, isError, error, refetch, isFetching } =
    useClaim(claimId);
  const verify = useVerifyClaim(claimId);
  const replaceToken = useReplaceToken(claimId);
  // Opened by the check that found the holder, and by the held panel's button
  // on any later visit. The transfer itself is confirmed inside the dialog.
  const [takeoverOpen, setTakeoverOpen] = useState(false);

  if (isPending) {
    return (
      <div className="space-y-5">
        {/* Same row as the loaded header: back link left, delete right. */}
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-28" />
        </div>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (isError || !claim) {
    const notFound =
      error instanceof ApiRequestError && error.code === "not_found";
    return (
      <div className="space-y-4">
        <p className="text-sm" role="alert">
          {notFound
            ? "We couldn't find that domain."
            : "We couldn't load this domain. Try again."}
        </p>
        {!notFound && error instanceof ApiRequestError && error.requestId ? (
          <p className="text-muted-foreground text-sm">
            Reference: {error.requestId}
          </p>
        ) : null}
        {!notFound ? (
          <Button size="sm" onClick={() => void refetch()} disabled={isFetching}>
            {isFetching ? "Retrying…" : "Retry"}
          </Button>
        ) : null}
        <Link
          href="/domains"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Back to domains
        </Link>
      </div>
    );
  }

  const isVerified = claim.state === "verified";
  // Read from the server's state, never from `tokenExpiresAt`: a verified claim
  // has no challenge, so its token's age means nothing here.
  const needsNewCode = claim.state === "expired" || claim.state === "superseded";
  const isHeld = claim.state === "held_by_another";
  const checkedBefore = claim.lastCheck !== null;
  const verifyLabel = checkedBefore ? "Check again" : "Verify domain";
  const lastChecked = lastCheckedAt(claim);
  const showComparison = claim.state === "value_mismatch";

  function runVerify() {
    verify.mutate(undefined, {
      onSuccess: (updated) => {
        if (updated.state === "verified") {
          toast.success(`You control ${updated.domain}.`);
        }
        // The proof matched but the domain is someone else's. Ask now, while
        // the user is watching their own click.
        if (updated.state === "held_by_another") {
          setTakeoverOpen(true);
        }
      },
      onError: (error) => toastApiError(error),
    });
  }

  const deleteDomain = (
    <DeleteDomainDialog
      claimId={claim.id}
      domain={claim.domain}
      isVerified={isVerified}
      onDeleted={() => {
        toast.success(`${claim.domain} deleted.`);
        router.push("/domains");
      }}
      trigger={
        <Button variant="outline" size="sm">
          Delete domain
        </Button>
      }
    />
  );

  // The only way back for a claim whose code is dead, and an escape hatch
  // beside every other pending action.
  const newCode = (
    <Button
      variant={needsNewCode ? "default" : "ghost"}
      size="sm"
      title={
        needsNewCode
          ? undefined
          : "Invalidates the current code. You'll need to update the TXT record."
      }
      onClick={() => replaceToken.mutate(undefined, { onError: (error) => toastApiError(error) })}
      disabled={replaceToken.isPending}
    >
      {replaceToken.isPending ? "Generating…" : "Generate a new code"}
    </Button>
  );

  const verifyButton = (
    <Button size="sm" onClick={runVerify} disabled={verify.isPending}>
      {/* Both labels share one grid cell so the button holds a single width
          across the click. The footer wraps, and a wider pending label
          pushed the buttons onto a second line. `invisible` keeps the
          spare label out of the accessibility tree too. */}
      <span className="grid place-items-center">
        <span
          className={cn(
            "col-start-1 row-start-1",
            verify.isPending && "invisible",
          )}
        >
          {verifyLabel}
        </span>
        <span
          className={cn(
            "col-start-1 row-start-1 flex items-center gap-1",
            !verify.isPending && "invisible",
          )}
        >
          <Loader2 className="size-3.5 animate-spin" />
          Checking…
        </span>
      </span>
    </Button>
  );

  // Verified has nothing left to do here; its delete control is in the header.
  // A dead code leaves only its replacement. Otherwise one primary action sits
  // beside it: a claim that has already proved control is asked to decide,
  // every other one to check.
  const actions = isVerified ? null : (
    <>
      {newCode}
      {needsNewCode ? null : isHeld ? (
        <Button size="sm" onClick={() => setTakeoverOpen(true)}>
          Take over
        </Button>
      ) : (
        verifyButton
      )}
    </>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/domains"
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "-ml-2 h-8",
          )}
        >
          <ArrowLeft className="size-3.5" />
          Domains
        </Link>
        {deleteDomain}
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-x-8 gap-y-5">
          <div className="flex flex-col items-start gap-2">
            <StatusBadge state={claim.state} />
            <span className="flex items-center gap-1">
              <span className="font-mono">{claim.domain}</span>
              <CopyButton
                value={claim.domain}
                label="domain"
                className="size-6 shrink-0"
              />
              {claim.verifiedAt !== null ? null : (
                <EditDomainDialog claimId={claim.id} domain={claim.domain} />
              )}
            </span>
          </div>

          <div className="flex flex-wrap gap-x-8 gap-y-4">
            <Meta label="Added" iso={claim.createdAt} />
            {lastChecked ? (
              <Meta label="Last checked" iso={lastChecked} />
            ) : null}
            {isVerified ? null : (
              <Meta
                label={
                  claim.state === "superseded"
                    ? "Code invalidated"
                    : needsNewCode
                      ? "Code expired"
                      : "Code expires"
                }
                iso={claim.tokenExpiresAt}
              />
            )}
          </div>
        </CardContent>
      </Card>

      <ClaimStatePanel claim={claim} />

      {/* Verification is point-in-time, so a verified claim has no record to
          show: the proof is done and the TXT value has no ongoing job. */}
      {isVerified ? null : showComparison ? (
        <ExpectedVsFoundCard claim={claim} footer={actions} />
      ) : (
        <DnsRecordCard
          value={claim.recordValue}
          hostname={claim.verificationHostname}
          title={needsNewCode ? "Previous record" : "Add this DNS record"}
          inactive={needsNewCode}
          footer={actions}
        />
      )}

      <TakeoverDialog
        claimId={claim.id}
        domain={claim.domain}
        open={takeoverOpen}
        onOpenChange={setTakeoverOpen}
      />
    </div>
  );
}
