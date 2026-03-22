-- Add 'notified' column to events table
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS notified BOOLEAN DEFAULT false;

-- Create pg_cron extension if not exists
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule the send-notifications Edge Function to run every minute
-- Note: You'll need to manually configure the webhook destination securely 
-- using Supabase Dashboard or pg_net if executing directly via cron.
-- For now, we will rely on pg_net for triggering.

CREATE EXTENSION IF NOT EXISTS pg_net;

-- This cron job calls the Edge Function every 1 minute
SELECT cron.schedule(
    'process-notifications-every-minute',
    '* * * * *',
    $$
    SELECT net.http_post(
        url:='https://pdcimvqzzpprkwuqbxnr.supabase.co/functions/v1/send-notifications',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('request.env.anon_key', true) || '"}',
        body:='{}'
    )
    $$
);
