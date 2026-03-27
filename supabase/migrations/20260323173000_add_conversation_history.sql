ALTER TABLE profiles ADD COLUMN IF NOT EXISTS conversation_history TEXT DEFAULT '[]';
