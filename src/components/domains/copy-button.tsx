"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent } from "@/components/ui/popover";

/**
 * On success this is just a button. The full value only appears when the
 * clipboard refuses, because that is the one moment "select it manually" is
 * unfollowable on its own: the value it refers to is truncated in the column.
 *
 * The popover is anchored to the button rather than triggered by it, so the
 * only thing that can open it is a failed copy.
 */
export function CopyButton({
  value,
  label,
  className,
  ...props
}: {
  value: string;
  label: string;
} & Omit<React.ComponentProps<typeof Button>, "value" | "onClick">) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <Popover open={failed} onOpenChange={setFailed}>
      <Button
        ref={anchor}
        type="button"
        variant="ghost"
        size="icon"
        className={className}
        aria-label={copied ? `${label} copied` : `Copy ${label}`}
        {...props}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setFailed(false);
          } catch {
            setCopied(false);
            setFailed(true);
          }
        }}
      >
        {copied ? (
          <Check className="size-3.5 text-emerald-500" />
        ) : (
          <Copy className="size-3.5" />
        )}
      </Button>
      <PopoverContent
        anchor={anchor}
        finalFocus={anchor}
        className="w-auto max-w-[min(26rem,calc(100vw-2rem))] font-sans"
      >
        <p className="text-muted-foreground text-xs">
          Couldn&rsquo;t copy. Select the {label} here:
        </p>
        <p className="font-mono text-xs break-all select-all">{value}</p>
      </PopoverContent>
    </Popover>
  );
}
