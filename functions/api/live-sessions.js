import { json, newId, logEvent } from "./_lib.js";
import { schemaOnce } from "./_schema-once.js";
import { courseAccess, cleanText } from "./_course-auth.js";
import { notify, courseLearnerIds } from "./_notify.js";

// C14 live sessions + attendance (Canvas Conferences, Moodle Attendance). We host no video:
// a session links an external meeting (Jitsi, Zoom, Meet...) to a date. Learners can check
// themselves in from 10 minutes before the start until it ends; teachers mark or correct
// attendance. Attendance is a record for the teacher, never a grade or credit.
//
// GET  /api/live-sessions?courseId=     members: sessions (join link for members), my attendance
//                                       teacher: + attendance counts per session
// GET  /api/live-sessions?sessionId=    teacher: the roster with each learner's status
// POST teacher: { action:"create", courseId, title, startsAt, durationMin, joinUrl, notes? }
//               { action:"update", sessionId, ...same } | { action:"delete", sessionId }
//               { action:"mark", sessionId, userId, status:"present"|"late"|"absent"|"excused" }
// POST learner: { action:"checkin", sessionId }

const STATUSES = ["present", "late", "absent", "excused"];
const EARLY_MS = 10 * 60 * 1000;

export function ensureLive(env) {
  return schemaOnce(env.DB, "live_sessions", async () => {
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS live_sessions (id TEXT PRIMARY KEY, course_id TEXT NOT NULL, title TEXT NOT NULL, starts_at INTEGER NOT NULL, duration_min INTEGER NOT NULL, " +
      "join_url TEXT NOT NULL, notes TEXT, created_by TEXT, created_at INTEGER NOT NULL)").run();
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_live_sessions_course ON live_sessions(course_id, starts_at)").run();
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS attendance (session_id TEXT NOT NULL, user_id TEXT NOT NULL, status TEXT NOT NULL, marked_by TEXT, marked_at INTEGER NOT NULL, PRIMARY KEY (session_id, user_id))").run();
  });
}

/** Only https meeting links; no credentials in the URL. Returns the URL or null. */
export function cleanJoinUrl(v) {
  try {
    const u = new URL(String(v || "").trim());
    if (u.protocol !== "https:" || u.username || u.password || u.toString().length > 500) return null;
    return u.toString();
  } catch { return null; }
}

function fields(b) {
  const title = cleanText(b.title, 160);
  const startsAt = Number(b.startsAt);
  const durationMin = Math.max(5, Math.min(600, Math.round(Number(b.durationMin) || 60)));
  const joinUrl = cleanJoinUrl(b.joinUrl);
  if (!title) return "Give the session a title.";
  if (!Number.isFinite(startsAt) || startsAt <= 0) return "Choose when it starts.";
  if (!joinUrl) return "Paste the meeting link (it must start with https://).";
  return { title, startsAt, durationMin, joinUrl, notes: cleanText(b.notes, 1000) || null };
}

export async function onRequestGet({ request, env }) {
  const sp = new URL(request.url).searchParams;
  await ensureLive(env);
  const sid = sp.get("sessionId");
  if (sid) {
    const s = await env.DB.prepare("SELECT * FROM live_sessions WHERE id=?").bind(sid).first();
    if (!s) return json({ error: "not found" }, 404);
    const { error } = await courseAccess(env, request, s.course_id, "teacher");
    if (error) return error;
    const { results } = await env.DB.prepare(
      "SELECT u.id, u.name, u.email, a.status, a.marked_by, a.marked_at FROM enrollments e JOIN users u ON u.id=e.user_id " +
      "LEFT JOIN attendance a ON a.session_id=? AND a.user_id=e.user_id WHERE e.kind='course' AND e.target_id=? ORDER BY u.name").bind(sid, s.course_id).all();
    return json({ session: s, roster: (results || []).map((r) => ({ ...r, self: r.marked_by === r.id })) });
  }
  const courseId = sp.get("courseId");
  const { user, teach, error } = await courseAccess(env, request, courseId, "member");
  if (error) return error;
  const { results } = await env.DB.prepare("SELECT * FROM live_sessions WHERE course_id=? ORDER BY starts_at").bind(courseId).all();
  const sessions = results || [];
  const now = Date.now();
  if (teach) {
    const counts = ((await env.DB.prepare("SELECT a.session_id, a.status, COUNT(*) AS n FROM attendance a JOIN live_sessions s ON s.id=a.session_id WHERE s.course_id=? GROUP BY a.session_id, a.status").bind(courseId).all()).results) || [];
    return json({ scope: "teacher", sessions: sessions.map((s) => ({ ...s, counts: Object.fromEntries(counts.filter((c) => c.session_id === s.id).map((c) => [c.status, c.n])) })) });
  }
  const mine = Object.fromEntries((((await env.DB.prepare("SELECT a.session_id, a.status FROM attendance a JOIN live_sessions s ON s.id=a.session_id WHERE s.course_id=? AND a.user_id=?").bind(courseId, user.id).all()).results) || []).map((r) => [r.session_id, r.status]));
  return json({ scope: "learner", sessions: sessions.map((s) => {
    const end = s.starts_at + s.duration_min * 60000;
    return { id: s.id, title: s.title, starts_at: s.starts_at, duration_min: s.duration_min, join_url: s.join_url, notes: s.notes, my_status: mine[s.id] || null,
      can_checkin: !mine[s.id] && now >= s.starts_at - EARLY_MS && now <= end };
  }) });
}

