// C5 Notification centre (Canvas Notification Settings, Moodle Notifications).
//
// notify(env, userIds, { kind, courseId, title, body, url, dedupe }) writes one in-app
// notification per recipient and, per each recipient's preferences, sends an email
// right away and/or a Web Push. Email "daily" is batched into one digest by the cron
// (sendDigests). Delivery is best-effort and never throws into the caller: a failed
// email must not fail the grade, post or message that triggered it.
//
// Push is payload-less (push-sender.js): the service worker fetches the newest
// unread notification itself and shows its title, so no text crosses the push service.
import { schemaOnce } from "./_schema-once.js";
import { newId } from "./_lib.js";
import { pushConfigured, sendPush } from "../push-sender.js";
import { ensurePolicies } from "./course-policies.js";

const DAY = 24 * 60 * 60 * 1000;

// email: "off" | "immediate" | "daily". Fan-out kinds (one event -> a whole course)
// cannot email immediately, so a busy course can't turn into hundreds of sends per post.
export const KINDS = {
  graded: { label: "My work is graded", email: "immediate", push: true, fanout: false },
  extension: { label: "A teacher changes my due date", email: "immediate", push: false, fanout: false },
  reply: { label: "Someone replies to my forum post", email: "off", push: false, fanout: false },
  message_request: { label: "A classmate asks to message me", email: "immediate", push: true, fanout: false },
  message: { label: "New direct message", email: "off", push: true, fanout: false },
  announcement: { label: "Course announcements", email: "daily", push: false, fanout: true },
  poll: { label: "A poll or survey opens", email: "off", push: false, fanout: true },
  due_soon: { label: "Work due within 2 days", email: "daily", push: false, fanout: true },
};
const EMAIL_CHOICES = ["off", "immediate", "daily"];
const MAX_IMMEDIATE = 50; // recipients per event that get immediate email/push; the rest fall back to in-app

export function ensureNotifications(env) {
  return schemaOnce(env.DB, "notifications", async () => {
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL, course_id TEXT, " +
      "title TEXT NOT NULL, body TEXT, url TEXT, dedupe TEXT, created_at INTEGER NOT NULL, read_at INTEGER, emailed_at INTEGER)").run();
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at)").run();
    await env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedupe ON notifications(user_id, dedupe)").run();
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS notification_prefs (user_id TEXT PRIMARY KEY, prefs TEXT NOT NULL, updated_at INTEGER NOT NULL)").run();
  });
}

/** Merge stored choices over the defaults; unknown keys and invalid values are dropped. */
export function resolvePrefs(stored) {
  const out = {};
  for (const [k, d] of Object.entries(KINDS)) {
    const s = (stored && stored[k]) || {};
    let email = EMAIL_CHOICES.includes(s.email) ? s.email : d.email;
    if (d.fanout && email === "immediate") email = "daily";
    out[k] = { email, push: typeof s.push === "boolean" ? s.push : d.push };
  }
  return out;
}

export async function getPrefs(env, userId) {
  await ensureNotifications(env);
  const row = await env.DB.prepare("SELECT prefs FROM notification_prefs WHERE user_id=?").bind(userId).first();
  let stored = null;
  try { stored = row ? JSON.parse(row.prefs) : null; } catch { stored = null; }
  return resolvePrefs(stored);
}

export async function sendEmail(env, to, subject, text) {
  if (!env.RESEND_API_KEY || !to || typeof fetch !== "function") return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: env.MAIL_FROM || "Sikhi University <login@sikhiuni.com>", to: [to], subject: subject.slice(0, 160), text }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch { return false; }
}

const SITE = "https://sikhiuni.com";
const FOOTER = `\n\nChoose which emails you get: ${SITE}/notifications#settings`;
const emailText = (n) => `${n.title}${n.body ? "\n\n" + n.body : ""}${n.url ? `\n\nOpen: ${SITE}${n.url}` : ""}${FOOTER}`;

/**
 * Create notifications for each recipient (deduplicated by `dedupe` when given) and
 * deliver immediate email / push per preference. Returns the number created.
 */
export async function notify(env, userIds, n) {
  try {
    if (!KINDS[n.kind]) throw new Error("unknown notification kind " + n.kind);
    await ensureNotifications(env);
    const ids = [...new Set((userIds || []).filter(Boolean))].slice(0, 5000);
    const now = Date.now();
    const title = String(n.title || "").slice(0, 200);
    const body = n.body ? String(n.body).slice(0, 500) : null;
    const created = [];
    for (const uid of ids) {
      const id = newId();
      const r = await env.DB.prepare("INSERT OR IGNORE INTO notifications (id, user_id, kind, course_id, title, body, url, dedupe, created_at) VALUES (?,?,?,?,?,?,?,?,?)")
        .bind(id, uid, n.kind, n.courseId || null, title, body, n.url || null, n.dedupe || null, now).run();
      if (r && r.meta && r.meta.changes) created.push({ uid, id });
    }
    if (!created.length || created.length > MAX_IMMEDIATE) return created.length;
    for (const { uid, id } of created) {
      const prefs = await getPrefs(env, uid);
      const p = prefs[n.kind];
      if (p.email === "immediate") {
        const u = await env.DB.prepare("SELECT email FROM users WHERE id=?").bind(uid).first();
        if (u && await sendEmail(env, u.email, title, emailText({ title, body, url: n.url }))) {
          await env.DB.prepare("UPDATE notifications SET emailed_at=? WHERE id=?").bind(now, id).run();
        }
      }
      if (p.push && pushConfigured(env)) {
        const { results } = await env.DB.prepare("SELECT endpoint FROM push_subs WHERE user_id=? LIMIT 5").bind(uid).all().catch(() => ({ results: [] }));
        for (const { endpoint } of results || []) { try { await sendPush(env, endpoint); } catch { /* best effort */ } }
      }
    }
    return created.length;
  } catch (e) {
    console.error("notify_failed", n && n.kind, String(e && e.message || e));
    return 0;
  }
}

