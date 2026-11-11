import { json, logEvent } from "./_lib.js";
import { schemaOnce } from "./_schema-once.js";
import { courseAccess } from "./_course-auth.js";

// C3 conditional release (Moodle "Restrict access", Canvas module requirements), for
// teacher-created items: assignments and polls/surveys. Optional per item; with no rule
// an item is open, as before. Lessons and Gurbani content are never gated here (plan:
// open access is a core value).
// A rule can require any of: a number of completed lessons in the course, a passed course
// quiz (the existing >= 80 pass), and a release date. All set conditions must hold.
//
// GET  /api/release-rules?courseId=   teacher: the course's rules
// POST /api/release-rules { courseId, itemType:"assignment"|"poll", itemId, minLessons?, requireQuizPass?, notBefore? }
//      all empty -> the rule is removed

const TYPES = { assignment: "assignments", poll: "polls" };

export function ensureRelease(env) {
  return schemaOnce(env.DB, "release_rules", () => env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS release_rules (item_type TEXT NOT NULL, item_id TEXT NOT NULL, course_id TEXT NOT NULL, min_lessons INTEGER, " +
    "require_quiz_pass INTEGER NOT NULL DEFAULT 0, not_before INTEGER, updated_by TEXT, updated_at INTEGER NOT NULL, PRIMARY KEY (item_type, item_id))"
  ).run());
}

/** Rules for a course, keyed "type:id". */
export async function courseRules(env, courseId) {
  await ensureRelease(env);
  const { results } = await env.DB.prepare("SELECT * FROM release_rules WHERE course_id=?").bind(courseId).all();
  return Object.fromEntries((results || []).map((r) => [`${r.item_type}:${r.item_id}`, r]));
}

/** The learner's progress in a course: completed lesson count and whether the quiz is passed. */
export async function learnerProgress(env, userId, courseId) {
  const p = await env.DB.prepare("SELECT done, passed_score FROM progress WHERE user_id=? AND course_id=?").bind(userId, courseId).first().catch(() => null);
  let lessons = 0;
  try { lessons = p && p.done ? JSON.parse(p.done).length : 0; } catch { lessons = 0; }
  return { lessons, quizPassed: !!(p && p.passed_score != null) };
}

/** null when released, otherwise a learner-facing reason. */
export function lockReason(rule, progress, now = Date.now()) {
  if (!rule) return null;
  const date = rule.not_before && now < rule.not_before ? new Date(rule.not_before).toUTCString().slice(0, 16) : null;
  const conds = [];
  if (rule.min_lessons && progress.lessons < rule.min_lessons) conds.push(`complete ${rule.min_lessons} lesson${rule.min_lessons === 1 ? "" : "s"} (you have ${progress.lessons})`);
  if (rule.require_quiz_pass && !progress.quizPassed) conds.push("pass the course quiz");
  if (!date && !conds.length) return null;
  if (!conds.length) return `Opens on ${date}.`;
  return `Unlocks when you ${conds.join(" and ")}${date ? `, and not before ${date}` : ""}.`;
}

/** Convenience for handlers: is this one item locked for this learner? */
export async function itemLock(env, itemType, itemId, courseId, userId) {
  await ensureRelease(env);
  const rule = await env.DB.prepare("SELECT * FROM release_rules WHERE item_type=? AND item_id=?").bind(itemType, itemId).first();
  if (!rule) return null;
  return lockReason(rule, await learnerProgress(env, userId, courseId));
}

export async function onRequestGet({ request, env }) {
  const courseId = new URL(request.url).searchParams.get("courseId");
  const { error } = await courseAccess(env, request, courseId, "teacher");
  if (error) return error;
  return json({ rules: Object.values(await courseRules(env, courseId)) });
}

const int = (v, lo, hi) => { if (v == null || v === "") return null; const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : null; };

export async function onRequestPost({ request, env }) {
  let b; try { b = await request.json(); } catch { return json({ error: "bad request" }, 400); }
  const { user, error } = await courseAccess(env, request, b && b.courseId, "teacher");
  if (error) return error;
  const table = TYPES[b.itemType];
  if (!table) return json({ error: "itemType must be assignment or poll" }, 400);
  const item = await env.DB.prepare(`SELECT course_id FROM ${table} WHERE id=?`).bind(String(b.itemId || "")).first().catch(() => null);
  if (!item || item.course_id !== b.courseId) return json({ error: "That item isn't in this course." }, 404);
  await ensureRelease(env);
  const minLessons = int(b.minLessons, 1, 1000);
  const requireQuiz = b.requireQuizPass ? 1 : 0;
  const notBefore = int(b.notBefore, 0, 8.64e15);
  const before = await env.DB.prepare("SELECT min_lessons, require_quiz_pass, not_before FROM release_rules WHERE item_type=? AND item_id=?").bind(b.itemType, b.itemId).first();
  if (!minLessons && !requireQuiz && !notBefore) {
    await env.DB.prepare("DELETE FROM release_rules WHERE item_type=? AND item_id=?").bind(b.itemType, b.itemId).run();
  } else {
    await env.DB.prepare("INSERT INTO release_rules (item_type, item_id, course_id, min_lessons, require_quiz_pass, not_before, updated_by, updated_at) VALUES (?,?,?,?,?,?,?,?) " +
      "ON CONFLICT(item_type, item_id) DO UPDATE SET min_lessons=excluded.min_lessons, require_quiz_pass=excluded.require_quiz_pass, not_before=excluded.not_before, updated_by=excluded.updated_by, updated_at=excluded.updated_at")
      .bind(b.itemType, b.itemId, b.courseId, minLessons, requireQuiz, notBefore, user.id, Date.now()).run();
  }
  await logEvent(env, user, "release_rule_set", b.itemId, b.itemType, { targetType: b.itemType, before: before || null, after: { min_lessons: minLessons, require_quiz_pass: requireQuiz, not_before: notBefore } });
  return json({ ok: true });
}
