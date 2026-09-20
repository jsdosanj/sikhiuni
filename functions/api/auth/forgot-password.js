import { newId, json } from "../_lib.js";
import { resetCodeTemplate } from "../../_email-templates.js";

// POST /api/auth/forgot-password { email }  -> emails a 6-digit code
//
// CONVERGED 2026-09-06 from a clickable reset LINK to a code bound to the
// requesting browser, matching sikhi.io and punjabiuni.com. See
// migrations/0013_reset_codes.sql for the full reasoning; in short, a link is
// a bearer credential that signs in whatever device opens the email, whereas
// a code is useless without the httpOnly psid cookie minted here.
//
// STILL DOUBLES AS "SET MY FIRST PASSWORD" for the real users who signed up
// before password auth existed and never set one. That property is
// load-bearing: it is the on-ramp that made retiring magic-link sign-in safe
// (see request.js). Nothing here looks at password_hash, so an account
// without one is treated identically to one that has.
//
// Always returns { ok: true } with a psid cookie regardless of whether the
// email exists — enumeration-resistant by construction, and the client flow
// must look identical either way.

export const PSID_COOKIE = "sikhiuni_pwreset_psid";
export const PSID_TTL_MS = 15 * 60 * 1000;

function randomCode() {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(arr[0] % 1000000).padStart(6, "0");
}

export function psidCookie(psid, maxAgeSec) {
  return `${PSID_COOKIE}=${psid}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad request" }, 400); }
  const email = String(body?.email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "Enter a valid email." }, 400);

  // A psid is minted even for an unknown address so the response is
  // byte-identical either way. It simply never gets a row to match.
  const psid = newId() + newId();
  const now = Date.now();

  const u = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (u) {
    // One outstanding code per user: a re-request invalidates the previous
    // one, so an older email can never complete a newer attempt. Same
    // anti-mail-bomb rule the old token flow used.
    await env.DB.prepare("DELETE FROM password_reset_codes WHERE user_id = ?").bind(u.id).run();

    const code = randomCode();
    await env.DB.prepare(
      "INSERT INTO password_reset_codes (psid, user_id, code, attempts, verified, expires_at, created_at) VALUES (?,?,?,0,0,?,?)"
    ).bind(psid, u.id, code, now + PSID_TTL_MS, now).run();

    const t = resetCodeTemplate(code);
    if (env.RESEND_API_KEY) {
      const p = fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({
          from: env.MAIL_FROM || "Sikhi University <login@sikhiuni.com>",
          to: [email],
          reply_to: env.REPLY_TO || "contact@sikhism.io",
          subject: t.subject,
          text: t.text,
          html: t.html,
        }),
      })
        .then(() => { console.log("[email] reset code sent"); })
        .catch((e) => { console.log("[email] reset code send failed", e && e.message); });
      if (typeof context.waitUntil === "function") context.waitUntil(p); else await p;
    } else {
      console.log("[email] reset code send failed: RESEND_API_KEY not configured for", email);
    }
  }

  return json({ ok: true }, 200, { "Set-Cookie": psidCookie(psid, Math.floor(PSID_TTL_MS / 1000)) });
}
