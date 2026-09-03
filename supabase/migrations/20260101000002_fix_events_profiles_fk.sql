-- events.user_id referenced auth.users(id) directly, which gives PostgREST
-- no direct FK path to embed profiles(telegram_chat_id) as a to-one
-- relation in send-notifications' query - it silently resolved to an
-- empty array instead, so every notification got skipped forever.
-- profiles.id is already 1:1 with auth.users.id, so repointing at
-- profiles(id) is safe and fixes the embed.
alter table public.events drop constraint if exists events_user_id_fkey;
alter table public.events
  add constraint events_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;
