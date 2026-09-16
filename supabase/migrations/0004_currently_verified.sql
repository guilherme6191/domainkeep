-- The list is a to-do list: domains that still need something sit above the
-- ones that are done. Ordering has to agree across pages, so the split is a
-- stored column rather than a state derived per request. The expression
-- mirrors is_currently_verified(); it is inlined so the column carries no
-- dependency on a function the earlier migration re-creates on every run.

alter table domain_claims
  add column if not exists currently_verified boolean
  generated always as (verified_at is not null and superseded_at is null)
  stored;

-- Matches the list query's order, so the first page is an index read.
create index if not exists domain_claims_owner_pending_idx
  on domain_claims (owner_id, currently_verified, created_at desc, id);
