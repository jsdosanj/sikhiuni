// C16 course import/export on real SQLite: the package carries teaching tools but no
// learner data; import needs a rights statement (ND refused, CC needs attribution, which
// is added to every item); everything with a status arrives as a draft; a preview writes
// nothing; AI-made packages are labelled; imports are registered; only a course's
// teachers can export or import.
import { describe, it, expect, beforeEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import * as pkg from "../functions/api/course-package.js";
import * as quizzes from "../functions/api/lms-quizzes.js";
import * as rubrics from "../functions/api/rubrics.js";
import * as polls from "../functions/api/polls.js";
import * as glossary from "../functions/api/glossary.js";

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
    INSERT INTO users (id, email, name, role) VALUES ('t','t@x.com','T','teacher'), ('tD','td@x.com','TD','teacher'), ('l','l@x.com','Learner','learner');
    INSERT INTO course_teachers VALUES ('C','t',0), ('D','t',0), ('D','tD',0);
    INSERT INTO enrollments VALUES ('l','course','C',0);
  `);
  for (const [sid, uid] of [["st", "t"], ["sD", "tD"], ["sl", "l"]]) sql.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?,?,?)").run(sid, uid, now + 1e9);
  const DB = { prepare(q: string) { let a: any[] = []; const st = { bind(...v: any[]) { a = v; return st; }, async run() { const r = sql.prepare(q).run(...a); return { success: true, meta: { changes: Number(r.changes) } }; }, async first() { return (sql.prepare(q).get(...a) as any) || null; }, async all() { return { results: sql.prepare(q).all(...a) }; } }; return st; } };
  env = { DB };
});
const req = (sid: string, path: string, body?: any) => new Request("https://sikhiuni.com" + path, body === undefined
  ? { headers: sid ? { cookie: `su_session=${sid}` } : {} } : { method: "POST", body: JSON.stringify(body), headers: { cookie: `su_session=${sid}`, "content-type": "application/json" } });
const P = async (mod: any, sid: string, body: any) => { const r = await mod.onRequestPost({ request: req(sid, "/api/x", body), env }); return { status: r.status, body: await r.json() }; };
const exportC = async (sid = "st", course = "C") => { const r = await pkg.onRequestGet({ request: req(sid, "/api/course-package?courseId=" + course), env }); return { status: r.status, body: await r.json(), headers: r.headers }; };

async function seedC() {
  const now = Date.now();
  await pkg.buildPackage(env, "C"); // creates every table the package touches
  const rub = await P(rubrics, "st", { action: "create", courseId: "C", title: "Essay rubric", criteria: [{ title: "Sources", points: 10 }] });
  sql.prepare("INSERT INTO assignments (id, course_id, teacher_id, title, instructions, due_at, points, allow_file, status, created_at, updated_at) VALUES ('a1','C','t','Essay','Write about seva.',?,20,1,'open',?,?)").run(now + 9e8, now, now);
  sql.prepare("INSERT INTO assignment_policies VALUES ('a1', 10, 3, ?)").run(now);
  await P(rubrics, "st", { action: "attach", assignmentId: "a1", rubricId: rub.body.id });
  sql.prepare("INSERT INTO submissions (id, assignment_id, user_id, text_content, submitted_at, updated_at, grade, feedback, status) VALUES ('s1','a1','l','SECRET LEARNER ESSAY',?,?,18,'SECRET FEEDBACK','graded')").run(now, now);
  const q = await P(quizzes, "st", { action: "create", courseId: "C", title: "Check-in" });
  await P(quizzes, "st", { action: "questions", id: q.body.id, questions: [{ type: "single", prompt: "2+2?", data: { options: ["3", "4"], correct: 1 } }] });
  await P(polls, "st", { action: "create", courseId: "C", kind: "survey", title: "Pace", questions: [{ type: "scale", prompt: "Pace ok?" }] });
  await P(glossary, "st", { courseId: "C", term: "Seva", termGur: "ਸੇਵਾ", definition: "Selfless service." });
}

describe("C16 course import/export", () => {
  it("exports teaching tools with no learner data, as a teacher-only download", async () => {
    await seedC();
    const e = await exportC();
    expect(e.status).toBe(200);
    expect(e.headers.get("content-disposition")).toContain("C-course-package.json");
    expect(e.body).toMatchObject({ format: "sikhiuni-course-package", version: 1, source: { course_id: "C" } });
    expect(e.body.assignments).toEqual([{ title: "Essay", instructions: "Write about seva.", points: 20, allow_file: true, late_penalty_per_day: 10, max_late_days: 3, rubric: "r0" }]);
    expect(e.body.quizzes[0].questions[0]).toMatchObject({ type: "single", data: { correct: 1 } });
    expect(e.body.glossary[0]).toMatchObject({ term: "Seva", term_gur: "ਸੇਵਾ" });
    const raw = JSON.stringify(e.body);
    expect(raw).not.toContain("SECRET");
    expect(raw).not.toContain("l@x.com");
    expect((await exportC("sD")).status).toBe(403); // teaches D, not C
    expect((await exportC("sl")).status).toBe(403); // learners never get answer keys
  });

  it("imports into another course as drafts, keeps rubric links and policies, and registers the import", async () => {
    await seedC();
    const p = (await exportC()).body;
    const prev = await P(pkg, "st", { courseId: "D", package: p, rights: { basis: "own" } });
    expect(prev.body).toMatchObject({ preview: true, counts: { assignments: 1, rubrics: 1, quizzes: 1, polls: 1, glossary: 1 }, problems: [] });
    expect(sql.prepare("SELECT COUNT(*) AS n FROM assignments WHERE course_id='D'").get()).toEqual({ n: 0 }); // preview writes nothing
    const r = await P(pkg, "st", { courseId: "D", package: p, rights: { basis: "own" }, confirm: true });
    expect(r.status).toBe(200);
    const a = sql.prepare("SELECT * FROM assignments WHERE course_id='D'").get() as any;
    expect(a).toMatchObject({ title: "Essay", instructions: "Write about seva.", status: "draft", due_at: null, points: 20, allow_file: 1 });
    expect(sql.prepare("SELECT late_penalty_per_day, max_late_days FROM assignment_policies WHERE assignment_id=?").get(a.id)).toEqual({ late_penalty_per_day: 10, max_late_days: 3 });
    const link = sql.prepare("SELECT r.course_id, r.title FROM assignment_rubrics ar JOIN rubrics r ON r.id=ar.rubric_id WHERE ar.assignment_id=?").get(a.id);
    expect(link).toEqual({ course_id: "D", title: "Essay rubric" });
    expect(sql.prepare("SELECT status FROM lms_quizzes WHERE course_id='D'").get()).toEqual({ status: "draft" });
    expect(sql.prepare("SELECT COUNT(*) AS n FROM lms_quiz_questions q JOIN lms_quizzes z ON z.id=q.quiz_id WHERE z.course_id='D'").get()).toEqual({ n: 1 });
    expect(sql.prepare("SELECT status FROM polls WHERE course_id='D'").get()).toEqual({ status: "draft" });
    expect(sql.prepare("SELECT COUNT(*) AS n FROM submissions WHERE assignment_id IN (SELECT id FROM assignments WHERE course_id='D')").get()).toEqual({ n: 0 });
    expect(sql.prepare("SELECT basis, source FROM course_imports WHERE course_id='D'").get()).toEqual({ basis: "own", source: "sikhiuni.com/C" });
    const log = await pkg.onRequestGet({ request: req("st", "/api/course-package?courseId=D&log=1"), env });
    expect((await log.json()).imports[0]).toMatchObject({ basis: "own", counts: { assignments: 1 } });
  });

  it("needs a rights statement: ND is refused, CC needs attribution, and the attribution goes on every item", async () => {
    await seedC();
    const p = (await exportC()).body;
    const go = (rights: any) => P(pkg, "st", { courseId: "D", package: p, rights, confirm: true });
    expect((await go(undefined)).status).toBe(400);
    expect((await go({ basis: "cc", licence: "CC-BY-ND-4.0", attribution: "X" })).body.error).toMatch(/No-derivatives/);
    expect((await go({ basis: "cc", licence: "CC-BY-SA-4.0" })).body.error).toMatch(/attribution/);
    expect((await go({ basis: "permission", permissionFrom: "Basics of Sikhi" })).status).toBe(400);
    expect((await go({ basis: "cc", licence: "CC-BY-SA-4.0", attribution: "Jane Doe, example.org" })).status).toBe(200);
    expect((sql.prepare("SELECT instructions FROM assignments WHERE course_id='D'").get() as any).instructions).toBe("Write about seva.\n\nAdapted from Jane Doe, example.org, licensed CC BY SA 4.0.");
    expect((sql.prepare("SELECT definition FROM glossary_terms WHERE course_id='D'").get() as any).definition).toContain("Adapted from Jane Doe");
    expect(sql.prepare("SELECT licence, attribution FROM course_imports").get()).toEqual({ licence: "CC-BY-SA-4.0", attribution: "Jane Doe, example.org" });
  });

  it("labels an AI-made package 'Created by AI.' and refuses bad packages and outsiders", async () => {
    await seedC();
    const p = { ...(await exportC()).body, ai_created: true };
    await P(pkg, "st", { courseId: "D", package: p, rights: { basis: "own" }, confirm: true });
    expect((sql.prepare("SELECT instructions FROM assignments WHERE course_id='D'").get() as any).instructions).toMatch(/^Created by AI\./);
    expect((sql.prepare("SELECT title FROM polls WHERE course_id='D'").get() as any).title).toBe("Created by AI. Pace");
    expect((await P(pkg, "st", { courseId: "D", package: { format: "other" }, rights: { basis: "own" }, confirm: true })).status).toBe(400);
    const bad = { ...p, quizzes: [{ title: "Broken", questions: [{ type: "single", prompt: "?", data: { options: ["a"] } }] }] };
    const r = await P(pkg, "st", { courseId: "D", package: bad, rights: { basis: "own" }, confirm: true });
    expect(r.status).toBe(400);
    expect(r.body.problems[0]).toMatch(/Broken/);
    expect((await P(pkg, "sD", { courseId: "C", package: p, rights: { basis: "own" }, confirm: true })).status).toBe(403);
    expect((await P(pkg, "sl", { courseId: "C", package: p, rights: { basis: "own" } })).status).toBe(403);
  });
});
