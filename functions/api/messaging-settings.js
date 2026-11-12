import { json, logEvent } from "./_lib.js";
import { courseAccess } from "./_course-auth.js";
import { ensureMessaging, getSettings, DEFAULT_SETTINGS } from "./_messaging.js";

// C18 teacher course settings for forums and direct messages.
// GET  /api/messaging-settings?courseId=   any signed-in user: the settings and whether
//                                           they are muted; teachers also get the mute list.
// POST /api/messaging-settings (teacher of the course, or admin):
//   { courseId, settings:{ forums_enabled, forum_locked, dms_enabled, dm_starters, teachers_read_dms, filter_enabled } }
//   { courseId, action:"mute"|"unmute", userId }
// Every change is audited with before/after.

export async function onRequestGet({ request, env }) {
  const courseId = new URL(request.url).searchParams.get("courseId");
  const { user, teach, error } = await courseAccess(env, request, courseId, "user");
  if (error) return error;
  const settings = await getSettings(env, courseId);
  const muted = !!(await env.DB.prepare("SELECT 1 AS x FROM course_mutes WHERE course_id=? AND user_id=?").bind(courseId, user.id).first());
  const out = { settings, muted, teacher: teach };
  if (teach) {
    const { results } = await env.DB.prepare("SELECT m.user_id, m.created_at, u.name, u.email FROM course_mutes m LEFT JOIN users u ON u.id=m.user_id WHERE m.course_id=? ORDER BY m.created_at DESC").bind(courseId).all();
    out.mutes = results || [];
  }
  return json(out);
}

const bit = (v, d) => (v == null ? d : v ? 1 : 0);

export async function onRequestPost({ request, env }) {
  let b; try { b = await request.json(); } catch { return json({ error: "bad request" }, 400); }
  const { user, error } = await courseAccess(env, request, b && b.courseId, "teacher");
  if (error) return error;
  await ensureMessaging(env);
  const now = Date.now();
  if (b.action === "mute" || b.action === "unmute") {
    const uid = String(b.userId || "").slice(0, 64);
    if (!uid) return json({ error: "userId required" }, 400);
    if (b.action === "mute") {
      await env.DB.prepare("INSERT OR IGNORE INTO course_mutes (course_id, user_id, muted_by, created_at) VALUES (?,?,?,?)").bind(b.courseId, uid, user.id, now).run();
    } else {
      await env.DB.prepare("DELETE FROM course_mutes WHERE course_id=? AND user_id=?").bind(b.courseId, uid).run();
    }
    await logEvent(env, user, b.action === "mute" ? "course_mute" : "course_unmute", b.courseId, null, { subject: uid, targetType: "course" });
    return json({ ok: true });
  }
  const before = await getSettings(env, b.courseId);
  const s = (b.settings && typeof b.settings === "object") ? b.settings : {};
  const next = {
    forums_enabled: bit(s.forums_enabled, before.forums_enabled),
    forum_locked: bit(s.forum_locked, before.forum_locked),
    dms_enabled: bit(s.dms_enabled, before.dms_enabled),
    dm_starters: ["learners", "teachers"].includes(s.dm_starters) ? s.dm_starters : before.dm_starters,
    teachers_read_dms: bit(s.teachers_read_dms, before.teachers_read_dms),
    filter_enabled: bit(s.filter_enabled, before.filter_enabled),
  };
  await env.DB.prepare("INSERT INTO course_messaging_settings (course_id, forums_enabled, forum_locked, dms_enabled, dm_starters, teachers_read_dms, filter_enabled, updated_by, updated_at) " +
    "VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(course_id) DO UPDATE SET forums_enabled=excluded.forums_enabled, forum_locked=excluded.forum_locked, dms_enabled=excluded.dms_enabled, " +
    "dm_starters=excluded.dm_starters, teachers_read_dms=excluded.teachers_read_dms, filter_enabled=excluded.filter_enabled, updated_by=excluded.updated_by, updated_at=excluded.updated_at")
    .bind(b.courseId, next.forums_enabled, next.forum_locked, next.dms_enabled, next.dm_starters, next.teachers_read_dms, next.filter_enabled, user.id, now).run();
  await logEvent(env, user, "messaging_settings_changed", b.courseId, null, { targetType: "course", before, after: next });
  return json({ ok: true, settings: { ...DEFAULT_SETTINGS, ...next } });
}
