import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ClaimViewState } from "@/lib/types";

type Presentation = {
  label: string;
  variant: "secondary" | "outline" | "destructive";
  className?: string;
};

// Every state says what it is, in the words the user would use: a list of four
// pending domains should name four different problems, not repeat one word.
// Amber marks the states where something is definitely off or a decision is
// waiting; red is reserved for superseded, the one state that changed against
// the user and has no one-click fix. Neutral is for the states where nothing
// has gone wrong yet: never checked, and a code that simply ran out of time.
const AMBER = "border-amber-400/35 bg-amber-500/15 text-amber-300";
const NEUTRAL = "text-muted-foreground";

const PRESENTATION: Record<ClaimViewState, Presentation> = {
  verified: {
    label: "Verified",
    variant: "outline",
    className: "border-emerald-400/35 bg-emerald-500/15 text-emerald-300",
  },
  superseded: {
    label: "Moved away",
    variant: "outline",
    className: "border-red-400/35 bg-red-500/15 text-red-300",
  },
  expired: { label: "Code expired", variant: "outline", className: NEUTRAL },
  setup_required: {
    label: "Unchecked",
    variant: "outline",
    className: NEUTRAL,
  },
  held_by_another: {
    label: "Held elsewhere",
    variant: "outline",
    className: AMBER,
  },
  record_not_found: {
    label: "Record not found",
    variant: "outline",
    className: AMBER,
  },
  value_mismatch: {
    label: "Wrong value",
    variant: "outline",
    className: AMBER,
  },
  temporary_dns_error: {
    label: "DNS didn’t answer",
    variant: "outline",
    className: AMBER,
  },
};

export function StatusBadge({ state }: { state: ClaimViewState }) {
  const { label, variant, className } = PRESENTATION[state];

  return (
    <Badge variant={variant} className={cn("font-medium", className)}>
      {label}
    </Badge>
  );
}
