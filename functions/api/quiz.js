import { json, getUser, logEvent, isCourseTeacher, hasCohortAccess } from "./_lib.js";
import { QUIZ_KEYS } from "./_quiz-keys.js";
import { INSTITUTE_QUIZ_KEYS } from "./_institute-quiz-keys.js";

// POST /api/quiz { courseId, answers:[selectedOptionIndex, ...] }
// Grades the quiz ON THE SERVER against the secret answer key. Answers are never
// sent to the browser, so a client cannot forge a score (and thus a certificate).
// If the user is signed in, the (best) score is stored authoritatively in progress.
//
// Gated (institutional) courses have no QUIZ_KEYS entry — build_quiz_keys.py
// skips them since their public courses.json entry ships quiz:[] on purpose
// (see functions/api/admin/drafts-export.js). For those, grade from the real
// answers in draft_quiz instead, but only for an entitled requester (course
// teacher/admin, or a member of a cohort tied to this course) — unlike a free
// course, a gated course's quiz isn't meant to be gradable by just anyone.
export async function onRequestPost({ request, env }) {
  let b; try { b = await request.json(); } catch (e) { return json({ error: "bad request" }, 400); }
  if (!b || !b.courseId) return json({ error: "unknown course or no quiz" }, 404);

  const user = await getUser(env, request);
  // Institute of Technology lessons + phase exams grade against their own
  // generated key file (web/scripts/build-institute-quiz-keys.mjs). Same
  // server-side-only discipline as the main catalogue's QUIZ_KEYS.
  let key = QUIZ_KEYS[b.courseId] || INSTITUTE_QUIZ_KEYS[b.courseId];
  if (!key) {
    const draft = await env.DB.prepare(
      "SELECT id FROM course_drafts WHERE course_id=? AND status='published' AND visibility='gated' ORDER BY updated_at DESC LIMIT 1"
    ).bind(b.courseId).first();
    if (!draft) return json({ error: "unknown course or no quiz" }, 404);
    if (!user) return json({ error: "Please sign in." }, 401);
    const entitled = user.role === "admin"
      || (await isCourseTeacher(env, user.id, b.courseId))
      || (await hasCohortAccess(env, user.id, b.courseId));
    if (!entitled) return json({ error: "This course requires cohort access." }, 403);
    const { results: quizRows } = await env.DB.prepare("SELECT idx, answer FROM draft_quiz WHERE draft_id=? ORDER BY idx").bind(draft.id).all();
    if (!quizRows || !quizRows.length) return json({ error: "unknown course or no quiz" }, 404);
    key = quizRows.map((q) => q.answer);
  }
  const answers = Array.isArray(b.answers) ? b.answers : [];

  let correct = 0;
  for (let i = 0; i < key.length; i++) if (Number(answers[i]) === key[i]) correct++;
  const total = key.length;
  const score = total ? Math.round((correct / total) * 100) : 0;
  const passed = score >= 80;

  // Persist the grade only for signed-in users (server is the source of truth).
  if (user) {
    const prior = await env.DB.prepare("SELECT passed_score FROM progress WHERE user_id=? AND course_id=?").bind(user.id, b.courseId).first();
    const wasPassed = !!(prior && prior.passed_score >= 80);
    await env.DB.prepare(
      "INSERT INTO progress (user_id, course_id, done, passed_score, updated_at) VALUES (?,?,'[]',?,?) " +
      "ON CONFLICT(user_id, course_id) DO UPDATE SET updated_at=excluded.updated_at, " +
      "passed_score=CASE WHEN progress.passed_score IS NULL THEN excluded.passed_score ELSE MAX(progress.passed_score, excluded.passed_score) END"
    ).bind(user.id, b.courseId, score, Date.now()).run();
    await logEvent(env, user, "quiz_attempted", b.courseId, "score=" + score);
    if (passed && !wasPassed) await logEvent(env, user, "passed_course", b.courseId, "score=" + score);
  }
  // A failing attempt returns ONLY the boolean. Returning `correct`/`score`
  // lets a client re-submit varied answers and use the count as an oracle to
  // reconstruct the answer key over many tries (CSO 2026-08-29). The score is
  // revealed once passed — the oracle is moot then, and the grade is already
  // in `progress` server-side regardless.
  return passed
    ? json({ passed: true, score, signedIn: !!user })
    : json({ passed: false, signedIn: !!user });
}
