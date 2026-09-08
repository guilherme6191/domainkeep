import { runVerification } from "@/lib/verification";

type Context = { params: Promise<{ id: string }> };

/**
 * Proves control, and nothing else. A matching proof on a domain another
 * account holds is reported as `held_by_another`; moving it takes a second,
 * explicit request to `/take-over`.
 */
export async function POST(request: Request, { params }: Context) {
  const { id } = await params;
  return runVerification(request, id, { allowTakeover: false });
}
