import { json, logEvent } from "./_lib.js";
import { schemaOnce } from "./_schema-once.js";
import { courseAccess, cleanText } from "./_course-auth.js";

// C7 (Canvas "Assign To" / late policies, Moodle user overrides): per-assignment
// late policy, per-learner due-date extensions, and per-learner accommodations
// (extra time on timed quizzes, used by the Phase 3 quiz engine).
//
// GET  /api/course-policies?courseId=  teacher: everything for the course;
//                                      learner: only their own extensions/accommodation.
// POST /api/course-policies (teacher of the course, or admin):
//   { action:"late_policy", assignmentId, latePenaltyPerDay (0-100), maxLateDays (null|0-365) }
//   { action:"extension",  assignmentId, userId, dueAt (ms) | null to remove, reason? }
//   { action:"accommodation", courseId, userId, extraTimePct (0-300), note? }
// Every change is audited with before/after.

export async function ensurePolicies(env) {
  return schemaOnce(env.DB, "course_policies", async () => {
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS assignment_policies (assignment_id TEXT PRIMARY KEY, late_penalty_per_day INTEGER NOT NULL DEFAULT 0, max_late_days INTEGER, updated_at INTEGER NOT NULL)").run();
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS assignment_extensions (assignment_id TEXT NOT NULL, user_id TEXT NOT NULL, due_at INTEGER NOT NULL, reason TEXT, created_by TEXT, created_at INTEGER NOT NULL, PRIMARY KEY (assignment_id, user_id))").run();
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS course_accommodations (course_id TEXT NOT NULL, user_id TEXT NOT NULL, extra_time_pct INTEGER NOT NULL DEFAULT 0, note TEXT, created_by TEXT, updated_at INTEGER NOT NULL, PRIMARY KEY (course_id, user_id))").run();
  });
}

const DAY = 24 * 60 * 60 * 1000;

/** The due date that applies to this learner (extension wins), and the policy. */
export async function dueFor(env, assignment, assignmentId, userId) {
  await ensurePolicies(env);
  const ext = userId ? await env.DB.prepare("SELECT due_at FROM assignment_extensions WHERE assignment_id=? AND user_id=?").bind(assignmentId, userId).first() : null;
  const pol = await env.DB.prepare("SELECT late_penalty_per_day, max_late_days FROM assignment_policies WHERE assignment_id=?").bind(assignmentId).first();
  return {
    dueAt: ext ? ext.due_at : assignment.due_at || null,
    extended: !!ext,
    latePenaltyPerDay: pol ? pol.late_penalty_per_day : 0,
    maxLateDays: pol && pol.max_late_days != null ? pol.max_late_days : null,
  };
}

/** Percentage deducted for a submission at `submittedAt` (whole days late, capped at 100). */
export function latePenaltyPct(due, submittedAt) {
  if (!due.dueAt || !submittedAt || submittedAt <= due.dueAt || !due.latePenaltyPerDay) return 0;
  const days = Math.ceil((submittedAt - due.dueAt) / DAY);
  return Math.min(100, days * due.latePenaltyPerDay);
}

/** Past the hard cutoff (due + maxLateDays)? */
export function pastCutoff(due, now) {
  return !!(due.dueAt && due.maxLateDays != null && now > due.dueAt + due.maxLateDays * DAY);
}

const int = (v, lo, hi) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : null; };

export async function onRequestGet({ request, env }) {
  const courseId = new URL(request.url).searchParams.get("courseId");
  const { user, teach, error } = await courseAccess(env, request, courseId, "member");
  if (error) return error;
  await ensurePolicies(env);
  const ids = await env.DB.prepare("SELECT id, title, due_at, status FROM assignments WHERE course_id=? ORDER BY due_at IS NULL, due_at").bind(courseId).all().catch(() => ({ results: [] }));
  const aIds = (ids.results || []).map((r) => r.id);
  const inList = aIds.length ? `(${aIds.map(() => "?").join(",")})` : "('')";
  if (teach) {
    const pol = await env.DB.prepare(`SELECT * FROM assignment_policies WHERE assignment_id IN ${inList}`).bind(...aIds).all();
    const ext = await env.DB.prepare(`SELECT e.assignment_id, e.user_id, e.due_at, e.reason, u.email, u.name FROM assignment_extensions e LEFT JOIN users u ON u.id=e.user_id WHERE e.assignment_id IN ${inList}`).bind(...aIds).all();
    const acc = await env.DB.prepare("SELECT a.user_id, a.extra_time_pct, a.note, u.email, u.name FROM course_accommodations a LEFT JOIN users u ON u.id=a.user_id WHERE a.course_id=?").bind(courseId).all();
    // Roster for the extension/accommodation pickers (the gradebook already shows teachers the same names/emails).
    const learners = await env.DB.prepare("SELECT u.id, u.name, u.email FROM enrollments e JOIN users u ON u.id=e.user_id WHERE e.kind='course' AND e.target_id=? ORDER BY u.name LIMIT 2000").bind(courseId).all();
    return json({ scope: "teacher", assignments: ids.results || [], learners: learners.results || [], policies: pol.results || [], extensions: ext.results || [], accommodations: acc.results || [] });
  }
  const ext = await env.DB.prepare(`SELECT assignment_id, due_at FROM assignment_extensions WHERE user_id=? AND assignment_id IN ${inList}`).bind(user.id, ...aIds).all();
  const acc = await env.DB.prepare("SELECT extra_time_pct FROM course_accommodations WHERE course_id=? AND user_id=?").bind(courseId, user.id).first();
  return json({ scope: "learner", extensions: ext.results || [], accommodation: acc || null });
}

