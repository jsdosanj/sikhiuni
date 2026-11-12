// C6 teacher analytics on real SQLite: figures, at-risk reasons (extensions respected),
// quiz difficulty, and that only the course's teachers can see any of it.
import { describe, it, expect, beforeEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import * as analytics from "../functions/api/analytics.js";
import * as quizzes from "../functions/api/lms-quizzes.js";

const DAY = 864e5;
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
    CREATE TABLE progress (user_id TEXT NOT NULL, course_id TEXT NOT NULL, done TEXT, passed_score INTEGER, updated_at INTEGER NOT NULL, PRIMARY KEY (user_id, course_id));
    CREATE TABLE assignments (id TEXT PRIMARY KEY, course_id TEXT NOT NULL, teacher_id TEXT, title TEXT, instructions TEXT, due_at INTEGER, points INTEGER, allow_file INTEGER, status TEXT, created_at INTEGER, updated_at INTEGER);
    CREATE TABLE submissions (id TEXT PRIMARY KEY, assignment_id TEXT, user_id TEXT, grade INTEGER, status TEXT);
    INSERT INTO users (id, email, name, role) VALUES ('t','t@x.com','T','teacher'), ('tB','tb@x.com','TB','teacher'), ('a','a@x.com','Amar','learner'), ('b','b@x.com','Baljit','learner'), ('c','c@x.com','Charan','learner');
    INSERT INTO course_teachers VALUES ('C','t',0), ('D','tB',0);
    INSERT INTO enrollments VALUES ('a','course','C',${now - 30 * DAY}), ('b','course','C',${now - 30 * DAY}), ('c','course','C',${now - 30 * DAY});
    INSERT INTO progress VALUES ('a','C','[0,1,2]',90,${now - DAY}), ('b','C','[0]',NULL,${now - 20 * DAY});
    INSERT INTO assignments VALUES ('x1','C','t','Essay','',${now - 2 * DAY},10,0,'open',${now},${now});
    INSERT INTO submissions VALUES ('s1','x1','a',8,'graded');
    CREATE TABLE assignment_extensions (assignment_id TEXT NOT NULL, user_id TEXT NOT NULL, due_at INTEGER NOT NULL, reason TEXT, created_by TEXT, created_at INTEGER NOT NULL, PRIMARY KEY (assignment_id, user_id));
    INSERT INTO assignment_extensions VALUES ('x1','c',${now + 5 * DAY},null,'t',${now});
  `);
  for (const [sid, uid] of [["st", "t"], ["stB", "tB"], ["sa", "a"]]) sql.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?,?,?)").run(sid, uid, now + 1e9);
  const DB = { prepare(q: string) { let a: any[] = []; const st = { bind(...v: any[]) { a = v; return st; }, async run() { const r = sql.prepare(q).run(...a); return { success: true, meta: { changes: Number(r.changes) } }; }, async first() { return (sql.prepare(q).get(...a) as any) || null; }, async all() { return { results: sql.prepare(q).all(...a) }; } }; return st; } };
  env = { DB, MEDIA: { get: async () => ({ json: async () => ({ courses: [{ id: "C", status: "published", title: "C", lessons: [{ title: "1" }, { title: "2" }, { title: "3" }] }] }) }) } };
});
const get = async (sid: string) => { const r = await analytics.onRequestGet({ request: new Request("https://sikhiuni.com/api/analytics?courseId=C", { headers: { cookie: `su_session=${sid}` } }), env }); return { status: r.status, body: await r.json() }; };
const post = async (sid: string, body: any) => (await quizzes.onRequestPost({ request: new Request("https://sikhiuni.com/api/x", { method: "POST", body: JSON.stringify(body), headers: { cookie: `su_session=${sid}`, "content-type": "application/json" } }), env })).json();

describe("C6 analytics", () => {
  it("summarises enrolment, activity, completion, assignments and at-risk learners", async () => {
    const { status, body } = await get("st");
    expect(status).toBe(200);
    expect(body.summary).toMatchObject({ enrolled: 3, active_7d: 1, active_30d: 2, lesson_count: 3, completed_all: 1, quiz_passed: 1 });
    expect(body.lessons.map((l: any) => l.completed)).toEqual([2, 1, 1]);
    expect(body.assignments[0]).toMatchObject({ submitted: 1, graded: 1, missing: 1, average_percent: 80 });
    const risk = Object.fromEntries(body.at_risk.map((r: any) => [r.name, r.reasons]));
    expect(risk.Baljit).toEqual(expect.arrayContaining(["no activity for 20 days", "missing 1 assignment"]));
    expect(risk.Charan).toEqual(["hasn't started"]); // has an extension, so not "missing"
    expect(risk.Amar).toBeUndefined();
  });

  it("includes quiz averages and the hardest questions", async () => {
    const id = (await post("st", { action: "create", courseId: "C", title: "Q" })).id;
    await post("st", { action: "questions", id, questions: [{ type: "truefalse", prompt: "Easy?", data: { correct: true } }, { type: "numeric", prompt: "Hard?", data: { answer: 7, tolerance: 0 } }] });
    await post("st", { action: "status", id, status: "open" });
    sql.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES ('sb','b',?)").run(Date.now() + 1e9);
    const at = (await post("sb", { action: "start", id })).attemptId;
    const qs = sql.prepare("SELECT id, type FROM lms_quiz_questions").all() as any[];
    await post("sb", { action: "submit", attemptId: at, answers: { [qs.find((q) => q.type === "truefalse").id]: true } });
    const q = (await get("st")).body.quizzes[0];
    expect(q).toMatchObject({ learners: 1, average_best: 50 });
    expect(q.hardest[0]).toMatchObject({ prompt: "Hard?", percent: 0 });
    // Exactly 50% is not "under 50%".
    expect((await get("st")).body.at_risk.find((r: any) => r.name === "Baljit").reasons).not.toContain("quiz scores under 50%");
  });

  it("only the course's teachers can see it", async () => {
    expect((await get("sa")).status).toBe(403);
    expect((await get("stB")).status).toBe(403);
  });
});
