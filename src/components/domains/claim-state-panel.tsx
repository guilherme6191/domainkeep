"use client";

import { useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ChevronRight,
  CircleCheck,
  CloudOff,
  Hourglass,
  Lock,
  SearchX,
} from "lucide-react";
import { CopyButton } from "@/components/domains/copy-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { nextStep } from "@/lib/claim-state";
import { formatDateTimeSentence } from "@/lib/format";
import { takeoverNoticeRemainingMs } from "@/lib/takeover-notice";
import { cn } from "@/lib/utils";
import {
  VERIFICATION_VALUE_PREFIX,
  type ClaimView,
  type ClaimViewState,
} from "@/lib/types";

function Mono({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-foreground font-mono text-sm">{children}</span>
  );
}

// The panel opens the one card rather than sitting in a box of its own, so it
// drops the alert's border and background and keeps its role and its layout.
const PLAIN = "border-0 bg-transparent p-0";

// The alert's description balances its lines, which suits the one-line note it
// was drawn for and not the paragraphs these panels carry: on a phone it
// squeezes body copy into a narrow ragged column. `text-pretty` leaves the
// measure alone and only guards against a widow.
const BODY = "text-pretty";

// Each outcome has its own glyph, so the shape says what happened before the
// words do: nothing found, a mismatch, no answer, someone else, out of time.
//
// The title says what happened; the line under it says what to do, in exactly
// the words the list used, so the page never renames the step the user came
// here to take. The explanation follows, for whoever wants it.
function Panel({
  state,
  icon,
  title,
  className,
  children,
}: {
  state: ClaimViewState;
  icon: React.ReactNode;
  title: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  const action = nextStep(state);

  return (
    <Alert className={cn(PLAIN, className)}>
      {icon}
      <AlertTitle className="text-base">{title}</AlertTitle>
      <AlertDescription className={cn(BODY, "space-y-2")}>
        {action ? (
          <p className="text-foreground font-medium">{action}.</p>
        ) : null}
        {children}
      </AlertDescription>
    </Alert>
  );
}

/** The fold on the not-found checklist, owned by the page so a re-check that
 *  remounts the panel doesn't snap it shut mid-troubleshooting. */
export interface TroubleshootingFold {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// The first miss is usually propagation, so the checklist stays folded until
// the user wants it.
function RecordNotFound({
  claim,
  fold,
}: {
  claim: ClaimView;
  fold?: TroubleshootingFold;
}) {
  return (
    <Panel
      state="record_not_found"
      icon={<SearchX />}
      title="We couldn’t find the verification record yet."
    >
      <p>
        DNS changes can take a few minutes, occasionally hours. Your code stays
        valid between checks.
      </p>

      <details
        className="group"
        open={fold?.open}
        onToggle={(event) => fold?.onOpenChange(event.currentTarget.open)}
      >
        <summary className="text-foreground focus-visible:ring-ring/50 flex w-fit cursor-pointer list-none items-center gap-1 rounded-sm font-medium outline-none focus-visible:ring-3 [&::-webkit-details-marker]:hidden">
          <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
          Still missing after a while?
        </summary>
        <ul className="list-disc space-y-1.5 pt-2 pl-4">
          <li>
            The value starts with <Mono>{VERIFICATION_VALUE_PREFIX}</Mono>; a
            bare token doesn&rsquo;t count.
          </li>
          <li>The value was pasted, not retyped.</li>
          <li>
            The record&rsquo;s full name is exactly <Mono>{claim.domain}</Mono>,
            not the root of the zone and not a sibling.
          </li>
          <li>
            The type is TXT. A name that is already a CNAME can&rsquo;t carry
            one.
          </li>
        </ul>
      </details>
    </Panel>
  );
}

// The one recoverable state where the record is definitely wrong, so it earns
// the badge's amber. The remedy is here rather than under the comparison, so
// the whole recovery reads in one place.
function ValueMismatch() {
  return (
    <Panel
      state="value_mismatch"
      icon={<AlertCircle />}
      title="We found the record, but its value doesn’t match."
      className="text-amber-300"
    >
      <p>
        Replace the found value with the expected one, or add it as another TXT
        value.
      </p>
    </Panel>
  );
}

// Expected beside found, in place of the record table: with the value wrong,
// what the user needs is the comparison, not the instructions again.
export function ExpectedVsFound({ claim }: { claim: ClaimView }) {
  const observed =
    claim.lastCheck?.result === "value_mismatch"
      ? claim.lastCheck.observedValues
      : [];

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-base font-medium">Expected vs. found</h2>
        <p className="text-muted-foreground">
          At <Mono>{claim.verificationHostname}</Mono>
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-[1fr_1px_1fr]">
        <div className="space-y-2.5">
          <div className="text-muted-foreground text-sm font-medium">
            Expected
          </div>
          <div className="flex items-start gap-2">
            <code
              translate="no"
              className="min-w-0 flex-1 font-mono text-sm leading-relaxed break-all"
            >
              {claim.recordValue}
            </code>
            <CopyButton
              value={claim.recordValue}
              label="expected value"
              className="size-6 shrink-0"
            />
          </div>
        </div>

        <div className="bg-border hidden sm:block" />

        <div className="space-y-2.5">
          <div className="text-muted-foreground text-sm font-medium">
            Found at this name
          </div>
          {observed.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No values were readable.
            </p>
          ) : (
            <ul className="space-y-2">
              {observed.map((value) => (
                <li key={value} className="flex items-start gap-2">
                  <span
                    aria-hidden
                    className="text-muted-foreground shrink-0 text-sm leading-relaxed"
                  >
                    ×
                  </span>
                  <code
                    translate="no"
                    className="text-muted-foreground min-w-0 font-mono text-sm leading-relaxed break-all"
                  >
                    {value}
                  </code>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * What it asks for is a decision rather than a fix, so the panel says what a
 * takeover would do and what leaving it alone costs. Both answers are under
 * it: the transfer, and the way back to the list.
 */
function HeldByAnother({ claim }: { claim: ClaimView }) {
  return (
    <Panel
      state="held_by_another"
      icon={<Lock />}
      title={`Your record matched, but another account holds ${claim.domain}.`}
    >
      <p>
        Nothing has moved and nobody has been told. Take it over and the domain
        becomes yours, and the other account is told it moved.
      </p>
      <p>
        If that isn&rsquo;t expected, check with whoever manages the domain
        first.
      </p>
    </Panel>
  );
}

function TemporaryDnsError() {
  return (
    <Panel
      state="temporary_dns_error"
      icon={<CloudOff />}
      title="DNS didn’t respond. Your record may still be correct."
    >
      <p>We couldn&rsquo;t complete the lookup. There&rsquo;s nothing to change.</p>
    </Panel>
  );
}

function Expired() {
  return (
    <Panel
      state="expired"
      icon={<Hourglass />}
      title="This verification code has expired."
    >
      <p>Codes are valid for seven days.</p>
    </Panel>
  );
}

// Decided once, when the component mounts: a page left open keeps the note, a
// load after ten minutes drops it. No timer, nothing to clean up.
function RecentTakeoverNotice({ tookOverAt }: { tookOverAt: string }) {
  const [visible] = useState(
    () => takeoverNoticeRemainingMs(tookOverAt, Date.now()) > 0,
  );
  if (!visible) return null;
  return (
    <p>Your DNS proof transferred this domain from another account to yours.</p>
  );
}

// The one outcome worth a beat: the check mark lands a moment after the
// panel, so success reads as an event rather than another state. Nothing is
// asked of the user, so the panel has no action line.
function Verified({ claim }: { claim: ClaimView }) {
  return (
    <Panel
      state="verified"
      icon={
        <CircleCheck className="motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:fill-mode-backwards motion-safe:delay-150 motion-safe:duration-300" />
      }
      title={`You control ${claim.domain}.`}
      className="text-emerald-300"
    >
      <p>
        {claim.verifiedAt
          ? `Verified on ${formatDateTimeSentence(claim.verifiedAt)}.`
          : "DNS control confirmed at the time of the check."}
      </p>
      <p>
        You can remove the <Mono>{VERIFICATION_VALUE_PREFIX}</Mono> TXT value
        from <Mono>{claim.domain}</Mono> now if you&rsquo;d like.
      </p>
      {claim.tookOverAt ? (
        <RecentTakeoverNotice key={claim.tookOverAt} tookOverAt={claim.tookOverAt} />
      ) : null}
    </Panel>
  );
}

function Superseded({ claim }: { claim: ClaimView }) {
  return (
    <Panel
      state="superseded"
      icon={<AlertTriangle />}
      title={`Another account proved control of ${claim.domain}.`}
      className="text-red-300"
    >
      <p>
        {claim.verifiedAt
          ? `You verified this domain on ${formatDateTimeSentence(claim.verifiedAt)}, and it has since moved. `
          : null}
        A new code verifies control again — you&rsquo;ll be asked to confirm
        before it moves back. Check with whoever manages this domain first on
        who should hold it.
      </p>
    </Panel>
  );
}

// History, for the states whose panel says nothing about it. The reclaim path
// ends on `held_by_another`, whose panel already names the account holding the
// domain and offers the way back: the note there is a louder, redder
// restatement of what the user is already reading.
function SupersededNote({ claim }: { claim: ClaimView }) {
  if (!claim.supersededAt || claim.state === "held_by_another") return null;
  return (
    <p className="text-sm text-red-300/90">
      This domain moved to another account on{" "}
      {formatDateTimeSentence(claim.supersededAt)}. Verifying proves control
      again; taking it back is a separate confirmation.
    </p>
  );
}

// Colour where something is settled or definitely wrong: green verified, red
// superseded, amber mismatch. Not found, DNS errors and expiry stay neutral,
// because the cause may be time rather than the user.
export function ClaimStatePanel({
  claim,
  fold,
}: {
  claim: ClaimView;
  fold?: TroubleshootingFold;
}) {
  if (claim.state === "superseded") return <Superseded claim={claim} />;

  return (
    <>
      <SupersededNote claim={claim} />
      {statePanel(claim, fold)}
    </>
  );
}

function statePanel(claim: ClaimView, fold?: TroubleshootingFold) {
  switch (claim.state) {
    case "record_not_found":
      return <RecordNotFound claim={claim} fold={fold} />;
    case "value_mismatch":
      return <ValueMismatch />;
    case "temporary_dns_error":
      return <TemporaryDnsError />;
    case "held_by_another":
      return <HeldByAnother claim={claim} />;
    case "expired":
      return <Expired />;
    case "verified":
      return <Verified claim={claim} />;
    case "superseded":
    case "setup_required":
      return null;
  }
}
