"use client";

import { useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ChevronRight,
  CircleCheck,
} from "lucide-react";
import { CopyButton } from "@/components/domains/copy-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDateTimeSentence } from "@/lib/format";
import { takeoverNoticeRemainingMs } from "@/lib/takeover-notice";
import { VERIFICATION_VALUE_PREFIX, type ClaimView } from "@/lib/types";

function Mono({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-foreground font-mono text-sm">{children}</span>
  );
}

// The first miss is usually propagation, so the checklist stays folded until
// the user wants it.
function RecordNotFound({ claim }: { claim: ClaimView }) {
  return (
    <Alert>
      <AlertCircle />
      <AlertTitle>We couldn&rsquo;t find the verification record yet.</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>
          DNS changes can take a few minutes, occasionally hours. Check again
          shortly — your code stays valid between checks.
        </p>

        <details className="group">
          <summary className="text-foreground flex cursor-pointer list-none items-center gap-1 font-medium [&::-webkit-details-marker]:hidden">
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
      </AlertDescription>
    </Alert>
  );
}

// Not destructive: the record is there, one value needs swapping. The card
// below shows expected and found, so the alert is the headline only.
function ValueMismatch() {
  return (
    <Alert>
      <AlertCircle />
      <AlertTitle>
        We found the record, but its value doesn&rsquo;t match.
      </AlertTitle>
    </Alert>
  );
}

// Replaces the record card in the mismatch state so expected and found read
// side by side.
export function ExpectedVsFoundCard({
  claim,
  footer,
}: {
  claim: ClaimView;
  footer?: React.ReactNode;
}) {
  const observed =
    claim.lastCheck?.result === "value_mismatch"
      ? claim.lastCheck.observedValues
      : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Expected vs. found</CardTitle>
        <CardDescription>
          At <Mono>{claim.verificationHostname}</Mono>
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-6 sm:grid-cols-[1fr_1px_1fr]">
          <div className="space-y-2.5">
            <div className="text-muted-foreground text-sm font-medium">
              Expected
            </div>
            <div className="flex items-start gap-2">
              <code className="min-w-0 flex-1 font-mono text-sm leading-relaxed break-all">
                {claim.recordValue}
              </code>
              <CopyButton
                value={claim.recordValue}
                label="expected value"
                className="size-7 shrink-0"
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
                    <code className="text-muted-foreground min-w-0 font-mono text-sm leading-relaxed break-all">
                      {value}
                    </code>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <p className="text-muted-foreground text-sm">
          Replace the found value with the expected one, or add it as another
          TXT value, then check again.
        </p>
      </CardContent>

      {footer ? (
        <CardFooter className="flex-wrap justify-end gap-2">{footer}</CardFooter>
      ) : null}
    </Card>
  );
}

function TemporaryDnsError() {
  return (
    <Alert>
      <AlertCircle />
      <AlertTitle>
        DNS didn&rsquo;t respond. Your record may still be correct.
      </AlertTitle>
      <AlertDescription>
        We couldn&rsquo;t complete the lookup. There&rsquo;s nothing to change
        yet — click Check again to retry.
      </AlertDescription>
    </Alert>
  );
}

function Expired() {
  return (
    <Alert>
      <AlertCircle />
      <AlertTitle>This verification code has expired.</AlertTitle>
      <AlertDescription>Codes are valid for seven days.</AlertDescription>
    </Alert>
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

function Verified({ claim }: { claim: ClaimView }) {
  return (
    <Alert className="border-emerald-400/35 text-emerald-300">
      <CircleCheck />
      <AlertTitle>You control {claim.domain}.</AlertTitle>
      <AlertDescription className="space-y-2">
        <p>
          {claim.verifiedAt
            ? `Verified on ${formatDateTimeSentence(claim.verifiedAt)}.`
            : "DNS control confirmed at the time of the check."}
        </p>
        <p>
          You can remove the <Mono>{VERIFICATION_VALUE_PREFIX}</Mono> TXT
          value from <Mono>{claim.domain}</Mono> now if you&rsquo;d like.
        </p>
        {claim.tookOverAt ? (
          <RecentTakeoverNotice key={claim.tookOverAt} tookOverAt={claim.tookOverAt} />
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

function Superseded({ claim }: { claim: ClaimView }) {
  return (
    <Alert className="border-red-400/35 text-red-300">
      <AlertTriangle />
      <AlertTitle>Another account proved control of {claim.domain}.</AlertTitle>
      <AlertDescription>
        {claim.verifiedAt
          ? `You verified this domain on ${formatDateTimeSentence(claim.verifiedAt)}, and it has since moved. `
          : null}
        If you still control its DNS, generate a new code and verify again to
        take it back. Check with whoever manages this domain first on who should
        hold it.
      </AlertDescription>
    </Alert>
  );
}

function SupersededNote({ claim }: { claim: ClaimView }) {
  if (!claim.supersededAt) return null;
  return (
    <p className="text-sm text-red-300/90">
      This domain moved to another account on{" "}
      {formatDateTimeSentence(claim.supersededAt)}. Verifying again takes it
      back.
    </p>
  );
}

// Colour only where something is settled: green verified, red superseded.
// Recoverable failures, expiry included, stay neutral.
export function ClaimStatePanel({ claim }: { claim: ClaimView }) {
  if (claim.state === "superseded") return <Superseded claim={claim} />;

  return (
    <>
      <SupersededNote claim={claim} />
      {statePanel(claim)}
    </>
  );
}

function statePanel(claim: ClaimView) {
  switch (claim.state) {
    case "record_not_found":
      return <RecordNotFound claim={claim} />;
    case "value_mismatch":
      return <ValueMismatch />;
    case "temporary_dns_error":
      return <TemporaryDnsError />;
    case "expired":
      return <Expired />;
    case "verified":
      return <Verified claim={claim} />;
    case "superseded":
    case "setup_required":
      return null;
  }
}
