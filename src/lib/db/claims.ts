import "server-only";
import type { PostgrestError } from "@supabase/supabase-js";
import type { LastCheck, LastCheckResult, DomainClaim } from "@/lib/types";
import { db, dbAdmin } from "@/lib/db/client";

export interface ClaimRecord {
  claim: DomainClaim;
}

const TABLE = "domain_claims";

const COLUMNS = "*";

/** As the Data API returns it: timestamps are ISO strings. */
interface ClaimRow {
  id: string;
  normalized_domain: string;
  owner_id: string;
  verification_token: string;
  token_expires_at: string;
  verified_at: string | null;
  superseded_at: string | null;
  took_over_at: string | null;
  last_check_result: LastCheckResult | null;
  last_check_at: string | null;
  last_check_observed_values: string[] | null;
  created_at: string;
  updated_at: string;
}

function toLastCheck(row: ClaimRow): LastCheck | null {
  if (!row.last_check_result || !row.last_check_at) return null;

  if (row.last_check_result === "value_mismatch") {
    return {
      result: "value_mismatch",
      observedValues: row.last_check_observed_values ?? [],
      checkedAt: new Date(row.last_check_at),
    };
  }

  return {
    result: row.last_check_result,
    checkedAt: new Date(row.last_check_at),
  };
}

function toClaim(row: ClaimRow): DomainClaim {
  return {
    id: row.id,
    normalizedDomain: row.normalized_domain,
    ownerId: row.owner_id,
    verificationToken: row.verification_token,
    tokenExpiresAt: new Date(row.token_expires_at),
    verifiedAt: row.verified_at ? new Date(row.verified_at) : null,
    supersededAt: row.superseded_at ? new Date(row.superseded_at) : null,
    tookOverAt: row.took_over_at ? new Date(row.took_over_at) : null,
    lastCheck: toLastCheck(row),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function toRecord(row: ClaimRow): ClaimRecord {
  return {
    claim: toClaim(row),
  };
}

/** Keeps the SQLSTATE so callers can tell outcomes apart. */
export class DatabaseError extends Error {
  readonly code: string;

  constructor(error: PostgrestError) {
    super(error.message);
    this.code = error.code;
  }
}

type Result<T> =
  | { data: T; error: null }
  | { data: null; error: PostgrestError };

function unwrap<T>(result: Result<T>): T {
  if (result.error) throw new DatabaseError(result.error);
  return result.data;
}

export async function listClaims(ownerId: string): Promise<ClaimRecord[]> {
  const rows = unwrap(
    await db()
      .from(TABLE)
      .select(COLUMNS)
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: false })
      .returns<ClaimRow[]>(),
  );
  return rows.map(toRecord);
}

export async function getClaim(
  id: string,
  ownerId: string,
): Promise<ClaimRecord | null> {
  const row = unwrap(
    await db()
      .from(TABLE)
      .select(COLUMNS)
      .eq("id", id)
      .eq("owner_id", ownerId)
      .maybeSingle<ClaimRow>(),
  );
  return row ? toRecord(row) : null;
}

export async function findClaimByDomain(
  ownerId: string,
  normalizedDomain: string,
): Promise<ClaimRecord | null> {
  const row = unwrap(
    await db()
      .from(TABLE)
      .select(COLUMNS)
      .eq("owner_id", ownerId)
      .eq("normalized_domain", normalizedDomain)
      .maybeSingle<ClaimRow>(),
  );
  return row ? toRecord(row) : null;
}

// Writes run as service_role, which bypasses row-level security. The owner
// filter on each write below is the authorization; never drop it.
export async function insertClaim(input: {
  ownerId: string;
  normalizedDomain: string;
  token: string;
  tokenExpiresAt: Date;
}): Promise<ClaimRecord> {
  const row = unwrap(
    await dbAdmin()
      .from(TABLE)
      .insert({
        normalized_domain: input.normalizedDomain,
        owner_id: input.ownerId,
        verification_token: input.token,
        token_expires_at: input.tokenExpiresAt.toISOString(),
      })
      .select(COLUMNS)
      .single<ClaimRow>(),
  );
  return toRecord(row);
}

