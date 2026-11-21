// C15 badges on real SQLite: automatic earning from combined criteria (lessons, course
// quiz, a course quiz score, live attendance), hand awards, the no-credit notice on every
// response, refusing credential/credit language, the public share view, and IDOR.
import { describe, it, expect, beforeEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import * as badges from "../functions/api/badges.js";
import * as quizzes from "../functions/api/lms-quizzes.js";

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
    INSERT INTO users (id, email, name, role) VALUES ('t','t@x.com','T','teacher'), ('tB','tb@x.com','TB','teacher'), ('a','a@x.com','Amar Singh','learner'), ('b','b@x.com','Baljit Kaur','learner'), ('out','o@x.com','Out','learner');
    INSERT INTO course_teachers VALUES ('C','t',0), ('D','tB',0);
    INSERT INTO enrollments VALUES ('a','course','C',0), ('b','course','C',0), ('out','course','D',0);
    INSERT INTO progress VALUES ('a','C','[0,1,2]',90,${now}), ('b','C','[0]',NULL,${now});
  `);
  for (const [sid, uid] of [["st", "t"], ["stB", "tB"], ["sa", "a"], ["sb", "b"], ["so", "out"]]) sql.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?,?,?)").run(sid, uid, now + 1e9);
  const DB = { prepare(q: string) { let a: any[] = []; const st = { bind(...v: any[]) { a = v; return st; }, async run() { const r = sql.prepare(q).run(...a); return { success: true, meta: { changes: Number(r.changes) } }; }, async first() { return (sql.prepare(q).get(...a) as any) || null; }, async all() { return { results: sql.prepare(q).all(...a) }; } }; return st; } };
  env = { DB, MEDIA: { get: async () => ({ json: async () => ({ courses: [{ id: "C", status: "published", title: "C", lessons: [{ title: "1" }, { title: "2" }, { title: "3" }] }] }) }) } };
});
const req = (sid: string, path: string, body?: any) => new Request("https://sikhiuni.com" + path, body === undefined
  ? { headers: sid ? { cookie: `su_session=${sid}` } : {} } : { method: "POST", body: JSON.stringify(body), headers: { cookie: `su_session=${sid}`, "content-type": "application/json" } });
const P = async (sid: string, body: any, mod: any = badges) => { const r = await mod.onRequestPost({ request: req(sid, "/api/x", body), env }); return { status: r.status, body: await r.json() }; };
const G = async (sid: string, q = "courseId=C") => { const r = await badges.onRequestGet({ request: req(sid, "/api/badges?" + q), env }); return { status: r.status, body: await r.json() }; };

describe("C15 badges", () => {
  it("earned automatically when every criterion holds; the notice comes with it", async () => {
    await P("st", { action: "create", courseId: "C", name: "Finisher", criteria: { allLessons: true, coursePass: true } });
    const a = (await G("sa")).body;
    expect(a.notice).toMatch(/not an accredited institution/);
    expect(a.badges[0]).toMatchObject({ name: "Finisher", earned: true });
    expect((await G("sb")).body.badges[0].earned).toBe(false);
    expect(sql.prepare("SELECT how FROM badge_awards").all()).toEqual([{ how: "earned" }]);
    expect((sql.prepare("SELECT title FROM notifications WHERE user_id='a'").get() as any).title).toBe("Badge earned: Finisher");
  });

  it("a course-quiz score criterion counts the learner's best attempt", async () => {
    const qid = (await P("st", { action: "create", courseId: "C", title: "Q" }, quizzes)).body.id;
    await P("st", { action: "questions", id: qid, questions: [{ type: "truefalse", prompt: "ਸੇਵਾ?", data: { correct: true } }] }, quizzes);
    await P("st", { action: "status", id: qid, status: "open" }, quizzes);
    await P("st", { action: "create", courseId: "C", name: "Quiz star", criteria: { quizId: qid, quizMinPct: 100 } });
    expect((await G("sb")).body.badges[0].earned).toBe(false);
    const at = (await P("sb", { action: "start", id: qid }, quizzes)).body.attemptId;
    const qq = (sql.prepare("SELECT id FROM lms_quiz_questions").get() as any).id;
    await P("sb", { action: "submit", attemptId: at, answers: { [qq]: true } }, quizzes);
    expect((await G("sb")).body.badges[0].earned).toBe(true);
    expect((await P("st", { action: "create", courseId: "C", name: "x", criteria: { quizId: "nope" } })).status).toBe(400);
  });

  it("hand awards and revokes; badges never use credential or credit language", async () => {
    const id = (await P("st", { action: "create", courseId: "C", name: "Seva spirit", description: "Helped classmates" })).body.id;
    expect((await G("sb")).body.badges[0].earned).toBe(false); // no criteria: never automatic
    await P("st", { action: "award", badgeId: id, userId: "b" });
    const mine = (await G("sb")).body.badges[0];
    expect(mine.earned).toBe(true);
    // Public share view: badge, first name only, and the notice.
    const pub = (await G("", "award=" + mine.award_id)).body;
    expect(pub.badge).toMatchObject({ name: "Seva spirit", recipient: "Baljit" });
    expect(JSON.stringify(pub)).not.toContain("b@x.com");
    expect(pub.notice).toMatch(/no university credit/);
    await P("st", { action: "revoke", badgeId: id, userId: "b" });
    expect((await G("sb")).body.badges[0].earned).toBe(false);
    for (const name of ["Accredited scholar", "3 credits", "Sikhi credential", "Mini degree"])
      expect((await P("st", { action: "create", courseId: "C", name })).status).toBe(400);
  });

  it("IDOR: only the course's teachers create, award or delete", async () => {
    const id = (await P("st", { action: "create", courseId: "C", name: "B" })).body.id;
    expect((await P("stB", { action: "award", badgeId: id, userId: "a" })).status).toBe(403);
    expect((await P("sa", { action: "award", badgeId: id, userId: "a" })).status).toBe(403);
    expect((await P("stB", { action: "create", courseId: "C", name: "x" })).status).toBe(403);
    expect((await P("st", { action: "award", badgeId: id, userId: "out" })).status).toBe(400);
    expect((await G("so")).status).toBe(403);
    expect((await G("", "award=not-a-real-id")).status).toBe(404);
  });
});
