import { json, getUser, logEvent } from "./_lib.js";

// GET /api/progress -> all of the user's course progress
export async function onRequestGet({ request, env }) {
  const user = await getUser(env, request);
  if (!user) return json({ error: "unauthorized" }, 401);
  const { results } = await env.DB.prepare("SELECT course_id, done, passed_score FROM progress WHERE user_id=?").bind(user.id).all();
  return json({ progress: results || [], userId: user.id });
}

// Single-lesson patches are atomic across devices; legacy snapshots remain
// supported for cached clients. Scores can only be changed by server grading.
export async function onRequestPost({ request, env }) {
  const user = await getUser(env, request);
  if (!user) return json({ error: "unauthorized" }, 401);
  let b; try { b = await request.json(); } catch { return json({ error: "bad request" }, 400); }
  if (!b || typeof b.courseId !== "string" || !/^[a-zA-Z0-9_-]{1,120}$/.test(b.courseId)) return json({ error: "valid courseId required" }, 400);
  if (b.expectedUserId && b.expectedUserId !== user.id) return json({ error: "account changed; reload before syncing" }, 409);
  let result, completed = false;
  if (Object.hasOwn(b, "lessonId")) {
    if (!Number.isInteger(b.lessonId) || b.lessonId < 0 || b.lessonId >= 1000 || typeof b.completed !== "boolean") return json({ error: "valid lessonId and completed required" }, 400);
    completed = b.completed;
    result = await env.DB.prepare(
      "INSERT INTO progress (user_id, course_id, done, passed_score, updated_at) VALUES (?,?,?,NULL,?) " +
      "ON CONFLICT(user_id, course_id) DO UPDATE SET done=(SELECT json_group_array(value) FROM (" +
      "SELECT value FROM json_each(progress.done) WHERE value<>? UNION SELECT ? WHERE ?=1 ORDER BY value)), updated_at=excluded.updated_at " +
      "WHERE (?=1 AND NOT EXISTS(SELECT 1 FROM json_each(progress.done) WHERE value=?)) " +
      "OR (?=0 AND EXISTS(SELECT 1 FROM json_each(progress.done) WHERE value=?))"
    ).bind(user.id, b.courseId, JSON.stringify(completed ? [b.lessonId] : []), Date.now(), b.lessonId, b.lessonId, +completed, +completed, b.lessonId, +completed, b.lessonId).run();
  } else {
    if (!Array.isArray(b.done)) return json({ error: "done array required" }, 400);
    const done = JSON.stringify([...new Set(b.done.filter(n => Number.isInteger(n) && n >= 0 && n < 1000))].sort((a,b) => a-b));
    result = await env.DB.prepare(
      "INSERT INTO progress (user_id, course_id, done, passed_score, updated_at) VALUES (?,?,?,NULL,?) " +
      "ON CONFLICT(user_id, course_id) DO UPDATE SET done=excluded.done, updated_at=excluded.updated_at WHERE progress.done<>excluded.done"
    ).bind(user.id, b.courseId, done, Date.now()).run();
  }
  if (result.meta?.changes > 0 && completed) await logEvent(env, user, "lesson_completed", b.courseId, "lesson=" + b.lessonId);
  return json({ ok: true });
}
