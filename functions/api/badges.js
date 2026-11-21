import { json, newId, logEvent } from "./_lib.js";
import { schemaOnce } from "./_schema-once.js";
import { courseAccess, cleanText } from "./_course-auth.js";
import { learnerProgress } from "./release-rules.js";
import { ensureQuizzes } from "./lms-quizzes.js";
import { ensureLive } from "./live-sessions.js";
import { notify } from "./_notify.js";

// C15 completion badges (Moodle/Canvas badges). A badge records that a learner did
// something in a course. It is NOT a credential, qualification, degree or credit, and
// every surface that shows one carries the approved no-credit notice (CLAUDE.md, the
// no-degree rules). It is never called a credential.
//
// Criteria a teacher can combine (all must hold): every lesson done, the course quiz
// passed, a course quiz at or above a %, and attending N live sessions. A badge with no
// criteria is awarded by hand only.
//
// GET  /api/badges?courseId=      members: the course's badges + whether I've earned each
//                                 (earned automatically when the criteria are met);
//                                 teacher: + who has each badge
// GET  /api/badges?award=ID       public: a badge award, for sharing, with the notice
// POST teacher: { action:"create", courseId, name, description?, criteria:{ allLessons?, coursePass?, quizId?, quizMinPct?, sessions? } }
//               { action:"delete", badgeId } | { action:"award"|"revoke", badgeId, userId }

export const NOTICE = "Self-development only. Sikhi University is not an accredited institution and does not grant college or university degrees or credit. Our certificates are not degrees, and no university credit is offered.";

export function ensureBadges(env) {
  return schemaOnce(env.DB, "badges", async () => {
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS badges (id TEXT PRIMARY KEY, course_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT, criteria TEXT NOT NULL, created_by TEXT, created_at INTEGER NOT NULL)").run();
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_badges_course ON badges(course_id)").run();
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS badge_awards (id TEXT PRIMARY KEY, badge_id TEXT NOT NULL, user_id TEXT NOT NULL, awarded_at INTEGER NOT NULL, awarded_by TEXT, how TEXT NOT NULL, UNIQUE (badge_id, user_id))").run();
  });
}

function cleanCriteria(c) {
  c = c && typeof c === "object" ? c : {};
  const out = {};
  if (c.allLessons) out.allLessons = true;
  if (c.coursePass) out.coursePass = true;
  if (c.quizId) { out.quizId = String(c.quizId).slice(0, 64); out.quizMinPct = Math.max(0, Math.min(100, Math.round(Number(c.quizMinPct) || 80))); }
  const n = Math.round(Number(c.sessions) || 0);
  if (n > 0) out.sessions = Math.min(200, n);
  return out;
}
const isAuto = (c) => !!(c.allLessons || c.coursePass || c.quizId || c.sessions);

/** Does this learner meet every criterion? lessonCount null = unknown (allLessons can't be checked). */
async function meets(env, criteria, courseId, userId, lessonCount) {
  if (!isAuto(criteria)) return false;
  const p = await learnerProgress(env, userId, courseId);
  if (criteria.allLessons && !(lessonCount && p.lessons >= lessonCount)) return false;
  if (criteria.coursePass && !p.quizPassed) return false;
  if (criteria.quizId) {
    await ensureQuizzes(env);
    const best = await env.DB.prepare("SELECT MAX(score * 100.0 / max_score) AS pct FROM lms_quiz_attempts WHERE quiz_id=? AND user_id=? AND status='submitted' AND max_score > 0").bind(criteria.quizId, userId).first();
    if (!best || best.pct == null || best.pct < criteria.quizMinPct) return false;
  }
  if (criteria.sessions) {
    await ensureLive(env);
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM attendance a JOIN live_sessions s ON s.id=a.session_id WHERE s.course_id=? AND a.user_id=? AND a.status IN ('present','late')").bind(courseId, userId).first();
    if (!n || n.n < criteria.sessions) return false;
  }
  return true;
}

async function lessonCountOf(env, courseId) {
  try {
    const { courseOutline } = await import("./_course-store.js");
    const c = env.MEDIA ? (await courseOutline(env.MEDIA)).courses.find((x) => x.id === courseId) : null;
    return c ? (Array.isArray(c.lessons) && c.lessons.length) || c.nLessons || null : null;
  } catch { return null; }
}

