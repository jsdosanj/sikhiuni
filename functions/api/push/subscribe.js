// POST /api/push/subscribe { endpoint, keys: { p256dh, auth } }
// Stores a Web Push subscription for the daily coursework reminder (payload-
// less push: the service worker supplies the notification text, so no payload
// encryption is needed server-side). Signed-in users get the sub linked to
// their account; anonymous subs are allowed (endpoint is the identity).
import { json, parseBody, getUser } from "../_lib.js";
import { isAllowedPushEndpoint } from "../../push-hosts.js";

let ready = false;
async function ensureTable(env) {
  if (ready) return;
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS push_subs (endpoint TEXT PRIMARY KEY, p256dh TEXT NOT NULL, auth TEXT NOT NULL, user_id TEXT, created_at INTEGER NOT NULL)"
  ).run();
  ready = true;
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: "unavailable" }, 503);
  const { body: b, error } = await parseBody(request);
  if (error) return error;
  const endpoint = b && typeof b.endpoint === "string" ? b.endpoint : "";
  const p256dh = b && b.keys && typeof b.keys.p256dh === "string" ? b.keys.p256dh : "";
  const auth = b && b.keys && typeof b.keys.auth === "string" ? b.keys.auth : "";
  // Endpoints are push-service URLs; anything else is junk (and keeps the
  // table from being used as arbitrary storage).
  if (!isAllowedPushEndpoint(endpoint) || endpoint.length > 1024 || !p256dh || !auth || p256dh.length > 256 || auth.length > 64) {
    return json({ error: "bad subscription" }, 400);
  }
  const user = await getUser(env, request).catch(() => null);
  await ensureTable(env);
  await env.DB.prepare(
    "INSERT INTO push_subs (endpoint, p256dh, auth, user_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5) " +
    "ON CONFLICT(endpoint) DO UPDATE SET p256dh = ?2, auth = ?3, user_id = COALESCE(?4, user_id)"
  ).bind(endpoint, p256dh, auth, user ? user.id : null, Math.floor(Date.now() / 1000)).run();
  return json({ ok: true });
}
