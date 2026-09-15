"use client";

import { useState } from "react";
import { ArrowLeft, Clock, Loader2 } from "lucide-react";
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
import type { ClaimView } from "@/lib/types";

const DAY_MS = 24 * 60 * 60 * 1000;

// Relative time, with the exact instant on hover.
function Meta({
  label,
  iso,
  className,
  icon,
}: {
  label: string;
  iso: string;
  className?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      {icon}
      <dt>{label}</dt>
      <dd className="text-foreground" title={formatDateTime(iso)}>
        {formatRelative(iso)}
      </dd>
    </div>
  );
}

/**
 * The one piece of metadata that is a deadline rather than history. It stays
 * quiet for most of the week and turns amber inside the last day, when the
 * user should act on it before the record they published stops counting.
 */
function CodeExpiry({ claim }: { claim: ClaimView }) {
  if (claim.state === "verified") return null;

  const dead = claim.state === "expired" || claim.state === "superseded";
  const remainingMs = new Date(claim.tokenExpiresAt).getTime() - Date.now();
  const urgent = dead || remainingMs < DAY_MS;

  return (
    <Meta
      label={
        claim.state === "superseded"
          ? "Code invalidated"
          : dead
            ? "Code expired"
            : "Code expires"
      }
      iso={claim.tokenExpiresAt}
      icon={<Clock className="size-3.5" aria-hidden />}
      className={cn(urgent && "text-amber-300 [&_dd]:text-amber-300")}
    />
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
        <Skeleton className="h-32 w-full" />
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

  // Quiet in the top bar: deletion is rare, and it should never outweigh the
  // check. It turns red only under the pointer.
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
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-destructive -mr-2 h-8"
        >
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
    <Button onClick={runVerify} disabled={verify.isPending}>
      {/* Both labels share one grid cell so the button holds a single width
          across the click. `invisible` keeps the spare label out of the
          accessibility tree too. */}
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
            "col-start-1 row-start-1 flex items-center gap-1.5",
            !verify.isPending && "invisible",
          )}
        >
          <Loader2 className="size-3.5 animate-spin" />
          Checking…
        </span>
      </span>
    </Button>
  );

  // The primary action sits in the header beside the status it acts on, so
  // the page reads status, then what to do about it, then how. Verified has
  // nothing left to do. A dead code leaves only its replacement. Otherwise
  // one primary action stands beside the escape hatch: a claim that has
  // already proved control is asked to decide, every other one to check.
  const actions = isVerified ? null : (
    <>
      {newCode}
      {needsNewCode ? null : isHeld ? (
        <Button onClick={() => setTakeoverOpen(true)}>Take over</Button>
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
            "text-muted-foreground hover:text-foreground -ml-2 h-8",
          )}
        >
          <ArrowLeft className="size-3.5" />
          Domains
        </Link>
        {deleteDomain}
      </div>

      <Card>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
            <div className="min-w-0 space-y-2">
              <StatusBadge state={claim.state} />
              <h1 className="flex min-w-0 items-center gap-1 font-mono text-lg font-semibold tracking-tight">
                <span className="truncate">{claim.domain}</span>
                <CopyButton
                  value={claim.domain}
                  label="domain"
                  className="size-6 shrink-0"
                />
                {claim.verifiedAt !== null ? null : (
                  <EditDomainDialog claimId={claim.id} domain={claim.domain} />
                )}
              </h1>
            </div>

            {actions ? (
              <div className="flex flex-wrap items-center gap-2">{actions}</div>
            ) : null}
          </div>

          <dl className="text-muted-foreground flex flex-wrap gap-x-6 gap-y-2 text-[13px]">
            <Meta label="Added" iso={claim.createdAt} />
            {lastChecked ? (
              <Meta label="Last checked" iso={lastChecked} />
            ) : null}
            <CodeExpiry claim={claim} />
          </dl>
        </CardContent>
      </Card>

      <ClaimStatePanel claim={claim} />

      {/* Verification is point-in-time, so a verified claim has no record to
          show: the proof is done and the TXT value has no ongoing job. */}
      {isVerified ? null : showComparison ? (
        <ExpectedVsFoundCard claim={claim} />
      ) : (
        <DnsRecordCard
          value={claim.recordValue}
          hostname={claim.verificationHostname}
          title={needsNewCode ? "Previous record" : "Add this DNS record"}
          inactive={needsNewCode}
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
