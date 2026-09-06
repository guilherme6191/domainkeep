/**
 * Absolute base for links we email out. Configuration comes first on purpose:
 * the only request that triggers a takeover notice belongs to the new holder,
 * so trusting its `Origin` would let them aim the previous holder's "recover
 * your domain" link at a host they control. The request is the last resort, and
 * in practice only local development gets there.
 */
export function appOrigin(request: Request): string {
  // Falsy, not nullish: an empty variable is unset, not a configured origin.
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const configured =
    process.env.NEXT_PUBLIC_APP_URL || (vercel && `https://${vercel}`);
  return (configured || new URL(request.url).origin).replace(/\/$/, "");
}
