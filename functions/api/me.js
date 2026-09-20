import { json, getUser, logEvent, isCourseTeacher, readCookie, sessionCookie } from "./_lib.js";
import { cleanName, cleanCountry, cleanLanguages } from "./_profile-options.js";

// ── Sliding session renewal (2026-09-06) ────────────────────────────────────
// A fixed 30-day cookie signs an active daily user out every 30 days for no
// reason; the instruction across all three sites was that an account should
// just stay logged in.
//
// This lives HERE and nowhere else because GET /api/me is the session read
// every page's boot already performs. Renewing on every authenticated request
// would be a DB write plus a Set-Cookie per API call for no benefit, and
// getUser() itself must stay pure — dozens of handlers call it, and none of
// them should be writing to the sessions table as a side effect.
const SESSION_TTL_SEC = 30 * 24 * 60 * 60;
const RENEW_BELOW_MS = 15 * 24 * 60 * 60 * 1000;

/** Returns a Set-Cookie value when the session was extended, else null.
 *  Only ever reached for an ALREADY-VALID session (getUser rejects expired
 *  ones first), and it re-checks expiry anyway: resurrecting a dead session
 *  would be a security bug, not a UX nicety. */
async function renewSessionIfStale(env, request) {
  const sid = readCookie(request, "su_session");
  if (!sid) return null;
  const now = Date.now();
  const row = await env.DB.prepare("SELECT expires_at FROM sessions WHERE id = ?").bind(sid).first();
  if (!row) return null;
  if (row.expires_at <= now) return null;                 // expired: leave it dead
  if (row.expires_at > now + RENEW_BELOW_MS) return null;  // plenty of life left
  await env.DB.prepare("UPDATE sessions SET expires_at = ? WHERE id = ?")
    .bind(now + SESSION_TTL_SEC * 1000, sid).run();
  return sessionCookie(sid, SESSION_TTL_SEC);
}

// GET /api/me -> current user { id, email, name, country, languages, role, mfa, isTeacher, marketingOptin } or { user: null }.
// mfa carries only `enrolled` (2026-09-10). It used to also carry `required`,
// hard-coded to role==='admin', and admin.astro refused to render the whole admin
// page on it. That mirrored the requireMfa() hard block, and when that block was
// removed the flag became a UI-only lockout with no server rule behind it: an
// un-enrolled admin passed every API call and still could not open the page.
// Enrolment being merely encouraged is not something a client flag can express,
// so the flag is gone rather than pinned to false. Enrolment IS still a real
// precondition for specific high-trust actions, and each is reported by the
// endpoint that enforces it (e.g. /api/teacher/profile's own mfaEnrolled for
// publish) — never globally from here.
// isTeacher covers both role==='teacher' AND a course_teachers assignment held by a
// user of any other role (e.g. an admin, or a learner given co-teacher access) — the
// nav/dashboard portal switcher uses this to decide whether to show the teacher view.
export async function onRequestGet({ request, env }) {
  const user = await getUser(env, request);
  if (!user) return json({ user: null });
  const mfaRow = await env.DB.prepare("SELECT enabled_at FROM user_mfa WHERE user_id=?").bind(user.id).first();
  const mfa = { enrolled: !!(mfaRow && mfaRow.enabled_at) };
  const isTeacher = user.role === "teacher" || (await isCourseTeacher(env, user.id));
  const marketingOptin = !!user.marketing_optin;
  // Renewal is best-effort: a failure here must not break the session read
  // that every page depends on.
  let renewed = null;
  try { renewed = await renewSessionIfStale(env, request); }
  catch (e) { console.log("[session] renewal skipped:", (e && e.message) || e); }
  return json({ user: { ...user, mfa, isTeacher, marketingOptin } }, 200,
    renewed ? { "Set-Cookie": renewed } : {});
}

// POST /api/me -> update the signed-in user's own profile (name, country,
// languages, and — if the `marketingOptin` key is present in the body — the
// marketing-email opt-in). Email is the magic-link sign-in identity and is
// intentionally not editable here.
//
// marketingOptin is deliberately OPTIONAL in the request body (checked with
// hasOwnProperty, not just truthiness) so the existing profile-save call from
// the Profile tab's name/country/languages fields — which never sends this
// key — can't accidentally flip a user's consent back to false on every
// unrelated save.
export async function onRequestPost({ request, env }) {
  const user = await getUser(env, request);
  if (!user) return json({ error: "unauthorized" }, 401);
  let b; try { b = await request.json(); } catch (e) { return json({ error: "bad request" }, 400); }

  const name = cleanName(b.name);
  const country = cleanCountry(b.country);
  const languages = cleanLanguages(b.languages);
  const hasOptinField = Object.prototype.hasOwnProperty.call(b, "marketingOptin");
  const marketingOptin = hasOptinField ? !!b.marketingOptin : !!user.marketing_optin;

  if (hasOptinField) {
    await env.DB.prepare("UPDATE users SET name=?, country=?, languages=?, marketing_optin=? WHERE id=?")
      .bind(name, country, languages, marketingOptin ? 1 : 0, user.id).run();
    await logEvent(env, user, "marketing_optin_update", null, marketingOptin ? "on" : "off");
  } else {
    await env.DB.prepare("UPDATE users SET name=?, country=?, languages=? WHERE id=?")
      .bind(name, country, languages, user.id).run();
  }
  await logEvent(env, user, "profile_update", null, null);

  return json({ user: { ...user, name, country, languages, marketingOptin } });
}
