-- Drop the old cron job that failed due to dynamic setting evaluation
SELECT cron.unschedule('process-notifications-every-minute');

-- Recreate with a static header (no auth needed since the function has --no-verify-jwt)
SELECT cron.schedule(
    'process-notifications-every-minute',
    '* * * * *',
    $$
    SELECT net.http_post(
        url:='https://pdcimvqzzpprkwuqbxnr.supabase.co/functions/v1/send-notifications',
        headers:='{"Content-Type": "application/json"}',
        body:='{}'
    )
    $$
);
