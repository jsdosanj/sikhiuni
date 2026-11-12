-- C18 course forums + classmate direct messages (plan "Messaging design", approved 2026-11-11).
-- functions/api/_messaging.js and discussions.js also create these on first use; keep identical.
-- Reversible:
--   DROP TABLE course_messaging_settings; DROP TABLE course_mutes; DROP TABLE user_blocks;
--   DROP TABLE dm_conversations; DROP TABLE dm_messages; DROP TABLE dm_reports; DROP TABLE forum_subscriptions;
--   ALTER TABLE discussions DROP COLUMN category;   (SQLite >= 3.35, which D1 runs)
ALTER TABLE discussions ADD COLUMN category TEXT;
CREATE TABLE IF NOT EXISTS course_messaging_settings (
  course_id TEXT PRIMARY KEY, forums_enabled INTEGER NOT NULL DEFAULT 1, forum_locked INTEGER NOT NULL DEFAULT 0,
  dms_enabled INTEGER NOT NULL DEFAULT 1, dm_starters TEXT NOT NULL DEFAULT 'learners', teachers_read_dms INTEGER NOT NULL DEFAULT 0,
  filter_enabled INTEGER NOT NULL DEFAULT 1, updated_by TEXT, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS course_mutes (course_id TEXT NOT NULL, user_id TEXT NOT NULL, muted_by TEXT, created_at INTEGER NOT NULL, PRIMARY KEY (course_id, user_id));
CREATE TABLE IF NOT EXISTS user_blocks (blocker_id TEXT NOT NULL, blocked_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (blocker_id, blocked_id));
CREATE TABLE IF NOT EXISTS dm_conversations (
  id TEXT PRIMARY KEY, course_id TEXT NOT NULL, pair_key TEXT NOT NULL, requester_id TEXT NOT NULL, recipient_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL, decided_at INTEGER, last_message_at INTEGER NOT NULL,
  UNIQUE (course_id, pair_key)
);
CREATE INDEX IF NOT EXISTS idx_dm_conv_requester ON dm_conversations(requester_id);
CREATE INDEX IF NOT EXISTS idx_dm_conv_recipient ON dm_conversations(recipient_id);
CREATE TABLE IF NOT EXISTS dm_messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, sender_id TEXT NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL, hidden INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS idx_dm_messages_conv ON dm_messages(conversation_id, created_at);
CREATE TABLE IF NOT EXISTS dm_reports (
  id TEXT PRIMARY KEY, message_id TEXT NOT NULL, conversation_id TEXT NOT NULL, course_id TEXT NOT NULL, reporter_id TEXT NOT NULL,
  reason TEXT, status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL, resolved_by TEXT, resolved_at INTEGER, UNIQUE (message_id, reporter_id)
);
CREATE TABLE IF NOT EXISTS forum_subscriptions (user_id TEXT NOT NULL, thread_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (user_id, thread_id));
