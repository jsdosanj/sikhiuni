-- Migration 0009: indexes for hot paths that were missing them.
-- Every gated-course content read and quiz submission joins course_teachers/
-- cohort_members/cohorts/course_drafts by columns that had no index, forcing a
-- full table scan on each request. Unlike migration 0008 (a one-shot ALTER
-- TABLE), these are CREATE INDEX IF NOT EXISTS — additive and idempotent, safe
-- to re-run, and also mirrored into schema.sql so fresh setups get them.
-- Run once: wrangler d1 execute sikh-university [--remote] --file=./migrations/0009_perf_indexes.sql
CREATE INDEX IF NOT EXISTS idx_course_teachers_user ON course_teachers(user_id);
CREATE INDEX IF NOT EXISTS idx_cohort_members_user ON cohort_members(user_id);
CREATE INDEX IF NOT EXISTS idx_cohorts_course ON cohorts(course_id);
CREATE INDEX IF NOT EXISTS idx_drafts_course ON course_drafts(course_id, status, updated_at);
