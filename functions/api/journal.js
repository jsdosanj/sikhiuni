import { json, newId, logEvent } from "./_lib.js";
import { schemaOnce } from "./_schema-once.js";
import { courseAccess, cleanText } from "./_course-auth.js";

// C10 Reflective journal (Moodle Journal). Private by default (plan Part D.6):
// only the author can read an entry, unless they tick "share with my teacher",
// and then only teachers of THAT course (and admins) can read it.
//
// GET    /api/journal?courseId=            learner: own entries; teacher: entries learners shared
// POST   /api/journal { courseId, body, shared? }            -> new entry
// POST   /api/journal { id, body?, shared? }                 -> edit own entry
// POST   /api/journal { id, action:"delete" }                -> delete own entry

async function ensure(env) {
  return schemaOnce(env.DB, "journal_entries", async () => {
    await env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS journal_entries (id TEXT PRIMARY KEY, course_id TEXT NOT NULL, user_id TEXT NOT NULL, body TEXT NOT NULL, " +
      "shared INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)"
    ).run();
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_journal_course_user ON journal_entries(course_id, user_id)").run();
  });
}

export async function onRequestGet({ request, env }) {
  const courseId = new URL(request.url).searchParams.get("courseId");
  const { user, teach, error } = await courseAccess(env, request, courseId, "member");
  if (error) return error;
  await ensure(env);
  if (teach) {
    const { results } = await env.DB.prepare(
      "SELECT j.id, j.body, j.created_at, j.updated_at, u.name, u.email FROM journal_entries j LEFT JOIN users u ON u.id=j.user_id " +
      "WHERE j.course_id=? AND j.shared=1 ORDER BY j.updated_at DESC LIMIT 200"
    ).bind(courseId).all();
    return json({ scope: "teacher", entries: results || [] });
  }
  const { results } = await env.DB.prepare(
    "SELECT id, body, shared, created_at, updated_at FROM journal_entries WHERE course_id=? AND user_id=? ORDER BY created_at DESC LIMIT 500"
  ).bind(courseId, user.id).all();
  return json({ scope: "learner", entries: results || [] });
}

export async function onRequestPost({ request, env }) {
  let b; try { b = await request.json(); } catch { return json({ error: "bad request" }, 400); }
  await ensure(env);
  const now = Date.now();
  if (b && b.id) {
    const row = await env.DB.prepare("SELECT course_id, user_id FROM journal_entries WHERE id=?").bind(String(b.id)).first();
    if (!row) return json({ error: "not found" }, 404);
    const { user, error } = await courseAccess(env, request, row.course_id, "user");
    if (error) return error;
    if (row.user_id !== user.id) return json({ error: "forbidden" }, 403); // only the author edits
    if (b.action === "delete") {
      await env.DB.prepare("DELETE FROM journal_entries WHERE id=?").bind(b.id).run();
      await logEvent(env, user, "journal_deleted", b.id, null, { targetType: "journal" });
      return json({ ok: true });
    }
    const body = b.body != null ? cleanText(b.body, 10000) : null;
    if (body === "") return json({ error: "Write something first." }, 400);
    await env.DB.prepare("UPDATE journal_entries SET body=COALESCE(?,body), shared=COALESCE(?,shared), updated_at=? WHERE id=?")
      .bind(body, b.shared == null ? null : (b.shared ? 1 : 0), now, b.id).run();
    return json({ ok: true });
  }
  const { user, teach, error } = await courseAccess(env, request, b && b.courseId, "member");
  if (error) return error;
  if (teach) return json({ error: "The journal is for learners." }, 400);
  const body = cleanText(b.body, 10000);
  if (!body) return json({ error: "Write something first." }, 400);
  const id = newId();
  await env.DB.prepare("INSERT INTO journal_entries (id, course_id, user_id, body, shared, created_at, updated_at) VALUES (?,?,?,?,?,?,?)")
    .bind(id, b.courseId, user.id, body, b.shared ? 1 : 0, now, now).run();
  return json({ ok: true, id });
}
