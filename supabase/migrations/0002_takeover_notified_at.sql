-- Records that the displaced holder was emailed about a takeover. Claiming the
-- notification is a conditional update on this column, so a retried or
-- double-clicked verification sends at most one notice per takeover.
alter table public.domain_claims
  add column if not exists takeover_notified_at timestamptz;

comment on column public.domain_claims.takeover_notified_at is
  'When the takeover notice was claimed for sending. Null means unsent; set once, never cleared. No index: the lookup filters on normalized_domain, which is already indexed.';

-- The Data API caches the column list; reload so writes to the new column work.
notify pgrst, 'reload schema';
