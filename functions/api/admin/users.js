import { json, requireMfa, logEvent, parseBody } from "../_lib.js";
import { mergeAccount } from "./_merge-account.js";

// GET /api/admin/users -> list all users with roles (admin only)
export async function onRequestGet({ request, env }) {
  const { error } = await requireMfa(env, request, ["admin"]);
  if (error) return error;
  const { results } = await env.DB.prepare(
    "SELECT id, email, name, role, created_at FROM users ORDER BY created_at DESC LIMIT 500"
  ).all();
  return json({ users: results || [] });
}

// POST /api/admin/users { id, role: 'learner'|'teacher' } -> change a user's role (admin only).
// Admin can only move people between learner and teacher. Granting/removing 'admin'
// is intentionally NOT possible here — admin status is controlled solely by the
// ADMIN_EMAILS env var, which is a comma-separated allowlist and may name more
// than one address.
// POST /api/admin/users { id, action: 'mfa_reset' } -> clear a user's MFA enrollment
// (break-glass for a teacher locked out of their authenticator). Logged.
// POST /api/admin/users { action: 'merge', sourceId, targetId } -> fold a duplicate
// account into the one that survives. `source` is deleted; `target` keeps its own
// email, role and credentials. See _merge-account.js for exactly what moves.
export async function onRequestPost({ request, env }) {
  const { user, error: authError } = await requireMfa(env, request, ["admin"]);
  if (authError) return authError;
  const { body, error } = await parseBody(request);
  if (error) return error;

  if (body.action === "merge") {
    const { sourceId, targetId } = body;
    if (!sourceId || !targetId) return json({ error: "sourceId and targetId required" }, 400);
    // Not a guard against malice so much as against a slip: merging an account
    // into itself would delete it outright at the end of mergeAccount().
    if (sourceId === targetId) return json({ error: "cannot merge an account into itself" }, 400);
    const source = await env.DB.prepare("SELECT id, email FROM users WHERE id=?").bind(sourceId).first();
    const target = await env.DB.prepare("SELECT id, email FROM users WHERE id=?").bind(targetId).first();
    if (!source || !target) return json({ error: "not found" }, 404);

    const { moved, dropped, skipped } = await mergeAccount(env, source, target);
    // Logged BEFORE the response so the trail survives even if the client never
    // sees it: after this, source.id appears in `events` with no `users` row to
    // join against, and this line is what explains where it went.
    await logEvent(env, user, "account_merge", target.id,
      `${source.email} (${source.id}) -> ${target.email}; moved ${moved}, dropped ${dropped}` +
      (Object.keys(skipped).length ? `, skipped ${JSON.stringify(skipped)}` : ""));
    return json({ ok: true, moved, dropped, skipped });
  }

  if (body.action === "mfa_reset") {
    if (!body.id) return json({ error: "id required" }, 400);
    await env.DB.prepare("DELETE FROM user_mfa WHERE user_id=?").bind(body.id).run();
    await env.DB.prepare("DELETE FROM mfa_backup_codes WHERE user_id=?").bind(body.id).run();
    await logEvent(env, user, "mfa_reset", body.id, null);
    return json({ ok: true });
  }

  // { id, flag: 'reviewer', action: 'grant'|'revoke' } -> a flag, never a role
  // value (see verify.js's ADMIN_EMAILS demotion logic, which only ever
  // touches role) — a scholar-verified teacher can be 'reviewer' and 'teacher'
  // at once, which a single-valued role column can't express.
  if (body.flag) {
    if (body.flag !== "reviewer") return json({ error: "unknown flag" }, 400);
    if (body.action !== "grant" && body.action !== "revoke") return json({ error: "action must be grant or revoke" }, 400);
    if (!body.id) return json({ error: "id required" }, 400);
    await env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS user_flags (user_id TEXT NOT NULL, flag TEXT NOT NULL, granted_by TEXT, granted_at INTEGER NOT NULL, PRIMARY KEY (user_id, flag))"
    ).run();
    if (body.action === "grant") {
      await env.DB.prepare(
        "INSERT INTO user_flags (user_id, flag, granted_by, granted_at) VALUES (?,?,?,?) ON CONFLICT(user_id, flag) DO NOTHING"
      ).bind(body.id, body.flag, user.id, Date.now()).run();
    } else {
      await env.DB.prepare("DELETE FROM user_flags WHERE user_id=? AND flag=?").bind(body.id, body.flag).run();
    }
    await logEvent(env, user, "flag_" + body.action, body.id, body.flag);
    return json({ ok: true });
  }

  const { id, role } = body;
  if (!id || (role !== "learner" && role !== "teacher")) return json({ error: "role must be learner or teacher" }, 400);

  const target = await env.DB.prepare("SELECT role FROM users WHERE id=?").bind(id).first();
  if (!target) return json({ error: "not found" }, 404);
  if (target.role === "admin") return json({ error: "admins are managed via ADMIN_EMAILS" }, 403);

  await env.DB.prepare("UPDATE users SET role=? WHERE id=?").bind(role, id).run();
  await logEvent(env, user, "role_change", id, target.role + "→" + role);
  return json({ ok: true });
}
