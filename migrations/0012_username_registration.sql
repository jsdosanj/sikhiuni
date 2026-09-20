-- 0012 — username + pending registrations (2026-09-06)
--
-- Part of the three-site auth standardization (sikhi.io / sikhiuni.com /
-- punjabiuni.com share one registration shape). See sikhi.io's
-- .cc/plan-auth-standardization-and-e2e-fusion.md.
--
-- Two changes:
--   1. users.username — nullable. Every existing account keeps NULL and is
--      never blocked by it; sign-in by email is unchanged. The UNIQUE index
--      is the real arbiter of the "two people register the same name at the
--      same moment" race, which no application-level check can win.
--      SQLite treats NULLs as distinct in a UNIQUE index, so thousands of
--      NULL-username legacy rows coexist happily under it.
--   2. pending_registrations — a registration is a PENDING RECORD, not a
--      half-made user row. An account is only INSERTed once the emailed code
--      has been proven, so there is no such thing here as an unverified,
--      unusable account (which is the exact dead end this migration's
--      sikhi.io counterpart exists to fix).
--
-- D1/SQLite has no `ADD COLUMN IF NOT EXISTS`, so the ALTER below is a
-- ONE-SHOT: re-running this file will fail on that line (and only that line)
-- with "duplicate column name". That is this repo's existing, documented
-- convention — see the sessions.mfa_ok ALTERs in schema.sql. The commented
-- block appended to schema.sql is the operator record for live DBs.

ALTER TABLE users ADD COLUMN username TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);

CREATE TABLE IF NOT EXISTS pending_registrations (
  rsid       TEXT PRIMARY KEY,          -- random id, held only in an httpOnly cookie on the requesting browser
  email      TEXT NOT NULL,
  username   TEXT NOT NULL,
  code       TEXT NOT NULL,             -- 6 digits
  attempts   INTEGER NOT NULL DEFAULT 0,-- destroyed at 8, so the code space can't be walked
  marketing  INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL,          -- 15 minutes
  created_at INTEGER NOT NULL
);
-- register-start replaces any earlier pending row for the same email, so a
-- resend invalidates the previous code. That lookup is by email.
CREATE INDEX IF NOT EXISTS idx_pending_reg_email ON pending_registrations(email);
