-- LMS Phase 1 (plan Part C, approved 2026-11-11): C7 late policy / extensions /
-- accommodations, C10 reflective journal, C11 course glossary, C12 polls/surveys/evaluations.
-- C1 (calendar) reads these tables and adds none.
-- Every handler also creates its tables on first use (CREATE TABLE IF NOT EXISTS), so
-- this file and the handler DDL must stay identical.
-- Reversible: all tables are new and nothing else references them:
--   DROP TABLE assignment_policies; DROP TABLE assignment_extensions; DROP TABLE course_accommodations;
--   DROP TABLE journal_entries; DROP TABLE glossary_terms;
--   DROP TABLE polls; DROP TABLE poll_participants; DROP TABLE poll_responses;

CREATE TABLE IF NOT EXISTS assignment_policies (
  assignment_id TEXT PRIMARY KEY, late_penalty_per_day INTEGER NOT NULL DEFAULT 0, max_late_days INTEGER, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS assignment_extensions (
  assignment_id TEXT NOT NULL, user_id TEXT NOT NULL, due_at INTEGER NOT NULL, reason TEXT, created_by TEXT, created_at INTEGER NOT NULL,
  PRIMARY KEY (assignment_id, user_id)
);
CREATE TABLE IF NOT EXISTS course_accommodations (
  course_id TEXT NOT NULL, user_id TEXT NOT NULL, extra_time_pct INTEGER NOT NULL DEFAULT 0, note TEXT, created_by TEXT, updated_at INTEGER NOT NULL,
  PRIMARY KEY (course_id, user_id)
);

-- Private by default: only the author reads an entry unless shared=1 (then teachers of that course).
CREATE TABLE IF NOT EXISTS journal_entries (
  id TEXT PRIMARY KEY, course_id TEXT NOT NULL, user_id TEXT NOT NULL, body TEXT NOT NULL,
  shared INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_journal_course_user ON journal_entries(course_id, user_id);

CREATE TABLE IF NOT EXISTS glossary_terms (
  id TEXT PRIMARY KEY, course_id TEXT NOT NULL, term TEXT NOT NULL, term_gur TEXT, definition TEXT NOT NULL,
  created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_glossary_course ON glossary_terms(course_id);

-- Anonymous polls store poll_responses.user_id = NULL; poll_participants (no answers,
-- no timestamp) is the only link between a person and a poll, and only says they took part.
CREATE TABLE IF NOT EXISTS polls (
  id TEXT PRIMARY KEY, course_id TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL,
  anonymous INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'draft', closes_at INTEGER, questions TEXT NOT NULL,
  created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_polls_course ON polls(course_id, status);
CREATE TABLE IF NOT EXISTS poll_participants (poll_id TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY (poll_id, user_id));
CREATE TABLE IF NOT EXISTS poll_responses (id TEXT PRIMARY KEY, poll_id TEXT NOT NULL, user_id TEXT, answers TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_poll_responses_poll ON poll_responses(poll_id);
