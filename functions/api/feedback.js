import { json, getUser, newId, logEvent } from "./_lib.js";

// Create the feedback table on demand so no separate migration is required.
async function ensureTable(env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS feedback (" +
    "id TEXT PRIMARY KEY, user_id TEXT, email TEXT, course_id TEXT, " +
    "category TEXT, message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new', created_at INTEGER NOT NULL)"
  ).run();
}

// POST /api/feedback { message, category?, courseId?, email? } -> store feedback (sign-in optional)
export async function onRequestPost({ request, env }) {
  await ensureTable(env);
  let b; try { b = await request.json(); } catch (e) { return json({ error: "bad request" }, 400); }
  const message = typeof b?.message === "string" ? b.message.trim().slice(0, 5000) : "";
  if (!message) return json({ error: "Please enter your feedback." }, 400);
  const category = (b.category || "general").toString().slice(0, 40);
  const courseId = (b.courseId || "").toString().slice(0, 120) || null;

  const user = await getUser(env, request);
  const email = (user && user.email) || (typeof b.email === "string" ? b.email.trim().toLowerCase().slice(0, 200) : "") || null;

  await env.DB.prepare(
    "INSERT INTO feedback (id, user_id, email, course_id, category, message, status, created_at) VALUES (?,?,?,?,?,?, 'new', ?)"
  ).bind(newId(), user ? user.id : null, email, courseId, category, message, Date.now()).run();
  if (user) await logEvent(env, user, "feedback_submitted", courseId, "category=" + category);
  // The database remains the source of truth if mail delivery is unavailable.
  let notified = false;
  if (env.CONTACT_RESEND_API_KEY) {
    try {
      const replyTo = email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined;
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.CONTACT_RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: "Sikhi University <akaal@sikhi.io>", to: ["akaal@sikhi.io"], reply_to: replyTo,
          subject: "SikhiUni feedback: " + category.replace(/[\r\n]/g, " "),
          text: `Category: ${category}\nCourse: ${courseId || 'Not specified'}\nReply email: ${email || 'Not supplied'}\n\n${message}` }),
      });
      notified = response.ok;
    } catch { /* Feedback is retained for the protected admin queue. */ }
  }
  if (!notified) console.warn("feedback_email_not_delivered");
  return json({ ok: true, notified });
}
