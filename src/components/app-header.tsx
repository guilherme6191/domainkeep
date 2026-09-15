import Link from "next/link";
import { UserButton } from "@clerk/nextjs";

// A check inside a rounded square: what the product does, in one glyph.
function Mark() {
  return (
    <svg viewBox="0 0 20 20" className="size-5 shrink-0" aria-hidden>
      <rect x="1" y="1" width="18" height="18" rx="5.5" className="fill-primary" />
      <path
        d="M6 10.4l2.6 2.6L14 7.6"
        fill="none"
        className="stroke-primary-foreground"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AppHeader() {
  return (
    <header className="border-border/60 border-b">
      {/* Same width as the page below, so the wordmark and the title share a left edge. */}
      <div className="mx-auto flex h-14 w-full max-w-4xl items-center justify-between px-6">
        <Link
          href="/domains"
          className="focus-visible:ring-ring/50 flex items-center gap-2 rounded-md text-sm font-semibold tracking-tight outline-none focus-visible:ring-3"
        >
          <Mark />
          Domainkeep
        </Link>
        <UserButton />
      </div>
    </header>
  );
}
