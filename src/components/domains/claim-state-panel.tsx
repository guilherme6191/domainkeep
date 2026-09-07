"use client";

import { useState } from "react";
import { AlertCircle, AlertTriangle, CircleCheck } from "lucide-react";
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

function RecordNotFound({ claim }: { claim: ClaimView }) {
  return (
    <Alert>
      <AlertCircle />
      <AlertTitle>We couldn&rsquo;t find the verification record yet.</AlertTitle>
      <AlertDescription className="space-y-4">
        <p>
          It may not have propagated yet, or it may be published at a different
          name. DNS changes can take anywhere from a few minutes to a few hours.
        </p>

        <div className="space-y-2">
          <p className="text-foreground font-medium">
            A few things worth checking
          </p>
          <ul className="list-disc space-y-1.5 pl-4">
            <li>
              The value starts with <Mono>{VERIFICATION_VALUE_PREFIX}</Mono>. A
              bare token, without the prefix, is not counted.
            </li>
            <li>
              The value was pasted, not retyped. A single wrong character in 64
              will fail.
            </li>
            <li>
              The record&rsquo;s full name is exactly <Mono>{claim.domain}</Mono>
              . <Mono>@</Mono> is the root of whichever zone you&rsquo;re
              editing, so using it in a parent zone publishes the record at the
              parent instead.
            </li>
            <li>
              The record type is TXT, not A or CNAME. A name that is already a
              CNAME cannot carry a TXT record at all — claim the root or a
              different name instead.
            </li>
          </ul>
        </div>

        <p>
          If everything above looks right, allow more time for DNS changes and
          check again in a few minutes. Retrying does not change your code.
        </p>
      </AlertDescription>
    </Alert>
  );
}

// Not destructive: the record is there, one value needs swapping.
function ValueMismatch({ claim }: { claim: ClaimView }) {
  return (
    <Alert>
      <AlertCircle />
      <AlertTitle>
        We found the record, but its value doesn&rsquo;t match.
      </AlertTitle>
      <AlertDescription>
        A <Mono>{VERIFICATION_VALUE_PREFIX}</Mono> value exists at{" "}
        <Mono>{claim.verificationHostname}</Mono>, so the name is right. It
        doesn&rsquo;t carry the token we generated for this domain.
      </AlertDescription>
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
          Correct the <Mono>{VERIFICATION_VALUE_PREFIX}</Mono> value at{" "}
          <Mono>{claim.verificationHostname}</Mono>, or add the expected one as
          another TXT value, then check again. Anything else at that name, such
          as SPF, stays as it is.
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
    <Alert variant="destructive" className="border-destructive/35">
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
            ? `Verified on ${formatDateTimeSentence(claim.verifiedAt)}. `
            : null}
          This confirms DNS control at the time of the check — it doesn&rsquo;t
          establish legal ownership.
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
    <Alert className="border-amber-400/35 text-amber-300">
      <AlertTriangle />
      <AlertTitle>Another account proved control of {claim.domain}.</AlertTitle>
      <AlertDescription>
        {claim.verifiedAt
          ? `You verified this domain on ${formatDateTimeSentence(claim.verifiedAt)}, and it has since moved. `
          : null}
        The code you published no longer proves anything. If you still control
        its DNS, generate a new code and verify again to take it back — but
        check with your team, or whoever manages this domain, on who should
        hold the claim. Anyone with DNS access can move it back the other way.
      </AlertDescription>
    </Alert>
  );
}

function SupersededNote({ claim }: { claim: ClaimView }) {
  if (!claim.supersededAt) return null;
  return (
    <p className="text-sm text-amber-300/90">
      This domain moved to another account on{" "}
      {formatDateTimeSentence(claim.supersededAt)}. Verifying again takes it
      back.
    </p>
  );
}

// Colour only where something is settled: green verified, amber superseded,
// red expired. Recoverable failures stay neutral.
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
      return <ValueMismatch claim={claim} />;
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
