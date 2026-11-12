import { json, getUser, logEvent } from "./_lib.js";
import { ensureNotifications, getPrefs, resolvePrefs, KINDS } from "./_notify.js";

// C5 notification centre.
// GET  /api/notifications                 -> { notifications (newest 50), unread }
// GET  /api/notifications?unread=1        -> unread only
// GET  /api/notifications?latest=1        -> the newest unread one from the last 10 minutes
//                                            (the service worker's push handler shows it)
// GET  /api/notifications?prefs=1         -> { prefs, kinds }
// POST /api/notifications { action:"read", ids:[...] } | { action:"read_all" }
// POST /api/notifications { action:"prefs", prefs:{ graded:{ email:"daily", push:false }, ... } }
// Every query is scoped to the signed-in user, so one person can never read or mark
// another person's notifications.

export async function onRequestGet({ request, env }) {
  const user = await getUser(env, request);
  if (!user) return json({ error: "Please sign in." }, 401);
  await ensureNotifications(env);
  const sp = new URL(request.url).searchParams;
  if (sp.get("prefs")) {
    const kinds = Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [k, { label: v.label, fanout: v.fanout }]));
    return json({ prefs: await getPrefs(env, user.id), kinds });
  }
  if (sp.get("latest")) {
    const n = await env.DB.prepare("SELECT id, title, url FROM notifications WHERE user_id=? AND read_at IS NULL AND created_at > ? ORDER BY created_at DESC LIMIT 1")
      .bind(user.id, Date.now() - 10 * 60 * 1000).first();
    return json({ notification: n || null });
  }
  const unreadOnly = !!sp.get("unread");
  const { results } = await env.DB.prepare(
    "SELECT id, kind, course_id, title, body, url, created_at, read_at FROM notifications WHERE user_id=?" + (unreadOnly ? " AND read_at IS NULL" : "") +
    " ORDER BY created_at DESC LIMIT 50"
  ).bind(user.id).all();
  const c = await env.DB.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND read_at IS NULL").bind(user.id).first();
  return json({ notifications: results || [], unread: c ? c.n : 0 });
}

export async function onRequestPost({ request, env }) {
  const user = await getUser(env, request);
  if (!user) return json({ error: "Please sign in." }, 401);
  let b; try { b = await request.json(); } catch { return json({ error: "bad request" }, 400); }
  await ensureNotifications(env);
  const now = Date.now();
  if (b && b.action === "read_all") {
    await env.DB.prepare("UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL").bind(now, user.id).run();
    return json({ ok: true });
  }
  if (b && b.action === "read") {
    const ids = (Array.isArray(b.ids) ? b.ids : []).map(String).slice(0, 100);
    for (const id of ids) await env.DB.prepare("UPDATE notifications SET read_at=? WHERE id=? AND user_id=? AND read_at IS NULL").bind(now, id, user.id).run();
    return json({ ok: true });
  }
  if (b && b.action === "prefs") {
    const prefs = resolvePrefs(b.prefs && typeof b.prefs === "object" ? b.prefs : {});
    await env.DB.prepare("INSERT INTO notification_prefs (user_id, prefs, updated_at) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET prefs=excluded.prefs, updated_at=excluded.updated_at")
      .bind(user.id, JSON.stringify(prefs), now).run();
    await logEvent(env, user, "notification_prefs_changed", user.id, null, { subject: user.id, targetType: "user" });
    return json({ ok: true, prefs });
  }
  return json({ error: "unknown action" }, 400);
}
