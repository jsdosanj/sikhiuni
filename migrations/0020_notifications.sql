-- C5 notification centre (plan Part C, Phase 2; approved 2026-11-11).
-- The handler (functions/api/_notify.js) also creates these on first use; keep both identical.
-- Retention: read notifications 90 days, all 180 days (daily cron).
-- Reversible: both tables are new and nothing references them:
--   DROP TABLE notifications; DROP TABLE notification_prefs;
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL, course_id TEXT,
  title TEXT NOT NULL, body TEXT, url TEXT, dedupe TEXT, created_at INTEGER NOT NULL, read_at INTEGER, emailed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedupe ON notifications(user_id, dedupe);
CREATE TABLE IF NOT EXISTS notification_prefs (user_id TEXT PRIMARY KEY, prefs TEXT NOT NULL, updated_at INTEGER NOT NULL);
