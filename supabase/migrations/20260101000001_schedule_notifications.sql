-- Schedules the every-minute notification cron job for project gtoqpgljntwqcqrbqhtf.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-notifications-every-minute') THEN
    PERFORM cron.unschedule('process-notifications-every-minute');
  END IF;
END $$;

SELECT cron.schedule(
  'process-notifications-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url:='https://gtoqpgljntwqcqrbqhtf.supabase.co/functions/v1/send-notifications',
    headers:='{"Content-Type": "application/json"}',
    body:='{}'
  )
  $$
);
