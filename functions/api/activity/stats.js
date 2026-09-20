import { json, requireUser } from "../_lib.js";

// GET /api/activity/stats — real streak + a full year of daily activity for
// the dashboard's GitHub-style contribution grid. Replaces dashboard.astro's
// former purely-client-side, per-device, localStorage-only streak.
const ACTIVE_DAY_THRESHOLD_SECONDS = 60;
const GRID_DAYS = 371; // 53 full weeks, so the grid always starts on a Sunday column

const dayStr = (d) => d.toISOString().slice(0, 10);

export async function onRequestGet({ request, env }) {
  const { user, error } = await requireUser(env, request);
  if (error) return error;

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - GRID_DAYS);

  const { results } = await env.DB.prepare(
    "SELECT day, active_seconds FROM daily_activity WHERE user_id = ? AND day >= ?"
  ).bind(user.id, dayStr(since)).all();

  const secondsByDay = new Map((results || []).map((r) => [r.day, r.active_seconds || 0]));
  const isActiveDay = (day) => (secondsByDay.get(day) || 0) >= ACTIVE_DAY_THRESHOLD_SECONDS;

  let streak = 0;
  const cur = new Date();
  if (!isActiveDay(dayStr(cur))) cur.setUTCDate(cur.getUTCDate() - 1);
  while (isActiveDay(dayStr(cur))) { streak++; cur.setUTCDate(cur.getUTCDate() - 1); }

  const grid = [];
  const t = new Date();
  for (let i = GRID_DAYS - 1; i >= 0; i--) {
    const d = new Date(t);
    d.setUTCDate(t.getUTCDate() - i);
    const s = dayStr(d);
    grid.push({ day: s, activeSeconds: secondsByDay.get(s) || 0 });
  }

  const activeDays = [...secondsByDay.values()].filter((s) => s >= ACTIVE_DAY_THRESHOLD_SECONDS).length;

  return json({ streak, activeDays, activeDayThresholdSeconds: ACTIVE_DAY_THRESHOLD_SECONDS, grid });
}
