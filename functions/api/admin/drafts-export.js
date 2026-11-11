import { json, requireMfa, logEvent } from "../_lib.js";

// GET /api/admin/drafts-export?status=approved[&limit=&offset=]
// Auth: an admin session, OR `Authorization: Bearer ${EXPORT_TOKEN}` (the
// import-drafts.yml GitHub Action calls this with the token — see
// docs/OPERATIONS.md and the EXPORT_TOKEN Worker secret / repo secret).
// Returns a canonical Course-shaped JSON array; scripts/import_drafts.py
// strips the leading-underscore fields before merging into courses.json.
export async function onRequestGet({ request, env }) {
  const authHeader = request.headers.get("authorization") || "";
  const bearerOk = !!env.EXPORT_TOKEN && authHeader === `Bearer ${env.EXPORT_TOKEN}`;
  let actor = null;
  if (!bearerOk) {
    const { user, error } = await requireMfa(env, request, ["admin"]);
    if (error) return error;
    actor = user;
  }
  await logEvent(env, actor, "export_drafts", null, bearerOk ? "export_token" : "admin_session", { targetType: "export" });

  const p = new URL(request.url).searchParams;
  const status = p.get("status") || "approved";
  const limit = Math.min(200, Math.max(1, parseInt(p.get("limit") || "50", 10) || 50));
  const offset = Math.max(0, parseInt(p.get("offset") || "0", 10) || 0);

  const { results: drafts } = await env.DB.prepare(
    "SELECT * FROM course_drafts WHERE status=? ORDER BY reviewed_at ASC LIMIT ? OFFSET ?"
  ).bind(status, limit, offset).all();

  const courses = [];
  for (const draft of drafts || []) {
    const { results: lessons } = await env.DB.prepare("SELECT idx, title, summary, html FROM draft_lessons WHERE draft_id=? ORDER BY idx").bind(draft.id).all();
    const { results: quiz } = await env.DB.prepare("SELECT idx, q, options, answer FROM draft_quiz WHERE draft_id=? ORDER BY idx").bind(draft.id).all();
    const author = await env.DB.prepare("SELECT name, email FROM users WHERE id=?").bind(draft.author_id).first();
    const profile = await env.DB.prepare("SELECT display_name, claimed_professor FROM teacher_profiles WHERE user_id=?").bind(draft.author_id).first();
    const professor = (profile && profile.claimed_professor) || (profile && profile.display_name) || (author && author.name) || (author && author.email) || "Sikhi University";

    let meta = {};
    try { meta = JSON.parse(draft.meta); } catch (e) {}
    const gated = draft.visibility === "gated";

    courses.push({
      id: draft.course_id, title: draft.title, topic: draft.topic, level: draft.level,
      professor, status: "published", aiCreated: !!meta.aiAssisted,
      summary: meta.summary || "",
      ...(gated ? { gated: true } : {}),
      ...(meta.outcomes && meta.outcomes.length ? { outcomes: meta.outcomes } : {}),
      ...(meta.terms && meta.terms.length ? { terms: meta.terms } : {}),
      ...(meta.references && meta.references.length ? { references: meta.references } : {}),
      // Gated (institutional) courses never ship lesson/quiz content into the public,
      // git-tracked catalogue — draft_lessons/draft_quiz remain the permanent source of
      // truth, served only to entitled users via functions/api/course-content.js.
      lessons: gated ? [] : (lessons || []).map((l) => ({ title: l.title, ...(l.summary ? { summary: l.summary } : {}), html: l.html })),
      quiz: gated ? [] : (quiz || []).map((q) => ({ q: q.q, options: JSON.parse(q.options), answer: q.answer })),
      _draftId: draft.id,
      _baseCourseId: draft.base_course_id,
      _authorId: draft.author_id,
      _authorEmail: author && author.email,
      _reviewedBy: draft.reviewed_by,
    });
  }

  return json({ courses, count: courses.length, limit, offset });
}
