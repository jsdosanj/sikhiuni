import { describe, it, expect } from "vitest";
import { onRequestPost } from "../functions/api/institute-exam.js";
import { INSTITUTE_QUIZ_KEYS } from "../functions/api/_institute-quiz-keys.js";
import { mockEnv, req, LEARNER } from "./helpers";

// INVARIANT: the Institute of Technology phase exam grades (pool-index, choice)
// tuples ON THE SERVER against the server-only key. No answer key reaches the
// browser, so a passing score — and therefore the certificate — cannot be
// forged. Sign-in is required (the score is what gates the certificate) and a
// short partial submission cannot pass; the client must answer a full sample.
// A FAILING attempt returns ONLY { passed:false } — no score/correct/total —
// so the count can't be used as an answer-key oracle across re-submissions
// (CSO 2026-08-29). Skip/dedup behaviour is therefore verified through the
// "< NEED distinct questions → 400" path, not through the count.
describe("POST /api/institute-exam — phase exam grading", () => {
  const TRACK = "aisf-00-setup";
  const KEY = INSTITUTE_QUIZ_KEYS[TRACK];
  const NEED = Math.min(20, KEY.length);

  const allCorrect = (n: number) => Array.from({ length: n }, (_, qi) => ({ qi, sel: KEY[qi] }));

  const call = (body: unknown, opts: Record<string, unknown> = {}) =>
    onRequestPost({
      request: req({ url: "http://localhost/api/institute-exam", body, cookie: "s" }),
      env: mockEnv({ user: LEARNER, ...opts }),
    });

  it("a full correct sample → passed:true, score revealed", async () => {
    const res = await call({ track: TRACK, items: allCorrect(NEED) });
    expect(res.status).toBe(200);
    const b = await res.json();
    expect(b.score).toBe(100);
    expect(b.passed).toBe(true);
  });

  it("a full wrong sample → passed:false and NO numeric fields (no oracle)", async () => {
    const items = Array.from({ length: NEED }, (_, qi) => ({ qi, sel: KEY[qi] === 0 ? 9 : 0 }));
    const res = await call({ track: TRACK, items });
    const b = await res.json();
    expect(b.passed).toBe(false);
    expect(b.score).toBeUndefined();
    expect(b.correct).toBeUndefined();
    expect(b.total).toBeUndefined();
  });

  it("a partial-but-failing attempt leaks no count (half right → just the boolean)", async () => {
    const half = Math.floor(NEED / 2);
    const items = Array.from({ length: NEED }, (_, qi) => ({ qi, sel: qi < half ? KEY[qi] : (KEY[qi] === 0 ? 9 : 0) }));
    const b = await (await call({ track: TRACK, items })).json();
    expect(b.passed).toBe(false);
    expect(b.score).toBeUndefined();
  });

  it("a short but all-correct submission cannot pass → 400 (answer the full exam)", async () => {
    const res = await call({ track: TRACK, items: allCorrect(3) });
    expect(res.status).toBe(400);
    const b = await res.json();
    expect(b.need).toBe(NEED);
  });

  it("not signed in → 401 (no score recorded, no certificate)", async () => {
    const res = await onRequestPost({
      request: req({ url: "http://localhost/api/institute-exam", body: { track: TRACK, items: allCorrect(NEED) } }),
      env: mockEnv({ user: null }),
    });
    expect(res.status).toBe(401);
  });

  it("unknown track → 404", async () => {
    const res = await call({ track: "no-such-phase", items: allCorrect(NEED) });
    expect(res.status).toBe(404);
  });

  it("duplicate qi entries count once — repeating 3 correct answers can't pass a 20-question exam", async () => {
    // 60 items but only 3 distinct qi → below NEED → rejected, not graded as 100%.
    const padded = Array.from({ length: 60 }, (_, i) => ({ qi: i % 3, sel: KEY[i % 3] }));
    const res = await call({ track: TRACK, items: padded });
    expect(res.status).toBe(400);
    const b = await res.json();
    expect(b.need).toBe(NEED);
  });

  it("out-of-range qi does not count toward the NEED threshold", async () => {
    // NEED-1 real answers + one out-of-range → still short → 400 (proves qi:9999 was skipped).
    const res = await call({ track: TRACK, items: [...allCorrect(NEED - 1), { qi: 9999, sel: 0 }] });
    expect(res.status).toBe(400);
  });

  it("malformed JSON body → 400", async () => {
    const res = await onRequestPost({
      request: req({ url: "http://localhost/api/institute-exam", body: "{oops", method: "POST", cookie: "s" }),
      env: mockEnv({ user: LEARNER }),
    });
    expect(res.status).toBe(400);
  });
});
