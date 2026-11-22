-- C16 course import/export (plan Part C, Phase 4). Records the rights basis of every import into a
-- course (own material, a Creative Commons licence with attribution, or written permission), as the
-- licensing register requires. functions/api/course-package.js also creates it on first use.
-- Reversible: the table is new and nothing references it:
--   DROP TABLE course_imports;
CREATE TABLE IF NOT EXISTS course_imports (id TEXT PRIMARY KEY, course_id TEXT NOT NULL, imported_by TEXT, imported_at INTEGER NOT NULL, source TEXT, basis TEXT NOT NULL, licence TEXT, attribution TEXT, permission_from TEXT, permission_ref TEXT, ai_created INTEGER NOT NULL DEFAULT 0, counts TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_course_imports_course ON course_imports(course_id);
