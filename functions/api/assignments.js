import { schemaOnce } from "./_schema-once.js";
import { json, getUser, newId, logEvent } from "./_lib.js";

async function ensure(env) {
  return schemaOnce(env.DB, "assignments", async () => {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS assignments (id TEXT PRIMARY KEY, course_id TEXT NOT NULL, teacher_id TEXT NOT NULL, " +
    "title TEXT NOT NULL, instructions TEXT NOT NULL, due_at INTEGER, points INTEGER NOT NULL DEFAULT 100, " +
    "allow_file INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)"
  ).run();
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS submissions (id TEXT PRIMARY KEY, assignment_id TEXT NOT NULL, user_id TEXT NOT NULL, " +
    "text_content TEXT, file_key TEXT, submitted_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, late INTEGER NOT NULL DEFAULT 0, " +
    "grade INTEGER, feedback TEXT, graded_by TEXT, graded_at INTEGER, status TEXT NOT NULL DEFAULT 'submitted', " +
    "UNIQUE (assignment_id, user_id))"
  ).run();
  });
}

async function ownsCourse(env, user, courseId) {
  if (user.role === "admin") return true;
  if (user.role !== "teacher") return false;
  const r = await env.DB.prepare("SELECT 1 FROM course_teachers WHERE user_id=? AND course_id=?").bind(user.id, courseId).first();
  return !!r;
}

// GET /api/assignments?courseId=... ->
//   teacher/admin (owning the course): every assignment, any status, with
//     submitted/graded counts for the dashboard strip.
//   learner (enrolled in the course): open/closed assignments only, each
//     annotated with the student's own submission state.
export async function onRequestGet({ request, env }) {
  const user = await getUser(env, request);
  if (!user) return json({ error: "Please sign in." }, 401);
  await ensure(env);
  const courseId = new URL(request.url).searchParams.get("courseId");
  if (!courseId) return json({ error: "courseId required" }, 400);

  if (user.role === "teacher" || user.role === "admin") {
    if (!(await ownsCourse(env, user, courseId))) return json({ error: "forbidden" }, 403);
    const { results } = await env.DB.prepare(
      "SELECT a.id, a.title, a.instructions, a.due_at, a.points, a.allow_file, a.status, a.created_at, " +
      "(SELECT COUNT(*) FROM submissions s WHERE s.assignment_id=a.id) AS submitted_count, " +
      "(SELECT COUNT(*) FROM submissions s WHERE s.assignment_id=a.id AND s.status='graded') AS graded_count " +
      "FROM assignments a WHERE a.course_id=? ORDER BY a.created_at DESC"
    ).bind(courseId).all();
    return json({ scope: "teacher", assignments: results || [] });
  }

  const enrolled = await env.DB.prepare("SELECT 1 FROM enrollments WHERE user_id=? AND kind='course' AND target_id=?").bind(user.id, courseId).first();
  if (!enrolled) return json({ error: "forbidden" }, 403);
  const { results } = await env.DB.prepare(
    "SELECT a.id, a.title, a.instructions, a.due_at, a.points, a.allow_file, a.status, " +
    "s.status AS my_status, s.grade AS my_grade, s.feedback AS my_feedback, s.submitted_at AS my_submitted_at, s.late AS my_late " +
    "FROM assignments a LEFT JOIN submissions s ON s.assignment_id=a.id AND s.user_id=? " +
    "WHERE a.course_id=? AND a.status != 'draft' ORDER BY a.due_at IS NULL, a.due_at ASC"
  ).bind(user.id, courseId).all();
  return json({ scope: "student", assignments: results || [] });
}

// POST /api/assignments — teacher/admin only, scoped to courses they own.
//   create: { courseId, title, instructions, dueAt?, points?, allowFile? }
//   update: { id, title?, instructions?, dueAt?, points?, allowFile? }
//   { id, action: 'close'|'reopen'|'delete' }
export async function onRequestPost({ request, env }) {
  const user = await getUser(env, request);
  if (!user || (user.role !== "teacher" && user.role !== "admin")) return json({ error: "forbidden" }, 403);
  await ensure(env);
  let b; try { b = await request.json(); } catch (e) { return json({ error: "bad request" }, 400); }
  const now = Date.now();

  if (!b.id) {
    const courseId = (b.courseId || "").toString().slice(0, 120);
    const title = (b.title || "").trim().slice(0, 200);
    const instructions = (b.instructions || "").trim().slice(0, 4000);
    if (!courseId || !title || !instructions) return json({ error: "courseId, title, and instructions required" }, 400);
    if (!(await ownsCourse(env, user, courseId))) return json({ error: "forbidden" }, 403);
    const points = Math.max(1, Math.min(1000, parseInt(b.points, 10) || 100));
    const dueAt = Number.isFinite(Number(b.dueAt)) && b.dueAt ? Number(b.dueAt) : null;
    const id = newId();
    await env.DB.prepare(
      "INSERT INTO assignments (id, course_id, teacher_id, title, instructions, due_at, points, allow_file, status, created_at, updated_at) " +
      "VALUES (?,?,?,?,?,?,?,?, 'open', ?, ?)"
    ).bind(id, courseId, user.id, title, instructions, dueAt, points, b.allowFile ? 1 : 0, now, now).run();
    await logEvent(env, user, "assignment_created", id, courseId);
    return json({ ok: true, id });
  }

  const a = await env.DB.prepare("SELECT course_id FROM assignments WHERE id=?").bind(b.id).first();
  if (!a) return json({ error: "not found" }, 404);
  if (!(await ownsCourse(env, user, a.course_id))) return json({ error: "forbidden" }, 403);

  if (b.action === "close") { await env.DB.prepare("UPDATE assignments SET status='closed', updated_at=? WHERE id=?").bind(now, b.id).run(); await logEvent(env, user, "assignment_closed", b.id, null); return json({ ok: true }); }
  if (b.action === "reopen") { await env.DB.prepare("UPDATE assignments SET status='open', updated_at=? WHERE id=?").bind(now, b.id).run(); await logEvent(env, user, "assignment_reopened", b.id, null); return json({ ok: true }); }
  if (b.action === "delete") { await env.DB.prepare("DELETE FROM submissions WHERE assignment_id=?").bind(b.id).run(); await env.DB.prepare("DELETE FROM assignments WHERE id=?").bind(b.id).run(); await logEvent(env, user, "assignment_deleted", b.id, null); return json({ ok: true }); }

  const title = b.title != null ? String(b.title).trim().slice(0, 200) : null;
  const instructions = b.instructions != null ? String(b.instructions).trim().slice(0, 4000) : null;
  const points = b.points != null ? Math.max(1, Math.min(1000, parseInt(b.points, 10) || 100)) : null;
  const dueAt = b.dueAt !== undefined ? (Number.isFinite(Number(b.dueAt)) && b.dueAt ? Number(b.dueAt) : null) : undefined;
  await env.DB.prepare(
    "UPDATE assignments SET title=COALESCE(?,title), instructions=COALESCE(?,instructions), points=COALESCE(?,points), " +
    "due_at=CASE WHEN ? THEN due_at ELSE ? END, allow_file=COALESCE(?,allow_file), updated_at=? WHERE id=?"
  ).bind(title, instructions, points, dueAt === undefined ? 1 : 0, dueAt === undefined ? null : dueAt, b.allowFile != null ? (b.allowFile ? 1 : 0) : null, now, b.id).run();
  await logEvent(env, user, "assignment_updated", b.id, null);
  return json({ ok: true });
}
