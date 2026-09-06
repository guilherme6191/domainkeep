const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** A malformed id is indistinguishable from someone else's id: both are 404. */
export function isClaimId(value: string): boolean {
  return UUID.test(value);
}
