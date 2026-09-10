import { newId, sessionCookie, readCookie, isAdminEmail, logEvent, json } from "../_lib.js";
import { hashPassword } from "../../_password.js";
import { insertUserWithOptin } from "./_onboarding.js";
import { RSID_COOKIE } from "./register-start.js";

// POST /api/auth/register-complete { code, password }
//
// Step 2. The rsid comes from the httpOnly cookie ONLY, never the body — that
// binding is what makes an intercepted code useless on its own. On success the
// account exists for the first time and the caller is signed in.
//
// No welcome email is sent here: register-start's code email already carried
// the welcome copy (functions/_email-templates.js). One email per new account.

const MAX_ATTEMPTS = 8; // 8 guesses at a 6-digit code, then the pending record is destroyed

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad request" }, 400); }

  const rsid = readCookie(request, RSID_COOKIE);
  if (!rsid) return json({ error: "That sign-up expired. Please start again.", code: "no_pending_registration" }, 400);

  const code = String(body?.code || "").trim();
  const password = String(body?.password || "");
  if (!code) return json({ error: "Enter the code from your email.", code: "code_required" }, 400);
  // Checked before touching the pending record so a weak password can't burn
  // one of the user's 8 attempts.
  if (password.length < 12) return json({ error: "Password must be at least 12 characters.", code: "weak_password" }, 400);

  const now = Date.now();
  const pending = await env.DB.prepare(
    "SELECT rsid, email, username, code, attempts, marketing FROM pending_registrations WHERE rsid = ? AND expires_at > ?"
  ).bind(rsid, now).first();
  if (!pending) return json({ error: "That code isn’t right (or it expired). Please start again.", code: "invalid_or_expired" }, 400);

  if (pending.attempts >= MAX_ATTEMPTS) {
    await env.DB.prepare("DELETE FROM pending_registrations WHERE rsid = ?").bind(rsid).run();
    return json({ error: "Too many wrong codes. Please start again.", code: "too_many_attempts" }, 429);
  }

  if (code !== pending.code) {
    await env.DB.prepare("UPDATE pending_registrations SET attempts = attempts + 1 WHERE rsid = ?").bind(rsid).run();
    return json({ error: "That code isn’t right. Check your email and try again.", code: "invalid_or_expired" }, 400);
  }

  // Re-check availability at completion: 15 minutes is plenty of time for
  // someone else to take either. The UNIQUE index is the real arbiter (see the
  // catch below); these reads just give a clean error in the common case.
  const emailTaken = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(pending.email).first();
  if (emailTaken) {
    await env.DB.prepare("DELETE FROM pending_registrations WHERE rsid = ?").bind(rsid).run();
    return json({ error: "An account with that email already exists. Try signing in.", code: "email_taken" }, 409);
  }
  const usernameTaken = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(pending.username).first();
  if (usernameTaken) return json({ error: "That username was just taken. Please pick another.", code: "username_taken" }, 409);

  const id = newId();
  const role = isAdminEmail(env, pending.email) ? "admin" : "learner";
  const passwordHash = await hashPassword(password);

  try {
    await insertUserWithOptin(env, {
      id, email: pending.email, name: null, role, createdAt: now,
      emailVerified: true, marketing: pending.marketing === 1, passwordHash, username: pending.username,
    });
  } catch (e) {
    // A UNIQUE violation on username means someone completed with the same
    // name between the read above and this INSERT. Retryable, not a 500 — and
    // the pending record is deliberately left alive so the user can pick
    // another name without needing a fresh email.
    if (/UNIQUE constraint failed.*username/i.test((e && e.message) || String(e))) {
      return json({ error: "That username was just taken. Please pick another.", code: "username_taken" }, 409);
    }
    throw e;
  }
  await logEvent(env, { id, role }, "user_created", pending.email, "password");

  await env.DB.prepare("DELETE FROM pending_registrations WHERE rsid = ?").bind(rsid).run();

  // A brand-new account has no MFA enrolment, so mfa_ok=1 — same as signup.js.
  const sid = newId() + newId();
  const expires = now + 30 * 24 * 60 * 60 * 1000;
  await env.DB.prepare("INSERT INTO sessions (id, user_id, expires_at, mfa_ok) VALUES (?,?,?,1)").bind(sid, id, expires).run();
  await logEvent(env, { id, role }, "login", pending.email, "password");

  // Two Set-Cookie headers, so this builds a real Headers object rather than
  // going through json(): that helper takes a plain object, which can only
  // carry one value per header name, and comma-joining Set-Cookie is a known
  // footgun (cookie values may legitimately contain commas).
  const headers = new Headers({ "content-type": "application/json" });
  headers.append("Set-Cookie", sessionCookie(sid, 30 * 24 * 60 * 60));
  // Burn the registration ticket cookie; its row is already gone.
  headers.append("Set-Cookie", `${RSID_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
  return new Response(JSON.stringify({ ok: true, username: pending.username }), { status: 200, headers });
}
