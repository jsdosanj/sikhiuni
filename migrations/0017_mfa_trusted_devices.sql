-- Remember-this-device for MFA (plan Part B4, approved 2026-11-11).
-- Reversible: DROP TABLE mfa_trusted_devices; (no other table depends on it).
-- The handler also creates this table on first use (CREATE TABLE IF NOT EXISTS).
CREATE TABLE IF NOT EXISTS mfa_trusted_devices (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, last_used_at INTEGER, ua TEXT
);
CREATE INDEX IF NOT EXISTS idx_mfa_trusted_devices_user ON mfa_trusted_devices(user_id);
