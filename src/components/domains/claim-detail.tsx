"use client";

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

/**
 * Shown for every pending claim, never only when the domain is held. Making it
 * conditional would answer "is this domain taken?" for anyone who typed it in,
 * which is the disclosure the whole flow is built to withhold until there is
 * proof.
 */
function TakeoverNote() {
  return (
    <p className="text-muted-foreground text-sm">
      Verifying takes the domain over if another account currently holds it.
      That&rsquo;s the intended path for a purchase or a migration between
      accounts — otherwise, check with whoever manages this domain first.
    </p>
  );
}

function PropagationNote({ buttonLabel }: { buttonLabel: string }) {
  return (
    <p className="text-muted-foreground text-sm">
      DNS changes can take a few minutes, occasionally hours, to propagate.
      Nothing is checked until you click {buttonLabel}, and your code stays
      valid between checks, so retrying is free.
    </p>
  );
}

export function ClaimDetail({ claimId }: { claimId: string }) {
  const router = useRouter();
  const { data: claim, isPending, isError, error, refetch, isFetching } =
    useClaim(claimId);
  const verify = useVerifyClaim(claimId);
  const replaceToken = useReplaceToken(claimId);

  if (isPending) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-8 w-56" />
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
  const challengeActive = new Date(claim.tokenExpiresAt) > new Date();
  const needsNewCode = claim.state === "expired" || !challengeActive;
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

  const actions = isVerified ? (
    deleteDomain
  ) : needsNewCode ? (
    <>
      <p className="text-muted-foreground mr-auto max-w-[26rem] text-sm">
        The previous value will stop working. You&rsquo;ll need to update the
        TXT record at your provider.
      </p>
      <Button
        size="sm"
        onClick={() => replaceToken.mutate(undefined, { onError: (error) => toastApiError(error) })}
        disabled={replaceToken.isPending}
      >
        {replaceToken.isPending ? "Generating…" : "Generate a new code"}
      </Button>
    </>
  ) : (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => replaceToken.mutate(undefined, { onError: (error) => toastApiError(error) })}
        disabled={replaceToken.isPending}
      >
        Generate a new code
      </Button>
      <Button size="sm" onClick={runVerify} disabled={verify.isPending}>
        {verify.isPending ? (
          <>
            <Loader2 className="size-3.5 animate-spin" />
            Checking DNS…
          </>
        ) : (
          verifyLabel
        )}
      </Button>
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
        {isVerified ? null : deleteDomain}
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-x-8 gap-y-5">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="font-mono">{claim.domain}</span>
              <CopyButton
                value={claim.domain}
                label="domain"
                className="size-6 shrink-0"
              />
            </span>
            <StatusBadge state={claim.state} />
            {claim.verifiedAt !== null ? null : (
              <EditDomainDialog claimId={claim.id} domain={claim.domain} />
            )}
          </div>

          <div className="flex flex-wrap gap-x-8 gap-y-4">
            <Meta label="Added" iso={claim.createdAt} />
            {lastChecked ? (
              <Meta label="Last checked" iso={lastChecked} />
            ) : null}
            {isVerified ? null : (
              <Meta
                label={needsNewCode ? "Challenge expired" : "Challenge expires"}
                iso={claim.tokenExpiresAt}
              />
            )}
          </div>
        </CardContent>
      </Card>

      <ClaimStatePanel claim={claim} />

      {showComparison ? (
        <ExpectedVsFoundCard claim={claim} footer={actions} />
      ) : (
        <DnsRecordCard
          value={claim.recordValue}
          hostname={claim.verificationHostname}
          title={isVerified ? "Verification record" : "Add this DNS record"}
          description={
            isVerified
              ? "The record we matched during the last check."
              : "Add the following record at your DNS provider."
          }
          note={
            isVerified ? (
              <p>
                You can remove the{" "}
                <span className="text-foreground font-mono">
                  resend-verify=
                </span>{" "}
                TXT value now if you&rsquo;d like. Leave anything else at that
                name alone.
              </p>
            ) : undefined
          }
          inactive={needsNewCode}
          footer={actions}
        />
      )}

      {isVerified || needsNewCode ? null : (
        <div className="space-y-2">
          <PropagationNote buttonLabel={verifyLabel} />
          <TakeoverNote />
        </div>
      )}
    </div>
  );
}
