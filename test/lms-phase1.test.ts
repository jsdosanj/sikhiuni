// LMS Phase 1 (plan Part C: C7 extensions/late policy/accommodations, C10 journal,
// C11 glossary, C12 polls/surveys/evaluations, C1 calendar + to-do) and the Part D
// authorisation rules they must follow. Real SQLite (node:sqlite), so the actual SQL runs.
// Every endpoint gets an IDOR check: a teacher of course B must not touch course A.
import { describe, it, expect, beforeEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import * as policies from "../functions/api/course-policies.js";
import * as journal from "../functions/api/journal.js";
import * as glossary from "../functions/api/glossary.js";
import * as polls from "../functions/api/polls.js";
import * as calendar from "../functions/api/calendar.js";
import * as submissions from "../functions/api/submissions.js";

const DAY = 24 * 3600 * 1000;
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
    INSERT INTO users (id, email, name, role) VALUES
      ('tA','ta@x.com','Teacher A','teacher'), ('tB','tb@x.com','Teacher B','teacher'), ('adm','adm@x.com','Admin','admin'),
      ('l1','l1@x.com','Learner One','learner'), ('l2','l2@x.com','Learner Two','learner'), ('l3','l3@x.com','Learner Three','learner'),
      ('lout','out@x.com','Outsider','learner');
    INSERT INTO course_teachers VALUES ('courseA','tA',0), ('courseB','tB',0);
    INSERT INTO enrollments VALUES ('l1','course','courseA',0), ('l2','course','courseA',0), ('l3','course','courseA',0), ('lout','course','courseB',0);
  `);
  sql.prepare("INSERT INTO assignments (id, course_id, teacher_id, title, instructions, due_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)")
    .run("a1", "courseA", "tA", "Essay on ਸੇਵਾ", "Write 500 words", now - 3 * DAY, now, now);
  for (const [sid, uid] of [["sA", "tA"], ["sB", "tB"], ["sAdm", "adm"], ["s1", "l1"], ["s2", "l2"], ["s3", "l3"], ["sOut", "lout"]])
    sql.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?,?,?)").run(sid, uid, now + 1e7);
  const DB = {
    prepare(q: string) {
      let args: any[] = [];
      const st = {
        bind(...v: any[]) { args = v; return st; },
        async run() { const r = sql.prepare(q).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; },
        async first() { return (sql.prepare(q).get(...args) as any) || null; },
        async all() { return { results: sql.prepare(q).all(...args) }; },
      };
      return st;
    },
  };
  return { DB };
}

const req = (sid: string, path: string, body?: any) =>
  new Request("https://sikhiuni.com" + path, body === undefined
    ? { headers: { cookie: `su_session=${sid}` } }
    : { method: "POST", body: JSON.stringify(body), headers: { cookie: `su_session=${sid}`, "content-type": "application/json" } });
const get = async (mod: any, sid: string, path: string) => { const r = await mod.onRequestGet({ request: req(sid, path), env }); return { status: r.status, body: await r.json() }; };
const post = async (mod: any, sid: string, path: string, body: any) => { const r = await mod.onRequestPost({ request: req(sid, path, body), env }); return { status: r.status, body: await r.json() }; };
const audit = (action: string) => sql.prepare("SELECT * FROM events WHERE action=?").all(action) as any[];

beforeEach(() => { env = makeEnv(); });

describe("C7 extensions, late policy, accommodations", () => {
  it("late penalty is whole days late x percent, capped at 100", () => {
    const due = { dueAt: 1000, latePenaltyPerDay: 10, maxLateDays: null };
    expect(policies.latePenaltyPct(due, 1000)).toBe(0);
    expect(policies.latePenaltyPct(due, 1001)).toBe(10);
    expect(policies.latePenaltyPct(due, 1000 + 2 * DAY + 1)).toBe(30);
    expect(policies.latePenaltyPct({ ...due, latePenaltyPerDay: 60 }, 1000 + 3 * DAY)).toBe(100);
  });

  it("an extension moves the learner's due date, so an otherwise-late submission is on time", async () => {
    const r = await post(policies, "sA", "/api/course-policies", { action: "extension", assignmentId: "a1", userId: "l1", dueAt: Date.now() + 2 * DAY, reason: "family" });
    expect(r.status).toBe(200);
    const s1 = await post(submissions, "s1", "/api/submissions", { assignmentId: "a1", text: "my essay" });
    expect(s1.body.late).toBe(false);
    const s2 = await post(submissions, "s2", "/api/submissions", { assignmentId: "a1", text: "my essay" });
    expect(s2.body.late).toBe(true); // no extension for l2
    const ev = audit("extension_set");
    expect(ev).toHaveLength(1);
    expect(ev[0].subject_user_id).toBe("l1");
  });

  it("past the hard cutoff the submission is refused; the learner's view shows their penalty", async () => {
    await post(policies, "sA", "/api/course-policies", { action: "late_policy", assignmentId: "a1", latePenaltyPerDay: 10, maxLateDays: 2 });
    const r = await post(submissions, "s1", "/api/submissions", { assignmentId: "a1", text: "too late" });
    expect(r.status).toBe(400);
    await post(policies, "sA", "/api/course-policies", { action: "late_policy", assignmentId: "a1", latePenaltyPerDay: 10, maxLateDays: null });
    const ok = await post(submissions, "s1", "/api/submissions", { assignmentId: "a1", text: "late but allowed" });
    expect(ok.status).toBe(200);
    expect(ok.body.late).toBe(true);
    expect(audit("late_policy_set")).toHaveLength(2);
  });

  it("an extension needs an enrolled learner, and accommodation is capped at 300%", async () => {
    expect((await post(policies, "sA", "/api/course-policies", { action: "extension", assignmentId: "a1", userId: "lout", dueAt: Date.now() + DAY })).status).toBe(400);
    await post(policies, "sA", "/api/course-policies", { action: "accommodation", courseId: "courseA", userId: "l1", extraTimePct: 999 });
    const t = await get(policies, "sA", "/api/course-policies?courseId=courseA");
    expect(t.body.accommodations[0].extra_time_pct).toBe(300);
    const mine = await get(policies, "s1", "/api/course-policies?courseId=courseA");
    expect(mine.body.scope).toBe("learner");
    expect(mine.body.accommodation.extra_time_pct).toBe(300);
    expect(mine.body).not.toHaveProperty("accommodations"); // no one else's data
  });

  it("IDOR: a teacher of another course, or a learner, cannot set policies", async () => {
    expect((await post(policies, "sB", "/api/course-policies", { action: "extension", assignmentId: "a1", userId: "l1", dueAt: Date.now() + DAY })).status).toBe(403);
    expect((await post(policies, "s1", "/api/course-policies", { action: "accommodation", courseId: "courseA", userId: "l1", extraTimePct: 100 })).status).toBe(403);
    expect((await get(policies, "sB", "/api/course-policies?courseId=courseA")).status).toBe(403);
    expect(audit("authz_denied").length).toBeGreaterThan(0);
  });
});

describe("C10 reflective journal (private by default)", () => {
  it("only the author reads an entry; the teacher sees it only when shared", async () => {
    const a = await post(journal, "s1", "/api/journal", { courseId: "courseA", body: "Today I reflected on ਨਿਮਰਤਾ." });
    await post(journal, "s1", "/api/journal", { courseId: "courseA", body: "Shared thought", shared: true });
    expect((await get(journal, "s1", "/api/journal?courseId=courseA")).body.entries).toHaveLength(2);
    expect((await get(journal, "s2", "/api/journal?courseId=courseA")).body.entries).toHaveLength(0);
    const t = await get(journal, "sA", "/api/journal?courseId=courseA");
    expect(t.body.entries.map((e: any) => e.body)).toEqual(["Shared thought"]);
    // Another learner can't edit or delete it.
    expect((await post(journal, "s2", "/api/journal", { id: a.body.id, body: "hijack" })).status).toBe(403);
    expect((await post(journal, "s2", "/api/journal", { id: a.body.id, action: "delete" })).status).toBe(403);
    expect((await post(journal, "s1", "/api/journal", { id: a.body.id, action: "delete" })).status).toBe(200);
  });

  it("IDOR: a teacher of another course and a non-enrolled learner are refused", async () => {
    await post(journal, "s1", "/api/journal", { courseId: "courseA", body: "x", shared: true });
    expect((await get(journal, "sB", "/api/journal?courseId=courseA")).status).toBe(403);
    expect((await post(journal, "sOut", "/api/journal", { courseId: "courseA", body: "x" })).status).toBe(403);
  });
});

describe("C11 course glossary", () => {
  it("the course teacher adds, edits and deletes terms (audited); anyone can read", async () => {
    const r = await post(glossary, "sA", "/api/glossary", { courseId: "courseA", term: "Seva", termGur: "ਸੇਵਾ", definition: "Selfless service." });
    expect(r.status).toBe(200);
    await post(glossary, "sA", "/api/glossary", { id: r.body.id, definition: "Selfless service, offered without desire for reward." });
    const list = await get(glossary, "sOut", "/api/glossary?courseId=courseA");
    expect(list.body.terms[0]).toMatchObject({ term: "Seva", term_gur: "ਸੇਵਾ" });
    expect(list.body.terms[0].definition).toContain("without desire");
    expect(audit("glossary_added")).toHaveLength(1);
    expect(audit("glossary_updated")).toHaveLength(1);
    expect((await post(glossary, "sA", "/api/glossary", { id: r.body.id, action: "delete" })).status).toBe(200);
    expect((await get(glossary, "s1", "/api/glossary?courseId=courseA")).body.terms).toHaveLength(0);
  });

  it("IDOR: learners and other teachers cannot edit", async () => {
    const r = await post(glossary, "sA", "/api/glossary", { courseId: "courseA", term: "Sangat", definition: "Congregation." });
    expect((await post(glossary, "s1", "/api/glossary", { courseId: "courseA", term: "x", definition: "y" })).status).toBe(403);
    expect((await post(glossary, "sB", "/api/glossary", { id: r.body.id, definition: "vandalised" })).status).toBe(403);
    expect((await post(glossary, "sB", "/api/glossary", { id: r.body.id, action: "delete" })).status).toBe(403);
  });
});

describe("C12 polls, surveys, evaluations", () => {
  const create = (extra: any = {}) => post(polls, "sA", "/api/polls", {
    action: "create", courseId: "courseA", kind: "poll", title: "Which topic next?",
    questions: [{ type: "choice", prompt: "Pick one", options: ["ਸੇਵਾ", "ਸਿਮਰਨ"] }, { type: "text", prompt: "Why?" }], ...extra,
  });

  it("drafts are hidden from learners; a learner answers once; tallies are right", async () => {
    const { body: { id } } = await create();
    expect((await get(polls, "s1", "/api/polls?courseId=courseA")).body.polls).toHaveLength(0);
    expect((await post(polls, "s1", "/api/polls", { action: "respond", id, answers: [0, "x"] })).status).toBe(400); // not open yet
    await post(polls, "sA", "/api/polls", { action: "update", id, status: "open" });
    expect((await post(polls, "s1", "/api/polls", { action: "respond", id, answers: [1, "because"] })).status).toBe(200);
    expect((await post(polls, "s1", "/api/polls", { action: "respond", id, answers: [0, "again"] })).status).toBe(409);
    expect((await post(polls, "s2", "/api/polls", { action: "respond", id, answers: [9, ""] })).status).toBe(400); // bad option
    await post(polls, "s2", "/api/polls", { action: "respond", id, answers: [1, ""] });
    const t = await get(polls, "sA", "/api/polls?id=" + id);
    expect(t.body.poll.results[0].counts).toEqual([0, 2]);
    expect(t.body.poll.individual.map((x: any) => x.name).sort()).toEqual(["Learner One", "Learner Two"]);
    // A learner who answered sees the choice tallies but not other people's text.
    const l = await get(polls, "s1", "/api/polls?id=" + id);
    expect(l.body.poll.results[0].counts).toEqual([0, 2]);
    expect(l.body.poll.results[1].answers).toEqual([]);
    expect(l.body.poll).not.toHaveProperty("individual");
  });

  it("anonymous: no user id is stored, and results stay hidden below 3 responses", async () => {
    const { body: { id } } = await create({ anonymous: true });
    await post(polls, "sA", "/api/polls", { action: "update", id, status: "open" });
    await post(polls, "s1", "/api/polls", { action: "respond", id, answers: [0, "secret"] });
    await post(polls, "s2", "/api/polls", { action: "respond", id, answers: [1, ""] });
    expect((sql.prepare("SELECT user_id FROM poll_responses").all() as any[]).every((r) => r.user_id === null)).toBe(true);
    let t = await get(polls, "sA", "/api/polls?id=" + id);
    expect(t.body.poll.results_hidden).toBeTruthy();
    expect(t.body.poll).not.toHaveProperty("results");
    await post(polls, "s3", "/api/polls", { action: "respond", id, answers: [1, ""] });
    t = await get(polls, "sA", "/api/polls?id=" + id);
    expect(t.body.poll.results[0].counts).toEqual([1, 2]);
    expect(t.body.poll).not.toHaveProperty("individual");
    // Double-vote guard still works for anonymous polls.
    expect((await post(polls, "s1", "/api/polls", { action: "respond", id, answers: [1, ""] })).status).toBe(409);
  });

  it("an evaluation starts from the template, is anonymous by default and its results are teacher-only", async () => {
    const r = await post(polls, "sA", "/api/polls", { action: "create", courseId: "courseA", kind: "evaluation", title: "End of course" });
    const p = await get(polls, "sA", "/api/polls?id=" + r.body.id);
    expect(p.body.poll.anonymous).toBe(true);
    expect(p.body.poll.questions).toHaveLength(polls.EVALUATION_TEMPLATE.length);
    await post(polls, "sA", "/api/polls", { action: "update", id: r.body.id, status: "open" });
    const answers = polls.EVALUATION_TEMPLATE.map((q: any) => (q.type === "scale" ? 5 : "Good"));
    await post(polls, "s1", "/api/polls", { action: "respond", id: r.body.id, answers });
    const l = await get(polls, "s1", "/api/polls?id=" + r.body.id);
    expect(l.body.poll).not.toHaveProperty("results");
    // Questions are frozen once anyone has responded.
    expect((await post(polls, "sA", "/api/polls", { action: "update", id: r.body.id, questions: [{ type: "text", prompt: "new" }] })).status).toBe(409);
  });

  it("a closed or past-deadline poll refuses responses", async () => {
    const { body: { id } } = await create({ closesAt: Date.now() - 1000 });
    await post(polls, "sA", "/api/polls", { action: "update", id, status: "open" });
    expect((await post(polls, "s1", "/api/polls", { action: "respond", id, answers: [0, ""] })).status).toBe(400);
  });

  it("IDOR: other teachers can't read results or edit; outsiders can't respond", async () => {
    const { body: { id } } = await create();
    await post(polls, "sA", "/api/polls", { action: "update", id, status: "open" });
    expect((await get(polls, "sB", "/api/polls?id=" + id)).status).toBe(403);
    expect((await post(polls, "sB", "/api/polls", { action: "update", id, status: "closed" })).status).toBe(403);
    expect((await post(polls, "sB", "/api/polls", { action: "delete", id })).status).toBe(403);
    expect((await post(polls, "s1", "/api/polls", { action: "delete", id })).status).toBe(403);
    expect((await post(polls, "sOut", "/api/polls", { action: "respond", id, answers: [0, ""] })).status).toBe(403);
    expect((await post(polls, "sB", "/api/polls", { action: "create", courseId: "courseA", title: "x", questions: [{ type: "text", prompt: "q" }] })).status).toBe(403);
  });

  it("validates questions", () => {
    expect(polls.cleanQuestions([])).toMatch(/at least one/);
    expect(polls.cleanQuestions([{ type: "choice", prompt: "p", options: ["only one"] }])).toMatch(/two options/);
    expect(polls.cleanQuestions([{ type: "html", prompt: "p" }])).toMatch(/type/);
    expect(polls.cleanAnswers([{ type: "scale", prompt: "p" }], [null])).toMatch(/Answer/);
    expect(polls.cleanAnswers([{ type: "scale", prompt: "p" }], [6])).toMatch(/Answer/);
    expect(polls.cleanAnswers([{ type: "scale", prompt: "p" }], [3])).toEqual([3]);
  });
});

describe("C1 calendar + to-do", () => {
  it("learner: their own due date (extension applied), unsubmitted work and unanswered polls", async () => {
    const future = Date.now() + 5 * DAY;
    await post(policies, "sA", "/api/course-policies", { action: "extension", assignmentId: "a1", userId: "l1", dueAt: future });
    const p = await post(polls, "sA", "/api/polls", { action: "create", courseId: "courseA", title: "Quick check", closesAt: Date.now() + DAY, questions: [{ type: "scale", prompt: "How sure are you?" }] });
    await post(polls, "sA", "/api/polls", { action: "update", id: p.body.id, status: "open" });
    const c1 = await get(calendar, "s1", "/api/calendar");
    expect(c1.body.events.find((e: any) => e.type === "assignment")).toMatchObject({ at: future, extended: true });
    expect(c1.body.todo.map((t: any) => t.type).sort()).toEqual(["assignment", "poll"]);
    // l2 has no extension: the original (past) due date, flagged overdue.
    const c2 = await get(calendar, "s2", "/api/calendar");
    expect(c2.body.todo.find((t: any) => t.type === "assignment").overdue).toBe(true);
    // Submitting and answering clears the to-do.
    await post(submissions, "s1", "/api/submissions", { assignmentId: "a1", text: "done" });
    await post(polls, "s1", "/api/polls", { action: "respond", id: p.body.id, answers: [4] });
    expect((await get(calendar, "s1", "/api/calendar")).body.todo).toHaveLength(0);
  });

  it("teacher: submissions waiting to be graded; nothing from other courses", async () => {
    await post(submissions, "s1", "/api/submissions", { assignmentId: "a1", text: "done" });
    const t = await get(calendar, "sA", "/api/calendar");
    expect(t.body.todo).toEqual([expect.objectContaining({ type: "grade", id: "a1", count: 1 })]);
    const other = await get(calendar, "sB", "/api/calendar");
    expect(other.body.todo).toHaveLength(0);
    expect(other.body.events).toHaveLength(0);
  });
});
