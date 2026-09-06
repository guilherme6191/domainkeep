-- One table, no `status` column: every state the product renders is derived
-- from the durable facts below, so nothing can drift out of sync.

create extension if not exists pgcrypto;

-- Both predicates matter: a superseded row keeps its historical verified_at,
-- so an index on verified_at alone would block the takeover it exists to permit.
create or replace function is_currently_verified(
  verified_at timestamptz,
  superseded_at timestamptz
) returns boolean
language sql
immutable
as $$
  select verified_at is not null and superseded_at is null;
$$;

create table if not exists domain_claims (
  id uuid primary key default gen_random_uuid(),
  normalized_domain text not null,
  owner_id text not null,
  verification_token text not null,
  token_expires_at timestamptz not null,
  verified_at timestamptz,
  superseded_at timestamptz,
  -- Set on the winner when its proof displaced another account. A timestamp,
  -- not a reference, so it never identifies anyone.
  took_over_at timestamptz,
  last_check_result text,
  last_check_at timestamptz,
  last_check_observed_values text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Many accounts may hold pending claims for one domain; the partial index
  -- below allows only one verified.
  constraint domain_claims_owner_domain_key
    unique (owner_id, normalized_domain),

  constraint domain_claims_superseded_implies_verified
    check (superseded_at is null or verified_at is not null),

  constraint domain_claims_takeover_implies_verified
    check (took_over_at is null or verified_at is not null),

  constraint domain_claims_takeover_excludes_superseded
    check (took_over_at is null or superseded_at is null),

  constraint domain_claims_last_check_shape
    check (
      (last_check_result is null and last_check_at is null)
      or (last_check_result is not null and last_check_at is not null)
    ),

  constraint domain_claims_last_check_result_valid
    check (
      last_check_result is null
      or last_check_result in (
        'record_not_found',
        'value_mismatch',
        'temporary_dns_error'
      )
    )
);

-- Rejects any concurrent transaction that would leave two verified holders.
create unique index if not exists one_active_claim_per_domain
  on domain_claims (normalized_domain)
  where is_currently_verified(verified_at, superseded_at);

create index if not exists domain_claims_owner_created_idx
  on domain_claims (owner_id, created_at desc);

create index if not exists domain_claims_normalized_domain_idx
  on domain_claims (normalized_domain);

-- Reads carry the caller's Clerk token: `authenticated` may select only, and
-- only its own rows (owner_id is the token's `sub`). Writes come solely from the
-- backend as `service_role`, which bypasses row-level security, so the route
-- handlers filter every write by owner themselves. The `(select ...)` wrapper
-- lets the planner evaluate the predicate once per query.
--
-- Supabase's default privileges already give `service_role` every right on
-- objects the `postgres` user creates, which is the user `DIRECT_URL` connects
-- as. The explicit grants to it below add nothing on that path; they exist so
-- this file states its own access model and holds if it is ever applied as a
-- different role or on a plain Postgres.
alter table domain_claims enable row level security;

revoke all on table domain_claims from anon, authenticated;
grant select on table domain_claims to authenticated;
grant select, insert, update, delete on table domain_claims to service_role;

drop policy if exists domain_claims_select_own on domain_claims;
create policy domain_claims_select_own on domain_claims
  for select to authenticated
  using (owner_id = (select auth.jwt() ->> 'sub'));

-- Reassignment, in one transaction. Called by the backend after a DNS lookup
-- matched; it re-checks token and expiry under the row lock because either may
-- have changed while the lookup was in flight. Only the previous verified
-- holder is touched; other accounts' pending claims keep their tokens. No
-- `security definer`: the calling role already bypasses row-level security.
create or replace function verify_domain_claim(
  p_claim_id uuid,
  p_owner_id text,
  p_token text
) returns public.domain_claims
language plpgsql
set search_path = ''
as $$
declare
  claim public.domain_claims;
  displaced_count integer;
begin
  select * into claim
    from public.domain_claims
   where id = p_claim_id
     and owner_id = p_owner_id
     for update;

  if not found then
    raise exception 'claim not found' using errcode = 'DK404';
  end if;

  -- Idempotent: a retry must not move the takeover timestamp.
  if public.is_currently_verified(claim.verified_at, claim.superseded_at) then
    return claim;
  end if;

  if claim.verification_token is distinct from p_token
     or claim.token_expires_at <= now() then
    raise exception 'challenge no longer active' using errcode = 'DK410';
  end if;

  -- Kill the loser's token in the same step, so its leftover TXT record cannot
  -- take the domain back without a new challenge.
  update public.domain_claims
     set superseded_at = now(),
         took_over_at = null,
         token_expires_at = now(),
         updated_at = now()
   where normalized_domain = claim.normalized_domain
     and id <> claim.id
     and public.is_currently_verified(verified_at, superseded_at);

  get diagnostics displaced_count = row_count;

  update public.domain_claims
     set verified_at = now(),
         superseded_at = null,
         took_over_at = case when displaced_count > 0 then now() else null end,
         last_check_result = null,
         last_check_at = null,
         last_check_observed_values = null,
         updated_at = now()
   where id = claim.id
  returning * into claim;

  return claim;
end;
$$;

revoke execute on function verify_domain_claim(uuid, text, text)
  from public, anon, authenticated;
grant execute on function verify_domain_claim(uuid, text, text)
  to service_role;

-- The Data API caches the schema; reload so the function is callable.
notify pgrst, 'reload schema';
