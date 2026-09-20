import { readCookie, json } from "../_lib.js";
import { PSID_COOKIE } from "./forgot-password.js";

// POST /api/auth/verify-reset-code { code }
//
// Middle step of the code-based reset (2026-09-06). The psid comes from the
// httpOnly cookie ONLY, never the body — that binding is the whole point: a
// code read out of an intercepted email is useless without the exact browser
// that asked for it.
//
// Split from reset-password.js because the two steps can be far apart in
// time: the user confirms the code, then thinks about a new password. Marking
// the row `verified` rather than immediately taking a password keeps the
// attempt cap meaningful (a password typo must not burn a code guess) and
// mirrors sikhi.io's and punjabiuni.com's flow exactly.

const MAX_ATTEMPTS = 8;
const VERIFIED_TTL_MS = 10 * 60 * 1000; // once confirmed, 10 minutes to actually set a password

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad request" }, 400); }

  const psid = readCookie(request, PSID_COOKIE);
  if (!psid) return json({ error: "That reset expired. Please start again.", code: "no_pending_reset" }, 400);

  const code = String(body?.code || "").trim();
  if (!code) return json({ error: "Enter the code from your email.", code: "code_required" }, 400);

  const now = Date.now();
  const row = await env.DB.prepare(
    "SELECT psid, user_id, code, attempts FROM password_reset_codes WHERE psid = ? AND expires_at > ?"
  ).bind(psid, now).first();
  // Identical answer for "no such psid" and "wrong code": neither tells the
  // caller anything about whether the email had an account behind it.
  if (!row) return json({ error: "That code isn’t right (or it expired). Please start again.", code: "invalid_or_expired" }, 400);

  if (row.attempts >= MAX_ATTEMPTS) {
    await env.DB.prepare("DELETE FROM password_reset_codes WHERE psid = ?").bind(psid).run();
    return json({ error: "Too many wrong codes. Please start again.", code: "too_many_attempts" }, 429);
  }

  if (code !== row.code) {
    await env.DB.prepare("UPDATE password_reset_codes SET attempts = attempts + 1 WHERE psid = ?").bind(psid).run();
    return json({ error: "That code isn’t right. Check your email and try again.", code: "invalid_or_expired" }, 400);
  }

  await env.DB.prepare("UPDATE password_reset_codes SET verified = 1, expires_at = ? WHERE psid = ?")
    .bind(now + VERIFIED_TTL_MS, psid).run();
  return json({ ok: true });
}
