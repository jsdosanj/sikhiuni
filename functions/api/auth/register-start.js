import { newId, json } from "../_lib.js";
import { handleProblem, normalizeHandle, HANDLE_PROBLEM_MESSAGE } from "./_handle-rules.js";
import { registrationCodeTemplate } from "../../_email-templates.js";

// POST /api/auth/register-start { username, email, marketing? }
//
// Step 1 of the 2026-09-06 standardized registration (same shape on sikhi.io
// and punjabiuni.com). Validates, emails a 6-digit code, and binds the pending
// record to THIS browser with a short-lived httpOnly cookie.
//
// NO USER ROW IS CREATED HERE. That ordering is the point: an account only
// exists once its email has been proven, so this site can never accumulate
// unverified accounts. It also means an abandoned sign-up leaves nothing
// behind but a row that expires in 15 minutes.

export const RSID_COOKIE = "sikhiuni_reg_rsid";
export const RSID_TTL_MS = 15 * 60 * 1000;

function randomCode() {
  // 6 digits from a real CSPRNG, never Math.random.
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(arr[0] % 1000000).padStart(6, "0");
}

function rsidCookie(rsid, maxAgeSec) {
  return `${RSID_COOKIE}=${rsid}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`;
}

/** Send the code and REPORT whether Resend accepted it.
 *
 *  2026-11 (user report: "it says it sent a code but I never receive it"): this
 *  used to be fire-and-forget and logged "sent" for ANY response, so a Resend
 *  refusal (unverified sender domain, 429 rate limit, daily quota, bad key) still
 *  told the learner "we emailed a code" and nothing ever arrived. Before #293 the
 *  router also never passed waitUntil, so the request could be torn down before
 *  the send finished. Now the send is awaited (short timeout) and a refusal is a
 *  visible, retryable error. Returns "sent" | "no_key" | "failed".
 *  No key = local dev / E2E (the harness reads the code from local D1), which
 *  stays a soft success exactly as before. */
async function sendCode(context, email, code, username) {
  const { env } = context;
  if (!env.RESEND_API_KEY) {
    // Pinned marker: the E2E harness asserts on "[email]" lines to prove no
    // mail is sent during a routine login.
    console.log("[email] registration code send failed: RESEND_API_KEY not configured for", email);
    return "no_key";
  }
  const t = registrationCodeTemplate(code, username);
  try {
    const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: env.MAIL_FROM || "Sikhi University <login@sikhiuni.com>",
      to: [email],
      reply_to: env.REPLY_TO || "akaal@sikhi.io",
      subject: t.subject,
      text: t.text,
      html: t.html,
    }),
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) { console.log("[email] registration code sent"); return "sent"; }
    // Resend's error body names the cause (e.g. "domain is not verified", "rate limit", "daily quota").
    const detail = await res.text().catch(() => "");
    console.error("[email] registration code send REFUSED", res.status, detail.slice(0, 300));
    return "failed";
  } catch (e) {
    console.error("[email] registration code send failed", e && e.message);
    return "failed";
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad request" }, 400); }

  const username = normalizeHandle(body?.username);
  const email = String(body?.email || "").trim().toLowerCase();
  const marketing = body?.marketing === true;

  const problem = handleProblem(username);
  if (problem) return json({ error: HANDLE_PROBLEM_MESSAGE[problem], code: problem }, 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) {
    return json({ error: "Enter a valid email.", code: "invalid_email" }, 400);
  }

  // Enumeration stance unchanged from the signup this replaces: an
  // already-registered email is told so, because "go sign in instead" is the
  // UX this site already has. Hardening that is a separate, deliberate call.
  const emailTaken = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (emailTaken) {
    return json({ error: "An account with that email already exists. Try signing in, or use ‘Forgot password’.", code: "email_taken" }, 409);
  }
  const usernameTaken = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
  if (usernameTaken) return json({ error: "That username is taken. Please pick another.", code: "username_taken" }, 409);

  // One outstanding pending registration per email: a resend (or a fresh
  // start) invalidates every earlier code for that address, so an older email
  // can never be used to complete a newer attempt.
  await env.DB.prepare("DELETE FROM pending_registrations WHERE email = ?").bind(email).run();

  const rsid = newId() + newId();
  const code = randomCode();
  const now = Date.now();
  await env.DB.prepare(
    "INSERT INTO pending_registrations (rsid, email, username, code, attempts, marketing, expires_at, created_at) VALUES (?,?,?,?,0,?,?,?)"
  ).bind(rsid, email, username, code, marketing ? 1 : 0, now + RSID_TTL_MS, now).run();

  const sent = await sendCode(context, email, code, username);
  if (sent === "failed") {
    // The code never left: don't strand the learner on "check your email".
    await env.DB.prepare("DELETE FROM pending_registrations WHERE rsid = ?").bind(rsid).run();
    return json({
      error: "We couldn't send the confirmation email just now. Please try again in a few minutes. If it keeps happening, contact us at akaal@sikhi.io.",
      code: "email_send_failed",
    }, 502);
  }

  // The code is NEVER in the response body. The E2E harness reads it out of
  // local D1 instead, so there is no dev-mode branch to fail open.
  return json({ ok: true, email, username }, 200, {
    "Set-Cookie": rsidCookie(rsid, Math.floor(RSID_TTL_MS / 1000)),
  });
}
