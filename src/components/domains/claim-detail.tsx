"use client";

import { useState } from "react";
import { ArrowLeft, Check, Clock, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ClaimStatePanel,
  ExpectedVsFound,
} from "@/components/domains/claim-state-panel";
import { CopyButton } from "@/components/domains/copy-button";
import { DeleteDomainDialog } from "@/components/domains/delete-domain-dialog";
import { DnsRecord } from "@/components/domains/dns-record";
import { EditDomainDialog } from "@/components/domains/edit-domain-dialog";
import { StatusBadge } from "@/components/domains/status-badge";
import { TakeoverDialog } from "@/components/domains/takeover-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useClaim, useReplaceToken, useVerifyClaim } from "@/hooks/use-claims";
import { ApiRequestError } from "@/lib/api/client";
import { toastApiError } from "@/lib/api/toast-error";
import {
  codeExpiryIsUrgent,
  codeIsDead,
  lastCheckedAt,
  recordWasFound,
} from "@/lib/claim-state";
import { formatDateTime, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ClaimView, ClaimViewState } from "@/lib/types";

// What a screen reader hears when a check settles. The panels announce
// themselves when they mount, but a second miss re-renders the same panel
// and says nothing, so the result is spoken here every time. Keyed on the
// full state type so a new outcome can't be added without a sentence;
// `setup_required` is never a check's answer and is here for completeness.
const OUTCOME: Record<ClaimViewState, string> = {
  verified: "Verified. You control this domain.",
  record_not_found: "Record not found yet. DNS may still be propagating.",
  value_mismatch: "Record found, but its value doesn't match.",
  temporary_dns_error: "DNS didn't respond. Nothing to change yet.",
  held_by_another: "Your record matched, but another account holds this domain.",
  expired: "This verification code has expired.",
  superseded: "Another account proved control of this domain.",
  setup_required: "Not checked yet.",
};

// Relative time, with the exact instant on hover. `urgent` colours the whole
// pair amber; otherwise the label is muted and the value reads in the
// foreground.
function Meta({
  label,
  iso,
  icon,
  urgent = false,
  action,
}: {
  label: string;
  iso: string;
  icon?: React.ReactNode;
  urgent?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <div className={cn("flex items-center gap-1.5", urgent && "text-amber-300")}>
      <dt className="flex items-center gap-1.5">
        {icon}
        {label}
      </dt>
      <dd
        className={cn("flex items-center gap-1.5", !urgent && "text-foreground")}
        title={formatDateTime(iso)}
      >
        {formatRelative(iso)}
        {action ? (
          <>
            <span aria-hidden>·</span>
            {action}
          </>
        ) : null}
      </dd>
    </div>
  );
}

/**
 * The one piece of metadata that is a deadline rather than history. It stays
 * quiet for most of the week and turns amber inside the last day, when the
 * user should act on it before the record they published stops counting.
 *
 * While the code is alive its replacement belongs here, beside the date that
 * prompts the question, and quiet: it is an escape hatch, not the next step.
 * Once the code is dead it leaves for the card below, where it is the only
 * thing left to do.
 */
function CodeExpiry({
  claim,
  newCode,
}: {
  claim: ClaimView;
  newCode: React.ReactNode;
}) {
  if (claim.state === "verified") return null;

  return (
    <Meta
      label={
        claim.state === "superseded"
          ? "Code invalidated"
          : codeIsDead(claim)
            ? "Code expired"
            : "Code expires"
      }
      iso={claim.tokenExpiresAt}
      icon={<Clock className="size-3.5" aria-hidden />}
      urgent={codeExpiryIsUrgent(claim)}
      action={codeIsDead(claim) ? null : newCode}
    />
  );
}

/**
 * Three steps at the head of the card, so the page answers "where am I in
 * this?" before the user reads a word of the outcome below them. A step counts
 * as done from what the system has actually seen: a check that found the
 * record clears the first one, whatever it then said about the value. A dead
 * code renames that step and turns it amber, because nothing else can move
 * until it is replaced.
 *
 * The current step is the loudest thing in the strip; a finished one steps
 * back to a tick, and one still ahead is fainter again.
 */
