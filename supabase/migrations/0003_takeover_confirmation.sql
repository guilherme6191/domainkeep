-- Verifying proves control; it no longer moves a domain by itself. A check that
-- matches while another account holds the domain records `held_by_another` and
-- stops there. The transfer runs only when the caller asks for it explicitly,
-- with a fresh proof.

alter table domain_claims
  drop constraint if exists domain_claims_last_check_result_valid;

alter table domain_claims
  add constraint domain_claims_last_check_result_valid
    check (
      last_check_result is null
      or last_check_result in (
        'record_not_found',
        'value_mismatch',
        'temporary_dns_error',
        'held_by_another'
      )
    );

-- 0001 recreates the three-argument function on every run, so drop it on every
-- run too: two overloads would make the Data API's RPC resolution ambiguous.
drop function if exists verify_domain_claim(uuid, text, text);

-- Reassignment, in one transaction. Called by the backend after a DNS lookup
-- matched; it re-checks token and expiry under the row lock because either may
-- have changed while the lookup was in flight. Only the previous verified
-- holder is touched; other accounts' pending claims keep their tokens. No
-- `security definer`: the calling role already bypasses row-level security.
--
-- `p_allow_takeover` is the user's answer to the confirmation, not a hint: when
-- it is false the supersede update never runs at all. Checking for a holder and
-- then running the transfer would displace an account that verified in between.
create or replace function verify_domain_claim(
  p_claim_id uuid,
  p_owner_id text,
  p_token text,
  p_allow_takeover boolean
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

  if p_allow_takeover then
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
  else
    -- The proof is good but the domain is someone else's; record that outcome
    -- and leave both rows alone. The token stays valid, so the caller can come
    -- back and confirm without proving control again from scratch.
    if exists (
      select 1
        from public.domain_claims
       where normalized_domain = claim.normalized_domain
         and id <> claim.id
         and public.is_currently_verified(verified_at, superseded_at)
    ) then
      update public.domain_claims
         set last_check_result = 'held_by_another',
             last_check_at = now(),
             last_check_observed_values = null,
             updated_at = now()
       where id = claim.id
      returning * into claim;

      return claim;
    end if;

    -- Nobody holds it: an ordinary first verification, displacing no one. A
    -- holder that commits between the check above and the update below hits
    -- `one_active_claim_per_domain`, and the caller is told to reload.
    displaced_count := 0;
  end if;

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

revoke execute on function verify_domain_claim(uuid, text, text, boolean)
  from public, anon, authenticated;
grant execute on function verify_domain_claim(uuid, text, text, boolean)
  to service_role;

-- The Data API caches the schema; reload so the function is callable.
notify pgrst, 'reload schema';
