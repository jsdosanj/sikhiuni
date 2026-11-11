import { json, getUser, newId, logEvent } from "./_lib.js";
import { notify } from "./_notify.js";
import { ensureMessaging, getSettings, isMuted, blockedBy, filterText, FORUM_CATEGORIES } from "./_messaging.js";

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
  await alter("ALTER TABLE discussions ADD COLUMN category TEXT"); // C18 forum categories (migrations/0022)
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
  // C18: course forum settings, the viewer's own blocks (their posts are hidden from the
  // blocker), and which threads the viewer follows.
  const settings = await getSettings(env, courseId);
  const forum = { enabled: !!settings.forums_enabled, locked: !!settings.forum_locked, categories: FORUM_CATEGORIES };
  if (!settings.forums_enabled) return json({ messages: [], forum });
  const viewer = await getUser(env, request);
  const hiddenAuthors = viewer ? await blockedBy(env, viewer.id) : new Set();
  const following = viewer ? new Set(((await env.DB.prepare("SELECT thread_id FROM forum_subscriptions WHERE user_id=?").bind(viewer.id).all()).results || []).map((r) => r.thread_id)) : new Set();
  try {
    const { results: roots } = await env.DB.prepare(
      "SELECT id, user_id, name, message, created_at, author_role, pinned, locked, category FROM discussions " +
      "WHERE course_id=? AND parent_id IS NULL AND hidden=0 ORDER BY pinned DESC, created_at DESC LIMIT 100"
    ).bind(courseId).all();
    const rootList = (roots || []).filter((r) => !hiddenAuthors.has(r.user_id));
    if (!rootList.length) return json({ messages: [], forum });

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
    for (const r of (replies || []).filter((x) => !hiddenAuthors.has(x.user_id))) (repliesByParent[r.parent_id] = repliesByParent[r.parent_id] || []).push({
      id: r.id, name: r.name, message: r.message, created_at: r.created_at,
      author_role: r.author_role || null, verified: verifiedByUser[r.user_id] || null,
    });

    const messages = rootList.map((r) => ({
      id: r.id, name: r.name, message: r.message, created_at: r.created_at,
      author_role: r.author_role || null, verified: verifiedByUser[r.user_id] || null,
      pinned: !!r.pinned, locked: !!r.locked, category: r.category || "general",
      following: following.has(r.id), mine: !!viewer && r.user_id === viewer.id,
      replies: repliesByParent[r.id] || [],
    }));
    return json({ messages, forum });
  } catch (e) { return json({ messages: [], forum }); }
}

// POST /api/discussions { courseId, message, parentId? } -> post a root or a
// depth-1 reply (sign-in required). Rejects a reply if the parent is missing,
// hidden, locked, or is itself a reply (depth cap).
export async function onRequestPost({ request, env }) {
  await ensure(env);
  const user = await getUser(env, request);
  if (!user) return json({ error: "Please sign in to post." }, 401);
  let b; try { b = await request.json(); } catch (e) { return json({ error: "bad request" }, 400); }
  await ensureMessaging(env);
  // C18: follow / unfollow a thread (replies then notify the follower).
  if (b.action === "follow" || b.action === "unfollow") {
    const t = await env.DB.prepare("SELECT id FROM discussions WHERE id=? AND parent_id IS NULL").bind(String(b.threadId || "")).first();
    if (!t) return json({ error: "not found" }, 404);
    if (b.action === "follow") await env.DB.prepare("INSERT OR IGNORE INTO forum_subscriptions (user_id, thread_id, created_at) VALUES (?,?,?)").bind(user.id, t.id, Date.now()).run();
    else await env.DB.prepare("DELETE FROM forum_subscriptions WHERE user_id=? AND thread_id=?").bind(user.id, t.id).run();
    return json({ ok: true });
  }
  const courseId = (b.courseId || "").toString().slice(0, 120);
  const message = (b.message || "").trim().slice(0, 2000);
  if (!courseId || !message) return json({ error: "Message required." }, 400);
  const settings = await getSettings(env, courseId);
  if (!settings.forums_enabled) return json({ error: "The forum is off for this course." }, 403);
  if (settings.forum_locked) return json({ error: "This course forum is read-only." }, 403);
  if (await isMuted(env, courseId, user.id)) return json({ error: "Your teacher has paused your posting in this course." }, 403);
  if (settings.filter_enabled) { const f = filterText(message); if (f) return json({ error: f }, 400); }
  const category = FORUM_CATEGORIES.includes(b.category) ? b.category : "general";

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
  if (!parentId && category === "announcements" && !authorRole) return json({ error: "Only teachers can start threads in Announcements." }, 403);
  const postId = newId();
  await env.DB.prepare(
    "INSERT INTO discussions (id, course_id, user_id, name, message, created_at, parent_id, author_role, pinned, locked, hidden, category) " +
    "VALUES (?,?,?,?,?,?,?,?,0,0,0,?)"
  ).bind(postId, courseId, user.id, name, message, Date.now(), parentId, authorRole, parentId ? null : category).run();
  if (!parentId) await env.DB.prepare("INSERT OR IGNORE INTO forum_subscriptions (user_id, thread_id, created_at) VALUES (?,?,?)").bind(user.id, postId, Date.now()).run();
  await logEvent(env, user, "discussion_post", courseId, message.slice(0, 80));
  if (parentId) {
    // The thread's author and everyone following it, except the person replying.
    const subs = ((await env.DB.prepare("SELECT user_id FROM forum_subscriptions WHERE thread_id=?").bind(parentId).all()).results || []).map((r) => r.user_id);
    const to = [...new Set([replyTo, ...subs])].filter((id) => id && id !== user.id);
    if (to.length) await notify(env, to, { kind: "reply", courseId, title: `${name} replied in a thread you follow`, body: message.slice(0, 200), url: `/course/${courseId}#discussion` });
  }
  return json({ ok: true });
}
