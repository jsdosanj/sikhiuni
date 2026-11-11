import { json, getUser, logEvent } from "./_lib.js";
import { schemaOnce } from "./_schema-once.js";
import { sha256 } from "./_audit.js";
import { calendarFor } from "./calendar.js";

// C1 private iCal feed: one secret URL per user, so a phone or Google/Apple/Outlook
// calendar can subscribe to their due dates. The token is shown once and stored only
// as a SHA-256 hash; "Turn off" (or a new link) revokes the old one. The feed carries
// titles and dates only, never grades, feedback or messages.
//
// GET  /api/calendar-feed                         signed in: { enabled, created_at }
// POST /api/calendar-feed { action:"create" }     new secret link (replaces any old one)
// POST /api/calendar-feed { action:"revoke" }
// GET  /api/calendar.ics?token=…                  the feed itself (no cookie needed)

const DAY = 24 * 60 * 60 * 1000;
const SITE = "https://sikhiuni.com";

export function ensureFeeds(env) {
  return schemaOnce(env.DB, "calendar_feeds", () => env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS calendar_feeds (user_id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL, last_used_at INTEGER)"
  ).run());
}

export async function onRequestGet({ request, env }) {
  const user = await getUser(env, request);
  if (!user) return json({ error: "Please sign in." }, 401);
  await ensureFeeds(env);
  const row = await env.DB.prepare("SELECT created_at, last_used_at FROM calendar_feeds WHERE user_id=?").bind(user.id).first();
  return json({ enabled: !!row, created_at: row ? row.created_at : null, last_used_at: row ? row.last_used_at : null });
}

export async function onRequestPost({ request, env }) {
  const user = await getUser(env, request);
  if (!user) return json({ error: "Please sign in." }, 401);
  let b; try { b = await request.json(); } catch { return json({ error: "bad request" }, 400); }
  await ensureFeeds(env);
  if (b && b.action === "revoke") {
    await env.DB.prepare("DELETE FROM calendar_feeds WHERE user_id=?").bind(user.id).run();
    await logEvent(env, user, "calendar_feed_revoked", user.id, null, { subject: user.id, targetType: "user" });
    return json({ ok: true });
  }
  if (!b || b.action !== "create") return json({ error: "unknown action" }, 400);
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(bytes, (x) => x.toString(16).padStart(2, "0")).join("");
  await env.DB.prepare("INSERT INTO calendar_feeds (user_id, token_hash, created_at) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET token_hash=excluded.token_hash, created_at=excluded.created_at, last_used_at=NULL")
    .bind(user.id, await sha256(token), Date.now()).run();
  await logEvent(env, user, "calendar_feed_created", user.id, null, { subject: user.id, targetType: "user" });
  return json({ ok: true, url: `${SITE}/api/calendar.ics?token=${token}` });
}

// RFC 5545 text escaping and 75-octet line folding.
const icsText = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const icsDate = (ms) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
function fold(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out = []; let cur = "", len = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (len + n > (out.length ? 74 : 75)) { out.push(cur); cur = ""; len = 0; }
    cur += ch; len += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export function buildIcs(events, now = Date.now()) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Sikhi University//Course calendar//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:Sikhi University", "REFRESH-INTERVAL;VALUE=DURATION:PT6H"];
  for (const e of events) {
    const url = e.type === "poll" ? `${SITE}/course-tools?course=${e.course_id}#polls` : `${SITE}/course/${e.course_id}`;
    lines.push("BEGIN:VEVENT", `UID:${e.type}-${e.id}@sikhiuni.com`, `DTSTAMP:${icsDate(now)}`, `DTSTART:${icsDate(e.at)}`, `DTEND:${icsDate(e.at)}`,
      `SUMMARY:${icsText(`${e.type === "poll" ? "Closes" : "Due"}: ${String(e.title).slice(0, 150)}`)}`, `URL:${url}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

export async function onRequestGetIcs({ request, env }) {
  const token = new URL(request.url).searchParams.get("token") || "";
  if (!/^[0-9a-f]{64}$/.test(token)) return new Response("Not found", { status: 404 });
  await ensureFeeds(env);
  const row = await env.DB.prepare("SELECT user_id FROM calendar_feeds WHERE token_hash=?").bind(await sha256(token)).first();
  if (!row) return new Response("Not found", { status: 404 });
  const user = await env.DB.prepare("SELECT id, role FROM users WHERE id=?").bind(row.user_id).first();
  if (!user) return new Response("Not found", { status: 404 });
  const now = Date.now();
  await env.DB.prepare("UPDATE calendar_feeds SET last_used_at=? WHERE user_id=?").bind(now, user.id).run();
  const { events } = await calendarFor(env, user, now - 60 * DAY, now + 365 * DAY);
  return new Response(buildIcs(events, now), { headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "private, max-age=900", "x-robots-tag": "noindex" } });
}
