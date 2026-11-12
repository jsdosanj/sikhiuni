import { verifyFamilyCredentials, familyErrorMessage } from '../../familyCredentials.js';
import { insertUserWithOptin } from './_onboarding.js';
import { newId, sessionCookie, logEvent, json } from "../_lib.js";
import { sessionNeedsMfa } from "./_trusted-device.js";

import { verifyPassword, DUMMY_HASH } from "../../_password.js";

// 10+ failed sign-ins for one identifier within 15 minutes -> one team alert (throttled in sendAuditAlert's caller).
async function alertOnLoginBurst(env, identifier, subject) {
  try {
    const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM events WHERE action='login_failed' AND target=? AND ts > ?")
      .bind(identifier, Date.now() - 15 * 60 * 1000).first();
    if (r && r.n === 10) await logEvent(env, null, "login_failed_burst", identifier, "10 failed sign-ins in 15 minutes", { outcome: "fail", subject, targetType: "account" });
  } catch { /* best effort */ }
}

// POST /api/auth/login { identifier, password }
//
// `identifier` is a USERNAME or an EMAIL (2026-09-06), discriminated by `@`.
// That split is unambiguous only because _handle-rules.js's HANDLE_RE forbids
// `@` in a username — the exclusion is load-bearing, not cosmetic.
//
// The legacy { email, password } body is still accepted and mapped straight
// through, so an un-updated client keeps working: the widening is additive,
// and rollback is re-pointing the UI rather than restoring a route.
export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad request" }, 400); }
  const identifier = String(body?.identifier || body?.email || "").trim().toLowerCase();
  const password = String(body?.password || "");
  if (!identifier || !password) return json({ error: "Username or email and password required." }, 400);

  let u = identifier.includes("@")
    ? await env.DB.prepare("SELECT id, email, role, password_hash FROM users WHERE email = ?").bind(identifier).first()
    : await env.DB.prepare("SELECT id, email, role, password_hash FROM users WHERE username = ?").bind(identifier).first();
  // Enumeration/timing resistance: always run a hash comparison, even for a
  // nonexistent account or one with no password set yet (magic-link-only).
  // This runs for BOTH branches — an unknown username has to cost the same as
  // an unknown email, or the new lookup becomes an enumeration oracle.
  const storedHash = u?.password_hash || DUMMY_HASH;
  const passOk = await verifyPassword(password, storedHash);
  if (!u || !u.password_hash || !passOk) {
    const proof = await verifyFamilyCredentials(env, 'sikhiuni.com', identifier, password, verifyPassword, u?.email || null);
    if (!proof.ok) {
      // Audit the failure (never the password). subject = the account, if one exists.
      await logEvent(env, null, "login_failed", identifier, proof.error || "bad_credentials", { outcome: "fail", subject: u ? u.id : null, targetType: "account" });
      await alertOnLoginBurst(env, identifier, u ? u.id : null);
      return json({ error: familyErrorMessage(proof), code: proof.error }, proof.error === 'family_unavailable' ? 503 : 401);
    }
    const { email, name } = proof.identity;
    u = await env.DB.prepare('SELECT id,email,role FROM users WHERE email = ?').bind(email).first();
    if (!u) {
      try { await insertUserWithOptin(env, { id: newId(), email, name, role: 'learner', createdAt: Date.now(), emailVerified: true, marketing: false }); }
      catch (e) { if (!/UNIQUE constraint/i.test(String(e))) throw e; }
      u = await env.DB.prepare('SELECT id,email,role FROM users WHERE email = ?').bind(email).first();
      if (!u) return json({error:'Unable to create your local session. Please try again.'},503);
    }
  }

  const sid = newId() + newId();
  const expires = Date.now() + 30 * 24 * 60 * 60 * 1000;
  // Enrolled users need the MFA step unless this browser is a remembered (trusted) device.
  const mfaEnrolled = await sessionNeedsMfa(env, request, u.id);
  await env.DB.prepare("INSERT INTO sessions (id, user_id, expires_at, mfa_ok) VALUES (?,?,?,?)")
    .bind(sid, u.id, expires, mfaEnrolled ? 0 : 1).run();
  await logEvent(env, { id: u.id, role: u.role }, "login", identifier, "password");

  return json({ ok: true, mfaRequired: mfaEnrolled }, 200, { "Set-Cookie": sessionCookie(sid, 30 * 24 * 60 * 60) });
}
