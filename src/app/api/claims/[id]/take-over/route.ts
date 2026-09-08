import { runVerification } from "@/lib/verification";

type Context = { params: Promise<{ id: string }> };

/**
 * The user's answer to the takeover confirmation. It runs its own DNS lookup:
 * the held state on the row is a record of the last check, not a permit, so
 * control is proved again in the request that acts on it.
 *
 * On a domain nobody else holds this is an ordinary verification. The guards
 * are the same as `/verify`'s, so a stale click on an expired or already
 * verified claim answers with the truth rather than an error.
 */
export async function POST(request: Request, { params }: Context) {
  const { id } = await params;
  return runVerification(request, id, { allowTakeover: true });
}
