-- C8 groups within a course + group assignments (plan Part C, Phase 4; approved 2026-11-11).
-- functions/api/groups.js also creates these on first use; keep both identical.
-- Reversible: all four tables are new and nothing references them:
--   DROP TABLE course_groups; DROP TABLE group_members; DROP TABLE group_assignments; DROP TABLE group_posts;
CREATE TABLE IF NOT EXISTS course_groups (id TEXT PRIMARY KEY, course_id TEXT NOT NULL, name TEXT NOT NULL, created_by TEXT, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_course_groups_course ON course_groups(course_id);
-- One group per learner per course.
CREATE TABLE IF NOT EXISTS group_members (group_id TEXT NOT NULL, course_id TEXT NOT NULL, user_id TEXT NOT NULL, added_at INTEGER NOT NULL, PRIMARY KEY (group_id, user_id), UNIQUE (course_id, user_id));
CREATE TABLE IF NOT EXISTS group_assignments (assignment_id TEXT PRIMARY KEY, course_id TEXT NOT NULL, set_by TEXT, set_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS group_posts (id TEXT PRIMARY KEY, group_id TEXT NOT NULL, user_id TEXT NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_group_posts_group ON group_posts(group_id, created_at);
