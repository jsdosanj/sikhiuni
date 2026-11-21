-- C14 live sessions + attendance (plan Part C, Phase 4; approved 2026-11-11). No video is hosted:
-- a session links an external meeting. functions/api/live-sessions.js also creates these on first use.
-- Reversible: both tables are new and nothing references them:
--   DROP TABLE live_sessions; DROP TABLE attendance;
CREATE TABLE IF NOT EXISTS live_sessions (
  id TEXT PRIMARY KEY, course_id TEXT NOT NULL, title TEXT NOT NULL, starts_at INTEGER NOT NULL, duration_min INTEGER NOT NULL,
  join_url TEXT NOT NULL, notes TEXT, created_by TEXT, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_live_sessions_course ON live_sessions(course_id, starts_at);
CREATE TABLE IF NOT EXISTS attendance (session_id TEXT NOT NULL, user_id TEXT NOT NULL, status TEXT NOT NULL, marked_by TEXT, marked_at INTEGER NOT NULL, PRIMARY KEY (session_id, user_id));
