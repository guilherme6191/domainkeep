import "server-only";
import { claimTakeoverNotification } from "@/lib/db/claims";
import { sendTakeoverNotice } from "@/lib/mail/takeover";
import type { DomainClaim } from "@/lib/types";
import { primaryEmailFor } from "@/lib/users";

/**
 * Tells the holder this verification displaced, if there was one. Runs after
 * the response, so nothing here can slow down or fail the new holder's check.
 * Marking comes before sending: a notice the list also shows is better missed
 * once than sent twice.
 */
export async function notifyTakeover(
  winner: DomainClaim,
  origin: string,
): Promise<void> {
  if (!winner.tookOverAt) return;

  const displaced = await claimTakeoverNotification({
    normalizedDomain: winner.normalizedDomain,
    tookOverAt: winner.tookOverAt,
    winnerId: winner.id,
  });
  if (!displaced) {
    console.info(
      `[takeover-notice] claim ${winner.id} displaced no unnotified holder; sending nothing.`,
    );
    return;
  }

  const to = await primaryEmailFor(displaced.ownerId);
  if (!to) {
    console.warn(`[takeover-notice] claim ${displaced.id} has no primary email.`);
    return;
  }

  const sent = await sendTakeoverNotice({
    to,
    domain: winner.normalizedDomain,
    tookOverAt: winner.tookOverAt,
    claimUrl: `${origin}/domains/${displaced.id}`,
  });

  if (sent) {
    console.info(
      `[takeover-notice] sent to ${to} for claim ${displaced.id}, taken over at ${winner.tookOverAt.toISOString()}`,
    );
  }
}
