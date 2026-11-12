import { json, getUser, newId, logEvent } from "./_lib.js";
import { canTeach, isEnrolled, validCourseId, cleanText } from "./_course-auth.js";
import { ensureMessaging, getSettings, isMuted, isBlocked, filterText, pairKey } from "./_messaging.js";
import { notify } from "./_notify.js";

// C18 classmate direct messages (plan "Messaging design", approved 2026-11-11).
// - Only between members (enrolled learners or teachers) of the same course, where DMs are on.
// - The first message is a REQUEST. The recipient sees sender, course and that message and
//   chooses Accept, Decline or Block. Nothing more can be sent until they accept.
//   Decline is silent: the sender keeps seeing "request sent". Block also stops requests
//   from that person in every course. Each course needs its own request.
// - Teachers may read DMs in their course only when the course setting says so (and
//   learners are told). Admins, and teachers of the course, see reported messages.
// - Plain text, length-capped, filtered per course settings; every action is audited
//   without the message text.
//
// GET  /api/messages                      my conversations (requests in/out, accepted)
// GET  /api/messages?conversation=ID      messages in one conversation
// GET  /api/messages?classmates=COURSE    people I may send a request to in that course
// GET  /api/messages?reports=COURSE|all   open reports (teacher of the course | admin)
// POST /api/messages { action:"request", courseId, toUserId, body }
// POST /api/messages { action:"send", conversationId, body }
// POST /api/messages { action:"accept"|"decline", conversationId }
// POST /api/messages { action:"block"|"unblock", userId }
// POST /api/messages { action:"report", messageId, reason? }
// POST /api/messages { action:"resolve", reportId, hideMessage? }   (teacher of the course | admin)

const DAY = 24 * 60 * 60 * 1000;
const MAX_REQUESTS_PER_DAY = 20;

async function isMember(env, userId, courseId) {
  const u = { id: userId, role: null };
  return (await canTeach(env, u, courseId)) || (await isEnrolled(env, u, courseId));
}
const nameOf = async (env, id) => { const u = await env.DB.prepare("SELECT name FROM users WHERE id=?").bind(id).first(); return (u && u.name) || "A classmate"; };

/** Who may read this conversation, and as what. */
async function viewerRole(env, user, c) {
  if (user.id === c.requester_id || user.id === c.recipient_id) return "participant";
  const reported = !!(await env.DB.prepare("SELECT 1 AS x FROM dm_reports WHERE conversation_id=?").bind(c.id).first());
  if (user.role === "admin" && reported) return "moderator";
  if (await canTeach(env, user, c.course_id)) {
    const s = await getSettings(env, c.course_id);
    if (s.teachers_read_dms) return "teacher";
    if (reported) return "moderator";
  }
  return null;
}

