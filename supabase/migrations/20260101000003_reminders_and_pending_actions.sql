-- Advance reminder stages (1 and 2 days before an event), in addition to
-- the existing at-time "notified" flag.
alter table public.events add column if not exists notified_1d boolean default false;
alter table public.events add column if not exists notified_2d boolean default false;

create index if not exists idx_events_pending_1d on public.events (start_date) where notified_1d = false;
create index if not exists idx_events_pending_2d on public.events (start_date) where notified_2d = false;

-- Holds one in-flight delete/update the user is being asked to confirm via
-- inline buttons, e.g. {"type":"delete","event_id":"..."} or
-- {"type":"update","event_id":"...","data":{...}}. Cleared once confirmed
-- or cancelled.
alter table public.profiles add column if not exists pending_action text default null;
