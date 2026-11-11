// C2 richer quizzes on real SQLite: every question type grades correctly through the
// per-attempt shuffle; learners never receive answer keys before review; time limits
// (with accommodations), attempt limits, question-bank draws, review settings; IDOR.
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import * as quizzes from "../functions/api/lms-quizzes.js";
import * as policies from "../functions/api/course-policies.js";
import * as rules from "../functions/api/release-rules.js";
import { cleanQuestion, gradeQuestion, learnerView, reviewOf } from "../functions/api/_quiz-engine.js";

let sql: DatabaseSync, env: any;
function makeEnv() {
  sql = new DatabaseSync(":memory:");
  const now = Date.now();
  sql.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, name TEXT, country TEXT, languages TEXT, role TEXT, marketing_optin INTEGER DEFAULT 0);
    CREATE TABLE sessions (id TEXT PRIMARY KEY, user_id TEXT, expires_at INTEGER, mfa_ok INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE rate_limits (k TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL);
    CREATE TABLE course_teachers (course_id TEXT NOT NULL, user_id TEXT NOT NULL, assigned_at INTEGER NOT NULL, PRIMARY KEY (course_id, user_id));
    CREATE TABLE enrollments (user_id TEXT NOT NULL, kind TEXT NOT NULL, target_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (user_id, kind, target_id));
    CREATE TABLE progress (user_id TEXT NOT NULL, course_id TEXT NOT NULL, done TEXT, passed_score INTEGER, updated_at INTEGER NOT NULL, PRIMARY KEY (user_id, course_id));
    CREATE TABLE assignments (id TEXT PRIMARY KEY, course_id TEXT NOT NULL, teacher_id TEXT, title TEXT, instructions TEXT, due_at INTEGER, points INTEGER, allow_file INTEGER, status TEXT, created_at INTEGER, updated_at INTEGER);
    INSERT INTO users (id, email, name, role) VALUES ('t','t@x.com','T','teacher'), ('tB','tb@x.com','TB','teacher'), ('l1','l1@x.com','One','learner'), ('l2','l2@x.com','Two','learner'), ('out','o@x.com','Out','learner');
    INSERT INTO course_teachers VALUES ('C','t',0), ('D','tB',0);
    INSERT INTO enrollments VALUES ('l1','course','C',0), ('l2','course','C',0), ('out','course','D',0);
  `);
  for (const [sid, uid] of [["st", "t"], ["stB", "tB"], ["s1", "l1"], ["s2", "l2"], ["so", "out"]]) sql.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?,?,?)").run(sid, uid, now + 1e9);
  const DB = { prepare(q: string) { let a: any[] = []; const st = { bind(...v: any[]) { a = v; return st; }, async run() { const r = sql.prepare(q).run(...a); return { success: true, meta: { changes: Number(r.changes) } }; }, async first() { return (sql.prepare(q).get(...a) as any) || null; }, async all() { return { results: sql.prepare(q).all(...a) }; } }; return st; } };
  return { DB };
}
const req = (sid: string, path: string, body?: any) => new Request("https://sikhiuni.com" + path, body === undefined
  ? { headers: { cookie: `su_session=${sid}` } } : { method: "POST", body: JSON.stringify(body), headers: { cookie: `su_session=${sid}`, "content-type": "application/json" } });
const P = async (sid: string, body: any, mod: any = quizzes) => { const r = await mod.onRequestPost({ request: req(sid, "/api/x", body), env }); return { status: r.status, body: await r.json() }; };
const G = async (sid: string, path: string) => { const r = await quizzes.onRequestGet({ request: req(sid, path), env }); return { status: r.status, body: await r.json() }; };

const QUESTIONS = [
  { type: "single", prompt: "Who compiled the Adi Granth in 1604?", points: 2, data: { options: ["Guru Arjan Dev Ji", "Guru Nanak Dev Ji", "Guru Gobind Singh Ji"], correct: 0, feedback: ["Yes.", "Not quite.", "Not quite."] } },
  { type: "multi", prompt: "Which are among the five Ks?", points: 2, data: { options: ["Kesh", "Kara", "Kurta", "Kirpan"], correct: [0, 1, 3] } },
  { type: "truefalse", prompt: "ਸੇਵਾ means selfless service.", data: { correct: true } },
  { type: "short", prompt: "Write the Gurmukhi for 'service'.", data: { accept: ["ਸੇਵਾ", "seva"] } },
  { type: "numeric", prompt: "How many Gurus in human form?", data: { answer: 10, tolerance: 0 } },
  { type: "matching", prompt: "Match the Guru to the Gurdwara city.", points: 2, data: { left: ["Guru Ram Das Ji", "Guru Gobind Singh Ji"], right: ["Amritsar", "Anandpur Sahib"] } },
  { type: "ordering", prompt: "Order these Gurus.", points: 3, data: { items: ["Guru Nanak Dev Ji", "Guru Angad Dev Ji", "Guru Amar Das Ji"] } },
];

async function openQuiz(extra: any = {}) {
  const id = (await P("st", { action: "create", courseId: "C", title: "Foundations check", ...extra })).body.id;
  expect((await P("st", { action: "questions", id, questions: QUESTIONS })).status).toBe(200);
  expect((await P("st", { action: "status", id, status: "open" })).status).toBe(200);
  return id;
}
/** The perfect answers for an attempt, derived from the server-side keys + the attempt's shuffle. */
function perfect(attemptId: string) {
  const a = sql.prepare("SELECT * FROM lms_quiz_attempts WHERE id=?").get(attemptId) as any;
  const perms = JSON.parse(a.perms), out: any = {};
  for (const q of sql.prepare("SELECT * FROM lms_quiz_questions WHERE quiz_id=?").all(a.quiz_id) as any[]) {
    const data = JSON.parse(q.data), p = perms[q.id];
    if (!(q.id in perms)) continue;
    if (q.type === "single") out[q.id] = p.indexOf(data.correct);
    if (q.type === "multi") out[q.id] = data.correct.map((c: number) => p.indexOf(c));
    if (q.type === "truefalse") out[q.id] = data.correct;
    if (q.type === "short") out[q.id] = "  ਸੇਵਾ ";
    if (q.type === "numeric") out[q.id] = "10";
    if (q.type === "matching") out[q.id] = data.left.map((_: any, i: number) => p.indexOf(i));
    if (q.type === "ordering") out[q.id] = data.items.map((_: any, i: number) => p.indexOf(i));
  }
  return out;
}

beforeEach(() => { env = makeEnv(); });
afterEach(() => vi.useRealTimers());

describe("quiz engine", () => {
  it("validates questions", () => {
    expect(cleanQuestion({ type: "essay", prompt: "x" })).toMatch(/type/);
    expect(cleanQuestion({ type: "single", prompt: "x", data: { options: ["a"], correct: 0 } })).toMatch(/two options/);
    expect(cleanQuestion({ type: "matching", prompt: "x", data: { left: ["a", "b"], right: ["c"] } })).toMatch(/pairs/);
    expect(cleanQuestion({ type: "truefalse", prompt: "x", data: { correct: "yes" } })).toMatch(/true or false/);
  });
  it("partial credit: multi subtracts wrong picks; ordering counts positions; repeats score zero", () => {
    const multi: any = cleanQuestion(QUESTIONS[1]);
    const id = [0, 1, 2, 3];
    expect(gradeQuestion(multi, id, [0, 1, 3]).earned).toBe(2);
    expect(gradeQuestion(multi, id, [0, 1, 2, 3]).earned).toBeCloseTo(2 * (2 / 3));
    expect(gradeQuestion(multi, id, [2]).earned).toBe(0);
    const ord: any = cleanQuestion(QUESTIONS[6]);
    expect(gradeQuestion(ord, [2, 0, 1], [1, 2, 0]).correct).toBe(true);
    expect(gradeQuestion(ord, [0, 1, 2], [0, 0, 0]).earned).toBe(0);
  });
  it("the learner view carries no keys, and the shuffle hides the stored order", () => {
    const q: any = { id: "q1", ...cleanQuestion(QUESTIONS[0]) };
    const v = learnerView(q, [2, 0, 1]);
    expect(v.options).toEqual(["Guru Gobind Singh Ji", "Guru Arjan Dev Ji", "Guru Nanak Dev Ji"]);
    expect(JSON.stringify(v)).not.toMatch(/correct|feedback/);
    expect(reviewOf(q, [2, 0, 1], 1)).toEqual({ correct: 1, feedback: "Yes." });
  });
});

describe("taking a quiz", () => {
  it("a perfect attempt scores full marks; answer keys never reach the learner before submitting", async () => {
    const id = await openQuiz({ review: "answers", passPct: 70 });
    const s = await P("s1", { action: "start", id });
    const att = await G("s1", "/api/lms-quizzes?attempt=" + s.body.attemptId);
    expect(att.body.attempt.questions).toHaveLength(7);
    expect(JSON.stringify(att.body)).not.toMatch(/"correct"|"accept"|"answer"|"tolerance"|feedback/);
    await P("s1", { action: "submit", attemptId: s.body.attemptId, answers: perfect(s.body.attemptId) });
    const r = (await G("s1", "/api/lms-quizzes?attempt=" + s.body.attemptId)).body.attempt;
    expect(r).toMatchObject({ score: 12, max_score: 12, percent: 100, passed: true });
    expect(r.review).toHaveLength(7);
    expect(r.review.every((x: any) => x.correct !== undefined)).toBe(true);
  });

  it("review 'score' shows only the score; 'after_close' adds answers once closed", async () => {
    const id = await openQuiz({ review: "after_close" });
    const a = (await P("s1", { action: "start", id })).body.attemptId;
    await P("s1", { action: "submit", attemptId: a, answers: {} });
    let r = (await G("s1", "/api/lms-quizzes?attempt=" + a)).body.attempt;
    expect(r.score).toBe(0); expect(r.review).toBeNull(); expect(r.review_note).toMatch(/closes/);
    await P("st", { action: "status", id, status: "closed" });
    r = (await G("s1", "/api/lms-quizzes?attempt=" + a)).body.attempt;
    expect(r.review).toHaveLength(7);
  });

  it("attempt limits, resuming, no resubmission, and a question-bank draw", async () => {
    const id = await openQuiz({ maxAttempts: 1, drawCount: 3 });
    const a = (await P("s1", { action: "start", id })).body.attemptId;
    expect((await P("s1", { action: "start", id })).body).toMatchObject({ attemptId: a, resumed: true });
    expect((await G("s1", "/api/lms-quizzes?attempt=" + a)).body.attempt.questions).toHaveLength(3);
    await P("s1", { action: "submit", attemptId: a, answers: {} });
    expect((await P("s1", { action: "submit", attemptId: a, answers: perfect(a) })).status).toBe(409);
    expect((await P("s1", { action: "start", id })).status).toBe(403);
  });

  it("time limits: accommodations add time; after time runs out only saved answers count", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const t0 = new Date("2026-11-12T10:00:00Z").getTime(); vi.setSystemTime(t0);
    const id = await openQuiz({ timeLimitMin: 10 });
    await P("st", { action: "accommodation", courseId: "C", userId: "l2", extraTimePct: 50 }, policies);
    const a1 = (await P("s1", { action: "start", id })).body.attemptId;
    const a2 = (await P("s2", { action: "start", id })).body.attemptId;
    expect((await G("s1", "/api/lms-quizzes?attempt=" + a1)).body.attempt.deadline_at).toBe(t0 + 10 * 60000);
    expect((await G("s2", "/api/lms-quizzes?attempt=" + a2)).body.attempt.deadline_at).toBe(t0 + 15 * 60000);
    const good = perfect(a1);
    const firstQ = Object.keys(good)[0];
    await P("s1", { action: "save", attemptId: a1, answers: { [firstQ]: good[firstQ] } });
    vi.setSystemTime(t0 + 12 * 60000); // past l1's deadline + grace, inside l2's
    const late = await P("s1", { action: "submit", attemptId: a1, answers: good });
    expect(late.body.expired).toBe(true);
    const row = sql.prepare("SELECT score, max_score FROM lms_quiz_attempts WHERE id=?").get(a1) as any;
    expect(row.score).toBeGreaterThan(0); expect(row.score).toBeLessThan(row.max_score); // only the saved answer counted
    expect((await P("s2", { action: "submit", attemptId: a2, answers: perfect(a2) })).body.expired).toBe(false);
  });

  it("drafts can't be started; questions freeze after the first attempt; release rules apply", async () => {
    const draft = (await P("st", { action: "create", courseId: "C", title: "Draft" })).body.id;
    await P("st", { action: "questions", id: draft, questions: QUESTIONS });
    expect((await P("s1", { action: "start", id: draft })).status).toBe(400);
    const id = await openQuiz();
    await P("s1", { action: "start", id });
    expect((await P("st", { action: "questions", id, questions: QUESTIONS })).status).toBe(409);
    await P("st", { courseId: "C", itemType: "quiz", itemId: id, requireQuizPass: true }, rules);
    expect((await P("s2", { action: "start", id })).status).toBe(403);
    expect((await G("s2", "/api/lms-quizzes?courseId=C")).body.quizzes[0]).toMatchObject({ locked: true });
  });

  it("the teacher sees per-question difficulty", async () => {
    const id = await openQuiz();
    const a = (await P("s1", { action: "start", id })).body.attemptId;
    await P("s1", { action: "submit", attemptId: a, answers: perfect(a) });
    const b = (await P("s2", { action: "start", id })).body.attemptId;
    await P("s2", { action: "submit", attemptId: b, answers: {} });
    const t = await G("st", "/api/lms-quizzes?id=" + id);
    expect(t.body.questions.every((q: any) => q.difficulty === 50)).toBe(true);
    expect(t.body.learners).toHaveLength(2);
  });
});

describe("IDOR", () => {
  it("other learners, outsiders and other teachers are refused", async () => {
    const id = await openQuiz();
    const a = (await P("s1", { action: "start", id })).body.attemptId;
    expect((await G("s2", "/api/lms-quizzes?attempt=" + a)).status).toBe(403);
    expect((await P("s2", { action: "submit", attemptId: a, answers: {} })).status).toBe(403);
    expect((await P("so", { action: "start", id })).status).toBe(403);
    expect((await G("stB", "/api/lms-quizzes?id=" + id)).status).toBe(403);
    expect((await G("s1", "/api/lms-quizzes?id=" + id)).status).toBe(403); // the key-bearing view is teacher-only
    expect((await P("stB", { action: "status", id, status: "closed" })).status).toBe(403);
  });
});