export async function onRequestGet({ request, env }) {
  const user = await getUser(env, request);
  if (!user) return json({ error: "Please sign in." }, 401);
  await ensureMessaging(env);
  const sp = new URL(request.url).searchParams;

  const convId = sp.get("conversation");
  if (convId) {
    const c = await env.DB.prepare("SELECT * FROM dm_conversations WHERE id=?").bind(convId).first();
    if (!c) return json({ error: "not found" }, 404);
    const role = await viewerRole(env, user, c);
    if (!role) { await logEvent(env, user, "authz_denied", c.id, "dm_read", { outcome: "denied", targetType: "conversation" }); return json({ error: "forbidden" }, 403); }
    // Before acceptance, only the opening message exists; the recipient may read it to decide.
    const { results } = await env.DB.prepare(
      "SELECT m.id, m.sender_id, m.body, m.created_at, m.hidden, u.name FROM dm_messages m LEFT JOIN users u ON u.id=m.sender_id " +
      "WHERE m.conversation_id=? ORDER BY m.created_at LIMIT 500").bind(c.id).all();
    const msgs = (results || []).filter((m) => role === "moderator" || !m.hidden)
      .map((m) => ({ id: m.id, mine: m.sender_id === user.id, name: m.name || "Learner", body: m.body, created_at: m.created_at, hidden: !!m.hidden }));
    // Decline is silent: the requester still sees "pending".
    const status = c.status === "declined" && user.id === c.requester_id ? "pending" : c.status;
    const s = await getSettings(env, c.course_id);
    const otherId = user.id === c.requester_id ? c.recipient_id : c.requester_id;
    return json({ conversation: { id: c.id, course_id: c.course_id, status, incoming: user.id === c.recipient_id, other: role === "participant" ? await nameOf(env, otherId) : null,
      other_id: role === "participant" ? otherId : null, teachers_can_read: !!s.teachers_read_dms, viewer: role }, messages: msgs });
  }

  const classmatesOf = sp.get("classmates");
  if (classmatesOf) {
    if (!validCourseId(classmatesOf)) return json({ error: "valid course required" }, 400);
    if (!(await isMember(env, user.id, classmatesOf))) return json({ error: "forbidden" }, 403);
    const s = await getSettings(env, classmatesOf);
    const teach = await canTeach(env, user, classmatesOf);
    if (!s.dms_enabled) return json({ classmates: [], reason: "Direct messages are off in this course." });
    if (s.dm_starters === "teachers" && !teach) return json({ classmates: [], reason: "In this course, only teachers can start a conversation." });
    const { results } = await env.DB.prepare(
      "SELECT u.id, u.name, 'learner' AS role FROM enrollments e JOIN users u ON u.id=e.user_id WHERE e.kind='course' AND e.target_id=? AND u.id<>? " +
      "UNION SELECT u.id, u.name, 'teacher' AS role FROM course_teachers t JOIN users u ON u.id=t.user_id WHERE t.course_id=? AND u.id<>? LIMIT 2000"
    ).bind(classmatesOf, user.id, classmatesOf, user.id).all();
    const blocks = (await env.DB.prepare("SELECT blocker_id, blocked_id FROM user_blocks WHERE blocker_id=? OR blocked_id=?").bind(user.id, user.id).all()).results || [];
    const hidden = new Set(blocks.map((b) => (b.blocker_id === user.id ? b.blocked_id : b.blocker_id)));
    const seen = new Map();
    for (const r of results || []) if (!hidden.has(r.id) && (!seen.has(r.id) || r.role === "teacher")) seen.set(r.id, { id: r.id, name: r.name || "Learner", role: r.role });
    return json({ classmates: [...seen.values()].sort((a, b) => a.name.localeCompare(b.name)) });
  }

  const reportsOf = sp.get("reports");
  if (reportsOf) {
    let where, args;
    if (reportsOf === "all") { if (user.role !== "admin") return json({ error: "forbidden" }, 403); where = "r.status='open'"; args = []; }
    else {
      if (!validCourseId(reportsOf) || !(await canTeach(env, user, reportsOf))) return json({ error: "forbidden" }, 403);
      where = "r.status='open' AND r.course_id=?"; args = [reportsOf];
    }
    const { results } = await env.DB.prepare(
      "SELECT r.id, r.message_id, r.conversation_id, r.course_id, r.reason, r.created_at, m.body, m.hidden, s.name AS sender, s.id AS sender_id, rp.name AS reporter " +
      "FROM dm_reports r JOIN dm_messages m ON m.id=r.message_id LEFT JOIN users s ON s.id=m.sender_id LEFT JOIN users rp ON rp.id=r.reporter_id " +
      `WHERE ${where} ORDER BY r.created_at DESC LIMIT 200`).bind(...args).all();
    return json({ reports: results || [] });
  }

  const { results } = await env.DB.prepare(
    "SELECT c.id, c.course_id, c.status, c.requester_id, c.recipient_id, c.created_at, c.last_message_at, " +
    "(SELECT body FROM dm_messages m WHERE m.conversation_id=c.id AND m.hidden=0 ORDER BY m.created_at DESC LIMIT 1) AS last_body, " +
    "ru.name AS requester_name, pu.name AS recipient_name FROM dm_conversations c " +
    "LEFT JOIN users ru ON ru.id=c.requester_id LEFT JOIN users pu ON pu.id=c.recipient_id " +
    "WHERE (c.requester_id=? OR (c.recipient_id=? AND c.status<>'declined')) ORDER BY c.last_message_at DESC LIMIT 200"
  ).bind(user.id, user.id).all();
  const conversations = (results || []).map((c) => {
    const incoming = c.recipient_id === user.id;
    return {
      id: c.id, course_id: c.course_id, incoming,
      status: c.status === "declined" ? "pending" : c.status,
      other: (incoming ? c.requester_name : c.recipient_name) || "Learner",
      other_id: incoming ? c.requester_id : c.recipient_id,
      preview: (c.last_body || "").slice(0, 120), last_message_at: c.last_message_at,
    };
  });
  const blocked = ((await env.DB.prepare("SELECT b.blocked_id AS id, u.name FROM user_blocks b LEFT JOIN users u ON u.id=b.blocked_id WHERE b.blocker_id=?").bind(user.id).all()).results || [])
    .map((r) => ({ id: r.id, name: r.name || "Learner" }));
  return json({ conversations, blocked });
}

