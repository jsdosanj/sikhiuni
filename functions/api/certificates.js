import { json, getUser, newId, logEvent } from "./_lib.js";
import { certificateEarnedTemplate } from "../_email-templates.js";
import { checkRateLimit } from "./_rate-limit.js";
import programsData from "../../site/assets/data/programs.json";

async function ensure(env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS certificates (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, course_id TEXT NOT NULL, name TEXT, score INTEGER, issued_at INTEGER NOT NULL, UNIQUE(user_id, course_id))"
  ).run();
}

// GET /api/certificates?id=... -> public verification of a certificate id
export async function onRequestGet({ request, env }) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return json({ valid: false });
  // Public lookup that returns a holder name: throttle per IP so ids cannot be enumerated.
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (!(await checkRateLimit(env, "certverify:" + ip, 60, 60))) return json({ error: "rate_limited" }, 429);
  try {
    await ensure(env);
    const r = await env.DB.prepare("SELECT course_id, name, score, issued_at FROM certificates WHERE id=?").bind(id).first();
    if (!r) return json({ valid: false });
    return json({ valid: true, courseId: r.course_id, name: r.name, score: r.score, issuedAt: r.issued_at });
  } catch (e) {
    // A database outage must NOT declare a genuine certificate invalid on the
    // public trust surface. Signal "couldn't check" (503) so the verify page
    // tells the visitor to try again, rather than "no certificate matches".
    console.error("cert_verify_db_error", id, e && e.stack || String(e));
    return json({ error: "cannot_check" }, 503);
  }
}

// One transactional email, only on FIRST issuance (the early return above
// handles re-issue / name edits, so a repeat visit never re-sends). Never
// throws and never changes the response: the certificate already exists. Same
// Resend shape as functions/api/auth/_onboarding.js sendWelcomeEmail. Runs via
// waitUntil when the router provides it, so Resend latency never delays the response.
async function sendCertificateEmail(env, email, name, certId, courseId) {
  if (!email) return;
  if (!env.RESEND_API_KEY) { console.log("cert email: RESEND_API_KEY not configured"); return; }
  try {
    const t = certificateEarnedTemplate(name, certId, programsData.programs.some((p) => p.id === courseId) ? "program" : "course");
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: env.MAIL_FROM || "Sikhi University <login@sikhiuni.com>",
        to: [email],
        reply_to: env.REPLY_TO || "akaal@sikhi.io",
        subject: t.subject, text: t.text, html: t.html,
      }),
      signal: AbortSignal.timeout(4000),
    });
  } catch (e) { console.log("Resend threw (certificate)", e && e.message); }
}

// POST /api/certificates { courseId, name } -> issue (or return existing) verifiable id.
// Server-validates the pass against the synced progress table.
export async function onRequestPost({ request, env, waitUntil }) {
  await ensure(env);
  const user = await getUser(env, request);
  if (!user) return json({ error: "Please sign in." }, 401);
  let b; try { b = await request.json(); } catch (e) { return json({ error: "bad request" }, 400); }
  const courseId = (b.courseId || "").toString().slice(0, 120);
  if (!courseId) return json({ error: "courseId required" }, 400);
  const name = (b.name || user.name || "").toString().trim().slice(0, 120);

  let score = null;
  try {
    const p = await env.DB.prepare("SELECT passed_score FROM progress WHERE user_id=? AND course_id=?").bind(user.id, courseId).first();
    score = p ? p.passed_score : null;
  } catch (e) {}
  if (!(typeof score === "number" && score >= 80)) {
    return json({ error: "Pass the course (80%+) first — your progress must sync while signed in." }, 403);
  }

  const existing = await env.DB.prepare("SELECT id, issued_at FROM certificates WHERE user_id=? AND course_id=?").bind(user.id, courseId).first();
  if (existing) {
    if (name) await env.DB.prepare("UPDATE certificates SET name=? WHERE id=?").bind(name, existing.id).run();
    return json({ ok: true, id: existing.id, issuedAt: existing.issued_at });
  }
  const id = "SU-" + newId().slice(0, 10).toUpperCase();
  const issuedAt = Date.now();
  await env.DB.prepare("INSERT INTO certificates (id, user_id, course_id, name, score, issued_at) VALUES (?,?,?,?,?,?)")
    .bind(id, user.id, courseId, name, score, issuedAt).run();
  await logEvent(env, user, "certificate_issued", courseId, "cert_id=" + id);
  // Off the request path where the runtime provides waitUntil (worker.js passes it); awaited otherwise (tests).
  const sending = sendCertificateEmail(env, user.email, name, id, courseId);
  if (typeof waitUntil === "function") waitUntil(sending); else await sending;
  return json({ ok: true, id, issuedAt });
}
