import { json, newId, logEvent } from "./_lib.js";
import { schemaOnce } from "./_schema-once.js";
import { courseAccess, cleanText } from "./_course-auth.js";

// C17 interactive activities: H5P content hosted on h5p.com or h5p.org, embedded in a
// course. We link the publisher's own embed player in a sandboxed frame; nothing is
// copied or rehosted. These are ungraded practice: scores stay inside the H5P player
// (recording them would need xAPI/LTI, which waits for a partner platform).
//
// Rights (CLAUDE.md): the teacher confirms they may use the activity and can give an
// attribution, shown under it. A new activity starts as a draft, so it can be checked
// for accuracy before learners see it.
//
// GET  /api/embeds?courseId=     members: open activities; teachers: all
// POST teacher: { action:"create", courseId, title, url, attribution?, rightsConfirmed:true }
//               { action:"status", id, status:"draft"|"open" } | { action:"delete", id }

export function ensureEmbeds(env) {
  return schemaOnce(env.DB, "course_embeds", async () => {
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS course_embeds (id TEXT PRIMARY KEY, course_id TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, src TEXT NOT NULL, " +
      "attribution TEXT, status TEXT NOT NULL DEFAULT 'draft', created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)").run();
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_course_embeds_course ON course_embeds(course_id)").run();
  });
}

/** An H5P page or embed URL -> the canonical embed URL, or null if it isn't one we allow. */
export function h5pEmbedUrl(raw) {
  let u; try { u = new URL(String(raw || "").trim()); } catch { return null; }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
  const host = u.hostname.toLowerCase();
  let m;
  if (/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.h5p\.com$/.test(host) && (m = u.pathname.match(/^\/content\/(\d{1,20})(\/embed)?\/?$/))) return `https://${host}/content/${m[1]}/embed`;
  if (host === "h5p.org" && (m = u.pathname.match(/^\/(?:node|h5p\/embed)\/(\d{1,12})\/?$/))) return `https://h5p.org/h5p/embed/${m[1]}`;
  return null;
}

export async function onRequestGet({ request, env }) {
  const courseId = new URL(request.url).searchParams.get("courseId");
  const { teach, error } = await courseAccess(env, request, courseId, "member");
  if (error) return error;
  await ensureEmbeds(env);
  const { results } = await env.DB.prepare(`SELECT id, kind, title, src, attribution, status, created_at FROM course_embeds WHERE course_id=? ${teach ? "" : "AND status='open'"} ORDER BY created_at`).bind(courseId).all();
  return json({ scope: teach ? "teacher" : "learner", embeds: results || [] });
}

export async function onRequestPost({ request, env }) {
  let b; try { b = await request.json(); } catch { return json({ error: "bad request" }, 400); }
  if (!b || typeof b !== "object") return json({ error: "bad request" }, 400);
  await ensureEmbeds(env);
  const now = Date.now();
  if (b.action === "create") {
    const { user, error } = await courseAccess(env, request, b.courseId, "teacher");
    if (error) return error;
    const title = cleanText(b.title, 160);
    if (!title) return json({ error: "Give the activity a title." }, 400);
    const src = h5pEmbedUrl(b.url);
    if (!src) return json({ error: "Paste the link to an H5P activity on h5p.com or h5p.org (for example https://yourname.h5p.com/content/123456)." }, 400);
    if (b.rightsConfirmed !== true) return json({ error: "Confirm you have the right to use this activity." }, 400);
    const id = newId();
    await env.DB.prepare("INSERT INTO course_embeds (id, course_id, kind, title, src, attribution, status, created_by, created_at, updated_at) VALUES (?,?,'h5p',?,?,?,'draft',?,?,?)")
      .bind(id, b.courseId, title, src, cleanText(b.attribution, 300) || null, user.id, now, now).run();
    await logEvent(env, user, "embed_created", id, `${title} (${src})`, { targetType: "embed" });
    return json({ ok: true, id, src });
  }
  const e = b.id ? await env.DB.prepare("SELECT * FROM course_embeds WHERE id=?").bind(String(b.id)).first() : null;
  if (!e) return json({ error: "not found" }, 404);
  const { user, error } = await courseAccess(env, request, e.course_id, "teacher");
  if (error) return error;
  if (b.action === "status") {
    if (!["draft", "open"].includes(b.status)) return json({ error: "bad status" }, 400);
    await env.DB.prepare("UPDATE course_embeds SET status=?, updated_at=? WHERE id=?").bind(b.status, now, e.id).run();
    await logEvent(env, user, "embed_status", e.id, e.title, { targetType: "embed", before: e.status, after: b.status });
    return json({ ok: true });
  }
  if (b.action === "delete") {
    await env.DB.prepare("DELETE FROM course_embeds WHERE id=?").bind(e.id).run();
    await logEvent(env, user, "embed_deleted", e.id, e.title, { targetType: "embed", before: { title: e.title, src: e.src } });
    return json({ ok: true });
  }
  return json({ error: "unknown action" }, 400);
}