async function checkBody(env, s, raw) {
  const body = cleanText(raw, 2000);
  if (!body) return { error: "Write a message first." };
  if (s.filter_enabled) { const f = filterText(body, { links: true }); if (f) return { error: f }; }
  return { body };
}

export async function onRequestPost({ request, env }) {
  const user = await getUser(env, request);
  if (!user) return json({ error: "Please sign in." }, 401);
  let b; try { b = await request.json(); } catch { return json({ error: "bad request" }, 400); }
  if (!b || typeof b !== "object") return json({ error: "bad request" }, 400);
  await ensureMessaging(env);
  const now = Date.now();

  if (b.action === "block" || b.action === "unblock") {
    const other = String(b.userId || "").slice(0, 64);
    if (!other || other === user.id) return json({ error: "userId required" }, 400);
    if (b.action === "block") {
      await env.DB.prepare("INSERT OR IGNORE INTO user_blocks (blocker_id, blocked_id, created_at) VALUES (?,?,?)").bind(user.id, other, now).run();
      // Any pending request from them is declined (silently, as with Decline).
      await env.DB.prepare("UPDATE dm_conversations SET status='declined', decided_at=? WHERE requester_id=? AND recipient_id=? AND status='pending'").bind(now, other, user.id).run();
    } else {
      await env.DB.prepare("DELETE FROM user_blocks WHERE blocker_id=? AND blocked_id=?").bind(user.id, other).run();
    }
    await logEvent(env, user, b.action === "block" ? "dm_block" : "dm_unblock", other, null, { subject: other, targetType: "user" });
    return json({ ok: true });
  }

  if (b.action === "request") {
    const courseId = b.courseId, to = String(b.toUserId || "").slice(0, 64);
    if (!validCourseId(courseId) || !to || to === user.id) return json({ error: "Choose a classmate." }, 400);
    if (!(await isMember(env, user.id, courseId))) { await logEvent(env, user, "authz_denied", courseId, "dm_request", { outcome: "denied", targetType: "course" }); return json({ error: "forbidden" }, 403); }
    if (!(await isMember(env, to, courseId))) return json({ error: "That person isn't in this course." }, 400);
    const s = await getSettings(env, courseId);
    if (!s.dms_enabled) return json({ error: "Direct messages are off in this course." }, 403);
    if (s.dm_starters === "teachers" && !(await canTeach(env, user, courseId))) return json({ error: "In this course, only teachers can start a conversation." }, 403);
    if (await isMuted(env, courseId, user.id)) return json({ error: "Your teacher has paused your messages in this course." }, 403);
    if (await isBlocked(env, user.id, to)) return json({ error: "You can't message this person." }, 403);
    const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM dm_conversations WHERE requester_id=? AND created_at>?").bind(user.id, now - DAY).first();
    if (recent && recent.n >= MAX_REQUESTS_PER_DAY) return json({ error: "You've sent a lot of requests today. Please try again tomorrow." }, 429);
    const chk = await checkBody(env, s, b.body);
    if (chk.error) return json({ error: chk.error }, 400);
    const existing = await env.DB.prepare("SELECT id, status, requester_id FROM dm_conversations WHERE course_id=? AND pair_key=?").bind(courseId, pairKey(user.id, to)).first();
    if (existing) {
      // Already asked (or declined, which the sender is never told): don't send again.
      return json({ ok: true, conversationId: existing.id, status: existing.status === "declined" ? "pending" : existing.status, existing: true });
    }
    const id = newId();
    await env.DB.prepare("INSERT INTO dm_conversations (id, course_id, pair_key, requester_id, recipient_id, status, created_at, last_message_at) VALUES (?,?,?,?,?,'pending',?,?)")
      .bind(id, courseId, pairKey(user.id, to), user.id, to, now, now).run();
    await env.DB.prepare("INSERT INTO dm_messages (id, conversation_id, sender_id, body, created_at) VALUES (?,?,?,?,?)").bind(newId(), id, user.id, chk.body, now).run();
    await logEvent(env, user, "dm_request", id, null, { subject: to, targetType: "conversation" });
    await notify(env, [to], { kind: "message_request", courseId, title: `${user.name || "A classmate"} wants to message you`, url: `/messages?c=${id}` });
    return json({ ok: true, conversationId: id, status: "pending" });
  }

  if (b.action === "report" || b.action === "resolve") {
    if (b.action === "report") {
      const m = await env.DB.prepare("SELECT m.id, m.conversation_id, m.sender_id, c.course_id, c.requester_id, c.recipient_id FROM dm_messages m JOIN dm_conversations c ON c.id=m.conversation_id WHERE m.id=?").bind(String(b.messageId || "")).first();
      if (!m || (user.id !== m.requester_id && user.id !== m.recipient_id)) return json({ error: "not found" }, 404);
      if (m.sender_id === user.id) return json({ error: "You can't report your own message." }, 400);
      await env.DB.prepare("INSERT OR IGNORE INTO dm_reports (id, message_id, conversation_id, course_id, reporter_id, reason, created_at) VALUES (?,?,?,?,?,?,?)")
        .bind(newId(), m.id, m.conversation_id, m.course_id, user.id, cleanText(b.reason, 500) || null, now).run();
      await logEvent(env, user, "dm_report", m.conversation_id, null, { subject: m.sender_id, targetType: "conversation" });
      return json({ ok: true });
    }
    const r = await env.DB.prepare("SELECT * FROM dm_reports WHERE id=?").bind(String(b.reportId || "")).first();
    if (!r) return json({ error: "not found" }, 404);
    if (!(await canTeach(env, user, r.course_id))) return json({ error: "forbidden" }, 403);
    if (b.hideMessage) await env.DB.prepare("UPDATE dm_messages SET hidden=1 WHERE id=?").bind(r.message_id).run();
    await env.DB.prepare("UPDATE dm_reports SET status='resolved', resolved_by=?, resolved_at=? WHERE message_id=? AND status='open'").bind(user.id, now, r.message_id).run();
    await logEvent(env, user, "dm_report_resolved", r.conversation_id, b.hideMessage ? "hidden" : "kept", { targetType: "conversation" });
    return json({ ok: true });
  }

  const c = await env.DB.prepare("SELECT * FROM dm_conversations WHERE id=?").bind(String(b.conversationId || "")).first();
  if (!c || (user.id !== c.requester_id && user.id !== c.recipient_id)) return json({ error: "not found" }, 404);
  const other = user.id === c.requester_id ? c.recipient_id : c.requester_id;

  if (b.action === "accept" || b.action === "decline") {
    if (user.id !== c.recipient_id || c.status !== "pending") return json({ error: "There's no request to answer." }, 400);
    await env.DB.prepare("UPDATE dm_conversations SET status=?, decided_at=? WHERE id=?").bind(b.action === "accept" ? "accepted" : "declined", now, c.id).run();
    await logEvent(env, user, b.action === "accept" ? "dm_accept" : "dm_decline", c.id, null, { subject: other, targetType: "conversation" });
    return json({ ok: true });
  }

  if (b.action === "send") {
    if (c.status !== "accepted") return json({ error: "You can send more once they accept your request." }, 403);
    const s = await getSettings(env, c.course_id);
    if (!s.dms_enabled) return json({ error: "Direct messages are off in this course." }, 403);
    if (await isMuted(env, c.course_id, user.id)) return json({ error: "Your teacher has paused your messages in this course." }, 403);
    if (await isBlocked(env, user.id, other)) return json({ error: "You can't message this person." }, 403);
    const chk = await checkBody(env, s, b.body);
    if (chk.error) return json({ error: chk.error }, 400);
    await env.DB.prepare("INSERT INTO dm_messages (id, conversation_id, sender_id, body, created_at) VALUES (?,?,?,?,?)").bind(newId(), c.id, user.id, chk.body, now).run();
    await env.DB.prepare("UPDATE dm_conversations SET last_message_at=? WHERE id=?").bind(now, c.id).run();
    await logEvent(env, user, "dm_send", c.id, null, { subject: other, targetType: "conversation" });
    await notify(env, [other], { kind: "message", courseId: c.course_id, title: `New message from ${user.name || "a classmate"}`, url: `/messages?c=${c.id}` });
    return json({ ok: true });
  }
  return json({ error: "unknown action" }, 400);
}
