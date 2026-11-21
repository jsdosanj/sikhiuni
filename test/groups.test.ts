// C8 groups + group assignments on real SQLite: manual and random grouping (one group per
// learner per course), a group submission reaching every member, grading one copy grading
// all (with each member's own late deduction), the private group board, and IDOR.
import { describe, it, expect, beforeEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import * as groups from "../functions/api/groups.js";
import * as submissions from "../functions/api/submissions.js";
import { onRequestPost as gradePost } from "../functions/api/submissions/grade.js";
import * as policies from "../functions/api/course-policies.js";

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
    CREATE TABLE assignments (id TEXT PRIMARY KEY, course_id TEXT NOT NULL, teacher_id TEXT NOT NULL, title TEXT NOT NULL, instructions TEXT NOT NULL,
      due_at INTEGER, points INTEGER NOT NULL DEFAULT 100, allow_file INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE submissions (id TEXT PRIMARY KEY, assignment_id TEXT NOT NULL, user_id TEXT NOT NULL, text_content TEXT, file_key TEXT, submitted_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL, late INTEGER NOT NULL DEFAULT 0, grade INTEGER, feedback TEXT, graded_by TEXT, graded_at INTEGER, status TEXT NOT NULL DEFAULT 'submitted', UNIQUE (assignment_id, user_id));
    INSERT INTO users (id, email, name, role) VALUES ('t','t@x.com','T','teacher'), ('tB','tb@x.com','TB','teacher'), ('a','a@x.com','Amar','learner'), ('b','b@x.com','Baljit','learner'),
      ('c','c@x.com','Charan','learner'), ('d','d@x.com','Dalip','learner'), ('e','e@x.com','Ekam','learner'), ('out','o@x.com','Out','learner');
    INSERT INTO course_teachers VALUES ('C','t',0), ('D','tB',0);
    INSERT INTO enrollments VALUES ('a','course','C',0), ('b','course','C',0), ('c','course','C',0), ('d','course','C',0), ('e','course','C',0), ('out','course','D',0);
    INSERT INTO assignments (id, course_id, teacher_id, title, instructions, due_at, points, created_at, updated_at) VALUES ('x','C','t','Group project','Together',${now - 2.5 * DAY},10,${now},${now});
  `);
  for (const [sid, uid] of [["st", "t"], ["stB", "tB"], ["sa", "a"], ["sb", "b"], ["sc", "c"], ["sd", "d"], ["se", "e"], ["so", "out"]]) sql.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?,?,?)").run(sid, uid, now + 1e9);
  const DB = { prepare(q: string) { let a: any[] = []; const st = { bind(...v: any[]) { a = v; return st; }, async run() { const r = sql.prepare(q).run(...a); return { success: true, meta: { changes: Number(r.changes) } }; }, async first() { return (sql.prepare(q).get(...a) as any) || null; }, async all() { return { results: sql.prepare(q).all(...a) }; } }; return st; } };
  env = { DB };
});
const req = (sid: string, path: string, body?: any) => new Request("https://sikhiuni.com" + path, body === undefined
  ? { headers: { cookie: `su_session=${sid}` } } : { method: "POST", body: JSON.stringify(body), headers: { cookie: `su_session=${sid}`, "content-type": "application/json" } });
const P = async (mod: any, sid: string, body: any) => { const r = await mod.onRequestPost({ request: req(sid, "/api/x", body), env }); return { status: r.status, body: await r.json() }; };
const G = async (sid: string) => { const r = await groups.onRequestGet({ request: req(sid, "/api/groups?courseId=C"), env }); return { status: r.status, body: await r.json() }; };
const grade = async (body: any) => { const r = await gradePost({ request: req("st", "/api/submissions/grade", body), env }); return { status: r.status, body: await r.json() }; };

describe("C8 groups", () => {
  it("random grouping covers everyone once; manual moves keep one group per learner", async () => {
    const auto = await P(groups, "st", { action: "auto", courseId: "C", size: 2 });
    expect(auto.body).toMatchObject({ groups: 3, learners: 5 }); // 5 learners, groups of ~2 -> 3 groups
    let t = (await G("st")).body;
    expect(t.groups.flatMap((g: any) => g.members.map((m: any) => m.id)).sort()).toEqual(["a", "b", "c", "d", "e"]);
    expect(t.unassigned).toEqual([]);
    const first = t.groups[0];
    await P(groups, "st", { action: "members", groupId: first.id, userIds: ["a", "b"] });
    t = (await G("st")).body;
    const counts = t.groups.flatMap((g: any) => g.members.map((m: any) => m.id));
    expect(counts.filter((id: string) => id === "a")).toHaveLength(1);
    expect((await P(groups, "st", { action: "members", groupId: first.id, userIds: ["out"] })).status).toBe(400); // not in this course
  });

  it("a group submission reaches every member; grading one grades all, each with their own late deduction", async () => {
    const g = (await P(groups, "st", { action: "create", courseId: "C", name: "ਸੰਗਤ team" })).body.id;
    await P(groups, "st", { action: "members", groupId: g, userIds: ["a", "b"] });
    await P(groups, "st", { action: "group_mode", assignmentId: "x", on: true });
    expect((await P(submissions, "sc", { assignmentId: "x", text: "alone" })).status).toBe(400); // not in a group
    const s = await P(submissions, "sa", { assignmentId: "x", text: "Our project" });
    expect(s.body.group).toBe("ਸੰਗਤ team");
    const rows = sql.prepare("SELECT user_id, text_content FROM submissions WHERE assignment_id='x' ORDER BY user_id").all() as any[];
    expect(rows).toEqual([{ user_id: "a", text_content: "Our project" }, { user_id: "b", text_content: "Our project" }]);
    // Baljit has an extension, so no late deduction for her.
    await P(policies, "st", { action: "late_policy", assignmentId: "x", latePenaltyPerDay: 10 });
    await P(policies, "st", { action: "extension", assignmentId: "x", userId: "b", dueAt: Date.now() + DAY });
    const sid = (sql.prepare("SELECT id FROM submissions WHERE user_id='a'").get() as any).id;
    const r = await grade({ submissionId: sid, grade: 10, feedback: "Well done", applyLatePenalty: true });
    expect(r.body).toMatchObject({ grade: 7, groupMembersGraded: 1 }); // Amar: 3 days late
    expect(sql.prepare("SELECT grade, feedback, status FROM submissions WHERE user_id='b'").get()).toEqual({ grade: 10, feedback: "Well done", status: "graded" });
    expect((await P(submissions, "sb", { assignmentId: "x", text: "change" })).status).toBe(400); // graded: locked for the group
  });

  it("group mode can't flip after submissions; the board is private to the group and its teachers", async () => {
    const g = (await P(groups, "st", { action: "create", courseId: "C", name: "One" })).body.id;
    await P(groups, "st", { action: "members", groupId: g, userIds: ["a", "b"] });
    await P(submissions, "sc", { assignmentId: "x", text: "individual" });
    expect((await P(groups, "st", { action: "group_mode", assignmentId: "x", on: true })).status).toBe(409);
    expect((await P(groups, "sa", { action: "post", groupId: g, body: "Meet Sunday?" })).status).toBe(200);
    expect((await P(groups, "sc", { action: "post", groupId: g, body: "let me in" })).status).toBe(403);
    expect((await P(groups, "st", { action: "post", groupId: g, body: "Good plan" })).status).toBe(200);
    const mine = (await G("sb")).body;
    expect(mine.group.members.map((m: any) => m.name).sort()).toEqual(["Amar", "Baljit"]);
    expect(mine.posts.map((p: any) => p.body)).toEqual(["Good plan", "Meet Sunday?"]);
    expect((await G("sc")).body.group).toBeNull();
    expect((await P(groups, "sa", { action: "post", groupId: g, body: "this is shit" })).status).toBe(400); // course filter
  });

  it("IDOR: other teachers and learners can't manage groups", async () => {
    const g = (await P(groups, "st", { action: "create", courseId: "C", name: "One" })).body.id;
    expect((await P(groups, "stB", { action: "create", courseId: "C", name: "x" })).status).toBe(403);
    expect((await P(groups, "stB", { action: "members", groupId: g, userIds: ["a"] })).status).toBe(403);
    expect((await P(groups, "sa", { action: "delete", groupId: g })).status).toBe(403);
    expect((await P(groups, "sa", { action: "group_mode", assignmentId: "x", on: true })).status).toBe(403);
    expect((await G("so")).status).toBe(403);
  });
});
