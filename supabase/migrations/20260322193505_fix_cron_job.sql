-- Historical fix: dropped the old cron job that failed due to dynamic
-- setting evaluation. Superseded by 20260101000001_schedule_notifications.sql,
-- which is idempotent (unschedule-then-schedule) so this file is now a no-op
-- on a fresh project.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-notifications-every-minute') THEN
    PERFORM cron.unschedule('process-notifications-every-minute');
  END IF;
END $$;
