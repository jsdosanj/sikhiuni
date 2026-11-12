import { json, newId, logEvent } from "./_lib.js";
import { schemaOnce } from "./_schema-once.js";
import { courseAccess, cleanText, validCourseId } from "./_course-auth.js";

// C11 Course glossary (Moodle Glossary). Teachers of the course curate terms;
// anyone can read them (course outlines are public, and a glossary is study aid,
// not lesson content). Gurmukhi is first-class: each term may carry its
// Gurmukhi form. Content-accuracy rules apply (CLAUDE.md): teacher-entered only,
// no machine-generated definitions, edits are audited.
//
// GET  /api/glossary?courseId=
// POST /api/glossary { courseId, term, termGur?, definition }        -> add
// POST /api/glossary { id, term?, termGur?, definition? }            -> edit
// POST /api/glossary { id, action:"delete" }                         -> delete

async function ensure(env) {
  return schemaOnce(env.DB, "glossary_terms", async () => {
    await env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS glossary_terms (id TEXT PRIMARY KEY, course_id TEXT NOT NULL, term TEXT NOT NULL, term_gur TEXT, definition TEXT NOT NULL, " +
      "created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)"
    ).run();
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_glossary_course ON glossary_terms(course_id)").run();
  });
}

export async function onRequestGet({ request, env }) {
  const courseId = new URL(request.url).searchParams.get("courseId");
  if (!validCourseId(courseId)) return json({ error: "valid courseId required" }, 400);
  await ensure(env);
  const { results } = await env.DB.prepare(
    "SELECT id, term, term_gur, definition, updated_at FROM glossary_terms WHERE course_id=? ORDER BY term COLLATE NOCASE LIMIT 1000"
  ).bind(courseId).all();
  return json({ terms: results || [] });
}

export async function onRequestPost({ request, env }) {
  let b; try { b = await request.json(); } catch { return json({ error: "bad request" }, 400); }
  await ensure(env);
  const now = Date.now();
  let courseId = b && b.courseId;
  let existing = null;
  if (b && b.id) {
    existing = await env.DB.prepare("SELECT course_id, term, term_gur, definition FROM glossary_terms WHERE id=?").bind(String(b.id)).first();
    if (!existing) return json({ error: "not found" }, 404);
    courseId = existing.course_id;
  }
  const { user, error } = await courseAccess(env, request, courseId, "teacher");
  if (error) return error;
  if (existing && b.action === "delete") {
    await env.DB.prepare("DELETE FROM glossary_terms WHERE id=?").bind(b.id).run();
    await logEvent(env, user, "glossary_deleted", b.id, existing.term, { targetType: "glossary", before: existing });
    return json({ ok: true });
  }
  const term = b.term != null ? cleanText(b.term, 120) : null;
  const termGur = b.termGur != null ? cleanText(b.termGur, 120) : null;
  const definition = b.definition != null ? cleanText(b.definition, 3000) : null;
  if (existing) {
    await env.DB.prepare("UPDATE glossary_terms SET term=COALESCE(?,term), term_gur=COALESCE(?,term_gur), definition=COALESCE(?,definition), updated_at=? WHERE id=?")
      .bind(term || null, termGur, definition || null, now, b.id).run();
    await logEvent(env, user, "glossary_updated", b.id, term || existing.term, { targetType: "glossary", before: existing, after: { term, term_gur: termGur, definition } });
    return json({ ok: true });
  }
  if (!term || !definition) return json({ error: "term and definition are required" }, 400);
  const id = newId();
  await env.DB.prepare("INSERT INTO glossary_terms (id, course_id, term, term_gur, definition, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)")
    .bind(id, courseId, term, termGur || null, definition, user.id, now, now).run();
  await logEvent(env, user, "glossary_added", id, term, { targetType: "glossary" });
  return json({ ok: true, id });
}
