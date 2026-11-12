// "Remember this device for 30 days" for MFA (plan Part B4, approved 2026-11-11).
//
// After a successful MFA code on a device whose user ticked "Remember this
// device", we set an httpOnly cookie holding a random token and store ONLY its
// SHA-256 in `mfa_trusted_devices`, bound to that user, expiring in 30 days.
// A later sign-in (password, SSO, password reset) that presents a valid,
// unexpired token for the SAME user starts its session with mfa_ok=1.
//
// Revoked (all of a user's tokens) on: MFA disabled, MFA reset by an admin,
// password changed via reset, and "sign out everywhere". A token is useless for
// any other user, and a stolen cookie alone does not sign anyone in (it only
// skips the second factor after the password/SSO step succeeds).
import { readCookie } from "../_lib.js";
import { sha256Hex } from "../_totp.js";
import { schemaOnce } from "../_schema-once.js";

export const DEVICE_COOKIE = "sikhiuni_mfa_dev";
export const DEVICE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

async function ensure(env) {
  return schemaOnce(env.DB, "mfa_trusted_devices", () => env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS mfa_trusted_devices (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, " +
    "created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, last_used_at INTEGER, ua TEXT)"
  ).run());
}

function randomToken() {
  const a = new Uint8Array(32);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function deviceCookie(value, maxAgeSec) {
  return `${DEVICE_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`;
}

/** Create a trusted-device token for this user and return the Set-Cookie value. */
export async function issueTrustedDevice(env, userId, request) {
  await ensure(env);
  const token = randomToken();
  const now = Date.now();
  const ua = (request.headers.get("User-Agent") || "").slice(0, 200) || null;
  await env.DB.prepare(
    "INSERT INTO mfa_trusted_devices (token_hash, user_id, created_at, expires_at, last_used_at, ua) VALUES (?,?,?,?,NULL,?)"
  ).bind(await sha256Hex(token), userId, now, now + DEVICE_TTL_MS, ua).run();
  return deviceCookie(token, Math.floor(DEVICE_TTL_MS / 1000));
}

/** True if the request carries a valid, unexpired trusted-device token for this user. */
export async function isTrustedDevice(env, request, userId) {
  const token = readCookie(request, DEVICE_COOKIE);
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return false;
  try {
    await ensure(env);
    const row = await env.DB.prepare(
      "SELECT user_id, expires_at FROM mfa_trusted_devices WHERE token_hash=?"
    ).bind(await sha256Hex(token)).first();
    if (!row || row.user_id !== userId || row.expires_at <= Date.now()) return false;
    await env.DB.prepare("UPDATE mfa_trusted_devices SET last_used_at=? WHERE token_hash=?")
      .bind(Date.now(), await sha256Hex(token)).run();
    return true;
  } catch { return false; }
}

/** Revoke every trusted device for a user (MFA disable/reset, password change, sign out everywhere). */
export async function revokeTrustedDevices(env, userId) {
  try {
    await ensure(env);
    await env.DB.prepare("DELETE FROM mfa_trusted_devices WHERE user_id=?").bind(userId).run();
  } catch { /* table may not exist yet: nothing to revoke */ }
}

/**
 * Does a new session for this user need the MFA step?
 * Enrolled AND not on a trusted device -> true.
 */
export async function sessionNeedsMfa(env, request, userId) {
  const row = await env.DB.prepare("SELECT enabled_at FROM user_mfa WHERE user_id=?").bind(userId).first();
  if (!(row && row.enabled_at)) return false;
  return !(await isTrustedDevice(env, request, userId));
}
