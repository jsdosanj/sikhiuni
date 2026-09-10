import { schemaOnce } from "./_schema-once.js";
import { json, getUser, newId, logEvent } from "./_lib.js";

async function ensure(env) {
  return schemaOnce(env.DB, "submissions", async () => {
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

// GET /api/submissions?assignmentId=...       -> teacher/admin roster (must own the course)
// GET /api/submissions?assignmentId=...&mine=1 -> the signed-in student's own submission (or null)
export async function onRequestGet({ request, env }) {
  const user = await getUser(env, request);
  if (!user) return json({ error: "Please sign in." }, 401);
  await ensure(env);
  const p = new URL(request.url).searchParams;
  const assignmentId = p.get("assignmentId");
  if (!assignmentId) return json({ error: "assignmentId required" }, 400);

  const assignment = await env.DB.prepare("SELECT course_id, points FROM assignments WHERE id=?").bind(assignmentId).first();
  if (!assignment) return json({ error: "not found" }, 404);

  if (p.get("mine") === "1") {
    const row = await env.DB.prepare(
      "SELECT id, text_content, file_key, submitted_at, updated_at, late, grade, feedback, status FROM submissions WHERE assignment_id=? AND user_id=?"
    ).bind(assignmentId, user.id).first();
    return json({ submission: row || null, points: assignment.points });
  }

  if (!(await ownsCourse(env, user, assignment.course_id))) return json({ error: "forbidden" }, 403);
  const { results } = await env.DB.prepare(
    "SELECT sub.id, sub.user_id, u.email, u.name, sub.text_content, sub.file_key, sub.submitted_at, sub.updated_at, " +
    "sub.late, sub.grade, sub.feedback, sub.status FROM submissions sub JOIN users u ON u.id=sub.user_id " +
    "WHERE sub.assignment_id=? ORDER BY sub.submitted_at DESC"
  ).bind(assignmentId).all();
  return json({ scope: "teacher", points: assignment.points, submissions: results || [] });
}

// POST /api/submissions { assignmentId, text?, fileKey? } -> student submits or
// resubmits (allowed until graded; UNIQUE(assignment_id,user_id) makes this an
// upsert). fileKey (if the assignment allows files) must be the caller's own
// media_objects row, kind='submission', tagged for this exact assignment.
export async function onRequestPost({ request, env }) {
  const user = await getUser(env, request);
  if (!user) return json({ error: "Please sign in." }, 401);
  await ensure(env);
  let b; try { b = await request.json(); } catch (e) { return json({ error: "bad request" }, 400); }
  const assignmentId = (b.assignmentId || "").toString();
  if (!assignmentId) return json({ error: "assignmentId required" }, 400);

  const assignment = await env.DB.prepare("SELECT course_id, due_at, allow_file, status FROM assignments WHERE id=?").bind(assignmentId).first();
  if (!assignment) return json({ error: "not found" }, 404);
  if (assignment.status === "closed") return json({ error: "This assignment is closed." }, 400);

  const enrolled = await env.DB.prepare("SELECT 1 FROM enrollments WHERE user_id=? AND kind='course' AND target_id=?").bind(user.id, assignment.course_id).first();
  if (!enrolled) return json({ error: "forbidden" }, 403);

  const existing = await env.DB.prepare("SELECT status FROM submissions WHERE assignment_id=? AND user_id=?").bind(assignmentId, user.id).first();
  if (existing && existing.status === "graded") return json({ error: "This submission has already been graded and can no longer be changed." }, 400);

  const text = String(b.text || "").trim().slice(0, 16000);
  let fileKey = null;
  if (b.fileKey) {
    if (!assignment.allow_file) return json({ error: "This assignment does not accept file submissions." }, 400);
    const media = await env.DB.prepare("SELECT owner_id, kind, context FROM media_objects WHERE key=?").bind(b.fileKey).first();
    if (!media || media.owner_id !== user.id || media.kind !== "submission" || media.context !== `assignment:${assignmentId}`) {
      return json({ error: "Invalid file reference." }, 400);
    }
    fileKey = b.fileKey;
  }
  if (!text && !fileKey) return json({ error: "Submit text or a file." }, 400);

  const now = Date.now();
  const late = assignment.due_at && now > assignment.due_at ? 1 : 0;
  await env.DB.prepare(
    "INSERT INTO submissions (id, assignment_id, user_id, text_content, file_key, submitted_at, updated_at, late, status) " +
    "VALUES (?,?,?,?,?,?,?,?, 'submitted') " +
    "ON CONFLICT(assignment_id, user_id) DO UPDATE SET text_content=excluded.text_content, file_key=excluded.file_key, " +
    "updated_at=excluded.updated_at, late=excluded.late, status='submitted'"
  ).bind(newId(), assignmentId, user.id, text || null, fileKey, now, now, late).run();
  await logEvent(env, user, "assignment_submitted", assignmentId, late ? "late" : null);
  return json({ ok: true, late: !!late });
}
