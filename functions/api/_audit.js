// Audit-log internals (plan Part A, approved 2026-11-11). `logEvent` in _lib.js
// is still the one write path; this module holds what it needs:
//
//  - request context: IP, country, user agent, a hash of the session id, cf-ray.
//    The router (worker.js) hands every handler a per-request env that carries
//    the request as env.AUDIT_REQUEST, so the ~75 existing logEvent call sites
//    get context with no signature change. Scheduled jobs simply have none.
//  - schema: the events table gains nullable columns, added in place on first
//    use (migrations/0018_audit_context.sql is the same change, for the record).
//  - tamper evidence: each row stores prev_hash (the newest row's hash when it
//    was written) and hash = SHA-256(prev_hash || canonical row). Network fields
//    (ip, country, ua) are deliberately NOT in the hash, so they can be erased at
//    90 days without breaking the chain. Concurrent writes can fork the chain;
//    the verifier tolerates forks and only flags rows whose content no longer
//    matches their hash, or whose prev_hash points at nothing.
//  - retention: learning events 180 days, everything else 2 years, ip/ua/country
//    nulled after 90 days (privacy minimisation, see the privacy policy).
//  - alerts: a short email to the team inbox on high-risk actions.
//
// Never put passwords, codes, tokens or raw session ids into target/detail.

export const LEARNING_ACTIONS = [
  "lesson_completed", "quiz_attempted", "institute_exam_attempted", "program_exam_attempted",
  "cohort_joined", "discussion_post", "assignment_submitted", "feedback_submitted", "contact_submitted",
];

export const SECURITY_ACTIONS = [
  "login", "login_failed", "login_failed_burst", "logout", "password_changed", "user_created", "register_code_failed", "admin_granted",
  "mfa_enabled", "mfa_disabled", "mfa_verified", "mfa_failed", "mfa_session_locked",
  "mfa_backup_code_used", "mfa_backup_regenerated", "mfa_device_remembered", "mfa_reset",
  "sessions_revoked", "role_change", "account_merge", "account_deleted", "authz_denied",
  "rate_limited", "reset_code_failed", "audit_chain_broken",
];

// Actions that email the team (throttled to one per action per hour).
export const ALERT_ACTIONS = new Set(["mfa_reset", "account_merge", "audit_chain_broken", "admin_granted", "login_failed_burst"]);

const NEW_COLUMNS = [
  ["ip", "TEXT"], ["country", "TEXT"], ["ua", "TEXT"], ["session_hash", "TEXT"], ["ray", "TEXT"],
  ["subject_user_id", "TEXT"], ["target_type", "TEXT"], ["outcome", "TEXT"],
  ["prev_hash", "TEXT"], ["hash", "TEXT"],
];

export async function sha256(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(str)));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Create the table if needed, then add any missing columns (idempotent). */
export async function ensureAuditSchema(db) {
  await db.prepare(
    "CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, ts INTEGER NOT NULL, user_id TEXT, role TEXT, action TEXT NOT NULL, target TEXT, detail TEXT)"
  ).run();
  for (const [col, type] of NEW_COLUMNS) {
    try { await db.prepare(`ALTER TABLE events ADD COLUMN ${col} ${type}`).run(); }
    catch (e) { if (!/duplicate column/i.test(String(e && e.message || e))) throw e; }
  }
  for (const idx of [
    "CREATE INDEX IF NOT EXISTS idx_events_user_ts ON events(user_id, ts)",
    "CREATE INDEX IF NOT EXISTS idx_events_subject_ts ON events(subject_user_id, ts)",
    "CREATE INDEX IF NOT EXISTS idx_events_action_ts ON events(action, ts)",
    "CREATE INDEX IF NOT EXISTS idx_events_hash ON events(hash)",
  ]) await db.prepare(idx).run();
}

function readSessionCookie(request) {
  const c = request.headers.get("Cookie") || "";
  const m = c.match(/(?:^|; )su_session=([^;]+)/);
  return m ? m[1] : null;
}

/** Request context for an audit row. All fields optional. */
export async function requestContext(request) {
  if (!request || !request.headers) return {};
  const sid = readSessionCookie(request);
  return {
    ip: request.headers.get("CF-Connecting-IP") || null,
    country: (request.cf && request.cf.country) || request.headers.get("CF-IPCountry") || null,
    ua: (request.headers.get("User-Agent") || "").slice(0, 200) || null,
    session_hash: sid ? (await sha256("su_session:" + sid)).slice(0, 32) : null,
    ray: request.headers.get("cf-ray") || null,
  };
}

/** The fields covered by the hash (network fields excluded on purpose). */
export function canonical(row) {
  return JSON.stringify([
    row.id, row.ts, row.user_id ?? null, row.role ?? null, row.action, row.target ?? null, row.detail ?? null,
    row.session_hash ?? null, row.ray ?? null, row.subject_user_id ?? null, row.target_type ?? null,
    row.outcome ?? null, row.prev_hash ?? null,
  ]);
}

