import { json, requireRole, logEvent, parseBody } from "../_lib.js";

const ROOT_ONLY_ACTIONS = new Set(["pin", "unpin", "lock", "unlock"]);
const ACTIONS = {
  pin: "SET pinned=1", unpin: "SET pinned=0",
  lock: "SET locked=1", unlock: "SET locked=0",
  hide: "SET hidden=1", unhide: "SET hidden=0",
};

// GET /api/discussions/moderate -> open discussion reports (admin only), joined
// with the reported message so the Moderation tab can render inline context.
export async function onRequestGet({ request, env }) {
  const { error } = await requireRole(env, request, ["admin"]);
  if (error) return error;
  const { results } = await env.DB.prepare(
    "SELECT dr.message_id, dr.user_id, dr.reason, dr.created_at, d.course_id, d.name, d.message, d.hidden " +
    "FROM discussion_reports dr JOIN discussions d ON d.id=dr.message_id " +
    "WHERE dr.status='open' ORDER BY dr.created_at ASC"
  ).all();
  return json({ reports: results || [] });
}

// POST /api/discussions/moderate { id, action: pin|unpin|lock|unlock|hide|unhide|resolve_report }
// -> the course's teacher (via course_teachers) or admin. pin/lock only apply
// to thread roots; hide/unhide apply to any message (root or reply).
// resolve_report clears every open report against a message without hiding it
// (the admin reviewed it and decided the content is fine) — admin only, since
// it's purely a Moderation-tab bookkeeping action, not a content action.
export async function onRequestPost({ request, env }) {
  const { user, error } = await requireRole(env, request, ["teacher", "admin"]);
  if (error) return error;
  const { body: b, error: bodyError } = await parseBody(request);
  if (bodyError) return bodyError;

  if (b.action === "resolve_report") {
    if (user.role !== "admin") return json({ error: "forbidden" }, 403);
    if (!b.id) return json({ error: "id required" }, 400);
    await env.DB.prepare("UPDATE discussion_reports SET status='resolved' WHERE message_id=?").bind(b.id).run();
    await logEvent(env, user, "discussion_report_resolved", b.id, null);
    return json({ ok: true });
  }

  // Own keys only: a plain object also answers for inherited names like "constructor" or "__proto__".
  const sql = typeof b.action === "string" && Object.hasOwn(ACTIONS, b.action) ? ACTIONS[b.action] : undefined;
  if (!b.id || !sql) return json({ error: "id and a valid action required" }, 400);

  const msg = await env.DB.prepare("SELECT course_id, parent_id FROM discussions WHERE id=?").bind(b.id).first();
  if (!msg) return json({ error: "not found" }, 404);
  if (ROOT_ONLY_ACTIONS.has(b.action) && msg.parent_id) return json({ error: "only thread roots can be pinned or locked" }, 400);

  if (user.role !== "admin") {
    const owns = await env.DB.prepare("SELECT 1 FROM course_teachers WHERE user_id=? AND course_id=?").bind(user.id, msg.course_id).first();
    if (!owns) return json({ error: "forbidden" }, 403);
  }

  await env.DB.prepare(`UPDATE discussions ${sql} WHERE id=?`).bind(b.id).run();
  await logEvent(env, user, "discussion_moderate", b.id, b.action);
  return json({ ok: true });
}
