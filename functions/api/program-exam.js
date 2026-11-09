import { json, getUser, logEvent } from "./_lib.js";
import { checkRateLimit } from "./_rate-limit.js";
import { QUIZ_KEYS } from "./_quiz-keys.js";
import programsData from "../../site/assets/data/programs.json";

// POST /api/program-exam { items:[{cid, qi, sel}] }
// Grades a program cumulative exam ON THE SERVER against the secret answer keys,
// mirroring /api/quiz for the multi-course question pool. The browser never
// receives quiz answers (they are stripped from the public catalogue); it submits
// (courseId, question-index, chosen-option) tuples and the server scores them.
//
// THE PASS MARK IS SERVER-SIDE AND THE DENOMINATOR HAS A FLOOR (CSO 2026-09-09).
// Both guard the same hole. This endpoint scores `correct / submitted-items`, not
// `correct / full-key-length` the way /api/quiz does, so the client controls the
// denominator. Previously it also controlled the threshold (`passMark`, clamped to
// a floor of 1). Together those made an unauthenticated answer-key oracle: POST a
// SINGLE item with passMark 1 and the pass/fail boolean alone tells you whether
// that one option was correct — 3-4 requests per question, repeat, and you have
// the whole key for every course in QUIZ_KEYS. That defeats the property the rest
// of this codebase is built to hold (answers never reach the browser), and a
// recovered key lets someone score 100% through /api/quiz, which DOES write
// `progress.passed_score` and therefore mints a real certificate.
//
// PASS_MARK matches /api/quiz's hardcoded 80 and every program in
// site/assets/data/programs.json (all 11 are 80). If a program ever needs a
// different mark, thread its id through and look the value up server-side — do
// not restore the client-supplied field. A mismatch fails safe (stricter than
// advertised), never lax.
const PASS_MARK = 80;
// The smallest real exam is 40 questions (programs.json) drawn from an 88-question
// pool, so no honest submission comes near this floor; unanswered questions still
// count toward `total`, so a real attempt is always its full question count.
const MIN_GRADABLE_ITEMS = 10;

// RECORDED MODE (added 2026-11): when the body names a real `programId` AND the
// caller is signed in, a pass is persisted to `progress` under
// course_id = <programId> (best score kept), exactly like /api/institute-exam does
// for its tracks. functions/api/certificates.js then issues a verifiable
// certificate id for it with no schema change. Because that pass now mints a
// verifiable certificate (before, it only set a browser flag), recorded mode is
// STRICT: every answer must be a distinct (cid, qi) from THIS program's own
// courses and the attempt must be the full exam (min(testQuestions, size of the
// program's question pool)), so none of the denominator-shrinking / repeat-item
// oracle tricks documented above apply. Anonymous or programId-less calls keep the
// legacy behaviour byte for byte (graded, never recorded).
function programById(id) {
  return typeof id === "string" ? programsData.programs.find((p) => p.id === id) : undefined;
}

// A recorded pass mints a verifiable certificate for the WHOLE program, so the server must also know the
// learner earned what the program is made of: every required course passed (>= PASS_MARK, the same bar
// /api/certificates uses for a course certificate) and, when the program has prerequisites, at least one of them
// passed as a program (a recorded program exam pass). Returns an error code or null.
async function missingRequirements(env, userId, prog) {
  const { results } = await env.DB.prepare("SELECT course_id, passed_score FROM progress WHERE user_id=?").bind(userId).all();
  const passed = new Set((results || []).filter((r) => typeof r.passed_score === "number" && r.passed_score >= PASS_MARK).map((r) => r.course_id));
  if (prog.courseIds.some((cid) => !passed.has(cid))) return "complete_required_courses";
  if (prog.prerequisites.length && !prog.prerequisites.some((pid) => passed.has(pid))) return "prerequisite_required";
  return null;
}

function gradeStrict(prog, items) {
  const allowed = new Set(prog.courseIds);
  const poolSize = prog.courseIds.reduce((n, cid) => n + (QUIZ_KEYS[cid] ? QUIZ_KEYS[cid].length : 0), 0);
  const need = Math.min(prog.testQuestions, poolSize);
  const seen = new Set();
  let correct = 0;
  for (const it of items) {
    const cid = it && it.cid;
    const qi = Number(it && it.qi);
    const key = allowed.has(cid) ? QUIZ_KEYS[cid] : null;
    if (!key || !Number.isInteger(qi) || qi < 0 || qi >= key.length) continue;
    const id = cid + "#" + qi;
    if (seen.has(id)) continue;
    seen.add(id);
    if (Number(it.sel) === key[qi]) correct++;
  }
  if (need === 0 || seen.size < need) return null;
  return Math.round((correct / seen.size) * 100);
}

export async function onRequestPost({ request, env }) {
  let b; try { b = await request.json(); } catch (e) { return json({ error: "bad request" }, 400); }
  const items = Array.isArray(b && b.items) ? b.items : [];
  if (items.length === 0) return json({ error: "no answers submitted" }, 400);
  // The longest real exam is 120 answers; bound the work an attempt can cause.
  if (items.length > 300) return json({ error: "too many answers" }, 400);

  const prog = programById(b && b.programId);
  const user = prog ? await getUser(env, request) : null;
  if (prog && user) {
    // Recorded attempts can mint a certificate: cap them per account (a real exam takes far longer than this allows).
    if (!(await checkRateLimit(env, "progexam:" + user.id, 20, 3600))) return json({ error: "rate_limited" }, 429);
    const missing = await missingRequirements(env, user.id, prog);
    if (missing) return json({ error: missing }, 403);
    const score = gradeStrict(prog, items);
    if (score === null) return json({ error: "answer the full exam first" }, 400);
    const passed = score >= PASS_MARK;
    await logEvent(env, user, "program_exam_attempted", prog.id, passed ? "score=" + score : "failed");
    if (!passed) return json({ passed: false });
    await env.DB.prepare(
      "INSERT INTO progress (user_id, course_id, done, passed_score, updated_at) VALUES (?,?,'[]',?,?) " +
      "ON CONFLICT(user_id, course_id) DO UPDATE SET updated_at=excluded.updated_at, " +
      "passed_score=CASE WHEN progress.passed_score IS NULL THEN excluded.passed_score ELSE MAX(progress.passed_score, excluded.passed_score) END"
    ).bind(user.id, prog.id, score, Date.now()).run();
    return json({ passed: true, score, recorded: true });
  }

  let correct = 0, total = 0;
  for (const it of items) {
    const key = it && it.cid ? QUIZ_KEYS[it.cid] : null;
    const qi = Number(it && it.qi);
    if (!key || !Number.isInteger(qi) || qi < 0 || qi >= key.length) continue; // unknown question — not graded
    total++;
    if (Number(it.sel) === key[qi]) correct++;
  }
  if (total === 0) return json({ error: "no gradable questions" }, 400);
  // Too few questions to be a real attempt: refuse rather than grade. Shrinking
  // the denominator is the oracle's first move.
  if (total < MIN_GRADABLE_ITEMS) return json({ error: "too few questions to grade" }, 400);
  const score = Math.round((correct / total) * 100);
  const passed = score >= PASS_MARK;
  // A failing attempt returns ONLY the boolean — see functions/api/quiz.js.
  // `correct`/`score` on a fail is an answer-key-reconstruction oracle.
  return passed ? json({ passed: true, score }) : json({ passed: false });
}