export async function rowHash(row) {
  return sha256((row.prev_hash || "") + "|" + canonical(row));
}

/**
 * Verify the newest `limit` rows: each row's hash must match its content, and
 * each row's prev_hash must exist (except the oldest row checked, and rows
 * written before the chain existed). Returns { checked, broken: [ids] }.
 */
export async function verifyChain(db, limit = 500) {
  const { results } = await db.prepare(
    "SELECT id, ts, user_id, role, action, target, detail, session_hash, ray, subject_user_id, target_type, outcome, prev_hash, hash " +
    "FROM events WHERE hash IS NOT NULL ORDER BY ts DESC LIMIT ?"
  ).bind(limit).all();
  const rows = results || [];
  const broken = [];
  const oldest = rows.length ? rows[rows.length - 1].id : null;
  for (const r of rows) {
    if ((await rowHash(r)) !== r.hash) { broken.push(r.id); continue; }
    if (r.prev_hash && r.id !== oldest) {
      const prev = await db.prepare("SELECT 1 AS x FROM events WHERE hash = ? LIMIT 1").bind(r.prev_hash).first();
      if (!prev) broken.push(r.id);
    }
  }
  return { checked: rows.length, broken };
}

const DAY = 24 * 60 * 60 * 1000;

/** Retention and minimisation. Safe to run daily. */
export async function pruneAudit(db, now = Date.now()) {
  const out = {};
  const learning = LEARNING_ACTIONS.map(() => "?").join(",");
  const run = async (key, sql, ...args) => {
    try { const r = await db.prepare(sql).bind(...args).run(); out[key] = (r.meta && r.meta.changes) || 0; }
    catch (e) { out[key] = "error: " + String(e && e.message || e); }
  };
  await run("learning_deleted", `DELETE FROM events WHERE ts < ? AND action IN (${learning})`, now - 180 * DAY, ...LEARNING_ACTIONS);
  await run("expired_deleted", "DELETE FROM events WHERE ts < ?", now - 730 * DAY);
  await run("network_nulled", "UPDATE events SET ip = NULL, ua = NULL, country = NULL WHERE ts < ? AND (ip IS NOT NULL OR ua IS NOT NULL OR country IS NOT NULL)", now - 90 * DAY);
  await run("trusted_devices_expired", "DELETE FROM mfa_trusted_devices WHERE expires_at < ?", now);
  return out;
}

/** Send one alert email to the team inbox. Never throws. */
export async function sendAuditAlert(env, action, summary) {
  const key = env.CONTACT_RESEND_API_KEY || env.RESEND_API_KEY;
  if (!key || typeof fetch !== "function") return false;
  const from = env.CONTACT_RESEND_API_KEY ? "Sikhi University <akaal@sikhi.io>" : (env.MAIL_FROM || "Sikhi University <login@sikhiuni.com>");
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from, to: [env.AUDIT_ALERT_TO || "akaal@sikhi.io"],
        subject: `[SikhiUni security] ${action}`.slice(0, 160),
        text: `${summary}\n\nReview: https://sikhiuni.com/admin (Audit tab).\nThis is an automatic security alert.`,
      }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch { return false; }
}

const LABELS = {
  login: "Signed in", login_failed: "Failed sign-in attempt", logout: "Signed out",
  password_changed: "Password changed", user_created: "Account created", admin_granted: "Admin access granted",
  login_failed_burst: "Many failed sign-in attempts", reset_code_failed: "Wrong password-reset code",
  mfa_enabled: "Two-factor turned on", mfa_disabled: "Two-factor turned off",
  mfa_verified: "Two-factor code accepted", mfa_failed: "Wrong two-factor code",
  mfa_session_locked: "Sign-in locked after wrong codes", mfa_backup_code_used: "Backup code used",
  mfa_backup_regenerated: "New backup codes created", mfa_device_remembered: "Device remembered for 30 days",
  mfa_reset: "Two-factor reset by an admin", sessions_revoked: "Signed out everywhere",
  role_change: "Role changed", account_merge: "Accounts merged",
};
export const activityLabel = (a) => LABELS[a] || a.replace(/_/g, " ");

/** "Chrome on Windows"-style summary of a user agent. */
export function deviceSummary(ua) {
  if (!ua) return null;
  const b = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox"
    : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows"
    : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "unknown OS";
  return `${b} on ${os}`;
}

/** 203.0.113.42 -> 203.0.113.x ; IPv6 -> first 3 groups. */
export function maskIp(ip) {
  if (!ip) return null;
  if (ip.includes(".")) return ip.split(".").slice(0, 3).join(".") + ".x";
  return ip.split(":").slice(0, 3).join(":") + ":…";
}
