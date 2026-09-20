import { describe, it, expect } from "vitest";
import { onRequestPost } from "../functions/api/quiz.js";
import { QUIZ_KEYS } from "../functions/api/_quiz-keys.js";
import { mockEnv, req } from "./helpers";

// INVARIANT 1: server-side grading. Answers are never sent to the browser, so a
// client cannot forge a score (and thus a certificate). Anonymous grading works.
// INVARIANT 1b (CSO 2026-08-29): a FAILING attempt returns only the boolean —
// no score/correct/total — so the count can't be used as an oracle to
// binary-search the answer key over repeated re-submissions.
describe("POST /api/quiz — server-side grading", () => {
  const COURSE = "ai-foundations";
  const KEY = QUIZ_KEYS[COURSE]; // [1,2,0,1,2,3]

  it("all-correct answers → passed:true, score 100 (anonymous, no user)", async () => {
    const res = await onRequestPost({
      request: req({ url: "http://localhost/api/quiz", body: { courseId: COURSE, answers: KEY.slice() } }),
      env: mockEnv(), // no user configured — pure anonymous path, never touches DB
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.passed).toBe(true);
    expect(body.score).toBe(100);
    expect(body.signedIn).toBe(false);
  });

  it("wrong answers → passed:false and NO numeric fields (no oracle)", async () => {
    // Shift every answer off the key so (almost) nothing matches.
    const wrong = KEY.map((k: number) => (k === 0 ? 9 : 0));
    const res = await onRequestPost({
      request: req({ url: "http://localhost/api/quiz", body: { courseId: COURSE, answers: wrong } }),
      env: mockEnv(),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.passed).toBe(false);
    expect(body.score).toBeUndefined();
    expect(body.correct).toBeUndefined();
    expect(body.total).toBeUndefined();
  });

  it("a partial-but-failing attempt still leaks nothing (12 of 20 right → no count)", async () => {
    // One-correct, rest-wrong: enough to be a useful oracle sample if leaked.
    const partial = KEY.map((k: number, i: number) => (i === 0 ? k : (k === 0 ? 9 : 0)));
    const res = await onRequestPost({
      request: req({ url: "http://localhost/api/quiz", body: { courseId: COURSE, answers: partial } }),
      env: mockEnv(),
    });
    const body = await res.json();
    expect(body.passed).toBe(false);
    expect(body.score).toBeUndefined();
  });

  it("unknown courseId → 404", async () => {
    const res = await onRequestPost({
      request: req({ url: "http://localhost/api/quiz", body: { courseId: "no-such-course", answers: [] } }),
      env: mockEnv(),
    });
    expect(res.status).toBe(404);
  });

  it("missing courseId → 404 (no key to grade against)", async () => {
    const res = await onRequestPost({
      request: req({ url: "http://localhost/api/quiz", body: { answers: [1, 2, 0] } }),
      env: mockEnv(),
    });
    expect(res.status).toBe(404);
  });

  it("malformed JSON body → 400", async () => {
    const res = await onRequestPost({
      request: req({ url: "http://localhost/api/quiz", body: "{not json", method: "POST" }),
      env: mockEnv(),
    });
    expect(res.status).toBe(400);
  });
});
