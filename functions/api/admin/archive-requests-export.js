import { json, requireMfa, logEvent } from "../_lib.js";

// GET /api/admin/archive-requests-export -> approved (not-yet-archived) course ids
// for scripts/import_drafts.py to flip to status:"archived" in courses.json, in the
// same git-PR run that imports approved studio drafts. Auth mirrors drafts-export.js:
// an admin session, OR `Authorization: Bearer ${EXPORT_TOKEN}` (import-drafts.yml).
export async function onRequestGet({ request, env }) {
  const authHeader = request.headers.get("authorization") || "";
  const bearerOk = !!env.EXPORT_TOKEN && authHeader === `Bearer ${env.EXPORT_TOKEN}`;
  let actor = null;
  if (!bearerOk) {
    const { user, error } = await requireMfa(env, request, ["admin"]);
    if (error) return error;
    actor = user;
  }
  await logEvent(env, actor, "export_archive_requests", null, bearerOk ? "export_token" : "admin_session", { targetType: "export" });
  const { results } = await env.DB.prepare(
    "SELECT id, course_id FROM course_archive_requests WHERE status='approved' ORDER BY decided_at ASC"
  ).all();
  return json({ requests: results || [] });
}
