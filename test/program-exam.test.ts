import { describe, it, expect } from "vitest";
import { onRequestPost } from "../functions/api/program-exam.js";
import { QUIZ_KEYS } from "../functions/api/_quiz-keys.js";
import { mockEnv, req, LEARNER } from "./helpers";
import programs from "../site/assets/data/programs.json";

// INVARIANT 2: program exam grades submitted {cid,qi,sel} tuples against the
// secret QUIZ_KEYS on the server. Unknown/out-of-range tuples are silently
// skipped (not counted), empty items → 400.
// INVARIANT 2b (CSO 2026-08-29): a failing attempt returns only { passed:false } —
// no score/correct/total — so the count can't be used as an answer-key oracle.
//
// INVARIANT 2c (CSO 2026-09-09): the pass mark is SERVER-side and the denominator
// has a floor. This endpoint scores `correct / submitted-items`, not
// `correct / full-key-length` the way /api/quiz does, so the client controls the
// denominator; it also used to accept a client-supplied `passMark` clamped to a
// floor of 1. Together those defeated 2b: a SINGLE-item submission with
// passMark 1 makes the pass/fail boolean itself the oracle — it is true iff that
// one option was correct. Recovering a key that way lets someone score 100%
// through /api/quiz, which DOES persist `progress.passed_score` and therefore
// mints a real certificate. /api/institute-exam got these guards in the
// 2026-08-29 pass; this endpoint was missed.
//
// Because of the floor, skip behaviour (unknown cid, out-of-range qi) is now
// verified with a full-size sample plus one skipped tuple: if a skipped tuple
// were counted, the score would drop below 100 and the assertion would fail.
describe("POST /api/program-exam — cumulative exam grading", () => {
  const COURSE = "ai-foundations";
  const KEY = QUIZ_KEYS[COURSE]; // [1,2,0,1,2,3]
  const N = 12; // comfortably above the server's MIN_GRADABLE_ITEMS floor

  // N gradable tuples, cycling the key (each item is graded independently).
  const sample = (pick: (qi: number) => number, n = N) =>
    Array.from({ length: n }, (_, i) => {
      const qi = i % KEY.length;
      return { cid: COURSE, qi, sel: pick(qi) };
    });
  const allCorrect = (n = N) => sample((qi) => KEY[qi], n);
  const wrongFor = (qi: number) => (KEY[qi] + 1) % 4;

  const call = (body: unknown) =>
    onRequestPost({ request: req({ url: "http://localhost/api/program-exam", body }), env: mockEnv() });

  // ---- INVARIANT 2c: the oracle is closed -----------------------------------

  it("rejects a single-item probe — the answer-key oracle's first move", async () => {
    // A correct answer submitted alone. Before the fix this returned
    // { passed: true, score: 100 } and revealed the key for that question.
    const res = await call({ items: [{ cid: COURSE, qi: 0, sel: KEY[0] }] });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/too few questions/i);
  });

  it("rejects a short partial submission below the gradable floor", async () => {
    const res = await call({ items: allCorrect(9) });
    expect(res.status).toBe(400);
  });

  it("ignores a client-supplied passMark — the server owns the threshold", async () => {
    const res = await call({ items: sample(wrongFor), passMark: 1 }); // 0% correct
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ passed: false });
  });

  it("enforces the 80% pass mark, not a laxer client value", async () => {
    // 9/12 = 75%: under 80, so a fail even though the client asks for 70.
    const some = allCorrect();
    for (let i = 9; i < N; i++) some[i].sel = wrongFor(some[i].qi);
    expect(await (await call({ items: some, passMark: 70 })).json()).toEqual({ passed: false });
  });

  it("a lowered passMark cannot isolate one unknown answer", async () => {
    // 11/12 correct, one unknown. With and without passMark the response must be
    // identical — the client cannot tune the threshold to straddle a single
    // question and read the answer off the boolean.
    const nearly = allCorrect();
    nearly[N - 1].sel = wrongFor(nearly[N - 1].qi);
    const withMark = await (await call({ items: nearly, passMark: 1 })).json();
    const without = await (await call({ items: nearly })).json();
    expect(withMark).toEqual(without);
  });

  // ---- INVARIANT 2 + 2b: original contract, preserved -----------------------

  it("a full correct sample → passed:true with the score revealed", async () => {
    const res = await call({ items: allCorrect() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.score).toBe(100);
    expect(body.passed).toBe(true);
  });

  it("a failing attempt returns NO numeric fields (no oracle)", async () => {
    const half = allCorrect();
    for (let i = 6; i < N; i++) half[i].sel = wrongFor(half[i].qi);
    const res = await call({ items: half });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.passed).toBe(false);
    expect(body.score).toBeUndefined();
    expect(body.correct).toBeUndefined();
    expect(body.total).toBeUndefined();
  });

  it("empty items → 400", async () => {
    expect((await call({ items: [] })).status).toBe(400);
  });

  it("missing items → 400", async () => {
    expect((await call({ passMark: 70 })).status).toBe(400);
  });

  it("unknown cid is skipped, not counted against the score", async () => {
    // A full correct sample plus one unknown-course tuple. If the unknown cid
    // were counted as wrong the score would drop below 100.
    const res = await call({ items: [...allCorrect(), { cid: "no-such-course", qi: 0, sel: 0 }] });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.score).toBe(100);
    expect(body.passed).toBe(true);
  });

  it("out-of-range qi is skipped, not counted", async () => {
    const res = await call({ items: [...allCorrect(), { cid: COURSE, qi: 999, sel: 0 }] });
    const body = await res.json();
    expect(body.score).toBe(100); // still N/N, not N/(N+1)
    expect(body.passed).toBe(true);
  });

  it("only unknown/ungradable tuples → 400 (no gradable questions)", async () => {
    const junk = Array.from({ length: N }, (_, i) => ({ cid: "no-such-course", qi: i, sel: 0 }));
    const res = await call({ items: junk });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/no gradable questions/i);
  });

  it("a perfect score passes any valid mark", async () => {
    const body = await (await call({ items: allCorrect(), passMark: 100 })).json();
    expect(body.score).toBe(100);
    expect(body.passed).toBe(true);
  });
});

