-- C15 completion badges (plan Part C, Phase 4; approved 2026-11-11). A badge records participation;
-- it is never a credential, qualification or credit, and every surface carries the no-credit notice.
-- functions/api/badges.js also creates these on first use; keep both identical.
-- Reversible: both tables are new and nothing references them:
--   DROP TABLE badges; DROP TABLE badge_awards;
CREATE TABLE IF NOT EXISTS badges (id TEXT PRIMARY KEY, course_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT, criteria TEXT NOT NULL, created_by TEXT, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_badges_course ON badges(course_id);
CREATE TABLE IF NOT EXISTS badge_awards (id TEXT PRIMARY KEY, badge_id TEXT NOT NULL, user_id TEXT NOT NULL, awarded_at INTEGER NOT NULL, awarded_by TEXT, how TEXT NOT NULL, UNIQUE (badge_id, user_id));