export async function updateClaimDomain(input: {
  id: string;
  ownerId: string;
  normalizedDomain: string;
  token: string;
  tokenExpiresAt: Date;
}): Promise<ClaimRecord | null> {
  const row = unwrap(
    await dbAdmin()
      .from(TABLE)
      .update({
        normalized_domain: input.normalizedDomain,
        verification_token: input.token,
        token_expires_at: input.tokenExpiresAt.toISOString(),
        last_check_result: null,
        last_check_at: null,
        last_check_observed_values: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.id)
      .eq("owner_id", input.ownerId)
      // Verification may have completed after the route's initial read.
      // Never move its proof or history to a different domain.
      .is("verified_at", null)
      .select(COLUMNS)
      .maybeSingle<ClaimRow>(),
  );
  return row ? toRecord(row) : null;
}

export async function replaceToken(input: {
  id: string;
  ownerId: string;
  token: string;
  tokenExpiresAt: Date;
}): Promise<ClaimRecord | null> {
  const row = unwrap(
    await dbAdmin()
      .from(TABLE)
      .update({
        verification_token: input.token,
        token_expires_at: input.tokenExpiresAt.toISOString(),
        last_check_result: null,
        last_check_at: null,
        last_check_observed_values: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.id)
      .eq("owner_id", input.ownerId)
      .select(COLUMNS)
      .maybeSingle<ClaimRow>(),
  );
  return row ? toRecord(row) : null;
}

export async function recordCheckFailure(input: {
  id: string;
  ownerId: string;
  expectedToken: string;
  result: LastCheckResult;
  observedValues: string[] | null;
  checkedAt: Date;
}): Promise<ClaimRecord | null> {
  const row = unwrap(
    await dbAdmin()
      .from(TABLE)
      .update({
        last_check_result: input.result,
        last_check_at: input.checkedAt.toISOString(),
        last_check_observed_values: input.observedValues,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.id)
      .eq("owner_id", input.ownerId)
      // The challenge may have been replaced or its domain edited while DNS
      // was in flight. Never attach token A's result to token B.
      .eq("verification_token", input.expectedToken)
      .select(COLUMNS)
      .maybeSingle<ClaimRow>(),
  );
  return row ? toRecord(row) : null;
}

/** Hard delete: the token dies with the row. */
export async function deleteClaim(id: string, ownerId: string): Promise<boolean> {
  const rows = unwrap(
    await dbAdmin()
      .from(TABLE)
      .delete()
      .eq("id", id)
      .eq("owner_id", ownerId)
      .select("id")
      .returns<{ id: string }[]>(),
  );
  return rows.length > 0;
}

/**
 * Claims the right to email the holder this takeover displaced, at most once.
 *
 * The transfer stamps the loser's `superseded_at` and the winner's
 * `took_over_at` with the same `now()` inside one transaction, so the displaced
 * row is the one at that exact instant with the domain but a different id. The
 * window is a millisecond wide rather than an equality because Postgres keeps
 * microseconds and `Date` truncates them: the stored value lies in
 * `[tookOverAt, tookOverAt + 1ms)`. A later takeover of the same domain would
 * match a plain `>=`, so the upper bound is load-bearing — do not drop it.
 *
 * Setting the column in the same statement that selects the row is what makes
 * this at-most-once: a concurrent request gets zero rows back and sends nothing.
 * The guard compares `takeover_notified_at` against this takeover's instant
 * rather than requiring null, because a claim can be lost, won back, and lost
 * again — a plain null check would notify only the first time. A notice already
 * claimed for *this* takeover was stamped after it, so it still blocks.
 */
export async function claimTakeoverNotification(input: {
  normalizedDomain: string;
  tookOverAt: Date;
  winnerId: string;
}): Promise<{ id: string; ownerId: string } | null> {
  const from = input.tookOverAt.toISOString();
  const to = new Date(input.tookOverAt.getTime() + 1).toISOString();

  const row = unwrap(
    await dbAdmin()
      .from(TABLE)
      .update({ takeover_notified_at: new Date().toISOString() })
      .eq("normalized_domain", input.normalizedDomain)
      .neq("id", input.winnerId)
      .gte("superseded_at", from)
      .lt("superseded_at", to)
      .or(
        `takeover_notified_at.is.null,takeover_notified_at.lt."${from}"`,
      )
      .select("id, owner_id")
      .maybeSingle<{ id: string; owner_id: string }>(),
  );
  return row ? { id: row.id, ownerId: row.owner_id } : null;
}

export class ClaimNotFoundError extends Error {}
export class ChallengeInactiveError extends Error {}
export class VerificationConflictError extends Error {}

/**
 * Runs the reassignment transaction in the database. Its custom SQLSTATEs let
 * the route tell outcomes apart without parsing messages.
 */
export async function verifyClaimAtomically(input: {
  id: string;
  ownerId: string;
  token: string;
}): Promise<ClaimRecord> {
  try {
    unwrap(
      await dbAdmin().rpc("verify_domain_claim", {
        p_claim_id: input.id,
        p_owner_id: input.ownerId,
        p_token: input.token,
      }),
    );
  } catch (error) {
    const code = error instanceof DatabaseError ? error.code : undefined;
    if (code === "DK404") throw new ClaimNotFoundError();
    if (code === "DK410") throw new ChallengeInactiveError();
    // The unique index rejected the transaction: another account verified first.
    if (code === "23505") throw new VerificationConflictError();
    throw error;
  }

  const record = await getClaim(input.id, input.ownerId);
  if (!record) throw new ClaimNotFoundError();
  return record;
}
