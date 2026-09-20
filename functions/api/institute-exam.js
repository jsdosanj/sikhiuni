import { json, getUser, logEvent } from "./_lib.js";
import { INSTITUTE_QUIZ_KEYS } from "./_institute-quiz-keys.js";

// POST /api/institute-exam { track, items:[{ qi, sel }] }
//
// The Institute of Technology phase exam. The browser holds only an answer-free
// question pool (web/src/data/institute/exam/<track>.json), samples ~20, and
// submits (pool-index, chosen-option) tuples. Grading happens HERE against the
// server-only key (web/scripts/build-institute-quiz-keys.mjs) — the same
// anti-forgery discipline as /api/quiz and /api/program-exam: no answer ever
// reaches the client, so a passing score (and therefore the certificate)
// cannot be forged.
//
// Sign-in is required: the score is persisted to `progress` under
// course_id = <track>, which is exactly what functions/api/certificates.js
// checks before it will issue a verifiable certificate id. Re-attempts keep
// the best score (MAX), mirroring /api/quiz.
export async function onRequestPost({ request, env }) {
  const user = await getUser(env, request);
  if (!user) return json({ error: "Please sign in to take the exam." }, 401);

  let b;
  try { b = await request.json(); } catch (e) { return json({ error: "bad request" }, 400); }

  const track = (b && b.track ? String(b.track) : "").slice(0, 120);
  const key = INSTITUTE_QUIZ_KEYS[track];
  if (!key || !Array.isArray(key) || key.length === 0) {
    return json({ error: "unknown exam" }, 404);
  }

  const items = Array.isArray(b && b.items) ? b.items : [];
  // The exam is a fixed-size sample of the bank; a client cannot pass by
  // answering only the three questions it is sure of.
  const need = Math.min(20, key.length);

  let correct = 0;
  let total = 0;
  const seen = new Set();
  for (const it of items) {
    const qi = Number(it && it.qi);
    if (!Number.isInteger(qi) || qi < 0 || qi >= key.length || seen.has(qi)) continue;
    seen.add(qi);
    total++;
    if (Number(it && it.sel) === key[qi]) correct++;
  }
  if (total < need) {
    return json({ error: "answer the full exam first", need }, 400);
  }

  const score = Math.round((correct / total) * 100);
  const passed = score >= 80;

  const prior = await env.DB
    .prepare("SELECT passed_score FROM progress WHERE user_id=? AND course_id=?")
    .bind(user.id, track)
    .first();
  const wasPassed = !!(prior && prior.passed_score >= 80);

  await env.DB.prepare(
    "INSERT INTO progress (user_id, course_id, done, passed_score, updated_at) VALUES (?,?,'[]',?,?) " +
    "ON CONFLICT(user_id, course_id) DO UPDATE SET updated_at=excluded.updated_at, " +
    "passed_score=CASE WHEN progress.passed_score IS NULL THEN excluded.passed_score ELSE MAX(progress.passed_score, excluded.passed_score) END"
  ).bind(user.id, track, score, Date.now()).run();

  await logEvent(env, user, "institute_exam_attempted", track, "score=" + score);
  if (passed && !wasPassed) await logEvent(env, user, "passed_course", track, "score=" + score);

  // A failing attempt returns ONLY the boolean — see functions/api/quiz.js.
  // Returning `correct` lets a client binary-search the sampled key over many
  // re-submissions and mint a certificate without knowing the material. The
  // score is revealed on a pass; the grade is persisted server-side regardless.
  return passed ? json({ passed: true, score }) : json({ passed: false });
}
