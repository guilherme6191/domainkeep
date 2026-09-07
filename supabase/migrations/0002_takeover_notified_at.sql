-- Records a takeover notice claimed for sending, not confirmed delivery.
-- A conditional update suppresses duplicate attempts; see the specification
-- for the timestamp assumptions. A later loss can update the marker again.
alter table public.domain_claims
  add column if not exists takeover_notified_at timestamptz;

comment on column public.domain_claims.takeover_notified_at is
  'Latest takeover notice claimed for sending, not confirmed delivery. Updated on later losses, never cleared. No index: the lookup filters on the indexed normalized_domain.';

-- The Data API caches the column list; reload so writes to the new column work.
notify pgrst, 'reload schema';
