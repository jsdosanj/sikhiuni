// C9 peer review on real SQLite: fair ring allocation (never your own work), anonymity
// both ways, feedback visible only after doing your own share, rubric + comment
// validation, teacher hide/close, grades untouched, IDOR.
import { describe, it, expect, beforeEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import * as peer from "../functions/api/peer-reviews.js";
import * as rubrics from "../functions/api/rubrics.js";

let sql: DatabaseSync, env: any;
beforeEach(() => {
  sql = new DatabaseSync(":memory:");
  const now = Date.now();
  sql.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, name TEXT, country TEXT, languages TEXT, role TEXT, marketing_optin INTEGER DEFAULT 0);
    CREATE TABLE sessions (id TEXT PRIMARY KEY, user_id TEXT, expires_at INTEGER, mfa_ok INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE rate_limits (k TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL);
    CREATE TABLE course_teachers (course_id TEXT NOT NULL, user_id TEXT NOT NULL, assigned_at INTEGER NOT NULL, PRIMARY KEY (course_id, user_id));
    CREATE TABLE enrollments (user_id TEXT NOT NULL, kind TEXT NOT NULL, target_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (user_id, kind, target_id));
    CREATE TABLE assignments (id TEXT PRIMARY KEY, course_id TEXT NOT NULL, teacher_id TEXT, title TEXT, instructions TEXT, due_at INTEGER, points INTEGER, allow_file INTEGER, status TEXT, created_at INTEGER, updated_at INTEGER);
    CREATE TABLE submissions (id TEXT PRIMARY KEY, assignment_id TEXT, user_id TEXT, text_content TEXT, grade INTEGER, status TEXT);
    INSERT INTO users (id, email, name, role) VALUES ('t','t@x.com','T','teacher'), ('tB','tb@x.com','TB','teacher'), ('a','a@x.com','Amar','learner'), ('b','b@x.com','Baljit','learner'), ('c','c@x.com','Charan','learner'), ('d','d@x.com','Dalip','learner');
    INSERT INTO course_teachers VALUES ('C','t',0), ('D','tB',0);
    INSERT INTO enrollments VALUES ('a','course','C',0), ('b','course','C',0), ('c','course','C',0), ('d','course','C',0);
    INSERT INTO assignments VALUES ('x','C','t','Reflection','',null,10,0,'open',${now},${now});
    INSERT INTO submissions VALUES ('sa','x','a','An essay on ਸੇਵਾ',7,'graded'), ('sb','x','b','An essay on ਸਿਮਰਨ',null,'submitted'), ('sc','x','c','An essay on ਸੰਗਤ',null,'submitted');
  `);
  for (const [sid, uid] of [["st", "t"], ["stB", "tB"], ["sa", "a"], ["sb", "b"], ["sc", "c"], ["sd", "d"]]) sql.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?,?,?)").run(sid, uid, now + 1e9);
  const DB = { prepare(q: string) { let a: any[] = []; const st = { bind(...v: any[]) { a = v; return st; }, async run() { const r = sql.prepare(q).run(...a); return { success: true, meta: { changes: Number(r.changes) } }; }, async first() { return (sql.prepare(q).get(...a) as any) || null; }, async all() { return { results: sql.prepare(q).all(...a) }; } }; return st; } };
  env = { DB };
});
const req = (sid: string, path: string, body?: any) => new Request("https://sikhiuni.com" + path, body === undefined
  ? { headers: { cookie: `su_session=${sid}` } } : { method: "POST", body: JSON.stringify(body), headers: { cookie: `su_session=${sid}`, "content-type": "application/json" } });
const P = async (sid: string, body: any, mod: any = peer) => { const r = await mod.onRequestPost({ request: req(sid, "/api/x", body), env }); return { status: r.status, body: await r.json() }; };
const G = async (sid: string, q = "assignmentId=x") => { const r = await peer.onRequestGet({ request: req(sid, "/api/peer-reviews?" + q), env }); return { status: r.status, body: await r.json() }; };
const LONG = "I liked how you explained this; one idea to develop further is the example.";

describe("C9 peer review", () => {
  it("ring allocation: everyone gives and gets N reviews, never their own", () => {
    const subs = ["a", "b", "c", "d", "e"].map((u) => ({ id: "s" + u, user_id: u }));
    const pairs = peer.allocate(subs, 2);
    expect(pairs).toHaveLength(10);
    for (const s of subs) {
      expect(pairs.filter((p) => p.reviewer_id === s.user_id)).toHaveLength(2);
      expect(pairs.filter((p) => p.submission_id === s.id)).toHaveLength(2);
      expect(pairs.some((p) => p.reviewer_id === s.user_id && p.submission_id === s.id)).toBe(false);
    }
  });

  it("start: needs submissions, caps N, runs once; non-submitters get nothing", async () => {
    expect((await P("st", { action: "start", assignmentId: "x", perLearner: 3 })).status).toBe(400); // 3 submissions -> max 2
    expect((await P("st", { action: "start", assignmentId: "x", perLearner: 2 })).body).toMatchObject({ learners: 3, perLearner: 2 });
    expect((await P("st", { action: "start", assignmentId: "x", perLearner: 1 })).status).toBe(409);
    expect((await G("sd")).body.to_review).toHaveLength(0);
    expect(sql.prepare("SELECT COUNT(*) AS n FROM notifications WHERE kind='peer_review'").get()).toEqual({ n: 3 });
  });

  it("anonymous both ways; feedback appears only after doing your own share; grades untouched", async () => {
    await P("st", { action: "start", assignmentId: "x", perLearner: 2 });
    const mine = (await G("sa")).body;
    expect(mine.to_review).toHaveLength(2);
    expect(JSON.stringify(mine.to_review)).not.toMatch(/Baljit|Charan/);
    expect(mine.to_review.map((r: any) => r.label)).toEqual(["Classmate 1", "Classmate 2"]);
    expect(mine.received).toEqual([]);
    expect((await P("sa", { action: "submit", reviewId: mine.to_review[0].id, comment: "too short" })).status).toBe(400);
    for (const sid of ["sa", "sb", "sc"]) for (const r of (await G(sid)).body.to_review) await P(sid, { action: "submit", reviewId: r.id, comment: LONG });
    const after = (await G("sa")).body;
    expect(after.received).toHaveLength(2);
    expect(JSON.stringify(after.received)).not.toMatch(/Baljit|Charan/);
    expect((sql.prepare("SELECT grade FROM submissions WHERE id='sa'").get() as any).grade).toBe(7);
  });

  it("uses the assignment's rubric when there is one", async () => {
    const r = await P("st", { action: "create", courseId: "C", title: "R", criteria: [{ title: "Insight", points: 4 }] }, rubrics);
    await P("st", { action: "attach", assignmentId: "x", rubricId: r.body.id }, rubrics);
    await P("st", { action: "start", assignmentId: "x", perLearner: 1 });
    const rv = (await G("sb")).body.to_review[0];
    expect((await P("sb", { action: "submit", reviewId: rv.id, comment: LONG })).status).toBe(400); // rubric required
    expect((await P("sb", { action: "submit", reviewId: rv.id, comment: LONG, rubricScores: { [r.body.criteria[0].id]: { points: 3 } } })).status).toBe(200);
  });

  it("teacher sees names, can hide a review, and can close", async () => {
    await P("st", { action: "start", assignmentId: "x", perLearner: 1 });
    for (const sid of ["sa", "sb", "sc"]) for (const r of (await G(sid)).body.to_review) await P(sid, { action: "submit", reviewId: r.id, comment: LONG });
    const t = (await G("st")).body;
    expect(t.reviews.every((r: any) => r.reviewer && r.author)).toBe(true);
    const ofAmar = t.reviews.find((r: any) => r.author === "Amar");
    await P("st", { action: "hide", reviewId: ofAmar.id });
    expect((await G("sa")).body.received).toHaveLength(0);
    await P("st", { action: "close", assignmentId: "x" });
    const rv = (await G("sb")).body.to_review[0];
    expect((await P("sb", { action: "submit", reviewId: rv.id, comment: LONG })).status).toBe(400);
  });

  it("IDOR: only the reviewer submits; other teachers and outsiders are refused", async () => {
    await P("st", { action: "start", assignmentId: "x", perLearner: 1 });
    const rv = (await G("sa")).body.to_review[0];
    expect((await P("sb", { action: "submit", reviewId: rv.id, comment: LONG })).status).toBe(403);
    expect((await P("stB", { action: "start", assignmentId: "x" })).status).toBe(403);
    expect((await P("stB", { action: "hide", reviewId: rv.id })).status).toBe(403);
    expect((await G("stB")).status).toBe(403);
  });
});
