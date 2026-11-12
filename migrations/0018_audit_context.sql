-- Audit-log context, structure and tamper evidence (plan Part A, approved 2026-11-11).
-- functions/api/_audit.js ensureAuditSchema() applies the same change in place on first use
-- (each ADD COLUMN is skipped if the column already exists), so this file is the record.
-- Reversible: SQLite >= 3.35 (D1) supports ALTER TABLE events DROP COLUMN <name> for each
-- column below; the app tolerates their absence only for reads made before they exist.
ALTER TABLE events ADD COLUMN ip TEXT;              -- erased after 90 days (pruneAudit)
ALTER TABLE events ADD COLUMN country TEXT;         -- erased after 90 days
ALTER TABLE events ADD COLUMN ua TEXT;              -- erased after 90 days
ALTER TABLE events ADD COLUMN session_hash TEXT;    -- SHA-256 prefix of the session id, never the id
ALTER TABLE events ADD COLUMN ray TEXT;             -- cf-ray request id
ALTER TABLE events ADD COLUMN subject_user_id TEXT; -- the user the event is ABOUT
ALTER TABLE events ADD COLUMN target_type TEXT;
ALTER TABLE events ADD COLUMN outcome TEXT;         -- ok | fail | denied
ALTER TABLE events ADD COLUMN prev_hash TEXT;
ALTER TABLE events ADD COLUMN hash TEXT;
CREATE INDEX IF NOT EXISTS idx_events_user_ts ON events(user_id, ts);
CREATE INDEX IF NOT EXISTS idx_events_subject_ts ON events(subject_user_id, ts);
CREATE INDEX IF NOT EXISTS idx_events_action_ts ON events(action, ts);
CREATE INDEX IF NOT EXISTS idx_events_hash ON events(hash);
