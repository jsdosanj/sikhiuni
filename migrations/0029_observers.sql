-- C13 observers (plan Part C, Phase 4). A parent, guardian or mentor sees a learner's progress,
-- read-only, only after the learner gives them a single-use invite code; the learner can remove
-- them at any time. functions/api/observers.js also creates these on first use; keep both identical.
-- Reversible: both tables are new and nothing references them:
--   DROP TABLE observer_links; DROP TABLE observer_invites;
CREATE TABLE IF NOT EXISTS observer_links (learner_id TEXT NOT NULL, observer_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (learner_id, observer_id));
CREATE INDEX IF NOT EXISTS idx_observer_links_observer ON observer_links(observer_id);
CREATE TABLE IF NOT EXISTS observer_invites (code_hash TEXT PRIMARY KEY, learner_id TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
