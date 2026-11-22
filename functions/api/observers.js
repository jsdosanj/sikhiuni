import { json, newId, getUser, logEvent } from "./_lib.js";
import { schemaOnce } from "./_schema-once.js";
import { notify } from "./_notify.js";

// C13 observers (Canvas Observer): a parent, guardian or mentor who can see a learner's
// progress, read-only. Consent comes from the learner, always:
//   - only the learner can create an invite code (one at a time, valid 7 days, single use);
//   - the observer redeems it while signed in to their own account;
//   - the learner sees every observer and can remove any of them at any time; an observer
//     can also stop observing.
// An observer sees course progress, assignment status and grades, quiz scores, badges and
// attendance. Never: submission text or files, feedback comments, journal entries,
// messages, forum posts or anything about other learners.
//
// GET  /api/observers                       my observers, the learners I observe, my open invite
// GET  /api/observers?learner=ID            observer only: that learner's read-only summary
// POST { action:"invite" }                  learner: new code (replaces any unused one)
//      { action:"cancel-invite" }
//      { action:"redeem", code }            observer
//      { action:"remove", observerId }      learner removes an observer
//      { action:"leave", learnerId }        observer stops observing

const DAY = 24 * 60 * 60 * 1000;
const INVITE_TTL = 7 * DAY;
const MAX_OBSERVERS = 5;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

export function ensureObservers(env) {
  return schemaOnce(env.DB, "observers", async () => {
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS observer_links (learner_id TEXT NOT NULL, observer_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (learner_id, observer_id))").run();
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_observer_links_observer ON observer_links(observer_id)").run();
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS observer_invites (code_hash TEXT PRIMARY KEY, learner_id TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)").run();
  });
}

function newCode() {
  const b = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(b, (x) => ALPHABET[x % ALPHABET.length]).join("");
}
const normCode = (c) => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
async function hash(code) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("observer:v1:" + code));
  return Array.from(new Uint8Array(d), (x) => x.toString(16).padStart(2, "0")).join("");
}
const fmtCode = (c) => c.slice(0, 5) + "-" + c.slice(5);

/** Is `observerId` currently observing `learnerId`? */
export async function isObserver(env, observerId, learnerId) {
  await ensureObservers(env);
  return !!(await env.DB.prepare("SELECT 1 AS x FROM observer_links WHERE learner_id=? AND observer_id=?").bind(learnerId, observerId).first());
}

const all = async (env, sql, ...args) => { try { return (await env.DB.prepare(sql).bind(...args).all()).results || []; } catch { return []; } };

/** The read-only summary an observer sees. Only scores and statuses, never content. */
export async function learnerSummary(env, learnerId) {
  const courses = await all(env, "SELECT target_id AS course_id, created_at AS enrolled_at FROM enrollments WHERE user_id=? AND kind='course' ORDER BY created_at", learnerId);
  const progress = await all(env, "SELECT course_id, done, passed_score, updated_at FROM progress WHERE user_id=?", learnerId);
  const assignments = await all(env,
    "SELECT a.id, a.course_id, a.title, a.due_at, a.points, s.submitted_at, s.late, s.status AS sub_status, s.grade FROM assignments a " +
    "JOIN enrollments e ON e.kind='course' AND e.target_id=a.course_id AND e.user_id=?1 " +
    "LEFT JOIN submissions s ON s.assignment_id=a.id AND s.user_id=?1 WHERE a.status IN ('open','closed') ORDER BY a.due_at", learnerId);
  const quizzes = await all(env,
    "SELECT q.course_id, q.title, MAX(t.score * 100.0 / t.max_score) AS best_pct, COUNT(t.id) AS attempts FROM lms_quiz_attempts t JOIN lms_quizzes q ON q.id=t.quiz_id " +
    "WHERE t.user_id=? AND t.status='submitted' AND t.max_score > 0 GROUP BY q.id", learnerId);
  const badges = await all(env, "SELECT b.course_id, b.name, w.awarded_at FROM badge_awards w JOIN badges b ON b.id=w.badge_id WHERE w.user_id=?", learnerId);
  const attendance = await all(env, "SELECT s.course_id, a.status, COUNT(*) AS n FROM attendance a JOIN live_sessions s ON s.id=a.session_id WHERE a.user_id=? GROUP BY s.course_id, a.status", learnerId);
  return courses.map((c) => {
    const p = progress.find((x) => x.course_id === c.course_id);
    let lessons = 0; try { lessons = p && p.done ? JSON.parse(p.done).length : 0; } catch { lessons = 0; }
    const att = {}; for (const r of attendance.filter((x) => x.course_id === c.course_id)) att[r.status] = r.n;
    return {
      course_id: c.course_id, enrolled_at: c.enrolled_at, lessons_done: lessons, course_test_passed: !!(p && p.passed_score != null), last_activity: p ? p.updated_at : null,
      assignments: assignments.filter((a) => a.course_id === c.course_id).map((a) => ({ title: a.title, due_at: a.due_at, points: a.points, submitted: !!a.submitted_at, late: !!a.late, graded: a.sub_status === "graded", grade: a.sub_status === "graded" ? a.grade : null })),
      quizzes: quizzes.filter((q) => q.course_id === c.course_id).map((q) => ({ title: q.title, best_pct: q.best_pct == null ? null : Math.round(q.best_pct), attempts: q.attempts })),
      badges: badges.filter((b) => b.course_id === c.course_id).map((b) => ({ name: b.name, awarded_at: b.awarded_at })),
      attendance: att,
    };
  });
}