// RECORDED MODE (2026-11): a signed-in pass on a real program is persisted to
// `progress` (course_id = program id) so /api/certificates can issue a verifiable
// certificate. Because that now mints something verifiable it is STRICT: the full
// exam, distinct questions, from that program's own courses only.
describe("POST /api/program-exam — recorded mode (programId + signed in)", () => {
  const PROG = "cert-gurbani-literacy"; // 40 questions drawn from an 88-question pool
  const prog = programs.programs.find((p: any) => p.id === PROG)!;
  const pool: { cid: string; qi: number }[] = [];
  for (const cid of prog.courseIds) for (let qi = 0; qi < (QUIZ_KEYS[cid] || []).length; qi++) pool.push({ cid, qi });
  const exam = (pick: (cid: string, qi: number) => number, n = prog.testQuestions) =>
    pool.slice(0, n).map((q) => ({ ...q, sel: pick(q.cid, q.qi) }));
  const right = (cid: string, qi: number) => QUIZ_KEYS[cid][qi];

  // Server-side progress rows that satisfy a program's requirements (every course >= 80), plus extras.
  const earned = (p: any, extra: any[] = []) => [...p.courseIds.map((c: string) => ({ course_id: c, passed_score: 90 })), ...extra];
  const run = async (items: unknown[], programId: string | null = PROG, signedIn = true, rows: any[] = earned(prog)) => {
    const env: any = mockEnv({ user: signedIn ? LEARNER : null, rows });
    const writes: any[][] = [];
    const prepare = env.DB.prepare.bind(env.DB);
    env.DB.prepare = (sql: string) => {
      const st = prepare(sql);
      const bind = st.bind.bind(st);
      st.bind = (...a: any[]) => { if (/INSERT INTO progress/.test(sql)) writes.push(a); return bind(...a); };
      return st;
    };
    const res = await onRequestPost({
      request: req({ url: "http://localhost/api/program-exam", cookie: signedIn ? "sess-learner" : undefined, body: { items, ...(programId ? { programId } : {}) } }),
      env,
    });
    return { res, writes };
  };

  it("a full passing exam is recorded under the program id and reported as recorded", async () => {
    const { res, writes } = await run(exam(right));
    expect(await res.json()).toEqual({ passed: true, score: 100, recorded: true });
    expect(writes).toHaveLength(1);
    expect(writes[0].slice(0, 3)).toEqual([LEARNER.id, PROG, 100]);
  });

  it("a failing full exam records nothing and reveals only the boolean", async () => {
    const { res, writes } = await run(exam((c, q) => (right(c, q) + 1) % 4));
    expect(await res.json()).toEqual({ passed: false });
    expect(writes).toHaveLength(0);
  });

  it("a short (cherry-picked) submission is refused, not graded", async () => {
    const { res, writes } = await run(exam(right, 12));
    expect(res.status).toBe(400);
    expect(writes).toHaveLength(0);
  });

  it("repeating one question to reach the count does not pass", async () => {
    const one = exam(right, 1)[0];
    const { res, writes } = await run(Array.from({ length: prog.testQuestions }, () => one));
    expect(res.status).toBe(400);
    expect(writes).toHaveLength(0);
  });

  it("questions from another program's courses are ignored (cannot pad the count)", async () => {
    const foreign = Object.keys(QUIZ_KEYS).find((c) => !prog.courseIds.includes(c))!;
    const padded = [...exam(right, 10), ...Array.from({ length: 30 }, (_, i) => ({ cid: foreign, qi: i % QUIZ_KEYS[foreign].length, sel: QUIZ_KEYS[foreign][i % QUIZ_KEYS[foreign].length] }))];
    const { res } = await run(padded);
    expect(res.status).toBe(400);
  });

  it("signed-out, or no programId, keeps the legacy graded-but-never-recorded behaviour", async () => {
    const a = await run(exam(right), PROG, false);
    expect(await a.res.json()).toEqual({ passed: true, score: 100 });
    expect(a.writes).toHaveLength(0);
    const b = await run(exam(right), null, true);
    expect(await b.res.json()).toEqual({ passed: true, score: 100 });
    expect(b.writes).toHaveLength(0);
  });

  it("refuses to record when a required course is not passed on the server (403, nothing written)", async () => {
    const rows = earned(prog).slice(1); // one course missing
    const { res, writes } = await run(exam(right), PROG, true, rows);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("complete_required_courses");
    expect(writes).toHaveLength(0);
  });

  it("a course below the 80 bar does not count", async () => {
    const rows = earned(prog).map((r, i) => (i === 0 ? { ...r, passed_score: 79 } : r));
    const { res } = await run(exam(right), PROG, true, rows);
    expect(res.status).toBe(403);
  });

  it("a program with prerequisites needs one of them recorded", async () => {
    const adv = programs.programs.find((p: any) => p.id === "bass")!; // requires aass
    const advPool: { cid: string; qi: number }[] = [];
    for (const cid of adv.courseIds) for (let qi = 0; qi < (QUIZ_KEYS[cid] || []).length; qi++) advPool.push({ cid, qi });
    const advExam = advPool.slice(0, adv.testQuestions).map((q) => ({ ...q, sel: QUIZ_KEYS[q.cid][q.qi] }));
    const without = await run(advExam, "bass", true, earned(adv));
    expect(without.res.status).toBe(403);
    expect((await without.res.json()).error).toBe("prerequisite_required");
    const withPrereq = await run(advExam, "bass", true, earned(adv, [{ course_id: "aass", passed_score: 88 }]));
    expect((await withPrereq.res.json()).recorded).toBe(true);
  });

  it("refuses an oversized answers array", async () => {
    const { res, writes } = await run(Array.from({ length: 301 }, (_, i) => ({ ...pool[i % pool.length], sel: 0 })));
    expect(res.status).toBe(400);
    expect(writes).toHaveLength(0);
  });

  it("rate limits recorded attempts per account (429)", async () => {
    const env: any = mockEnv({ user: LEARNER });
    const prepare = env.DB.prepare.bind(env.DB);
    env.DB.prepare = (sql: string) => {
      const st = prepare(sql);
      if (/rate_limits/.test(sql) && /RETURNING/.test(sql)) st.first = async () => ({ count: 21 });
      return st;
    };
    const res = await onRequestPost({
      request: req({ url: "http://localhost/api/program-exam", cookie: "sess-learner", body: { items: exam(right), programId: PROG } }),
      env,
    });
    expect(res.status).toBe(429);
  });

  it("an unknown programId is not recorded", async () => {
    const { res, writes } = await run(exam(right), "not-a-program", true);
    expect(writes).toHaveLength(0);
    expect((await res.json()).recorded).toBeUndefined();
  });
});
