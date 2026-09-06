import "server-only";
import { auth } from "@clerk/nextjs/server";

/** Ownership always comes from the session, never from a request body. */
export async function currentUserId(): Promise<string | null> {
  const { userId } = await auth();
  return userId;
}
