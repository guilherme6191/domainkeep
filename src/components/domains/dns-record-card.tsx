import { CopyButton } from "@/components/domains/copy-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

const COLUMNS = "sm:grid-cols-[5rem_4rem_1fr_4rem]";

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
      <div className="text-muted-foreground text-sm sm:hidden">{label}</div>
      <div className="font-mono text-sm">{children}</div>
    </div>
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
  description = "Add the following record at your DNS provider.",
  note,
  inactive = false,
  footer,
}: {
  value: string;
  hostname: string;
  title?: string;
  description?: string;
  note?: React.ReactNode;
  inactive?: boolean;
  footer?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className={cn(inactive && "opacity-40")}>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>

      <CardContent className={cn(inactive && "opacity-40")}>
        <div className="overflow-hidden rounded-lg border">
          <div
            className={cn(
              "text-muted-foreground hidden border-b px-4 py-2.5 text-sm font-medium sm:grid sm:gap-4",
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
                <span className={cn(inactive && "line-through")}>@</span>
                {inactive ? null : (
                  <CopyButton value="@" label="name" className="size-6 shrink-0" />
                )}
              </span>
            </Cell>
            <Cell label="Value">
              <span className="flex items-center gap-1">
                <span
                  className={cn("min-w-0 truncate select-all", inactive && "line-through")}
                  title={value}
                >
                  {value}
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
          {note ?? (
            <p>
              <span className="text-foreground font-mono">@</span> is the root
              of the zone you&rsquo;re editing — the record&rsquo;s full name
              needs to end up as{" "}
              <span className="inline-flex items-center gap-1 align-middle">
                <span className="text-foreground font-mono">{hostname}</span>
                {inactive ? null : (
                  <CopyButton
                    value={hostname}
                    label="full name"
                    className="size-6 shrink-0"
                  />
                )}
              </span>
              . If TXT values already exist there, such as SPF, add this one
              alongside them — don&rsquo;t replace them.
            </p>
          )}
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
