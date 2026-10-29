// Shared existing D1 fixed-window limiter; preserves fail-open on D1 failure.
let rlReady = false;
export async function checkRateLimit(env, key, limit, windowSec) {
  if (!env.DB) return true;
  try {
    if (!rlReady) {
      await env.DB.prepare("CREATE TABLE IF NOT EXISTS rate_limits (k TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL)").run();
      rlReady = true;
    }
    const now = Math.floor(Date.now() / 1000);
    const row = await env.DB.prepare(
      "INSERT INTO rate_limits (k, count, reset_at) VALUES (?1, 1, ?2) " +
      "ON CONFLICT(k) DO UPDATE SET " +
      "count = CASE WHEN reset_at <= ?3 THEN 1 ELSE count + 1 END, " +
      "reset_at = CASE WHEN reset_at <= ?3 THEN ?2 ELSE reset_at END " +
      "RETURNING count"
    ).bind(key, now + windowSec, now).first();
    return !row || row.count <= limit;
  } catch (e) { return true; }
}
