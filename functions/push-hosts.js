// Web Push endpoints are chosen by the BROWSER, but /api/push/subscribe is open to
// anonymous callers, so the stored endpoint is attacker-controlled input that the
// daily cron later POSTs to (with a VAPID JWT signed for that origin). Restrict it to
// the real push services so the table cannot be used to make our Worker request
// arbitrary hosts (SSRF / request cannon) or to mint signed JWTs for them.
const EXACT = new Set(["fcm.googleapis.com", "android.googleapis.com", "web.push.apple.com", "updates.push.services.mozilla.com"]);
const SUFFIXES = [".push.services.mozilla.com", ".notify.windows.com", ".push.apple.com"];

export function isAllowedPushEndpoint(endpoint) {
  let u;
  try { u = new URL(String(endpoint)); } catch { return false; }
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return false;
  const h = u.hostname.toLowerCase();
  return EXACT.has(h) || SUFFIXES.some((s) => h.endsWith(s));
}
