ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_event_id UUID REFERENCES events(id);
