// C3 conditional release (assignments + polls) and C1's private iCal feed, on real SQLite.
import { describe, it, expect, beforeEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import * as rules from "../functions/api/release-rules.js";
import * as assignments from "../functions/api/assignments.js";
import * as submissions from "../functions/api/submissions.js";
import * as polls from "../functions/api/polls.js";
import * as calendar from "../functions/api/calendar.js";
import * as feed from "../functions/api/calendar-feed.js";

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
    CREATE TABLE progress (user_id TEXT NOT NULL, course_id TEXT NOT NULL, done TEXT, passed_score INTEGER, updated_at INTEGER NOT NULL, PRIMARY KEY (user_id, course_id));
    CREATE TABLE assignments (id TEXT PRIMARY KEY, course_id TEXT NOT NULL, teacher_id TEXT NOT NULL, title TEXT NOT NULL, instructions TEXT NOT NULL,
      due_at INTEGER, points INTEGER NOT NULL DEFAULT 100, allow_file INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE submissions (id TEXT PRIMARY KEY, assignment_id TEXT NOT NULL, user_id TEXT NOT NULL, text_content TEXT, file_key TEXT, submitted_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL, late INTEGER NOT NULL DEFAULT 0, grade INTEGER, feedback TEXT, graded_by TEXT, graded_at INTEGER, status TEXT NOT NULL DEFAULT 'submitted', UNIQUE (assignment_id, user_id));
    INSERT INTO users (id, email, name, role) VALUES ('t','t@x.com','T','teacher'), ('tB','tb@x.com','TB','teacher'), ('l1','l1@x.com','One','learner'), ('l2','l2@x.com','Two','learner');
    INSERT INTO course_teachers VALUES ('C','t',0), ('D','tB',0);
    INSERT INTO enrollments VALUES ('l1','course','C',0), ('l2','course','C',0);
    INSERT INTO progress VALUES ('l1','C','[0,1,2]',85,${now}), ('l2','C','[0]',NULL,${now});
    INSERT INTO assignments (id, course_id, teacher_id, title, instructions, due_at, created_at, updated_at) VALUES ('a1','C','t','Final essay; with, commas','Secret brief',${now + 3 * DAY},${now},${now});
  `);
  for (const [sid, uid] of [["st", "t"], ["stB", "tB"], ["s1", "l1"], ["s2", "l2"]]) sql.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?,?,?)").run(sid, uid, now + 1e7);
  const DB = { prepare(q: string) { let a: any[] = []; const st = { bind(...v: any[]) { a = v; return st; }, async run() { const r = sql.prepare(q).run(...a); return { success: true, meta: { changes: Number(r.changes) } }; }, async first() { return (sql.prepare(q).get(...a) as any) || null; }, async all() { return { results: sql.prepare(q).all(...a) }; } }; return st; } };
  return { DB };
}
const req = (sid: string, path: string, body?: any) => new Request("https://sikhiuni.com" + path, body === undefined
  ? { headers: sid ? { cookie: `su_session=${sid}` } : {} }
  : { method: "POST", body: JSON.stringify(body), headers: { cookie: `su_session=${sid}`, "content-type": "application/json" } });
const P = async (mod: any, sid: string, body: any) => { const r = await mod.onRequestPost({ request: req(sid, "/api/x", body), env }); return { status: r.status, body: await r.json() }; };
const G = async (mod: any, sid: string, path: string) => { const r = await mod.onRequestGet({ request: req(sid, path), env }); return { status: r.status, body: await r.json() }; };

beforeEach(() => { env = makeEnv(); });

describe("C3 release rules", () => {
  it("lockReason combines conditions and returns null when met", () => {
    const prog = { lessons: 2, quizPassed: false };
    expect(rules.lockReason(null, prog)).toBeNull();
    expect(rules.lockReason({ min_lessons: 2 }, prog)).toBeNull();
    expect(rules.lockReason({ min_lessons: 3, require_quiz_pass: 1 }, prog)).toBe("Unlocks when you complete 3 lessons (you have 2) and pass the course quiz.");
    expect(rules.lockReason({ not_before: Date.UTC(2099, 0, 1) }, prog)).toMatch(/^Opens on /);
  });

  it("an assignment locked by a rule hides its brief and refuses submissions until met", async () => {
    expect((await P(rules, "st", { courseId: "C", itemType: "assignment", itemId: "a1", minLessons: 2, requireQuizPass: true })).status).toBe(200);
    const two = (await G(assignments, "s2", "/api/assignments?courseId=C")).body.assignments[0];
    expect(two).toMatchObject({ locked: true, instructions: "" });
    expect(two.lock_reason).toMatch(/2 lessons.*quiz/);
    expect((await P(submissions, "s2", { assignmentId: "a1", text: "x" })).status).toBe(403);
    const one = (await G(assignments, "s1", "/api/assignments?courseId=C")).body.assignments[0];
    expect(one).toMatchObject({ locked: false, instructions: "Secret brief" });
    expect((await P(submissions, "s1", { assignmentId: "a1", text: "x" })).status).toBe(200);
    // Locked work stays off the to-do list.
    expect((await G(calendar, "s2", "/api/calendar")).body.todo).toHaveLength(0);
    // Clearing every condition removes the rule.
    await P(rules, "st", { courseId: "C", itemType: "assignment", itemId: "a1" });
    expect((await G(assignments, "s2", "/api/assignments?courseId=C")).body.assignments[0].locked).toBe(false);
  });

  it("a locked poll hides its questions and refuses answers", async () => {
    const p = (await P(polls, "st", { action: "create", courseId: "C", title: "Check-in", questions: [{ type: "scale", prompt: "How sure?" }] })).body.id;
    await P(polls, "st", { action: "update", id: p, status: "open" });
    await P(rules, "st", { courseId: "C", itemType: "poll", itemId: p, requireQuizPass: true });
    const g = (await G(polls, "s2", "/api/polls?id=" + p)).body.poll;
    expect(g).toMatchObject({ locked: true, questions: [] });
    expect((await G(polls, "s2", "/api/polls?courseId=C")).body.polls[0]).toMatchObject({ locked: true, open: false });
    expect((await P(polls, "s2", { action: "respond", id: p, answers: [3] })).status).toBe(403);
    expect((await P(polls, "s1", { action: "respond", id: p, answers: [3] })).status).toBe(200);
  });

  it("IDOR: only the course's teachers set rules, only for items in that course", async () => {
    expect((await P(rules, "stB", { courseId: "C", itemType: "assignment", itemId: "a1", minLessons: 1 })).status).toBe(403);
    expect((await P(rules, "s1", { courseId: "C", itemType: "assignment", itemId: "a1", minLessons: 1 })).status).toBe(403);
    expect((await P(rules, "stB", { courseId: "D", itemType: "assignment", itemId: "a1", minLessons: 1 })).status).toBe(404);
    expect((await G(rules, "stB", "/api/release-rules?courseId=C")).status).toBe(403);
  });
});

describe("C1 iCal feed", () => {
  it("a secret link serves the learner's dates as valid iCal; revoking or replacing it kills the old link", async () => {
    const c = await P(feed, "s1", { action: "create" });
    const token = new URL(c.body.url).searchParams.get("token")!;
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(sql.prepare("SELECT * FROM calendar_feeds").all())).not.toContain(token); // only the hash is stored
    const ics = async (tk: string) => feed.onRequestGetIcs({ request: req("", "/api/calendar.ics?token=" + tk), env });
    const r = await ics(token);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toMatch(/text\/calendar/);
    const body = await r.text();
    expect(body).toMatch(/^BEGIN:VCALENDAR\r\n/);
    expect(body).toContain("SUMMARY:Due: Final essay\\; with\\, commas");
    expect(body).toContain("UID:assignment-a1@sikhiuni.com");
    expect(body.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
    const c2 = await P(feed, "s1", { action: "create" });
    expect((await ics(token)).status).toBe(404); // replaced
    await P(feed, "s1", { action: "revoke" });
    expect((await ics(new URL(c2.body.url).searchParams.get("token")!)).status).toBe(404);
    expect((await ics("nope")).status).toBe(404);
    expect((await G(feed, "s1", "/api/calendar-feed")).body.enabled).toBe(false);
  });

  it("long titles are folded at 75 octets, Gurmukhi included", () => {
    const out = feed.buildIcs([{ type: "assignment", id: "x", course_id: "C", title: "ਸ੍ਰੀ ਗੁਰੂ ਗ੍ਰੰਥ ਸਾਹਿਬ ਜੀ ".repeat(6), at: Date.now() }]);
    expect(out.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
    expect(out).toContain("\r\n ");
  });
});
