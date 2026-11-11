import { json, getUser, newId, logEvent } from "./_lib.js";
import { notify } from "./_notify.js";

// Each ALTER is its own try/catch: SQLite/D1 has no ADD COLUMN IF NOT EXISTS, so
// after migrations/0004_discussions_threading.sql has run these always fail
// (harmlessly) — this keeps the handler safe to call before AND after it runs.
async function ensure(env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS discussions (id TEXT PRIMARY KEY, course_id TEXT NOT NULL, user_id TEXT, name TEXT, message TEXT NOT NULL, created_at INTEGER NOT NULL)"
  ).run();
  const alter = async (sql) => { try { await env.DB.prepare(sql).run(); } catch (e) {} };
  await alter("ALTER TABLE discussions ADD COLUMN parent_id TEXT");
  await alter("ALTER TABLE discussions ADD COLUMN author_role TEXT");
  await alter("ALTER TABLE discussions ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0");
  await alter("ALTER TABLE discussions ADD COLUMN locked INTEGER NOT NULL DEFAULT 0");
  await alter("ALTER TABLE discussions ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0");
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS discussion_reports (message_id TEXT NOT NULL, user_id TEXT NOT NULL, reason TEXT, created_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'open', PRIMARY KEY (message_id, user_id))"
  ).run();
}

async function isCourseInstructor(env, user, courseId) {
  if (user.role === "admin") return true;
  const r = await env.DB.prepare("SELECT 1 FROM course_teachers WHERE user_id=? AND course_id=?").bind(user.id, courseId).first();
  return !!r;
}

// GET /api/discussions?courseId=... -> threaded, depth-1, pinned roots first then
// newest. Hidden posts (moderator-removed) never appear here. Additive shape —
// existing consumers reading only name/message/created_at are unaffected;
// legacy flat rows (parent_id NULL) render as roots automatically.
export async function onRequestGet({ request, env }) {
  await ensure(env);
  const courseId = new URL(request.url).searchParams.get("courseId");
  if (!courseId) return json({ error: "courseId required" }, 400);
  try {
    const { results: roots } = await env.DB.prepare(
      "SELECT id, user_id, name, message, created_at, author_role, pinned, locked FROM discussions " +
      "WHERE course_id=? AND parent_id IS NULL AND hidden=0 ORDER BY pinned DESC, created_at DESC LIMIT 100"
    ).bind(courseId).all();
    const rootList = roots || [];
    if (!rootList.length) return json({ messages: [] });

    const rootIds = rootList.map((r) => r.id);
    const { results: replies } = await env.DB.prepare(
      `SELECT id, user_id, name, message, created_at, author_role, parent_id FROM discussions ` +
      `WHERE parent_id IN (${rootIds.map(() => "?").join(",")}) AND hidden=0 ORDER BY created_at ASC`
    ).bind(...rootIds).all();

    const posterIds = [...new Set([...rootList, ...(replies || [])].map((r) => r.user_id).filter(Boolean))];
    let verifiedByUser = {};
    if (posterIds.length) {
      const { results: tp } = await env.DB.prepare(
        `SELECT user_id, verification_level FROM teacher_profiles WHERE is_public=1 AND user_id IN (${posterIds.map(() => "?").join(",")})`
      ).bind(...posterIds).all();
      verifiedByUser = Object.fromEntries((tp || []).map((r) => [r.user_id, r.verification_level]));
    }

    const repliesByParent = {};
    for (const r of replies || []) (repliesByParent[r.parent_id] = repliesByParent[r.parent_id] || []).push({
      id: r.id, name: r.name, message: r.message, created_at: r.created_at,
      author_role: r.author_role || null, verified: verifiedByUser[r.user_id] || null,
    });

    const messages = rootList.map((r) => ({
      id: r.id, name: r.name, message: r.message, created_at: r.created_at,
      author_role: r.author_role || null, verified: verifiedByUser[r.user_id] || null,
      pinned: !!r.pinned, locked: !!r.locked,
      replies: repliesByParent[r.id] || [],
    }));
    return json({ messages });
  } catch (e) { return json({ messages: [] }); }
}

// POST /api/discussions { courseId, message, parentId? } -> post a root or a
// depth-1 reply (sign-in required). Rejects a reply if the parent is missing,
// hidden, locked, or is itself a reply (depth cap).
export async function onRequestPost({ request, env }) {
  await ensure(env);
  const user = await getUser(env, request);
  if (!user) return json({ error: "Please sign in to post." }, 401);
  let b; try { b = await request.json(); } catch (e) { return json({ error: "bad request" }, 400); }
  const courseId = (b.courseId || "").toString().slice(0, 120);
  const message = (b.message || "").trim().slice(0, 2000);
  if (!courseId || !message) return json({ error: "Message required." }, 400);

  let parentId = null, replyTo = null;
  if (b.parentId) {
    const parent = await env.DB.prepare(
      "SELECT id, course_id, parent_id, locked, hidden, user_id FROM discussions WHERE id=?"
    ).bind(b.parentId).first();
    if (!parent || parent.course_id !== courseId || parent.hidden) return json({ error: "Cannot reply to that message." }, 400);
    if (parent.parent_id) return json({ error: "Replies can't be nested further." }, 400);
    if (parent.locked) return json({ error: "This thread is locked." }, 400);
    parentId = b.parentId;
    replyTo = parent.user_id;
  }

  // Never derive a public display name from the email (leaks the local-part).
  const name = (user.name || "Learner").slice(0, 80);
  const authorRole = (await isCourseInstructor(env, user, courseId)) ? "instructor" : null;
  await env.DB.prepare(
    "INSERT INTO discussions (id, course_id, user_id, name, message, created_at, parent_id, author_role, pinned, locked, hidden) " +
    "VALUES (?,?,?,?,?,?,?,?,0,0,0)"
  ).bind(newId(), courseId, user.id, name, message, Date.now(), parentId, authorRole).run();
  await logEvent(env, user, "discussion_post", courseId, message.slice(0, 80));
  if (replyTo && replyTo !== user.id) await notify(env, [replyTo], { kind: "reply", courseId, title: `${name} replied to your post`, body: message.slice(0, 200), url: `/course/${courseId}#discussion` });
  return json({ ok: true });
}
