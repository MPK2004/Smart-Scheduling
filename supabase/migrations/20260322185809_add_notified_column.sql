-- Add 'notified' column to events table
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS notified BOOLEAN DEFAULT false;

-- Create pg_cron extension if not exists
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Cron scheduling moved to 20260101000001_schedule_notifications.sql
-- (this file used to hardcode the project URL here, which broke replay
-- against a different project).
