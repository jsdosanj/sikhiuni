import { schemaOnce } from "../_schema-once.js";
import { json, requireUser, parseBody } from "../_lib.js";

// POST /api/activity/heartbeat { activeSeconds } — accrues real engagement
// time (mouse/keyboard/scroll/touch, tab visible, not idle — see
// public/scripts/activity-tracker.js) onto today's daily_activity row for
// the signed-in user. Mirrors the sibling sikhi.io repo's identical route
// (pages/api/activity/heartbeat.ts) — same cap, same reasoning, duplicated
// rather than shared per this whole project family's convention.
const MAX_SECONDS_PER_REQUEST = 120;

function ensureTable(env) {
  return schemaOnce(env.DB, "daily_activity", () => env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS daily_activity (user_id TEXT NOT NULL, day TEXT NOT NULL, active_seconds INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, day))"
  ).run());
}

export async function onRequestPost({ request, env }) {
  const { user, error } = await requireUser(env, request);
  if (error) return error;

  const { body, error: bodyError } = await parseBody(request);
  if (bodyError) return bodyError;

  const activeSeconds = Math.max(0, Math.min(MAX_SECONDS_PER_REQUEST, Math.round(Number(body?.activeSeconds) || 0)));
  if (activeSeconds <= 0) return json({ ok: true });

  await ensureTable(env);
  const day = new Date().toISOString().slice(0, 10);

  await env.DB.prepare(
    "INSERT INTO daily_activity (user_id, day, active_seconds) VALUES (?, ?, ?) " +
    "ON CONFLICT(user_id, day) DO UPDATE SET active_seconds = active_seconds + excluded.active_seconds"
  ).bind(user.id, day, activeSeconds).run();

  return json({ ok: true });
}
