import { newId, sessionCookie, isAdminEmail, logEvent } from "../_lib.js";
import { verifySsoToken } from "../../_sso.js";
import { insertUserWithOptin, sendWelcomeEmail } from "./_onboarding.js";

async function sha256Hex(input) {
  const bytes = new TextEncoder().encode(input);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

// GET /api/auth/sso?sso_token=...&return=/some/path
//
// Consumer side of the cross-domain handoff minted by sikhi.io's
// GET /api/sso/issue. Verifies the token, finds-or-creates a local user by
// email (same MFA-aware session logic as functions/api/auth/verify.js's
// magic-link path -- an SSO login is a real login and must respect an
// existing account's security settings, not just skip them for a
// newly-provisioned one), then redirects to a same-origin-only `return`
// path (never an absolute URL -- that would make this an open redirect off
// a trusted-looking sikhiuni.com link).
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const token = url.searchParams.get("sso_token") || "";
  const returnPath = url.searchParams.get("return") || "/dashboard.html";
  const base = env.SITE_URL || url.origin;

  const safeReturn = returnPath.startsWith("/") && !returnPath.startsWith("//") ? returnPath : "/dashboard.html";
  const dest = `${base}${safeReturn}`;
  const fail = (msg) => Response.redirect(`${base}/login.html?error=${encodeURIComponent(msg)}`, 302);

  const secret = env.SSO_SHARED_SECRET;
  if (!secret) return fail("Sign-in via sikhi.io is not configured yet.");

  const payload = await verifySsoToken(token, secret);
  if (!payload) return fail("This sign-in link is invalid or expired.");

  // Hub-and-spoke enforcement (Decision 3 of
  // .cc/plan-sso-receiver-punjabiuni-sikhiuni.md, in sikhi.io's repo):
  // sikhi.io is the only token issuer today, but verifySsoToken itself
  // (functions/_sso.js) deliberately doesn't check `iss` -- it stays a
  // generic verifier. All three sites currently share ONE secret, so
  // without this check a token minted by (or forged as coming from) any
  // other secret-holder would be accepted just as readily as one actually
  // minted by sikhi.io.
  if (payload.iss !== "sikhi.io") return fail("This sign-in link is invalid or expired.");

  // One-time token consumption: a valid handoff must mint exactly one local
  // session, even before exp. A replay sees INSERT OR IGNORE change-count 0.
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS used_sso_tokens (token_hash TEXT PRIMARY KEY, used_at INTEGER NOT NULL)"
  ).run();
  const tokenHash = await sha256Hex(token);
  const consume = await env.DB.prepare(
    "INSERT OR IGNORE INTO used_sso_tokens (token_hash, used_at) VALUES (?,?)"
  ).bind(tokenHash, Date.now()).run();
  if (consume?.meta && consume.meta.changes === 0) return fail("This sign-in link is invalid or expired.");

  const email = payload.email;
  let user = await env.DB.prepare("SELECT id, role FROM users WHERE email = ?").bind(email).first();
  const wantAdmin = isAdminEmail(env, email);
  if (!user) {
    // FIRST LANDING = this person's signup moment here, so it is the one and
    // only place that seeds marketing_optin from the token's optional
    // `marketingOptIn` claim, and the one and only place that mails a
    // welcome. Absence of the claim reads as no consent (an older sikhi.io
    // issuer simply doesn't send it). On every LATER login the existing-user
    // branches below run instead and never touch the column -- a choice made
    // on this site must win over the hub's echo of it, and re-syncing on
    // every login would silently clobber it.
    const id = newId();
    const role = wantAdmin ? "admin" : "learner";
    await insertUserWithOptin(env, {
      id, email, name: payload.name || null, role, createdAt: Date.now(),
      emailVerified: true, marketing: payload.marketingOptIn === true,
    });
    user = { id, role };
    await logEvent(env, { id, role }, "user_created", email, "sso:sikhi.io");
    sendWelcomeEmail(context, email, payload.name || null);
  } else if (wantAdmin && user.role !== "admin") {
    await env.DB.prepare("UPDATE users SET role='admin' WHERE id=?").bind(user.id).run();
    user = { ...user, role: "admin" };
  }

  const sid = newId() + newId();
  const expires = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days, matches verify.js
  const mfaRow = await env.DB.prepare("SELECT enabled_at FROM user_mfa WHERE user_id=?").bind(user.id).first();
  const mfaEnrolled = !!(mfaRow && mfaRow.enabled_at);
  await env.DB.prepare("INSERT INTO sessions (id, user_id, expires_at, mfa_ok) VALUES (?,?,?,?)")
    .bind(sid, user.id, expires, mfaEnrolled ? 0 : 1).run();
  await logEvent(env, user, "login", email, "sso:sikhi.io");

  const location = mfaEnrolled ? `${base}/mfa.html` : dest;
  return new Response(null, {
    status: 302,
    headers: { Location: location, "Set-Cookie": sessionCookie(sid, 30 * 24 * 60 * 60) },
  });
}
