import { schemaOnce } from "./_schema-once.js";
// Shared helpers for Sikhi University Pages Functions. (_-prefixed → not a route.)
export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

export function newId() { return crypto.randomUUID().replace(/-/g, ""); }

export function readCookie(request, name) {
  const c = request.headers.get("Cookie") || "";
  const safeName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = c.match(new RegExp("(?:^|; )" + safeName + "=([^;]+)"));
  return m ? decodeURIComponent(m[1]) : null;
}

export function sessionCookie(id, maxAgeSec) {
  // httpOnly + Secure + SameSite=Lax. maxAgeSec=0 clears it.
  return `su_session=${id}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`;
}

// Resolve the logged-in user from the session cookie, or null.
//
// marketing_optin is selected here (not just in me.js) so every route that
// calls getUser() gets the current opt-in value on the user object for free.
// Wrapped: this runs on every authenticated request, so a DB that hasn't yet
// had the column ALTERed onto it (a stale preview/local D1 the migration
// hasn't reached) must not break login sitewide -- degrade to the plain
// query and default the opt-in to 0 rather than throwing.
export async function getUser(env, request) {
  const sid = readCookie(request, "su_session");
  if (!sid) return null;
  try {
    const row = await env.DB.prepare(
      "SELECT u.id, u.email, u.name, u.country, u.languages, u.role, u.marketing_optin, s.mfa_ok FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ?"
    ).bind(sid, Date.now()).first();
    return row || null;
  } catch (e) {
    const message = (e && e.message) || String(e);
    if (!/marketing_optin|no such column/i.test(message)) throw e;
    const row = await env.DB.prepare(
      "SELECT u.id, u.email, u.name, u.country, u.languages, u.role, s.mfa_ok FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ?"
    ).bind(sid, Date.now()).first();
    return row ? { ...row, marketing_optin: 0 } : null;
  }
}

export function isAdminEmail(env, email) {
  const list = (env.ADMIN_EMAILS || "").toLowerCase().split(",").map(s => s.trim()).filter(Boolean);
  return list.includes((email || "").toLowerCase());
}

// Append-only audit log. Best-effort: auto-creates the table and never throws,
// so logging a non-critical event can't break the action that triggered it.
export async function logEvent(env, user, action, target, detail) {
  try {
    await schemaOnce(env.DB, "events", () => env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, ts INTEGER NOT NULL, user_id TEXT, role TEXT, action TEXT NOT NULL, target TEXT, detail TEXT)"
    ).run());
    await env.DB.prepare(
      "INSERT INTO events (id, ts, user_id, role, action, target, detail) VALUES (?,?,?,?,?,?,?)"
    ).bind(newId(), Date.now(), user ? user.id : null, user ? user.role : null, action, target || null, detail || null).run();
  } catch (e) { /* logging is non-critical */ }
}

// Resolve the signed-in user and, if `roles` is given, require their role to be
// in that list. Callers do: `const { user, error } = await requireRole(env, request,
// ["admin"]); if (error) return error;`. Matches the "forbidden"/403 + "Please
// sign in."/401 wording already used by handlers adopting this helper.
export async function requireRole(env, request, roles) {
  const user = await getUser(env, request);
  if (!user) return { error: json({ error: "Please sign in." }, 401) };
  if (roles && roles.length && !roles.includes(user.role)) return { error: json({ error: "forbidden" }, 403) };
  return { user };
}

// Same as requireRole but with no role check — just requires a signed-in user.
export async function requireUser(env, request) {
  return requireRole(env, request, null);
}

// Parse a JSON request body, returning a uniform 400 on malformed input.
// Callers do: `const { body, error } = await parseBody(request); if (error) return error;`
export async function parseBody(request) {
  try { return { body: await request.json() }; }
  catch (e) { return { error: json({ error: "bad request" }, 400) }; }
}

// Same as requireRole, plus an MFA gate once a user has enrolled. Policy:
// - Not enrolled: everyone passes, admins included. Enrollment is STRONGLY
//   encouraged for admins but is no longer a login-time block on /api/admin/*
//   (2026-09-10): the hard block made a newly-added admin email unable to do
//   anything at all until they had set up an authenticator, and the previous
//   `403 mfa_enrollment_required` gave the UI no way out of that. Enrollment
//   stays a precondition for specific high-trust actions (studio submission,
//   uploads, profile publish), enforced by those handlers, not here.
//   TRADE-OFF, stated plainly: a stolen admin session cookie now reaches every
//   /api/admin/* route with no second factor. Re-tightening this is a one-line
//   revert of the removed `user.role === "admin"` branch.
// - Enrolled: unchanged — the current session must have completed the /mfa step
//   (mfa_ok=1), regardless of role. An admin who DOES enroll is as protected as
//   they were before.
export async function requireMfa(env, request, roles) {
  const { user, error } = await requireRole(env, request, roles);
  if (error) return { error };
  const row = await env.DB.prepare("SELECT enabled_at FROM user_mfa WHERE user_id=?").bind(user.id).first();
  const enrolled = !!(row && row.enabled_at);
  if (enrolled && user.mfa_ok !== 1) return { error: json({ error: "mfa_required" }, 403) };
  return { user };
}

// Does this user hold the given flag (e.g. 'reviewer')? Flags are independent of
// `users.role` — see verify.js's admin-demotion logic, which only ever touches role.
export async function hasFlag(env, userId, flag) {
  const row = await env.DB.prepare("SELECT 1 FROM user_flags WHERE user_id=? AND flag=?").bind(userId, flag).first();
  return !!row;
}

// A reviewer is anyone flagged 'reviewer', or an admin (admins are always reviewers).
export async function requireReviewer(env, request) {
  const { user, error } = await requireRole(env, request, null);
  if (error) return { error };
  if (user.role === "admin") return { user };
  if (!(await hasFlag(env, user.id, "reviewer"))) return { error: json({ error: "forbidden" }, 403) };
  return { user };
}

// Does this user teach `courseId` (course_teachers is independent of `users.role` —
// an admin or even a learner can be assigned as a course's teacher of record)?
// Omit courseId to ask "does this user teach anything at all" (used to decide
// whether to show teacher-only UI/nav for a non-admin, non-'teacher'-role user).
export async function isCourseTeacher(env, userId, courseId) {
  if (courseId) {
    const r = await env.DB.prepare("SELECT 1 FROM course_teachers WHERE user_id=? AND course_id=?").bind(userId, courseId).first();
    return !!r;
  }
  const r = await env.DB.prepare("SELECT 1 FROM course_teachers WHERE user_id=? LIMIT 1").bind(userId).first();
  return !!r;
}

// Is this user a member of ANY cohort tied to `courseId`? Used to gate full
// content/grading for institutional ("gated") courses — see functions/api/cohorts.js
// for how a cohort's invite code is what actually grants membership (payment,
// if any, is handled entirely by the licensing institution on their own site).
export async function hasCohortAccess(env, userId, courseId) {
  const r = await env.DB.prepare(
    "SELECT 1 FROM cohort_members cm JOIN cohorts c ON c.id=cm.cohort_id WHERE cm.user_id=? AND c.course_id=?"
  ).bind(userId, courseId).first();
  return !!r;
}
