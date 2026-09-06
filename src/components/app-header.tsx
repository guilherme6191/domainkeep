import Link from "next/link";
import { UserButton } from "@clerk/nextjs";

export function AppHeader() {
  return (
    <header className="border-border/60 border-b">
      <div className="flex h-14 w-full items-center justify-between px-6">
        <Link
          href="/domains"
          className="text-sm font-semibold tracking-tight"
        >
          Domainkeep
        </Link>
        <UserButton />
      </div>
    </header>
  );
}
