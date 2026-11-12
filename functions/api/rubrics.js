import { json, getUser, newId, logEvent } from "./_lib.js";
import { schemaOnce } from "./_schema-once.js";
import { courseAccess, cleanText } from "./_course-auth.js";

// C4 Rubrics + a per-teacher comment library (Canvas Rubrics / SpeedGrader comment
// library, Moodle Advanced grading). Grading itself stays in submissions/grade.js.
//
// GET  /api/rubrics?courseId=        teacher: the course's rubrics, which assignment uses which, my saved comments
// GET  /api/rubrics?assignmentId=    member: the rubric attached to that assignment (learners see the criteria)
// POST /api/rubrics (teacher of the course):
//   { action:"create", courseId, title, criteria:[{ title, description?, points, levels?:[{ label, points }] }] }
//   { action:"update", id, title?, criteria? }      criterion ids are kept, so existing assessments still line up
//   { action:"delete", id }                         also detaches it from assignments
//   { action:"attach", assignmentId, rubricId|null }
// POST /api/rubrics (any teacher/admin, own library only):
//   { action:"comment_add", text } | { action:"comment_delete", id }

export function ensureRubrics(env) {
  return schemaOnce(env.DB, "rubrics", async () => {
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS rubrics (id TEXT PRIMARY KEY, course_id TEXT NOT NULL, title TEXT NOT NULL, criteria TEXT NOT NULL, " +
      "created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)").run();
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_rubrics_course ON rubrics(course_id)").run();
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS assignment_rubrics (assignment_id TEXT PRIMARY KEY, rubric_id TEXT NOT NULL)").run();
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS submission_grading (submission_id TEXT PRIMARY KEY, rubric_id TEXT, rubric_scores TEXT, " +
      "raw_grade INTEGER, penalty_pct INTEGER NOT NULL DEFAULT 0, graded_by TEXT, updated_at INTEGER NOT NULL)").run();
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS grading_comments (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, text TEXT NOT NULL, created_at INTEGER NOT NULL)").run();
  });
}

const int = (v, lo, hi) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };

/** Validate criteria; keeps a criterion's id when the teacher edits it. Returns array or error string. */
export function cleanCriteria(list) {
  if (!Array.isArray(list) || !list.length) return "Add at least one criterion.";
  if (list.length > 20) return "At most 20 criteria.";
  const out = [];
  for (const c of list) {
    const title = cleanText(c && c.title, 120);
    const points = int(c && c.points, 0, 1000);
    if (!title || points == null) return "Each criterion needs a title and points (0–1000).";
    const item = { id: /^[a-z0-9]{6,32}$/.test(c.id || "") ? c.id : newId().slice(0, 12), title, points };
    const description = cleanText(c.description, 500);
    if (description) item.description = description;
    if (Array.isArray(c.levels) && c.levels.length) {
      const levels = c.levels.slice(0, 6).map((l) => ({ label: cleanText(l && l.label, 60), points: int(l && l.points, 0, points) }));
      if (levels.some((l) => !l.label || l.points == null)) return `Each level of "${title}" needs a label and points within 0–${points}.`;
      item.levels = levels;
    }
    out.push(item);
  }
  return out;
}

/** Score a rubric: per-criterion points (clamped) and comments. Returns { scores, raw, total } or error string. */
export function scoreRubric(criteria, input) {
  if (!input || typeof input !== "object") return "Score every criterion.";
  const scores = {};
  let raw = 0, total = 0;
  for (const c of criteria) {
    total += c.points;
    const s = input[c.id];
    const p = s == null ? null : int(s.points, 0, c.points);
    if (p == null) return `Score "${c.title}" (0–${c.points}).`;
    scores[c.id] = { points: p };
    const comment = cleanText(s.comment, 1000);
    if (comment) scores[c.id].comment = comment;
    raw += p;
  }
  return { scores, raw, total };
}

export async function rubricForAssignment(env, assignmentId) {
  await ensureRubrics(env);
  const r = await env.DB.prepare("SELECT r.id, r.title, r.criteria FROM assignment_rubrics ar JOIN rubrics r ON r.id=ar.rubric_id WHERE ar.assignment_id=?").bind(assignmentId).first();
  return r ? { id: r.id, title: r.title, criteria: JSON.parse(r.criteria) } : null;
}

const isStaff = (u) => u && (u.role === "teacher" || u.role === "admin");

export async function onRequestGet({ request, env }) {
  const sp = new URL(request.url).searchParams;
  await ensureRubrics(env);
  const assignmentId = sp.get("assignmentId");
  if (assignmentId) {
    const a = await env.DB.prepare("SELECT course_id FROM assignments WHERE id=?").bind(assignmentId).first().catch(() => null);
    if (!a) return json({ error: "not found" }, 404);
    const { error } = await courseAccess(env, request, a.course_id, "member");
    if (error) return error;
    return json({ rubric: await rubricForAssignment(env, assignmentId) });
  }
  const courseId = sp.get("courseId");
  const { user, error } = await courseAccess(env, request, courseId, "teacher");
  if (error) return error;
  const { results } = await env.DB.prepare("SELECT id, title, criteria, updated_at FROM rubrics WHERE course_id=? ORDER BY title").bind(courseId).all();
  const att = await env.DB.prepare("SELECT ar.assignment_id, ar.rubric_id FROM assignment_rubrics ar JOIN assignments a ON a.id=ar.assignment_id WHERE a.course_id=?").bind(courseId).all().catch(() => ({ results: [] }));
  const comments = await env.DB.prepare("SELECT id, text FROM grading_comments WHERE user_id=? ORDER BY created_at DESC LIMIT 200").bind(user.id).all();
  return json({
    rubrics: (results || []).map((r) => ({ ...r, criteria: JSON.parse(r.criteria) })),
    attached: Object.fromEntries((att.results || []).map((r) => [r.assignment_id, r.rubric_id])),
    comments: comments.results || [],
  });
}

