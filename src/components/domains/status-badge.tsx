import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ClaimViewState } from "@/lib/types";

type Presentation = {
  label: string;
  variant: "secondary" | "outline" | "destructive";
  className?: string;
};

// The badge collapses seven states into four labels by what the user does next:
// nothing, start, open and fix, or open and learn the domain moved. Every
// pending-with-a-fix state shares one "Needs attention" label. The detail page
// names the exact state.
// Amber means "open this", not proof of a mistake: the cause may be propagation,
// a configuration issue, a lookup failure, or an expired challenge. Red is
// reserved for superseded, the one state that changed against the user and has
// no one-click fix.
const NEEDS_ATTENTION: Presentation = {
  label: "Needs attention",
  variant: "outline",
  className: "border-amber-400/35 bg-amber-500/15 text-amber-300",
};

const PRESENTATION: Record<ClaimViewState, Presentation> = {
  verified: {
    label: "Verified",
    variant: "outline",
    className: "border-emerald-400/35 bg-emerald-500/15 text-emerald-300",
  },
  superseded: {
    label: "Superseded",
    variant: "outline",
    className: "border-red-400/35 bg-red-500/15 text-red-300",
  },
  expired: NEEDS_ATTENTION,
  setup_required: {
    label: "Unchecked",
    variant: "outline",
    className: "text-muted-foreground",
  },
  record_not_found: NEEDS_ATTENTION,
  value_mismatch: NEEDS_ATTENTION,
  temporary_dns_error: NEEDS_ATTENTION,
};

export function StatusBadge({ state }: { state: ClaimViewState }) {
  const { label, variant, className } = PRESENTATION[state];

  return (
    <Badge variant={variant} className={cn("font-medium", className)}>
      {label}
    </Badge>
  );
}