export async function onRequestPost({ request, env }) {
  let b; try { b = await request.json(); } catch { return json({ error: "bad request" }, 400); }
  let courseId = b && b.courseId;
  if (b && b.assignmentId) {
    const a = await env.DB.prepare("SELECT course_id FROM assignments WHERE id=?").bind(String(b.assignmentId)).first().catch(() => null);
    if (!a) return json({ error: "assignment not found" }, 404);
    courseId = a.course_id;
  }
  const { user, error } = await courseAccess(env, request, courseId, "teacher");
  if (error) return error;
  await ensurePolicies(env);
  const now = Date.now();

  if (b.action === "late_policy") {
    const pen = int(b.latePenaltyPerDay, 0, 100) ?? 0;
    const max = b.maxLateDays == null || b.maxLateDays === "" ? null : int(b.maxLateDays, 0, 365);
    const before = await env.DB.prepare("SELECT late_penalty_per_day, max_late_days FROM assignment_policies WHERE assignment_id=?").bind(b.assignmentId).first();
    await env.DB.prepare("INSERT INTO assignment_policies (assignment_id, late_penalty_per_day, max_late_days, updated_at) VALUES (?,?,?,?) ON CONFLICT(assignment_id) DO UPDATE SET late_penalty_per_day=excluded.late_penalty_per_day, max_late_days=excluded.max_late_days, updated_at=excluded.updated_at")
      .bind(b.assignmentId, pen, max, now).run();
    await logEvent(env, user, "late_policy_set", b.assignmentId, null, { targetType: "assignment", before: before || null, after: { late_penalty_per_day: pen, max_late_days: max } });
    return json({ ok: true });
  }

  if (b.action === "extension") {
    const uid = cleanText(b.userId, 64);
    if (!uid) return json({ error: "userId required" }, 400);
    const enrolled = await env.DB.prepare("SELECT 1 AS x FROM enrollments WHERE user_id=? AND kind='course' AND target_id=?").bind(uid, courseId).first();
    if (!enrolled) return json({ error: "That learner is not enrolled in this course." }, 400);
    const before = await env.DB.prepare("SELECT due_at FROM assignment_extensions WHERE assignment_id=? AND user_id=?").bind(b.assignmentId, uid).first();
    if (b.dueAt == null) {
      await env.DB.prepare("DELETE FROM assignment_extensions WHERE assignment_id=? AND user_id=?").bind(b.assignmentId, uid).run();
    } else {
      const due = Number(b.dueAt);
      if (!Number.isFinite(due) || due < now - DAY) return json({ error: "dueAt must be a future time" }, 400);
      await env.DB.prepare("INSERT INTO assignment_extensions (assignment_id, user_id, due_at, reason, created_by, created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(assignment_id, user_id) DO UPDATE SET due_at=excluded.due_at, reason=excluded.reason, created_by=excluded.created_by, created_at=excluded.created_at")
        .bind(b.assignmentId, uid, due, cleanText(b.reason, 300) || null, user.id, now).run();
    }
    await logEvent(env, user, "extension_set", b.assignmentId, null, { subject: uid, targetType: "assignment", before: before ? before.due_at : null, after: b.dueAt == null ? null : Number(b.dueAt) });
    return json({ ok: true });
  }

  if (b.action === "accommodation") {
    const uid = cleanText(b.userId, 64);
    if (!uid) return json({ error: "userId required" }, 400);
    const pct = int(b.extraTimePct, 0, 300) ?? 0;
    const before = await env.DB.prepare("SELECT extra_time_pct FROM course_accommodations WHERE course_id=? AND user_id=?").bind(courseId, uid).first();
    if (pct === 0) await env.DB.prepare("DELETE FROM course_accommodations WHERE course_id=? AND user_id=?").bind(courseId, uid).run();
    else await env.DB.prepare("INSERT INTO course_accommodations (course_id, user_id, extra_time_pct, note, created_by, updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(course_id, user_id) DO UPDATE SET extra_time_pct=excluded.extra_time_pct, note=excluded.note, created_by=excluded.created_by, updated_at=excluded.updated_at")
      .bind(courseId, uid, pct, cleanText(b.note, 300) || null, user.id, now).run();
    await logEvent(env, user, "accommodation_set", courseId, null, { subject: uid, targetType: "course", before: before ? before.extra_time_pct : 0, after: pct });
    return json({ ok: true });
  }
  return json({ error: "unknown action" }, 400);
}
