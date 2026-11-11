-- C2 richer quizzes: teacher-made course quizzes (plan Part C, Phase 3; approved 2026-11-11).
-- Separate from the existing course quiz (quiz.js / progress.passed_score), which is unchanged.
-- functions/api/lms-quizzes.js also creates these on first use; keep both identical.
-- Reversible: all three tables are new and nothing references them:
--   DROP TABLE lms_quizzes; DROP TABLE lms_quiz_questions; DROP TABLE lms_quiz_attempts;
CREATE TABLE IF NOT EXISTS lms_quizzes (
  id TEXT PRIMARY KEY, course_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT, status TEXT NOT NULL DEFAULT 'draft',
  time_limit_min INTEGER, max_attempts INTEGER, draw_count INTEGER, review TEXT NOT NULL DEFAULT 'score', pass_pct INTEGER,
  created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lms_quizzes_course ON lms_quizzes(course_id);
CREATE TABLE IF NOT EXISTS lms_quiz_questions (id TEXT PRIMARY KEY, quiz_id TEXT NOT NULL, position INTEGER NOT NULL, type TEXT NOT NULL, prompt TEXT NOT NULL, data TEXT NOT NULL, points INTEGER NOT NULL DEFAULT 1);
CREATE INDEX IF NOT EXISTS idx_lms_quiz_questions_quiz ON lms_quiz_questions(quiz_id, position);
-- Answer keys live only in lms_quiz_questions.data; attempts store this attempt's shuffles.
CREATE TABLE IF NOT EXISTS lms_quiz_attempts (
  id TEXT PRIMARY KEY, quiz_id TEXT NOT NULL, course_id TEXT NOT NULL, user_id TEXT NOT NULL, started_at INTEGER NOT NULL, deadline_at INTEGER,
  submitted_at INTEGER, question_ids TEXT NOT NULL, perms TEXT NOT NULL, answers TEXT, score REAL, max_score REAL, results TEXT, status TEXT NOT NULL DEFAULT 'in_progress'
);
CREATE INDEX IF NOT EXISTS idx_lms_quiz_attempts_user ON lms_quiz_attempts(quiz_id, user_id);