export async function onRequestPost({ request, env }) {
  let b; try { b = await request.json(); } catch { return json({ error: "bad request" }, 400); }
  if (!b || typeof b !== "object") return json({ error: "bad request" }, 400);
  await ensureRubrics(env);
  const now = Date.now();

  if (b.action === "comment_add" || b.action === "comment_delete") {
    const user = await getUser(env, request);
    if (!user) return json({ error: "Please sign in." }, 401);
    if (!isStaff(user)) return json({ error: "forbidden" }, 403);
    if (b.action === "comment_delete") {
      await env.DB.prepare("DELETE FROM grading_comments WHERE id=? AND user_id=?").bind(String(b.id || ""), user.id).run();
      return json({ ok: true });
    }
    const text = cleanText(b.text, 1000);
    if (!text) return json({ error: "Write the comment first." }, 400);
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM grading_comments WHERE user_id=?").bind(user.id).first();
    if (n && n.n >= 200) return json({ error: "Your library is full (200). Delete some first." }, 400);
    const id = newId();
    await env.DB.prepare("INSERT INTO grading_comments (id, user_id, text, created_at) VALUES (?,?,?,?)").bind(id, user.id, text, now).run();
    return json({ ok: true, id });
  }

  if (b.action === "create") {
    const { user, error } = await courseAccess(env, request, b.courseId, "teacher");
    if (error) return error;
    const title = cleanText(b.title, 160);
    if (!title) return json({ error: "Give the rubric a title." }, 400);
    const criteria = cleanCriteria(b.criteria);
    if (typeof criteria === "string") return json({ error: criteria }, 400);
    const id = newId();
    await env.DB.prepare("INSERT INTO rubrics (id, course_id, title, criteria, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?)")
      .bind(id, b.courseId, title, JSON.stringify(criteria), user.id, now, now).run();
    await logEvent(env, user, "rubric_created", id, title, { targetType: "rubric" });
    return json({ ok: true, id, criteria });
  }

  if (b.action === "attach") {
    const a = await env.DB.prepare("SELECT course_id FROM assignments WHERE id=?").bind(String(b.assignmentId || "")).first().catch(() => null);
    if (!a) return json({ error: "assignment not found" }, 404);
    const { user, error } = await courseAccess(env, request, a.course_id, "teacher");
    if (error) return error;
    if (b.rubricId) {
      const r = await env.DB.prepare("SELECT course_id FROM rubrics WHERE id=?").bind(String(b.rubricId)).first();
      if (!r || r.course_id !== a.course_id) return json({ error: "That rubric belongs to another course." }, 400);
      await env.DB.prepare("INSERT INTO assignment_rubrics (assignment_id, rubric_id) VALUES (?,?) ON CONFLICT(assignment_id) DO UPDATE SET rubric_id=excluded.rubric_id").bind(b.assignmentId, b.rubricId).run();
    } else {
      await env.DB.prepare("DELETE FROM assignment_rubrics WHERE assignment_id=?").bind(b.assignmentId).run();
    }
    await logEvent(env, user, "rubric_attached", b.assignmentId, b.rubricId || "none", { targetType: "assignment" });
    return json({ ok: true });
  }

  const r = b.id ? await env.DB.prepare("SELECT * FROM rubrics WHERE id=?").bind(String(b.id)).first() : null;
  if (!r) return json({ error: "not found" }, 404);
  const { user, error } = await courseAccess(env, request, r.course_id, "teacher");
  if (error) return error;
  if (b.action === "delete") {
    await env.DB.prepare("DELETE FROM assignment_rubrics WHERE rubric_id=?").bind(r.id).run();
    await env.DB.prepare("DELETE FROM rubrics WHERE id=?").bind(r.id).run();
    await logEvent(env, user, "rubric_deleted", r.id, r.title, { targetType: "rubric" });
    return json({ ok: true });
  }
  if (b.action === "update") {
    const title = b.title != null ? cleanText(b.title, 160) || null : null;
    let criteria = null;
    if (b.criteria != null) {
      criteria = cleanCriteria(b.criteria);
      if (typeof criteria === "string") return json({ error: criteria }, 400);
    }
    await env.DB.prepare("UPDATE rubrics SET title=COALESCE(?,title), criteria=COALESCE(?,criteria), updated_at=? WHERE id=?")
      .bind(title, criteria ? JSON.stringify(criteria) : null, now, r.id).run();
    await logEvent(env, user, "rubric_updated", r.id, title || r.title, { targetType: "rubric" });
    return json({ ok: true });
  }
  return json({ error: "unknown action" }, 400);
}
