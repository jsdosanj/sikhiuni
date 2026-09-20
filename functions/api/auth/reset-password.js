import { newId, sessionCookie, readCookie, logEvent, json } from "../_lib.js";
import { hashPassword } from "../../_password.js";
import { PSID_COOKIE } from "./forgot-password.js";

// POST /api/auth/reset-password { password } — psid from the cookie
//
// Final step of the code-based reset (2026-09-06). Requires a
// password_reset_codes row for this browser's psid that verify-reset-code.js
// has already marked `verified`.
//
// The legacy link-based grace branch (a raw `token` in the body) was removed
// 2026-09-07, once an hour had comfortably passed since the deploy — it was
// the last bearer-credential path left in this codebase, and every link
// minted by the old flow has long since expired.

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad request" }, 400); }
  const password = String(body?.password || "");
  // Checked before anything is consumed, so a short password can never burn a
  // verified ticket.
  if (password.length < 12) return json({ error: "Password must be at least 12 characters." }, 400);

  const psid = readCookie(request, PSID_COOKIE);
  if (!psid) return json({ error: "That reset expired. Please start again.", code: "no_pending_reset" }, 400);
  const row = await env.DB.prepare(
    "SELECT user_id FROM password_reset_codes WHERE psid = ? AND verified = 1 AND expires_at > ?"
  ).bind(psid, Date.now()).first();
  if (!row) return json({ error: "That reset expired. Please start again.", code: "not_verified" }, 400);
  const userId = row.user_id;
  await env.DB.prepare("DELETE FROM password_reset_codes WHERE psid = ?").bind(psid).run();

  const u = await env.DB.prepare("SELECT id, role FROM users WHERE id = ?").bind(userId).first();
  if (!u) return json({ error: "This reset is invalid or has expired." }, 400);

  const passwordHash = await hashPassword(password);
  await env.DB.prepare("UPDATE users SET password_hash = ?, email_verified = 1 WHERE id = ?").bind(passwordHash, u.id).run();

  const sid = newId() + newId();
  const expires = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const mfaRow = await env.DB.prepare("SELECT enabled_at FROM user_mfa WHERE user_id=?").bind(u.id).first();
  const mfaEnrolled = !!(mfaRow && mfaRow.enabled_at);
  await env.DB.prepare("INSERT INTO sessions (id, user_id, expires_at, mfa_ok) VALUES (?,?,?,?)")
    .bind(sid, u.id, expires, mfaEnrolled ? 0 : 1).run();
  await logEvent(env, u, "login", null, "password-reset");

  // Two Set-Cookie headers (session in, psid burned) need a real Headers
  // object — a plain object can only carry one value per name.
  const headers = new Headers({ "content-type": "application/json" });
  headers.append("Set-Cookie", sessionCookie(sid, 30 * 24 * 60 * 60));
  headers.append("Set-Cookie", `${PSID_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
  return new Response(JSON.stringify({ ok: true, mfaRequired: mfaEnrolled }), { status: 200, headers });
}
