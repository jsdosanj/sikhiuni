// C18 course forums + classmate messaging: shared rules (plan "Messaging design").
// Settings are per course and editable by the course's teachers (and admins):
//   forums_enabled, forum_locked (read-only/archived), dms_enabled,
//   dm_starters ("learners" = any member may start a request | "teachers" = only teachers),
//   teachers_read_dms (shown to learners when on), filter_enabled.
// Blocks are per user pair and apply in every course; mutes are per course.
import { schemaOnce } from "./_schema-once.js";

export const DEFAULT_SETTINGS = { forums_enabled: 1, forum_locked: 0, dms_enabled: 1, dm_starters: "learners", teachers_read_dms: 0, filter_enabled: 1 };
export const FORUM_CATEGORIES = ["general", "qa", "announcements"];

export function ensureMessaging(env) {
  return schemaOnce(env.DB, "messaging", async () => {
    const run = (q) => env.DB.prepare(q).run();
    await run("CREATE TABLE IF NOT EXISTS course_messaging_settings (course_id TEXT PRIMARY KEY, forums_enabled INTEGER NOT NULL DEFAULT 1, forum_locked INTEGER NOT NULL DEFAULT 0, " +
      "dms_enabled INTEGER NOT NULL DEFAULT 1, dm_starters TEXT NOT NULL DEFAULT 'learners', teachers_read_dms INTEGER NOT NULL DEFAULT 0, filter_enabled INTEGER NOT NULL DEFAULT 1, " +
      "updated_by TEXT, updated_at INTEGER NOT NULL)");
    await run("CREATE TABLE IF NOT EXISTS course_mutes (course_id TEXT NOT NULL, user_id TEXT NOT NULL, muted_by TEXT, created_at INTEGER NOT NULL, PRIMARY KEY (course_id, user_id))");
    await run("CREATE TABLE IF NOT EXISTS user_blocks (blocker_id TEXT NOT NULL, blocked_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (blocker_id, blocked_id))");
    await run("CREATE TABLE IF NOT EXISTS dm_conversations (id TEXT PRIMARY KEY, course_id TEXT NOT NULL, pair_key TEXT NOT NULL, requester_id TEXT NOT NULL, recipient_id TEXT NOT NULL, " +
      "status TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL, decided_at INTEGER, last_message_at INTEGER NOT NULL, UNIQUE (course_id, pair_key))");
    await run("CREATE INDEX IF NOT EXISTS idx_dm_conv_requester ON dm_conversations(requester_id)");
    await run("CREATE INDEX IF NOT EXISTS idx_dm_conv_recipient ON dm_conversations(recipient_id)");
    await run("CREATE TABLE IF NOT EXISTS dm_messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, sender_id TEXT NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL, hidden INTEGER NOT NULL DEFAULT 0)");
    await run("CREATE INDEX IF NOT EXISTS idx_dm_messages_conv ON dm_messages(conversation_id, created_at)");
    await run("CREATE TABLE IF NOT EXISTS dm_reports (id TEXT PRIMARY KEY, message_id TEXT NOT NULL, conversation_id TEXT NOT NULL, course_id TEXT NOT NULL, reporter_id TEXT NOT NULL, " +
      "reason TEXT, status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL, resolved_by TEXT, resolved_at INTEGER, UNIQUE (message_id, reporter_id))");
    await run("CREATE TABLE IF NOT EXISTS forum_subscriptions (user_id TEXT NOT NULL, thread_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (user_id, thread_id))");
  });
}

export async function getSettings(env, courseId) {
  await ensureMessaging(env);
  const row = await env.DB.prepare("SELECT forums_enabled, forum_locked, dms_enabled, dm_starters, teachers_read_dms, filter_enabled FROM course_messaging_settings WHERE course_id=?").bind(courseId).first();
  return { ...DEFAULT_SETTINGS, ...(row || {}) };
}

export async function isMuted(env, courseId, userId) {
  await ensureMessaging(env);
  return !!(await env.DB.prepare("SELECT 1 AS x FROM course_mutes WHERE course_id=? AND user_id=?").bind(courseId, userId).first());
}

/** Blocked in either direction. */
export async function isBlocked(env, a, b) {
  await ensureMessaging(env);
  return !!(await env.DB.prepare("SELECT 1 AS x FROM user_blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)").bind(a, b, b, a).first());
}

/** Ids this user has blocked (used to hide their forum posts from the blocker). */
export async function blockedBy(env, userId) {
  await ensureMessaging(env);
  const { results } = await env.DB.prepare("SELECT blocked_id FROM user_blocks WHERE blocker_id=?").bind(userId).all();
  return new Set((results || []).map((r) => r.blocked_id));
}

// A deliberately small list of common English profanity. Teachers can switch the
// filter off for their course; it is a speed bump, not moderation.
const PROFANITY = /\b(f+u+c+k+\w*|sh[i1]t+\w*|bitch\w*|cunt\w*|asshole\w*|bastard\w*|motherf\w*|dickhead\w*|wh[o0]re\w*|slut\w*)\b/i;
const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|ly|me|co|app|xyz|info|ru|tk|gg|link|site|online)\b)/i;

/** Returns an error message, or null when the text passes. Links are checked only when asked (DMs). */
export function filterText(text, { links = false } = {}) {
  if (PROFANITY.test(text)) return "Please rephrase: this course filters offensive language.";
  if (links && LINK.test(text)) return "Links can't be sent in direct messages in this course.";
  return null;
}

export const pairKey = (a, b) => [a, b].sort().join(":");
