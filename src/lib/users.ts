import "server-only";
import { clerkClient } from "@clerk/nextjs/server";

/**
 * The account's current primary address, read from Clerk on every send. Never
 * stored on the claim. The notifier logs the recipient on a successful send;
 * the address is never returned to the other account.
 */
export async function primaryEmailFor(userId: string): Promise<string | null> {
  const user = await (await clerkClient()).users.getUser(userId);
  return user.primaryEmailAddress?.emailAddress ?? null;
}
