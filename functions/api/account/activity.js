import { json, getUser, logEvent, sessionCookie } from "../_lib.js";
import { SECURITY_ACTIONS, activityLabel, deviceSummary, maskIp } from "../_audit.js";
import { revokeTrustedDevices } from "../auth/_trusted-device.js";

// GET /api/account/activity -> the signed-in user's own recent security activity
// (last 20: sign-ins, failed attempts on their account, MFA and password changes,
// sign-out-everywhere). Only rows BY or ABOUT this user. The IP is masked
// (203.0.113.x) and the device is summarised ("Chrome on Windows"); the raw UA
// and full IP stay admin-only, and are erased after 90 days.
export async function onRequestGet({ request, env }) {
  const user = await getUser(env, request);
  if (!user) return json({ error: "Please sign in." }, 401);
  const list = SECURITY_ACTIONS.filter((a) => !["authz_denied", "rate_limited", "audit_chain_broken"].includes(a));
  try {
    const { results } = await env.DB.prepare(
      `SELECT ts, action, outcome, ip, country, ua FROM events WHERE (user_id = ? OR subject_user_id = ?) AND action IN (${list.map(() => "?").join(",")}) ORDER BY ts DESC LIMIT 20`
    ).bind(user.id, user.id, ...list).all();
    return json({
      activity: (results || []).map((r) => ({
        ts: r.ts, action: r.action, label: activityLabel(r.action), outcome: r.outcome || "ok",
        country: r.country || null, ip: maskIp(r.ip), device: deviceSummary(r.ua),
      })),
    });
  } catch {
    return json({ activity: [] });
  }
}

// POST /api/account/activity { action: "sign_out_everywhere" } -> deletes EVERY
// session for this account (this one included) and forgets every remembered MFA
// device. Logged as sessions_revoked.
export async function onRequestPost({ request, env }) {
  const user = await getUser(env, request);
  if (!user) return json({ error: "Please sign in." }, 401);
  let b; try { b = await request.json(); } catch { return json({ error: "bad request" }, 400); }
  if (!b || b.action !== "sign_out_everywhere") return json({ error: "unknown action" }, 400);
  const r = await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id).run();
  await revokeTrustedDevices(env, user.id);
  const n = (r && r.meta && r.meta.changes) || 0;
  await logEvent(env, user, "sessions_revoked", user.id, `${n} session(s)`, { subject: user.id, targetType: "account" });
  return json({ ok: true, sessions: n }, 200, { "Set-Cookie": sessionCookie("", 0) });
}
