-- C17 interactive activities (plan Part C, Phase 4): H5P content hosted on h5p.com / h5p.org,
-- shown in a sandboxed frame on the course tools page. Nothing is rehosted; activities start as
-- drafts. functions/api/embeds.js also creates it on first use.
-- Reversible: the table is new and nothing references it:
--   DROP TABLE course_embeds;
CREATE TABLE IF NOT EXISTS course_embeds (id TEXT PRIMARY KEY, course_id TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, src TEXT NOT NULL, attribution TEXT, status TEXT NOT NULL DEFAULT 'draft', created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_course_embeds_course ON course_embeds(course_id);
