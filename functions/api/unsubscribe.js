import { json, logEvent } from "./_lib.js";
import { ensureNotifications, resolvePrefs, KINDS } from "./_notify.js";

// One-click unsubscribe for notification emails (CAN-SPAM, RFC 8058, Gmail/Yahoo bulk
// sender rules). Every notification email carries a signed link and a List-Unsubscribe
// header pointing here.
//   POST /api/unsubscribe?u=<user>&t=<sig>   one click (mail clients POST
//                                            "List-Unsubscribe=One-Click"): turns every
//                                            notification email off, no sign-in needed.
//   GET  same URL                            a small page with a button that POSTs; a GET
//                                            never unsubscribes, so link scanners can't.
// The token is an HMAC of the user id, so a link only ever works for its own recipient.
// In-app notifications are unaffected; transactional mail (sign-up codes, password reset)
// is not covered by this and is sent regardless.

const enc = new TextEncoder();
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function sign(env, userId) {
  const secret = env.UNSUBSCRIBE_SECRET || env.MFA_ENC_KEY;
  if (!secret) return null;
  const key = await crypto.subtle.importKey("raw", enc.encode("unsubscribe:v1:" + secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(String(userId)))).slice(0, 32);
}

/** The signed unsubscribe URL for a user, or null when no signing secret is configured. */
export async function unsubscribeUrl(env, userId) {
  const t = await sign(env, userId);
  return t ? `https://sikhiuni.com/api/unsubscribe?u=${encodeURIComponent(userId)}&t=${t}` : null;
}

async function valid(env, u, t) {
  if (!u || !t || u.length > 64) return false;
  const want = await sign(env, u);
  if (!want || want.length !== t.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ t.charCodeAt(i);
  return diff === 0;
}

const page = (body) => new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Email preferences, Sikhi University</title>
<style>body{font:17px/1.6 Georgia,serif;color:#0b1e3a;background:#faf8f3;max-width:34rem;margin:12vh auto;padding:0 1.25rem}button{font:600 15px Helvetica,Arial,sans-serif;background:#0b2444;color:#fff;border:0;border-radius:3px;padding:.8rem 1.4rem;cursor:pointer}a{color:#0b2444}</style></head><body>${body}</body></html>`,
  { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'" } });

export async function onRequestGet({ request, env }) {
  const sp = new URL(request.url).searchParams;
  if (!(await valid(env, sp.get("u"), sp.get("t")))) return page("<h1>This link isn't valid</h1><p>Manage your emails from <a href=\"/notifications#settings\">your notification settings</a> after signing in.</p>");
  const action = `/api/unsubscribe?u=${encodeURIComponent(sp.get("u"))}&t=${encodeURIComponent(sp.get("t"))}`;
  return page(`<h1>Stop notification emails?</h1><p>You'll stop getting course notification emails from Sikhi University (grades, announcements, messages, daily summaries). You'll still see notifications when you sign in, and we'll still send essential account emails such as password resets.</p>
<form method="post" action="${action}"><button type="submit">Unsubscribe</button></form><p style="margin-top:1.5rem"><a href="/notifications#settings">Choose which emails you get instead</a></p>`);
}

export async function onRequestPost({ request, env }) {
  const sp = new URL(request.url).searchParams;
  const u = sp.get("u");
  if (!(await valid(env, u, sp.get("t")))) return json({ error: "invalid link" }, 400);
  await ensureNotifications(env);
  const row = await env.DB.prepare("SELECT prefs FROM notification_prefs WHERE user_id=?").bind(u).first();
  let stored = {};
  try { stored = row ? JSON.parse(row.prefs) : {}; } catch { stored = {}; }
  const prefs = resolvePrefs(stored);
  for (const k of Object.keys(KINDS)) prefs[k].email = "off";
  await env.DB.prepare("INSERT INTO notification_prefs (user_id, prefs, updated_at) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET prefs=excluded.prefs, updated_at=excluded.updated_at")
    .bind(u, JSON.stringify(prefs), Date.now()).run();
  await logEvent(env, { id: u, role: null }, "email_unsubscribed", u, "all notification email", { subject: u, targetType: "user" });
  // One-click clients POST and ignore the body; a person who pressed the button gets a page.
  if ((request.headers.get("content-type") || "").includes("form") && !(await request.clone().text()).includes("List-Unsubscribe")) {
    return page("<h1>You're unsubscribed</h1><p>You won't get course notification emails any more. You can turn them back on any time in <a href=\"/notifications#settings\">your notification settings</a>.</p>");
  }
  return json({ ok: true });
}
