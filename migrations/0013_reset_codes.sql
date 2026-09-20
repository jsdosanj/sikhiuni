-- 0013 — password reset by 6-digit code + same-browser binding (2026-09-06)
--
-- Converges this site's forgot-password onto the shape sikhi.io and
-- punjabiuni.com already use. See sikhi.io's
-- .cc/plan-auth-standardization-and-e2e-fusion.md (Decision 8).
--
-- WHY, since the link flow "worked": a reset LINK is a bearer credential. It
-- signs in whatever device opens the email — very often the phone rather than
-- the desktop browser the user is actually locked out of — and anyone who can
-- read the mailbox (a forwarded message, a synced client, an intercepted
-- inbox) holds a working password change with nothing else needed. A code is
-- useless on its own: it only completes the flow when submitted from the SAME
-- BROWSER that asked for it, proven by the httpOnly psid cookie minted at
-- request time. That argument was already accepted for the other two sites;
-- this makes the third agree, and means there is one reset path to reason
-- about (and to E2E test) rather than two.
--
-- password_reset_tokens is deliberately LEFT IN PLACE and still readable:
-- reset-password.js keeps a token branch for the grace window so links
-- already in flight when this deploys still work out their remaining hour.
-- No destructive DDL against a live database.

CREATE TABLE IF NOT EXISTS password_reset_codes (
  psid       TEXT PRIMARY KEY,           -- random id, held only in an httpOnly cookie on the requesting browser
  user_id    TEXT NOT NULL,
  code       TEXT NOT NULL,              -- 6 digits
  attempts   INTEGER NOT NULL DEFAULT 0, -- destroyed at 8, so the code space can't be walked
  verified   INTEGER NOT NULL DEFAULT 0, -- 1 once the code is confirmed and a new password is awaited
  expires_at INTEGER NOT NULL,           -- 15 minutes
  created_at INTEGER NOT NULL
);
-- forgot-password replaces any earlier outstanding code for the same user, so
-- a re-request invalidates the previous one. That lookup is by user_id.
CREATE INDEX IF NOT EXISTS idx_pw_reset_codes_user ON password_reset_codes(user_id);
