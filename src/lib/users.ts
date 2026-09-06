import "server-only";
import { clerkClient } from "@clerk/nextjs/server";

/**
 * The account's current primary address, read from Clerk on every send. Never
 * stored on the claim and never logged, so it cannot go stale or leak.
 */
export async function primaryEmailFor(userId: string): Promise<string | null> {
  const user = await (await clerkClient()).users.getUser(userId);
  return user.primaryEmailAddress?.emailAddress ?? null;
}
