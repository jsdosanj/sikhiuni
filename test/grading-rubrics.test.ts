// C4 grading + rubrics on real SQLite: rubric validation, attach rules, rubric scoring
// scaled to assignment points, the opt-in late-policy deduction, before/after audit,
// what the learner and the grader see, the per-teacher comment library, and IDOR.
import { describe, it, expect, beforeEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import * as rubrics from "../functions/api/rubrics.js";
import * as submissions from "../functions/api/submissions.js";
import { onRequestPost as gradePost } from "../functions/api/submissions/grade.js";
import * as policies from "../functions/api/course-policies.js";

const DAY = 864e5;
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
    CREATE TABLE assignments (id TEXT PRIMARY KEY, course_id TEXT NOT NULL, teacher_id TEXT NOT NULL, title TEXT NOT NULL, instructions TEXT NOT NULL,
      due_at INTEGER, points INTEGER NOT NULL DEFAULT 100, allow_file INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE submissions (id TEXT PRIMARY KEY, assignment_id TEXT NOT NULL, user_id TEXT NOT NULL, text_content TEXT, file_key TEXT, submitted_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL, late INTEGER NOT NULL DEFAULT 0, grade INTEGER, feedback TEXT, graded_by TEXT, graded_at INTEGER, status TEXT NOT NULL DEFAULT 'submitted', UNIQUE (assignment_id, user_id));
    INSERT INTO users (id, email, name, role) VALUES ('tA','ta@x.com','Teacher A','teacher'), ('tB','tb@x.com','Teacher B','teacher'), ('l1','l1@x.com','One','learner'), ('l2','l2@x.com','Two','learner');
    INSERT INTO course_teachers VALUES ('A','tA',0), ('B','tB',0);
    INSERT INTO enrollments VALUES ('l1','course','A',0), ('l2','course','A',0);
    INSERT INTO sessions (id, user_id, expires_at) VALUES ('sA','tA',${now + 1e7}), ('sB','tB',${now + 1e7}), ('s1','l1',${now + 1e7}), ('s2','l2',${now + 1e7});
    INSERT INTO assignments (id, course_id, teacher_id, title, instructions, due_at, points, created_at, updated_at) VALUES ('a1','A','tA','Essay','x',${now - 2.5 * DAY},50,${now},${now}), ('b1','B','tB','Other','x',null,100,${now},${now});
    INSERT INTO submissions (id, assignment_id, user_id, text_content, submitted_at, updated_at) VALUES ('sub1','a1','l1','My essay',${now},${now}), ('sub2','a1','l2','Late essay',${now},${now});
  `);
  const DB = { prepare(q: string) { let a: any[] = []; const st = { bind(...v: any[]) { a = v; return st; }, async run() { const r = sql.prepare(q).run(...a); return { success: true, meta: { changes: Number(r.changes) } }; }, async first() { return (sql.prepare(q).get(...a) as any) || null; }, async all() { return { results: sql.prepare(q).all(...a) }; } }; return st; } };
  return { DB };
}
const req = (sid: string, path: string, body?: any) => new Request("https://sikhiuni.com" + path, body === undefined
  ? { headers: { cookie: `su_session=${sid}` } }
  : { method: "POST", body: JSON.stringify(body), headers: { cookie: `su_session=${sid}`, "content-type": "application/json" } });
const post = async (mod: any, sid: string, body: any) => { const r = await mod.onRequestPost({ request: req(sid, "/api/x", body), env }); return { status: r.status, body: await r.json() }; };
const get = async (mod: any, sid: string, path: string) => { const r = await mod.onRequestGet({ request: req(sid, path), env }); return { status: r.status, body: await r.json() }; };
const grade = async (sid: string, body: any) => { const r = await gradePost({ request: req(sid, "/api/submissions/grade", body), env }); return { status: r.status, body: await r.json() }; };

const CRITERIA = [
  { title: "Understanding of ਸੇਵਾ", points: 6, levels: [{ label: "Strong", points: 6 }, { label: "Partial", points: 3 }] },
  { title: "Use of sources", points: 4, description: "Cites ang numbers correctly" },
];
async function rubricOnA1() {
  const c = await post(rubrics, "sA", { action: "create", courseId: "A", title: "Essay rubric", criteria: CRITERIA });
  await post(rubrics, "sA", { action: "attach", assignmentId: "a1", rubricId: c.body.id });
  return c.body as { id: string; criteria: any[] };
}

beforeEach(() => { env = makeEnv(); });

describe("rubrics", () => {
  it("validates criteria and keeps criterion ids stable across edits", async () => {
    expect(rubrics.cleanCriteria([])).toMatch(/at least one/);
    expect(rubrics.cleanCriteria([{ title: "x", points: -1 }])).toMatch(/points/);
    expect(rubrics.cleanCriteria([{ title: "x", points: 5, levels: [{ label: "Top", points: 9 }] }])).toMatch(/level/);
    const r = await rubricOnA1();
    const ids = r.criteria.map((c) => c.id);
    await post(rubrics, "sA", { action: "update", id: r.id, criteria: r.criteria.map((c) => ({ ...c, title: c.title + "!" })) });
    const after = (await get(rubrics, "sA", "/api/rubrics?courseId=A")).body.rubrics[0].criteria.map((c: any) => c.id);
    expect(after).toEqual(ids);
  });

  it("learners see the attached rubric; a rubric can't be attached across courses", async () => {
    const r = await rubricOnA1();
    expect((await get(rubrics, "s1", "/api/rubrics?assignmentId=a1")).body.rubric.title).toBe("Essay rubric");
    expect((await post(rubrics, "sB", { action: "attach", assignmentId: "b1", rubricId: r.id })).status).toBe(400);
  });

  it("IDOR: other teachers and learners can't read, create, edit, attach or delete", async () => {
    const r = await rubricOnA1();
    expect((await get(rubrics, "sB", "/api/rubrics?courseId=A")).status).toBe(403);
    expect((await get(rubrics, "sB", "/api/rubrics?assignmentId=a1")).status).toBe(403);
    expect((await post(rubrics, "sB", { action: "create", courseId: "A", title: "x", criteria: CRITERIA })).status).toBe(403);
    expect((await post(rubrics, "sB", { action: "update", id: r.id, title: "hijack" })).status).toBe(403);
    expect((await post(rubrics, "sB", { action: "attach", assignmentId: "a1", rubricId: null })).status).toBe(403);
    expect((await post(rubrics, "s1", { action: "delete", id: r.id })).status).toBe(403);
  });

  it("the comment library is per teacher; learners can't use it", async () => {
    await post(rubrics, "sA", { action: "comment_add", text: "Cite the ang number." });
    expect((await get(rubrics, "sA", "/api/rubrics?courseId=A")).body.comments.map((c: any) => c.text)).toEqual(["Cite the ang number."]);
    expect((await get(rubrics, "sB", "/api/rubrics?courseId=B")).body.comments).toEqual([]);
    const id = (await get(rubrics, "sA", "/api/rubrics?courseId=A")).body.comments[0].id;
    await post(rubrics, "sB", { action: "comment_delete", id }); // not theirs: no effect
    expect((await get(rubrics, "sA", "/api/rubrics?courseId=A")).body.comments).toHaveLength(1);
    expect((await post(rubrics, "s1", { action: "comment_add", text: "x" })).status).toBe(403);
  });
});

describe("grading", () => {
  it("rubric scores are scaled to the assignment's points and audited before/after", async () => {
    const r = await rubricOnA1();
    const [c1, c2] = r.criteria;
    const g = await grade("sA", { submissionId: "sub1", feedback: "Good", rubricScores: { [c1.id]: { points: 6, comment: "Clear" }, [c2.id]: { points: 2 } } });
    expect(g.status).toBe(200);
    expect(g.body.grade).toBe(40); // 8/10 of 50
    const ev = sql.prepare("SELECT * FROM events WHERE action='submission_graded'").get() as any;
    expect(ev.subject_user_id).toBe("l1");
    expect(JSON.parse(ev.detail)).toMatchObject({ before: { grade: null, status: "submitted" }, after: { grade: 40 } });
  });

  it("rejects incomplete or out-of-range rubric scores, and rubric scores with no rubric", async () => {
    expect((await grade("sA", { submissionId: "sub1", rubricScores: { x: { points: 1 } } })).status).toBe(400);
    const r = await rubricOnA1();
    expect((await grade("sA", { submissionId: "sub1", rubricScores: { [r.criteria[0].id]: { points: 6 } } })).status).toBe(400);
    expect((await grade("sA", { submissionId: "sub1", rubricScores: { [r.criteria[0].id]: { points: 7 }, [r.criteria[1].id]: { points: 1 } } })).status).toBe(400);
  });

  it("the late policy is deducted only when the teacher applies it", async () => {
    await post(policies, "sA", { action: "late_policy", assignmentId: "a1", latePenaltyPerDay: 10 });
    expect((await grade("sA", { submissionId: "sub2", grade: 50 })).body.grade).toBe(50);
    const g = await grade("sA", { submissionId: "sub2", grade: 50, applyLatePenalty: true });
    expect(g.body).toMatchObject({ grade: 35, raw: 50, penaltyPct: 30 }); // 3 days late x 10%
  });

  it("the grader roster and the learner's own view show how it was marked", async () => {
    const r = await rubricOnA1();
    await grade("sA", { submissionId: "sub1", rubricScores: { [r.criteria[0].id]: { points: 3, comment: "Partial" }, [r.criteria[1].id]: { points: 4 } } });
    const roster = await get(submissions, "sA", "/api/submissions?assignmentId=a1");
    expect(roster.body).toMatchObject({ title: "Essay", course_id: "A", rubric: { title: "Essay rubric" } });
    expect(roster.body.submissions.find((s: any) => s.id === "sub1").grading.rubric_scores[r.criteria[0].id]).toEqual({ points: 3, comment: "Partial" });
    const mine = await get(submissions, "s1", "/api/submissions?assignmentId=a1&mine=1");
    expect(mine.body.submission.grading.rubric_scores[r.criteria[0].id].comment).toBe("Partial");
    // Not graded yet -> no marking details for l2.
    expect((await get(submissions, "s2", "/api/submissions?assignmentId=a1&mine=1")).body.submission.grading).toBeNull();
  });

  it("IDOR: a teacher of another course can't grade or see the roster", async () => {
    expect((await grade("sB", { submissionId: "sub1", grade: 1 })).status).toBe(403);
    expect((await get(submissions, "sB", "/api/submissions?assignmentId=a1")).status).toBe(403);
  });
});
