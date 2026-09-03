-- telegram_pending_deletes is only ever read/written by edge functions
-- using the service role key (which bypasses RLS regardless). Enabling
-- RLS with no policies here simply blocks the anon/authenticated roles
-- from reading or writing it via the public REST API - it should never
-- have been reachable that way, since it's internal bookkeeping, not
-- user-facing data.
alter table public.telegram_pending_deletes enable row level security;
