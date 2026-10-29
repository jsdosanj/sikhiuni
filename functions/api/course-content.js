import { getLearningUser } from './_learning-user.js';
import { json as baseJson, isCourseTeacher, hasCohortAccess } from "./_lib.js";
import { storedCourse } from './_course-store.js';
import { checkRateLimit } from './_rate-limit.js';
import { PRIVATE_COURSE_HEADERS } from "./_course-access.js";
const json = (data, status=200) => baseJson(data,status,PRIVATE_COURSE_HEADERS);

// GET /api/course-content?courseId=<id>: authenticated free lessons from private
// per-course R2 objects, or institutional lessons from D1's published draft.
// The public courses.json endpoint contains outline metadata only.
//
// Entitlement: the course's teacher/admin, or a member of a cohort tied to
// this courseId (functions/api/cohorts.js — the institution licensing the
// course hands its buyers that cohort's invite code; sikhiuni.com never
// processes payment itself).
//
// Quiz answers are never included here — this mirrors the public
// course-viewing experience for a free course; grading happens separately
// via POST /api/quiz (extended to grade gated courses from draft_quiz too).
export async function onRequestGet({ request, env }) {
  let user,needsMfa;
  try { ({user,needsMfa}=await getLearningUser(env,request)); } catch { return json({error:"Authentication unavailable"},503); }
  if (!user) return json({ error: "Please sign in to view this course." }, 401);
  if (needsMfa) return json({error:"mfa_required"},403);

  const courseId = new URL(request.url).searchParams.get("courseId");
  if (!courseId || courseId.length>200 || /[\\/]/.test(courseId)) return json({ error: "Valid courseId required" }, 400);
  if (!await checkRateLimit(env, 'course-content:' + user.id, 30, 60)) return baseJson({error:'rate_limited'},429,{...PRIVATE_COURSE_HEADERS,'retry-after':'60'});

  // Free published courses are still free, but lesson delivery requires a verified
  // session. Institutional courses continue through their existing cohort checks.
  if (env.MEDIA?.get) {
    let course;
    try { course = await storedCourse(env.MEDIA, courseId); } catch { return json({error:'Course content is temporarily unavailable.'},503); }
    // An institutional draft can be published in D1 before its outline export.
    // Unknown outline IDs continue through the existing cohort/teacher checks.
    if (course && !course.gated) {
      if (course.status !== 'published') return json({error:'not found'},404);
      return json({
        lessons:(course.lessons || []).map(l=>({title:l.title,...(l.summary?{summary:l.summary}:{}),html:l.html || ''})),
        quiz:(course.quiz || []).map(q=>({q:q.q,options:q.options})),
        terms:course.terms || [], references:course.references || [],
      });
    }
  }


  const entitled = user.role === "admin"
    || (await isCourseTeacher(env, user.id, courseId))
    || (await hasCohortAccess(env, user.id, courseId));
  if (!entitled) {
    return json({ error: "This course requires cohort access. Ask your program administrator for an invite code." }, 403);
  }

  const draft = await env.DB.prepare(
    "SELECT id FROM course_drafts WHERE course_id=? AND status='published' ORDER BY updated_at DESC LIMIT 1"
  ).bind(courseId).first();
  if (!draft) return json({ error: "not found" }, 404);

  const { results: lessons } = await env.DB.prepare(
    "SELECT idx, title, summary, html FROM draft_lessons WHERE draft_id=? ORDER BY idx"
  ).bind(draft.id).all();
  const { results: quiz } = await env.DB.prepare(
    "SELECT idx, q, options FROM draft_quiz WHERE draft_id=? ORDER BY idx"
  ).bind(draft.id).all();

  return json({
    lessons: (lessons || []).map((l) => ({ title: l.title, ...(l.summary ? { summary: l.summary } : {}), html: l.html })),
    quiz: (quiz || []).map((q) => ({ q: q.q, options: JSON.parse(q.options) })),
  });
}
