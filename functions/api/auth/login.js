import { verifyFamilyCredentials, familyErrorMessage } from '../../familyCredentials.js';
import { insertUserWithOptin } from './_onboarding.js';
import { newId, sessionCookie, logEvent, json } from "../_lib.js";
import { verifyPassword, DUMMY_HASH } from "../../_password.js";

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
    if (!proof.ok) return json({ error: familyErrorMessage(proof), code: proof.error }, proof.error === 'family_unavailable' ? 503 : 401);
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
  const mfaRow = await env.DB.prepare("SELECT enabled_at FROM user_mfa WHERE user_id=?").bind(u.id).first();
  const mfaEnrolled = !!(mfaRow && mfaRow.enabled_at);
  await env.DB.prepare("INSERT INTO sessions (id, user_id, expires_at, mfa_ok) VALUES (?,?,?,?)")
    .bind(sid, u.id, expires, mfaEnrolled ? 0 : 1).run();
  await logEvent(env, { id: u.id, role: u.role }, "login", identifier, "password");

  return json({ ok: true, mfaRequired: mfaEnrolled }, 200, { "Set-Cookie": sessionCookie(sid, 30 * 24 * 60 * 60) });
}