export async function onRequestGet({ request, env }) {
  const user = await getUser(env, request);
  if (!user) return json({ error: "Please sign in." }, 401);
  await ensureObservers(env);
  const learnerId = new URL(request.url).searchParams.get("learner");
  if (learnerId) {
    if (!(await isObserver(env, user.id, String(learnerId).slice(0, 64)))) return json({ error: "forbidden" }, 403);
    const l = await env.DB.prepare("SELECT id, name FROM users WHERE id=?").bind(learnerId).first();
    if (!l) return json({ error: "not found" }, 404);
    await logEvent(env, user, "observer_viewed", learnerId, "progress summary", { subject: learnerId, targetType: "user" });
    return json({ learner: { id: l.id, name: l.name }, courses: await learnerSummary(env, learnerId) });
  }
  const observers = await all(env, "SELECT u.id, u.name, u.email, o.created_at FROM observer_links o JOIN users u ON u.id=o.observer_id WHERE o.learner_id=? ORDER BY o.created_at", user.id);
  const observing = await all(env, "SELECT u.id, u.name, o.created_at FROM observer_links o JOIN users u ON u.id=o.learner_id WHERE o.observer_id=? ORDER BY o.created_at", user.id);
  const inv = await env.DB.prepare("SELECT expires_at FROM observer_invites WHERE learner_id=? AND expires_at>?").bind(user.id, Date.now()).first();
  return json({ observers, observing, invite: inv ? { expires_at: inv.expires_at } : null, max: MAX_OBSERVERS });
}

export async function onRequestPost({ request, env }) {
  const user = await getUser(env, request);
  if (!user) return json({ error: "Please sign in." }, 401);
  let b; try { b = await request.json(); } catch { return json({ error: "bad request" }, 400); }
  if (!b || typeof b !== "object") return json({ error: "bad request" }, 400);
  await ensureObservers(env);
  const now = Date.now();

  if (b.action === "invite") {
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM observer_links WHERE learner_id=?").bind(user.id).first();
    if (n && n.n >= MAX_OBSERVERS) return json({ error: `You can have up to ${MAX_OBSERVERS} observers. Remove one first.` }, 400);
    const code = newCode();
    await env.DB.prepare("DELETE FROM observer_invites WHERE learner_id=? OR expires_at<?").bind(user.id, now).run();
    await env.DB.prepare("INSERT INTO observer_invites (code_hash, learner_id, created_at, expires_at) VALUES (?,?,?,?)").bind(await hash(code), user.id, now, now + INVITE_TTL).run();
    await logEvent(env, user, "observer_invite_created", user.id, "observer invite", { subject: user.id, targetType: "user" });
    // The code is shown once; only its hash is stored.
    return json({ ok: true, code: fmtCode(code), expires_at: now + INVITE_TTL });
  }
  if (b.action === "cancel-invite") {
    await env.DB.prepare("DELETE FROM observer_invites WHERE learner_id=?").bind(user.id).run();
    return json({ ok: true });
  }
  if (b.action === "redeem") {
    const code = normCode(b.code);
    if (code.length !== 10) return json({ error: "That code isn't valid. Check it with the learner." }, 400);
    const inv = await env.DB.prepare("SELECT learner_id, expires_at FROM observer_invites WHERE code_hash=?").bind(await hash(code)).first();
    if (!inv || inv.expires_at < now) return json({ error: "That code isn't valid or has expired. Ask the learner for a new one." }, 400);
    if (inv.learner_id === user.id) return json({ error: "This is your own code. Give it to the person who should see your progress." }, 400);
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM observer_links WHERE learner_id=?").bind(inv.learner_id).first();
    if (n && n.n >= MAX_OBSERVERS) return json({ error: "This learner already has the most observers allowed." }, 400);
    await env.DB.prepare("DELETE FROM observer_invites WHERE code_hash=?").bind(await hash(code)).run(); // single use
    await env.DB.prepare("INSERT OR IGNORE INTO observer_links (learner_id, observer_id, created_at) VALUES (?,?,?)").bind(inv.learner_id, user.id, now).run();
    await logEvent(env, user, "observer_linked", inv.learner_id, "observer added", { subject: inv.learner_id, targetType: "user", after: user.id });
    // The learner is always told, so a link can't be made without them knowing.
    await notify(env, [inv.learner_id], { kind: "observer", title: `${user.name || "Someone"} can now see your progress`, body: "You can remove them at any time.", url: "/observers" });
    return json({ ok: true, learnerId: inv.learner_id });
  }
  if (b.action === "remove" || b.action === "leave") {
    const learnerId = b.action === "remove" ? user.id : String(b.learnerId || "").slice(0, 64);
    const observerId = b.action === "remove" ? String(b.observerId || "").slice(0, 64) : user.id;
    const r = await env.DB.prepare("DELETE FROM observer_links WHERE learner_id=? AND observer_id=?").bind(learnerId, observerId).run();
    if (!(r.meta && r.meta.changes)) return json({ error: "not found" }, 404);
    await logEvent(env, user, "observer_removed", learnerId, b.action, { subject: learnerId, targetType: "user", before: observerId });
    return json({ ok: true });
  }
  return json({ error: "unknown action" }, 400);
}
