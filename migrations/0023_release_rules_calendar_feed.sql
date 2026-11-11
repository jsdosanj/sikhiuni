-- C3 conditional release for assignments/polls, and C1's private iCal feed
-- (plan Part C, Phase 2; approved 2026-11-11). Handlers also create these on first use.
-- Reversible: both tables are new and nothing references them:
--   DROP TABLE release_rules; DROP TABLE calendar_feeds;
CREATE TABLE IF NOT EXISTS release_rules (
  item_type TEXT NOT NULL, item_id TEXT NOT NULL, course_id TEXT NOT NULL, min_lessons INTEGER,
  require_quiz_pass INTEGER NOT NULL DEFAULT 0, not_before INTEGER, updated_by TEXT, updated_at INTEGER NOT NULL,
  PRIMARY KEY (item_type, item_id)
);
-- The feed token is a bearer secret: only its SHA-256 is stored.
CREATE TABLE IF NOT EXISTS calendar_feeds (user_id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL, last_used_at INTEGER);