/** Enrolled learners of a course (the usual fan-out audience). */
export async function courseLearnerIds(env, courseId) {
  const { results } = await env.DB.prepare("SELECT user_id FROM enrollments WHERE kind='course' AND target_id=? LIMIT 5000").bind(courseId).all().catch(() => ({ results: [] }));
  return (results || []).map((r) => r.user_id);
}

/** Cron: "due within 2 days" reminders for unsubmitted work (extensions applied), deduplicated per due date. */
export async function queueDueSoon(env, now = Date.now()) {
  await ensureNotifications(env);
  await ensurePolicies(env); // the extensions table may not exist until a teacher first grants one
  let made = 0;
  try {
    const { results } = await env.DB.prepare(
      "SELECT e.user_id, a.id, a.course_id, a.title, COALESCE(x.due_at, a.due_at) AS due FROM assignments a " +
      "JOIN enrollments e ON e.kind='course' AND e.target_id=a.course_id " +
      "LEFT JOIN assignment_extensions x ON x.assignment_id=a.id AND x.user_id=e.user_id " +
      "LEFT JOIN submissions s ON s.assignment_id=a.id AND s.user_id=e.user_id " +
      "WHERE a.status='open' AND s.id IS NULL AND COALESCE(x.due_at, a.due_at) BETWEEN ? AND ? LIMIT 2000"
    ).bind(now, now + 2 * DAY).all();
    for (const r of results || []) {
      made += await notify(env, [r.user_id], { kind: "due_soon", courseId: r.course_id, title: `Due soon: ${r.title}`, body: `Due ${new Date(r.due).toUTCString()}.`, url: `/course/${r.course_id}`, dedupe: `due:${r.id}:${r.due}` });
    }
  } catch (e) { console.error("due_soon_failed", String(e && e.message || e)); } // assignments/extensions absent
  return made;
}

/** Cron: one digest email per user for unread notifications whose kind is set to "daily". */
export async function sendDigests(env, now = Date.now()) {
  await ensureNotifications(env);
  const { results } = await env.DB.prepare(
    "SELECT n.id, n.user_id, n.kind, n.title, n.url, u.email FROM notifications n JOIN users u ON u.id=n.user_id " +
    "WHERE n.emailed_at IS NULL AND n.read_at IS NULL AND n.created_at > ? ORDER BY n.user_id, n.created_at LIMIT 5000"
  ).bind(now - 2 * DAY).all();
  const byUser = new Map();
  for (const r of results || []) { if (!byUser.has(r.user_id)) byUser.set(r.user_id, []); byUser.get(r.user_id).push(r); }
  let sent = 0;
  for (const [uid, rows] of byUser) {
    if (sent >= 500) break;
    const prefs = await getPrefs(env, uid);
    const items = rows.filter((r) => prefs[r.kind] && prefs[r.kind].email === "daily");
    if (!items.length) continue;
    const text = `Your Sikhi University updates:\n\n${items.slice(0, 30).map((r) => `- ${r.title}${r.url ? ` (${SITE}${r.url})` : ""}`).join("\n")}` +
      `${items.length > 30 ? `\n…and ${items.length - 30} more at ${SITE}/notifications` : ""}${FOOTER}`;
    if (await sendEmail(env, rows[0].email, `Your daily summary (${items.length} update${items.length === 1 ? "" : "s"})`, text)) {
      sent++;
      for (const r of items) await env.DB.prepare("UPDATE notifications SET emailed_at=? WHERE id=?").bind(now, r.id).run();
    }
  }
  return sent;
}

/** Retention: read notifications 90 days, everything 180 days. */
export async function pruneNotifications(env, now = Date.now()) {
  await ensureNotifications(env);
  const a = await env.DB.prepare("DELETE FROM notifications WHERE read_at IS NOT NULL AND created_at < ?").bind(now - 90 * DAY).run();
  const b = await env.DB.prepare("DELETE FROM notifications WHERE created_at < ?").bind(now - 180 * DAY).run();
  return ((a.meta && a.meta.changes) || 0) + ((b.meta && b.meta.changes) || 0);
}
