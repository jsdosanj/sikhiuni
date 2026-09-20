import { json } from "./_lib.js";
import { QUIZ_KEYS } from "./_quiz-keys.js";

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

export async function onRequestPost({ request, env }) {
  let b; try { b = await request.json(); } catch (e) { return json({ error: "bad request" }, 400); }
  const items = Array.isArray(b && b.items) ? b.items : [];
  if (items.length === 0) return json({ error: "no answers submitted" }, 400);

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