export async function onRequestPost({ request, env }) {
  let b; try { b = await request.json(); } catch { return json({ error: "bad request" }, 400); }
  if (!b || typeof b !== "object") return json({ error: "bad request" }, 400);
  await ensureLive(env);
  const now = Date.now();

  if (b.action === "create") {
    const { user, error } = await courseAccess(env, request, b.courseId, "teacher");
    if (error) return error;
    const f = fields(b);
    if (typeof f === "string") return json({ error: f }, 400);
    const id = newId();
    await env.DB.prepare("INSERT INTO live_sessions (id, course_id, title, starts_at, duration_min, join_url, notes, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?)")
      .bind(id, b.courseId, f.title, f.startsAt, f.durationMin, f.joinUrl, f.notes, user.id, now).run();
    await logEvent(env, user, "live_session_created", id, f.title, { targetType: "live_session" });
    await notify(env, await courseLearnerIds(env, b.courseId), { kind: "announcement", courseId: b.courseId, title: `Live session: ${f.title}`, body: new Date(f.startsAt).toUTCString(), url: `/course-tools?course=${b.courseId}#live`, dedupe: `live:${id}` });
    return json({ ok: true, id });
  }

  const s = b.sessionId ? await env.DB.prepare("SELECT * FROM live_sessions WHERE id=?").bind(String(b.sessionId)).first() : null;
  if (!s) return json({ error: "not found" }, 404);

  if (b.action === "checkin") {
    const { user, teach, error } = await courseAccess(env, request, s.course_id, "member");
    if (error) return error;
    if (teach) return json({ error: "Teachers mark attendance from the roster." }, 400);
    const end = s.starts_at + s.duration_min * 60000;
    if (now < s.starts_at - EARLY_MS || now > end) return json({ error: "Check-in opens 10 minutes before the session and closes when it ends." }, 400);
    const status = now > s.starts_at + 10 * 60000 ? "late" : "present";
    const r = await env.DB.prepare("INSERT OR IGNORE INTO attendance (session_id, user_id, status, marked_by, marked_at) VALUES (?,?,?,?,?)").bind(s.id, user.id, status, user.id, now).run();
    if (r.meta && r.meta.changes) await logEvent(env, user, "attendance_checkin", s.id, status, { targetType: "live_session" });
    return json({ ok: true, status });
  }

  const { user, error } = await courseAccess(env, request, s.course_id, "teacher");
  if (error) return error;
  if (b.action === "delete") {
    await env.DB.prepare("DELETE FROM attendance WHERE session_id=?").bind(s.id).run();
    await env.DB.prepare("DELETE FROM live_sessions WHERE id=?").bind(s.id).run();
    await logEvent(env, user, "live_session_deleted", s.id, s.title, { targetType: "live_session" });
    return json({ ok: true });
  }
  if (b.action === "update") {
    const f = fields({ title: s.title, startsAt: s.starts_at, durationMin: s.duration_min, joinUrl: s.join_url, notes: s.notes, ...b });
    if (typeof f === "string") return json({ error: f }, 400);
    await env.DB.prepare("UPDATE live_sessions SET title=?, starts_at=?, duration_min=?, join_url=?, notes=? WHERE id=?").bind(f.title, f.startsAt, f.durationMin, f.joinUrl, f.notes, s.id).run();
    await logEvent(env, user, "live_session_updated", s.id, f.title, { targetType: "live_session", before: { starts_at: s.starts_at }, after: { starts_at: f.startsAt } });
    return json({ ok: true });
  }
  if (b.action === "mark") {
    if (!STATUSES.includes(b.status)) return json({ error: "status must be present, late, absent or excused" }, 400);
    const uid = String(b.userId || "").slice(0, 64);
    const enrolled = await env.DB.prepare("SELECT 1 AS x FROM enrollments WHERE user_id=? AND kind='course' AND target_id=?").bind(uid, s.course_id).first();
    if (!enrolled) return json({ error: "That learner isn't in this course." }, 400);
    const before = await env.DB.prepare("SELECT status FROM attendance WHERE session_id=? AND user_id=?").bind(s.id, uid).first();
    await env.DB.prepare("INSERT INTO attendance (session_id, user_id, status, marked_by, marked_at) VALUES (?,?,?,?,?) ON CONFLICT(session_id, user_id) DO UPDATE SET status=excluded.status, marked_by=excluded.marked_by, marked_at=excluded.marked_at")
      .bind(s.id, uid, b.status, user.id, now).run();
    await logEvent(env, user, "attendance_marked", s.id, b.status, { subject: uid, targetType: "live_session", before: before ? before.status : null, after: b.status });
    return json({ ok: true });
  }
  return json({ error: "unknown action" }, 400);
}