export async function onRequestGet({ request, env }) {
  const sp = new URL(request.url).searchParams;
  await ensureBadges(env);
  const awardId = sp.get("award");
  if (awardId) {
    if (!/^[a-z0-9]{16,40}$/.test(awardId)) return json({ error: "not found" }, 404);
    const a = await env.DB.prepare("SELECT w.awarded_at, b.name, b.description, b.course_id, u.name AS recipient FROM badge_awards w JOIN badges b ON b.id=w.badge_id LEFT JOIN users u ON u.id=w.user_id WHERE w.id=?").bind(awardId).first();
    if (!a) return json({ error: "not found" }, 404);
    // Shared publicly by the learner: first name only, never an email.
    return json({ badge: { name: a.name, description: a.description, course_id: a.course_id, recipient: String(a.recipient || "A learner").split(/\s+/)[0], awarded_at: a.awarded_at }, notice: NOTICE });
  }
  const courseId = sp.get("courseId");
  const { user, teach, error } = await courseAccess(env, request, courseId, "member");
  if (error) return error;
  const badges = ((await env.DB.prepare("SELECT * FROM badges WHERE course_id=? ORDER BY created_at").bind(courseId).all()).results) || [];
  if (teach) {
    const holders = ((await env.DB.prepare("SELECT w.badge_id, w.how, w.awarded_at, u.id, u.name, u.email FROM badge_awards w JOIN badges b ON b.id=w.badge_id LEFT JOIN users u ON u.id=w.user_id WHERE b.course_id=? ORDER BY w.awarded_at").bind(courseId).all()).results) || [];
    return json({ scope: "teacher", notice: NOTICE, badges: badges.map((b) => ({ ...b, criteria: JSON.parse(b.criteria), holders: holders.filter((h) => h.badge_id === b.id) })) });
  }
  const now = Date.now();
  const lessonCount = await lessonCountOf(env, courseId);
  const out = [];
  for (const b of badges) {
    const criteria = JSON.parse(b.criteria);
    let award = await env.DB.prepare("SELECT id, awarded_at, how FROM badge_awards WHERE badge_id=? AND user_id=?").bind(b.id, user.id).first();
    if (!award && await meets(env, criteria, courseId, user.id, lessonCount)) {
      const id = newId();
      const r = await env.DB.prepare("INSERT OR IGNORE INTO badge_awards (id, badge_id, user_id, awarded_at, awarded_by, how) VALUES (?,?,?,?,NULL,'earned')").bind(id, b.id, user.id, now).run();
      if (r.meta && r.meta.changes) {
        await logEvent(env, user, "badge_earned", b.id, b.name, { targetType: "badge" });
        await notify(env, [user.id], { kind: "graded", courseId, title: `Badge earned: ${b.name}`, url: `/badge?id=${id}` });
      }
      award = await env.DB.prepare("SELECT id, awarded_at, how FROM badge_awards WHERE badge_id=? AND user_id=?").bind(b.id, user.id).first();
    }
    out.push({ id: b.id, name: b.name, description: b.description, criteria, earned: !!award, award_id: award ? award.id : null, awarded_at: award ? award.awarded_at : null });
  }
  return json({ scope: "learner", notice: NOTICE, badges: out });
}

export async function onRequestPost({ request, env }) {
  let b; try { b = await request.json(); } catch { return json({ error: "bad request" }, 400); }
  if (!b || typeof b !== "object") return json({ error: "bad request" }, 400);
  await ensureBadges(env);
  const now = Date.now();
  if (b.action === "create") {
    const { user, error } = await courseAccess(env, request, b.courseId, "teacher");
    if (error) return error;
    const name = cleanText(b.name, 80);
    if (!name) return json({ error: "Name the badge." }, 400);
    if (/\b(credit|credential|degree|diploma|accredit|certified|qualification)/i.test(name + " " + (b.description || ""))) {
      return json({ error: "Badges record participation only. Please avoid words like credit, credential, degree or qualification." }, 400);
    }
    const criteria = cleanCriteria(b.criteria);
    if (criteria.quizId) {
      await ensureQuizzes(env);
      const q = await env.DB.prepare("SELECT course_id FROM lms_quizzes WHERE id=?").bind(criteria.quizId).first();
      if (!q || q.course_id !== b.courseId) return json({ error: "That quiz isn't in this course." }, 400);
    }
    const id = newId();
    await env.DB.prepare("INSERT INTO badges (id, course_id, name, description, criteria, created_by, created_at) VALUES (?,?,?,?,?,?,?)")
      .bind(id, b.courseId, name, cleanText(b.description, 400) || null, JSON.stringify(criteria), user.id, now).run();
    await logEvent(env, user, "badge_created", id, name, { targetType: "badge" });
    return json({ ok: true, id, criteria });
  }
  const badge = b.badgeId ? await env.DB.prepare("SELECT * FROM badges WHERE id=?").bind(String(b.badgeId)).first() : null;
  if (!badge) return json({ error: "not found" }, 404);
  const { user, error } = await courseAccess(env, request, badge.course_id, "teacher");
  if (error) return error;
  if (b.action === "delete") {
    await env.DB.prepare("DELETE FROM badge_awards WHERE badge_id=?").bind(badge.id).run();
    await env.DB.prepare("DELETE FROM badges WHERE id=?").bind(badge.id).run();
    await logEvent(env, user, "badge_deleted", badge.id, badge.name, { targetType: "badge" });
    return json({ ok: true });
  }
  if (b.action === "award" || b.action === "revoke") {
    const uid = String(b.userId || "").slice(0, 64);
    const enrolled = await env.DB.prepare("SELECT 1 AS x FROM enrollments WHERE user_id=? AND kind='course' AND target_id=?").bind(uid, badge.course_id).first();
    if (!enrolled) return json({ error: "That learner isn't in this course." }, 400);
    if (b.action === "award") {
      const id = newId();
      const r = await env.DB.prepare("INSERT OR IGNORE INTO badge_awards (id, badge_id, user_id, awarded_at, awarded_by, how) VALUES (?,?,?,?,?,'awarded')").bind(id, badge.id, uid, now, user.id).run();
      if (r.meta && r.meta.changes) await notify(env, [uid], { kind: "graded", courseId: badge.course_id, title: `Badge awarded: ${badge.name}`, url: `/badge?id=${id}` });
    } else {
      await env.DB.prepare("DELETE FROM badge_awards WHERE badge_id=? AND user_id=?").bind(badge.id, uid).run();
    }
    await logEvent(env, user, b.action === "award" ? "badge_awarded" : "badge_revoked", badge.id, badge.name, { subject: uid, targetType: "badge" });
    return json({ ok: true });
  }
  return json({ error: "unknown action" }, 400);
}
