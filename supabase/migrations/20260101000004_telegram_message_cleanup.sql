-- Every bot message the Telegram bot sends gets a row here with a
-- delete_at timestamp; send-notifications (already ticking every minute)
-- sweeps due rows and deletes the corresponding Telegram message, keeping
-- the chat clean. Buttons that are tapped (confirm/cancel/delrequest)
-- delete their message immediately instead of waiting for this sweep.
create table if not exists public.telegram_pending_deletes (
  id bigserial primary key,
  chat_id bigint not null,
  message_id bigint not null,
  delete_at timestamptz not null default (now() + interval '5 minutes')
);

create index if not exists idx_telegram_pending_deletes_due on public.telegram_pending_deletes (delete_at);

-- Internal bookkeeping only, touched exclusively by edge functions via the
-- service role key - never meant to be reachable through the public REST
-- API, so lock it down with no anon/authenticated policies.
alter table public.telegram_pending_deletes enable row level security;
