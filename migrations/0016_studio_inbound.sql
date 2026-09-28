-- Migration 0016: Sikhi Studio publish protocol, v1 — idempotency + mapping
-- table for signed course publications from sikhi.io (functions/api/
-- studio-publish.js). One row per publicationId; (seq, content_sha256) is
-- the idempotency key the protocol's retry/replay rules rely on.
-- Run once: wrangler d1 execute sikh-university [--remote] --file=./migrations/0016_studio_inbound.sql
CREATE TABLE IF NOT EXISTS studio_inbound (
  publication_id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL, org_name TEXT,
  item_id TEXT, draft_id TEXT, course_id TEXT,
  seq INTEGER NOT NULL, revision INTEGER, content_sha256 TEXT,
  state TEXT NOT NULL DEFAULT 'active', -- active|withdrawn
  last_status TEXT,
  received_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