function ProgressSteps({ state }: { state: ClaimViewState }) {
  const needsNewCode = codeIsDead({ state });
  const recordFound = recordWasFound(state);
  const verified = state === "verified";
  const current = verified ? 3 : recordFound ? 2 : 1;

  const steps = [
    { label: needsNewCode ? "Get a new code" : "Add record", done: recordFound },
    { label: "Check", done: verified },
    { label: "Verified", done: verified },
  ];

  return (
    <ol
      aria-label="Progress"
      className="flex flex-wrap items-center gap-2 text-sm"
    >
      {steps.map((step, index) => {
        const isCurrent = current === index + 1;
        const urgent = isCurrent && needsNewCode && index === 0;

        return (
          <li
            key={step.label}
            aria-current={isCurrent ? "step" : undefined}
            className="flex items-center gap-2"
          >
            <span
              aria-hidden
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium tabular-nums",
                step.done && "border-border text-muted-foreground",
                isCurrent && "border-primary/40 bg-primary/15 text-primary",
                !step.done && !isCurrent && "border-border/60 text-muted-foreground/50",
                urgent && "border-amber-400/50 bg-amber-500/15 text-amber-300",
              )}
            >
              {step.done ? <Check className="size-3.5" /> : index + 1}
            </span>
            <span
              className={cn(
                step.done ? "text-muted-foreground" : "text-muted-foreground/50",
                isCurrent && "text-foreground font-medium",
                urgent && "text-amber-300",
              )}
            >
              {step.label}
            </span>
            {/* Dropped where the strip is too narrow to hold three steps on
                one line: a connector that survives the wrap dangles off the
                end of it, pointing at nothing. */}
            {index < steps.length - 1 ? (
              <span aria-hidden className="bg-border ml-1 hidden h-px w-6 @sm:block" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

export function ClaimDetail({ claimId }: { claimId: string }) {
  const router = useRouter();
  const { data: claim, isPending, isError, error, refetch, isFetching } =
    useClaim(claimId);
  const verify = useVerifyClaim(claimId);
  const replaceToken = useReplaceToken(claimId);
  // Opened by the check that found the holder, and by the card's Take over
  // button on any later visit. The transfer is confirmed inside the dialog.
  const [takeoverOpen, setTakeoverOpen] = useState(false);
  // Counts settled checks so a result can animate in without the first paint
  // doing the same, and so a repeated outcome still gets a fresh panel.
  const [checks, setChecks] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  // Lives here, not in the panel, so a re-check can't snap it shut.
  const [troubleshootingOpen, setTroubleshootingOpen] = useState(false);

  // Every settled lookup, whether a check or a confirmed takeover, lands the
  // same way: a fresh panel and a spoken outcome.
  function settle(updated: ClaimView) {
    setChecks((count) => count + 1);
    setAnnouncement(OUTCOME[updated.state]);
  }

  if (isPending) {
    return (
      <div className="space-y-5">
        {/* Same row as the loaded header: back link left, delete right. */}
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-28" />
        </div>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-56 w-full" />
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
  const needsNewCode = codeIsDead(claim);
  const isHeld = claim.state === "held_by_another";
  const checkedBefore = claim.lastCheck !== null;
  const lastChecked = lastCheckedAt(claim);
  const showComparison = claim.state === "value_mismatch";

  // The verified panel is the confirmation; a toast saying the same thing at
  // the same moment would be noise.
  function runVerify() {
    setAnnouncement("Checking DNS…");
    verify.mutate(undefined, {
      onSuccess: (updated) => {
        settle(updated);
        // The proof matched but the domain is someone else's. Ask now, while
        // the user is watching their own click.
        if (updated.state === "held_by_another") {
          setTakeoverOpen(true);
        }
      },
      onError: (error) => {
        setAnnouncement("The check didn't run. Try again.");
        toastApiError(error);
      },
    });
  }

  // Guarded rather than disabled, because the link in the meta is small and
  // easy to double-tap: a second request would invalidate the code the first
  // just issued.
  function replaceCode() {
    if (replaceToken.isPending) return;
    replaceToken.mutate(undefined, {
      onError: (error) => toastApiError(error),
    });
  }

  // Up in the top bar, away from the card: deletion is rare, and it should
  // never outweigh the next step. Its treatment is the destructive variant the
  // row menu's delete already uses — a tint, not a filled button.
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
        <Button variant="destructive" size="sm">
          Delete domain
        </Button>
      }
    />
  );

  const newCodeLabel = replaceToken.isPending
    ? "Generating…"
    : "Get a new code";

  const newCodeLink = (
    <Button
      variant="link"
      className="h-auto p-0 text-[13px] font-normal"
      title="Invalidates the current code. You'll need to update the TXT record."
      onClick={replaceCode}
    >
      {newCodeLabel}
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
          {checkedBefore ? "Check again" : "Verify domain"}
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

  // One pending action, at the foot of the content it acts on, so reading the
  // page top to bottom ends at the button. Verified has nothing left to do. A
  // dead code leaves only its replacement. A claim that has already proved
  // control is asked to decide, with leaving it alone a quiet answer beside
  // the transfer; every other one is asked to check.
  const action = isVerified ? null : needsNewCode ? (
    <Button onClick={replaceCode} disabled={replaceToken.isPending}>
      {newCodeLabel}
    </Button>
  ) : isHeld ? (
    <>
      <Button onClick={() => setTakeoverOpen(true)}>Take over</Button>
      <Link
        href="/domains"
        className={cn(
          buttonVariants({ variant: "ghost" }),
          "text-muted-foreground hover:text-foreground",
        )}
      >
        Leave it
      </Link>
    </>
  ) : (
    verifyButton
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/domains"
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            // Pulled left so the label, not the button's padding, lines up
            // with the content below it.
            "text-muted-foreground hover:text-foreground -ml-2",
          )}
        >
          <ArrowLeft className="size-3.5" />
          Domains
        </Link>
        {deleteDomain}
      </div>

      {/* A plain block, not a card: the domain and its dates are the page's
          heading, and the card below is the thing to act on. */}
      <div className="space-y-2.5">
        <StatusBadge state={claim.state} />
        {/* The controls sit beside the heading, not inside it, so its
            accessible name is the domain alone. */}
        <div className="flex min-w-0 items-center gap-1">
          <h1 className="truncate font-mono text-lg font-semibold tracking-tight">
            {claim.domain}
          </h1>
          <CopyButton
            value={claim.domain}
            label="domain"
            className="size-6 shrink-0"
          />
          {claim.verifiedAt !== null ? null : (
            <EditDomainDialog claimId={claim.id} domain={claim.domain} />
          )}
        </div>

        <dl className="text-muted-foreground flex flex-wrap gap-x-6 gap-y-2 text-[13px]">
          <Meta label="Added" iso={claim.createdAt} />
          {lastChecked ? <Meta label="Last checked" iso={lastChecked} /> : null}
          <CodeExpiry claim={claim} newCode={newCodeLink} />
        </dl>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      {/* Keyed on the check count, not the state: a repeat miss should still
          visibly answer the click. The card dims while a check is in flight,
          so the page shows work in progress, not a stuck button. */}
      <div
        key={checks}
        aria-busy={verify.isPending || undefined}
        className={cn(
          "transition-opacity duration-300",
          checks > 0 &&
            "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-300",
          verify.isPending && "opacity-60",
        )}
      >
        <Card>
          {/* Where the domain is in the process heads the card that holds the
              step, so one block answers where am I, what happened, what to do
              and the button, in that order. */}
          <CardHeader className="border-b">
            <ProgressSteps state={claim.state} />
          </CardHeader>

          <CardContent className="space-y-5">
            <ClaimStatePanel
              claim={claim}
              fold={{
                open: troubleshootingOpen,
                onOpenChange: setTroubleshootingOpen,
              }}
            />

            {/* Verification is point-in-time, so a verified claim has no record
                to show: the proof is done and the TXT value has no ongoing job.
                A held domain is waiting on a decision, not on its record. */}
            {isVerified || isHeld ? null : showComparison ? (
              <ExpectedVsFound claim={claim} />
            ) : (
              <DnsRecord
                value={claim.recordValue}
                hostname={claim.verificationHostname}
                title={needsNewCode ? "Previous record" : "Add this DNS record"}
                inactive={needsNewCode}
              />
            )}

            {action ? (
              <div className="flex flex-wrap items-center gap-2">{action}</div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <TakeoverDialog
        claimId={claim.id}
        domain={claim.domain}
        open={takeoverOpen}
        onOpenChange={setTakeoverOpen}
        onResult={settle}
      />
    </div>
  );
}
