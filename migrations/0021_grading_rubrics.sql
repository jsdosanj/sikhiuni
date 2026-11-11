-- C4 grading + rubrics (plan Part C, Phase 2; approved 2026-11-11).
-- functions/api/rubrics.js also creates these on first use; keep both identical.
-- Reversible: all four tables are new and nothing references them:
--   DROP TABLE rubrics; DROP TABLE assignment_rubrics; DROP TABLE submission_grading; DROP TABLE grading_comments;
-- submissions.grade stays the grade of record; submission_grading only holds how it was reached.
CREATE TABLE IF NOT EXISTS rubrics (
  id TEXT PRIMARY KEY, course_id TEXT NOT NULL, title TEXT NOT NULL, criteria TEXT NOT NULL,
  created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rubrics_course ON rubrics(course_id);
CREATE TABLE IF NOT EXISTS assignment_rubrics (assignment_id TEXT PRIMARY KEY, rubric_id TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS submission_grading (
  submission_id TEXT PRIMARY KEY, rubric_id TEXT, rubric_scores TEXT,
  raw_grade INTEGER, penalty_pct INTEGER NOT NULL DEFAULT 0, graded_by TEXT, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS grading_comments (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, text TEXT NOT NULL, created_at INTEGER NOT NULL);
