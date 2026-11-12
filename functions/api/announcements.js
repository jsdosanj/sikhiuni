import { json, getUser, newId, logEvent, parseBody } from "./_lib.js";
import { notify, courseLearnerIds } from "./_notify.js";

async function ensure(env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS announcements (id TEXT PRIMARY KEY, course_id TEXT NOT NULL, author_id TEXT, author_name TEXT, title TEXT, body TEXT NOT NULL, created_at INTEGER NOT NULL)"
  ).run();
}
async function assignedCourseIds(env, userId) {
  const { results } = await env.DB.prepare("SELECT course_id FROM course_teachers WHERE user_id=?").bind(userId).all();
  return (results || []).map((r) => r.course_id);
}

// GET /api/announcements[?course=ID] -> recent announcements (public).
export async function onRequestGet({ request, env }) {
  await ensure(env);
  const course = new URL(request.url).searchParams.get("course");
  let sql = "SELECT id, course_id, author_name, title, body, created_at FROM announcements";
  const binds = [];
  if (course) { sql += " WHERE course_id=?"; binds.push(course); }
  sql += " ORDER BY created_at DESC LIMIT 50";
  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  return json({ announcements: results || [] });
}

// POST /api/announcements { courseId, title, body } -> post (teacher who owns the course, or admin).
export async function onRequestPost({ request, env }) {
  const user = await getUser(env, request);
  if (!user || (user.role !== "teacher" && user.role !== "admin")) return json({ error: "forbidden" }, 403);
  await ensure(env);
  const { body: b, error } = await parseBody(request);
  if (error) return error;
  if (!b.courseId || !b.body || !b.body.trim()) return json({ error: "courseId and body required" }, 400);
  if (user.role !== "admin") {
    const ids = await assignedCourseIds(env, user.id);
    if (!ids.includes(b.courseId)) return json({ error: "forbidden" }, 403);
  }
  const id = newId();
  await env.DB.prepare(
    "INSERT INTO announcements (id, course_id, author_id, author_name, title, body, created_at) VALUES (?,?,?,?,?,?,?)"
  ).bind(id, b.courseId, user.id, user.name || user.email, (b.title || "").slice(0, 160), b.body.slice(0, 4000), Date.now()).run();
  await logEvent(env, user, "announcement", b.courseId, (b.title || "").slice(0, 80));
  await notify(env, await courseLearnerIds(env, b.courseId), { kind: "announcement", courseId: b.courseId, title: (b.title || "New announcement").slice(0, 160), body: b.body.slice(0, 300), url: `/course/${b.courseId}` });
  return json({ ok: true, id });
}
