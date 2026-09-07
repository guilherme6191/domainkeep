import { Info } from "lucide-react";
import { CopyButton } from "@/components/domains/copy-button";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { recordName } from "@/lib/domain";
import { VERIFICATION_VALUE_PREFIX } from "@/lib/types";
import { cn } from "@/lib/utils";

const COLUMNS = "sm:grid-cols-[5rem_11rem_1fr_4rem]";

// The table shows a short form of the value: the prefix, then ten hex digits
// at each end, enough to tell one token from another where it was pasted.
// The copy button carries the full value and its own manual fallback.
const VISIBLE_DIGITS = 10;

function ShortValue({ value }: { value: string }) {
  const token = value.slice(VERIFICATION_VALUE_PREFIX.length);
  return (
    <>
      {VERIFICATION_VALUE_PREFIX}
      {token.slice(0, VISIBLE_DIGITS)}
      <span className="text-muted-foreground">[…]</span>
      {token.slice(-VISIBLE_DIGITS)}
    </>
  );
}

// Provider-style table on `sm` and up; labels move inline on phones.
function Cell({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("min-w-0 space-y-1 sm:space-y-0", className)}>
      <div className="text-muted-foreground text-[13px] sm:hidden">{label}</div>
      <div className="font-mono text-[13px]">{children}</div>
    </div>
  );
}

// The Name explanation lives where the question comes up, not under the table.
// One paragraph covers `@`, a relative label, and a delegated zone.
function NameHelp({ hostname }: { hostname: string }) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground size-6 shrink-0"
            aria-label="What goes in the Name field?"
          />
        }
      >
        <Info className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent className="font-sans">
        <p>
          Name is what your DNS provider calls the host.{" "}
          <span className="text-foreground font-mono">@</span> means the root
          of the zone you&rsquo;re editing, and{" "}
          <span className="text-foreground font-mono">news</span> means{" "}
          <span className="text-foreground font-mono">news</span> under that
          root. If the name you&rsquo;re claiming is itself the root of the
          zone you&rsquo;re editing, use{" "}
          <span className="text-foreground font-mono">@</span>. Either way,
          the record&rsquo;s full name must end up as{" "}
          <span className="text-foreground font-mono break-words">{hostname}</span>
          .
        </p>
      </PopoverContent>
    </Popover>
  );
}

/**
 * `inactive` is the expired case: shown for reference, dimmed, not copyable.
 * The footer stays live because that is where the way out lives.
 */
export function DnsRecordCard({
  value,
  hostname,
  title = "Add this DNS record",
  inactive = false,
  footer,
}: {
  value: string;
  hostname: string;
  title?: string;
  inactive?: boolean;
  footer?: React.ReactNode;
}) {
  const name = recordName(hostname);

  return (
    <Card>
      <CardHeader className={cn(inactive && "opacity-40")}>
        <CardTitle>{title}</CardTitle>
      </CardHeader>

      <CardContent className={cn(inactive && "opacity-40")}>
        <div className="overflow-hidden rounded-lg border">
          <div
            className={cn(
              "text-muted-foreground hidden border-b px-4 py-2.5 text-[13px] font-medium sm:grid sm:gap-4",
              COLUMNS,
            )}
          >
            <div>Type</div>
            <div>Name</div>
            <div>Value</div>
            <div>TTL</div>
          </div>

          <div
            className={cn("grid gap-4 px-4 py-3.5 sm:items-center", COLUMNS)}
          >
            <Cell label="Type">TXT</Cell>
            <Cell label="Name">
              <span className="flex items-center gap-1">
                <span
                  className={cn("min-w-0 truncate", inactive && "line-through")}
                  title={name}
                >
                  {name}
                </span>
                {inactive ? null : (
                  <>
                    <CopyButton value={name} label="name" className="size-6 shrink-0" />
                    <NameHelp hostname={hostname} />
                  </>
                )}
              </span>
            </Cell>
            <Cell label="Value">
              <span className="flex items-center gap-1">
                <span className={cn(inactive && "line-through")} title={value}>
                  <ShortValue value={value} />
                </span>
                {inactive ? null : (
                  <CopyButton
                    value={value}
                    label="record value"
                    className="size-6 shrink-0"
                  />
                )}
              </span>
            </Cell>
            <Cell label="TTL">Auto</Cell>
          </div>
        </div>

        <div className="text-muted-foreground pt-3.5 text-sm">
          <p>
            The record&rsquo;s full name must be{" "}
            <span className="text-foreground font-mono">{hostname}</span>
            {inactive ? null : (
              <CopyButton
                value={hostname}
                label="full name"
                className="ml-1 -mr-1 size-6 align-middle"
              />
            )}
            . Add it alongside any TXT values already there, such as SPF.
          </p>
        </div>
      </CardContent>

      {footer ? (
        <CardFooter className="flex-wrap justify-end gap-2">
          {footer}
        </CardFooter>
      ) : null}
    </Card>
  );
}
