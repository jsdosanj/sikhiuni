import { json, requireMfa, logEvent } from "../_lib.js";
import { SECURITY_ACTIONS } from "../_audit.js";

// GET /api/admin/events -> filtered/sorted/paginated audit-log events (admin only).
// Query params (all optional):
//   action   exact action match (e.g. "login")
//   role     exact role match (learner|teacher|admin)
//   outcome  ok | fail | denied
//   preset   "security" (security actions only) | "failures" (outcome fail/denied)
//   subject  a user id or email: events BY that user or ABOUT that user (timeline)
//   q        substring search across email/target/detail/ip (LIKE wildcards escaped)
//   from,to  ms-epoch timestamp range (inclusive)
//   sort     "ts_desc" (default) | "ts_asc"
//   limit    page size (default 100, max 500; CSV max 5000)
//   offset   pagination offset (default 0)
//   format   "csv" -> download (the export is itself audited as export_audit)
// Returns { events, actions, total }.
const likeEscape = (s) => s.replace(/[\\%_]/g, (c) => "\\" + c);
const COLS = ["id", "ts", "user_id", "email", "role", "action", "outcome", "target", "target_type", "subject_user_id", "detail", "ip", "country", "ua", "session_hash", "ray"];

export async function onRequestGet({ request, env }) {
  const { user, error } = await requireMfa(env, request, ["admin"]);
  if (error) return error;

  const p = new URL(request.url).searchParams;
  const where = [];
  const args = [];
  const action = (p.get("action") || "").trim();
  if (action) { where.push("e.action = ?"); args.push(action); }
  const role = (p.get("role") || "").trim();
  if (role) { where.push("e.role = ?"); args.push(role); }
  const outcome = (p.get("outcome") || "").trim();
  if (outcome) { where.push("COALESCE(e.outcome,'ok') = ?"); args.push(outcome); }
  const preset = (p.get("preset") || "").trim();
  if (preset === "security") { where.push(`e.action IN (${SECURITY_ACTIONS.map(() => "?").join(",")})`); args.push(...SECURITY_ACTIONS); }
  if (preset === "failures") where.push("e.outcome IN ('fail','denied')");
  const subject = (p.get("subject") || "").trim();
  if (subject) {
    let sid = subject;
    if (subject.includes("@")) {
      const u = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(subject.toLowerCase()).first();
      sid = u ? u.id : "__none__";
    }
    where.push("(e.user_id = ? OR e.subject_user_id = ? OR e.target = ?)"); args.push(sid, sid, sid);
  }
  const q = (p.get("q") || "").trim();
  if (q) {
    where.push("(u.email LIKE ? ESCAPE '\\' OR e.target LIKE ? ESCAPE '\\' OR e.detail LIKE ? ESCAPE '\\' OR e.ip LIKE ? ESCAPE '\\')");
    const like = "%" + likeEscape(q) + "%";
    args.push(like, like, like, like);
  }
  const from = parseInt(p.get("from") || "", 10);
  if (Number.isFinite(from)) { where.push("e.ts >= ?"); args.push(from); }
  const to = parseInt(p.get("to") || "", 10);
  if (Number.isFinite(to)) { where.push("e.ts <= ?"); args.push(to); }

  const whereSql = where.length ? " WHERE " + where.join(" AND ") : "";
  const order = p.get("sort") === "ts_asc" ? "ASC" : "DESC";
  const csv = p.get("format") === "csv";
  const limit = csv ? Math.min(5000, Math.max(1, parseInt(p.get("limit") || "5000", 10) || 5000))
    : Math.min(500, Math.max(1, parseInt(p.get("limit") || "100", 10) || 100));
  const offset = Math.max(0, parseInt(p.get("offset") || "0", 10) || 0);

  try {
    const rows = await env.DB.prepare(
      "SELECT e.id, e.ts, e.user_id, e.role, e.action, e.target, e.detail, e.ip, e.country, e.ua, e.session_hash, e.ray, " +
      "e.subject_user_id, e.target_type, COALESCE(e.outcome,'ok') AS outcome, u.email " +
      "FROM events e LEFT JOIN users u ON u.id=e.user_id" + whereSql +
      " ORDER BY e.ts " + order + " LIMIT ? OFFSET ?"
    ).bind(...args, limit, offset).all();

    if (csv) {
      await logEvent(env, user, "export_audit", null, `${(rows.results || []).length} rows; filters=${p.toString().slice(0, 300)}`, { targetType: "export" });
      // Neutralise spreadsheet formula injection, as in gradebook.js.
      const cell = (c) => { let s = c == null ? "" : String(c); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
      const lines = [COLS.join(",")].concat((rows.results || []).map((r) => COLS.map((k) => cell(k === "ts" ? new Date(r.ts).toISOString() : r[k])).join(",")));
      return new Response(lines.join("\n"), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=audit-log.csv" } });
    }

    const totalRow = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM events e LEFT JOIN users u ON u.id=e.user_id" + whereSql
    ).bind(...args).first();
    const actionsRows = await env.DB.prepare("SELECT DISTINCT action FROM events ORDER BY action").all();
    return json({
      events: rows.results || [],
      total: totalRow ? totalRow.n : 0,
      actions: (actionsRows.results || []).map((r) => r.action),
    });
  } catch (e) {
    console.error("admin_events_query_failed", String(e && e.message || e));
    return json({ events: [], total: 0, actions: [] });
  }
}
