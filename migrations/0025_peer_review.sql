-- C9 peer review (plan Part C, Phase 3; approved 2026-11-11). Feedback only: grades unchanged.
-- functions/api/peer-reviews.js also creates these on first use; keep both identical.
-- Reversible: both tables are new and nothing references them:
--   DROP TABLE peer_review_settings; DROP TABLE peer_reviews;
CREATE TABLE IF NOT EXISTS peer_review_settings (
  assignment_id TEXT PRIMARY KEY, course_id TEXT NOT NULL, reviews_per_learner INTEGER NOT NULL,
  anonymous INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'open', opened_at INTEGER NOT NULL, updated_by TEXT
);
CREATE TABLE IF NOT EXISTS peer_reviews (
  id TEXT PRIMARY KEY, assignment_id TEXT NOT NULL, course_id TEXT NOT NULL, reviewer_id TEXT NOT NULL, submission_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'assigned', rubric_scores TEXT, comment TEXT, hidden INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, submitted_at INTEGER, UNIQUE (reviewer_id, submission_id)
);
CREATE INDEX IF NOT EXISTS idx_peer_reviews_assignment ON peer_reviews(assignment_id);
