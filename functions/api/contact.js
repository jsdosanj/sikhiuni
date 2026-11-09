import { json, getUser, newId, logEvent } from "./_lib.js";

// POST /api/contact { name, email, topic, message, website? }
//
// The public "Contact us" form (/contact). Every message is stored first (the
// shared `feedback` table, category "contact:<topic>", so it also shows in the
// admin feedback queue) and then emailed to akaal@sikhi.io with the sender as
// reply-to, so the team can answer straight from their inbox.
//
// Mail: CONTACT_RESEND_API_KEY (the sikhi.io account, sends as akaal@sikhi.io) is
// preferred, exactly like /api/feedback; if only the site's RESEND_API_KEY is set,
// it sends from MAIL_FROM on that account. The caller is told whether the email
// went out, so the page never claims "sent" when it wasn't.
//
// Abuse: a hidden honeypot field (`website`), length caps, and a per-IP limit
// in worker.js RATE_LIMITS.
const TOPICS = new Set(["general", "account", "courses", "certificates", "partnerships", "technical", "other"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const oneLine = (s) => String(s).replace(/[\r\n]+/g, " ").trim();

async function ensureTable(env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS feedback (" +
    "id TEXT PRIMARY KEY, user_id TEXT, email TEXT, course_id TEXT, " +
    "category TEXT, message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new', created_at INTEGER NOT NULL)"
  ).run();
}

export async function onRequestPost({ request, env }) {
  let b; try { b = await request.json(); } catch { return json({ error: "bad request" }, 400); }
  // Honeypot: real visitors never see or fill this field. Pretend success so bots learn nothing.
  if (b && typeof b.website === "string" && b.website.trim()) return json({ ok: true, notified: true });

  const name = oneLine(typeof b?.name === "string" ? b.name : "").slice(0, 120);
  const email = String(typeof b?.email === "string" ? b.email : "").trim().toLowerCase().slice(0, 200);
  const topic = TOPICS.has(b?.topic) ? b.topic : "general";
  const message = String(typeof b?.message === "string" ? b.message : "").trim().slice(0, 5000);
  if (!name) return json({ error: "Please tell us your name.", field: "name" }, 400);
  if (!EMAIL_RE.test(email)) return json({ error: "Please enter a valid email so we can reply.", field: "email" }, 400);
  if (message.length < 10) return json({ error: "Please write a little more so we can help (at least 10 characters).", field: "message" }, 400);

  const user = await getUser(env, request).catch(() => null);
  await ensureTable(env);
  const id = newId();
  await env.DB.prepare(
    "INSERT INTO feedback (id, user_id, email, course_id, category, message, status, created_at) VALUES (?,?,?,?,?,?, 'new', ?)"
  ).bind(id, user ? user.id : null, email, null, "contact:" + topic, `From: ${name}\n\n${message}`, Date.now()).run();
  if (user) await logEvent(env, user, "contact_submitted", null, "topic=" + topic);

  const key = env.CONTACT_RESEND_API_KEY || env.RESEND_API_KEY;
  const from = env.CONTACT_RESEND_API_KEY ? "Sikhi University <akaal@sikhi.io>" : (env.MAIL_FROM || "Sikhi University <login@sikhiuni.com>");
  let notified = false;
  if (key) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: ["akaal@sikhi.io"],
          reply_to: email,
          subject: `SikhiUni contact (${topic}): ${name}`.slice(0, 180),
          text: `Name: ${name}\nEmail: ${email}\nTopic: ${topic}\nSigned-in account: ${user ? user.email || user.id : "no"}\nReference: ${id}\n\n${message}`,
        }),
        signal: AbortSignal.timeout(8000),
      });
      notified = res.ok;
      if (!res.ok) console.error("contact_email_refused", res.status, (await res.text().catch(() => "")).slice(0, 300));
    } catch (e) { console.error("contact_email_failed", e && e.message); }
  } else {
    console.warn("contact_email_not_configured");
  }
  // Stored either way; `notified` lets the page say honestly whether the email went out.
  return json({ ok: true, notified, reference: id });
}
