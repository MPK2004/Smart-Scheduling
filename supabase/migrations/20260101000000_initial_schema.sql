-- Baseline schema reconstruction.
-- The original schema was created by hand in the Supabase dashboard and was
-- never captured as a migration. This file rebuilds it from the app's
-- generated types, the README ER diagram, and the later ALTER migrations,
-- so a fresh project can be bootstrapped from `supabase db push` alone.

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  title text not null,
  description text,
  start_date timestamptz not null,
  end_date timestamptz,
  category text,
  recurrence text,
  notified boolean default false,
  user_id uuid references auth.users(id) on delete cascade
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  username text not null unique,
  telegram_chat_id bigint unique,
  link_code text,
  last_event_id uuid references public.events(id),
  last_bot_response text default '',
  conversation_history text default '[]'
);

-- Query pattern used by send-notifications every minute: events that are
-- due and not yet notified. Without this index it's a full table scan on
-- every cron tick, which is what saturated the old project's disk IO.
create index if not exists idx_events_pending_notifications
  on public.events (start_date)
  where notified = false;

create index if not exists idx_events_user_id on public.events (user_id);

-- Auto-create a profile row when a new auth user signs up (Signup.tsx sends
-- `username` as auth metadata and relies on this trigger to persist it).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, coalesce(new.raw_user_meta_data->>'username', new.email));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Row Level Security: each user can only see/modify their own rows.
-- Edge functions use the service_role key and bypass RLS entirely.
alter table public.events enable row level security;
alter table public.profiles enable row level security;

drop policy if exists "Users manage their own events" on public.events;
create policy "Users manage their own events"
  on public.events for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users manage their own profile" on public.profiles;
create policy "Users manage their own profile"
  on public.profiles for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- pg_cron/pg_net are needed for the notification cron job, scheduled
-- separately (see supabase/migrations/20260101000001_schedule_notifications.sql)
-- once the project's real URL is known.
create extension if not exists pg_cron;
create extension if not exists pg_net;
