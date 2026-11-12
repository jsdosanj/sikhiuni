// C5 notification centre: real SQLite, real handlers. Covers creation from the
// events wired so far (grade, announcement, forum reply, extension, poll opening),
// per-user isolation, preferences (incl. no immediate email for course-wide kinds),
// immediate email + daily digest via a stubbed Resend, due-soon reminders and retention.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import * as notifications from "../functions/api/notifications.js";
import { notify, resolvePrefs, queueDueSoon, sendDigests, pruneNotifications } from "../functions/api/_notify.js";
import { onRequestPost as gradePost } from "../functions/api/submissions/grade.js";
import { onRequestPost as announcePost } from "../functions/api/announcements.js";
import * as polls from "../functions/api/polls.js";
import * as policies from "../functions/api/course-policies.js";

const DAY = 864e5;
let sql: DatabaseSync, env: any, sent: any[];

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
    INSERT INTO users (id, email, name, role) VALUES ('t','t@x.com','Teacher','teacher'), ('l1','l1@x.com','One','learner'), ('l2','l2@x.com','Two','learner');
    INSERT INTO course_teachers VALUES ('C','t',0);
    INSERT INTO enrollments VALUES ('l1','course','C',0), ('l2','course','C',0);
    INSERT INTO sessions (id, user_id, expires_at) VALUES ('st','t',${now + 1e7}), ('s1','l1',${now + 1e7}), ('s2','l2',${now + 1e7});
    INSERT INTO assignments (id, course_id, teacher_id, title, instructions, due_at, created_at, updated_at) VALUES ('a1','C','t','Essay','x',${now + DAY},${now},${now});
    INSERT INTO submissions (id, assignment_id, user_id, submitted_at, updated_at) VALUES ('sub1','a1','l1',${now},${now});
  `);
  const DB = { prepare(q: string) { let a: any[] = []; const st = { bind(...v: any[]) { a = v; return st; }, async run() { const r = sql.prepare(q).run(...a); return { success: true, meta: { changes: Number(r.changes) } }; }, async first() { return (sql.prepare(q).get(...a) as any) || null; }, async all() { return { results: sql.prepare(q).all(...a) }; } }; return st; } };
  return { DB, RESEND_API_KEY: "test-key" };
}
const req = (sid: string, path: string, body?: any) => new Request("https://sikhiuni.com" + path, body === undefined
  ? { headers: { cookie: `su_session=${sid}` } }
  : { method: "POST", body: JSON.stringify(body), headers: { cookie: `su_session=${sid}`, "content-type": "application/json" } });
const inbox = async (sid: string, q = "") => (await (await notifications.onRequestGet({ request: req(sid, "/api/notifications" + q), env })).json());

beforeEach(() => {
  env = makeEnv(); sent = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: any) => { if (String(url).includes("resend")) sent.push(JSON.parse(init.body)); return new Response("{}", { status: 200 }); }));
});
afterEach(() => vi.unstubAllGlobals());

describe("events create notifications for the right people", () => {
  it("grading notifies only that learner, and emails them right away by default", async () => {
    const r = await gradePost({ request: req("st", "/api/submissions/grade", { submissionId: "sub1", grade: 90, feedback: "Good" }), env });
    expect(r.status).toBe(200);
    const one = await inbox("s1");
    expect(one.notifications).toEqual([expect.objectContaining({ kind: "graded", title: "Graded: Essay", body: "90/100" })]);
    expect(one.unread).toBe(1);
    expect((await inbox("s2")).notifications).toHaveLength(0);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual(["l1@x.com"]);
  });

  it("an announcement reaches every enrolled learner, but goes to the daily summary, not instant email", async () => {
    await announcePost({ request: req("st", "/api/announcements", { courseId: "C", title: "Class moved", body: "Now on Sunday." }), env });
    expect((await inbox("s1")).notifications[0]).toMatchObject({ kind: "announcement", title: "Class moved" });
    expect((await inbox("s2")).notifications[0].kind).toBe("announcement");
    expect(sent).toHaveLength(0);
    expect(await sendDigests(env)).toBe(2);
    expect(sent.map((m) => m.to[0]).sort()).toEqual(["l1@x.com", "l2@x.com"]);
    expect(await sendDigests(env)).toBe(0); // nothing twice
  });

  it("an extension and an opened poll notify; reopening a poll does not repeat it", async () => {
    await policies.onRequestPost({ request: req("st", "/api/course-policies", { action: "extension", assignmentId: "a1", userId: "l2", dueAt: Date.now() + 3 * DAY }), env });
    expect((await inbox("s2")).notifications[0].kind).toBe("extension");
    const p = await (await polls.onRequestPost({ request: req("st", "/api/polls", { action: "create", courseId: "C", title: "Quick", questions: [{ type: "scale", prompt: "?" }] }), env })).json();
    for (const status of ["open", "closed", "open"]) await polls.onRequestPost({ request: req("st", "/api/polls", { action: "update", id: p.id, status }), env });
    expect((await inbox("s1")).notifications.filter((n: any) => n.kind === "poll")).toHaveLength(1);
  });
});

describe("inbox and preferences", () => {
  it("a user can only mark their own notifications read", async () => {
    await notify(env, ["l1"], { kind: "message", title: "hi" });
    const id = (await inbox("s1")).notifications[0].id;
    await notifications.onRequestPost({ request: req("s2", "/api/notifications", { action: "read", ids: [id] }), env });
    expect((await inbox("s1")).unread).toBe(1);
    await notifications.onRequestPost({ request: req("s1", "/api/notifications", { action: "read", ids: [id] }), env });
    expect((await inbox("s1")).unread).toBe(0);
  });

  it("preferences: saved per user, invalid values ignored, course-wide kinds can't email instantly", async () => {
    const r = await (await notifications.onRequestPost({ request: req("s1", "/api/notifications", { action: "prefs", prefs: { graded: { email: "off", push: false }, announcement: { email: "immediate" }, bogus: { email: "immediate" }, reply: { email: "always" } } }), env })).json();
    expect(r.prefs.graded).toEqual({ email: "off", push: false });
    expect(r.prefs.announcement.email).toBe("daily");
    expect(r.prefs).not.toHaveProperty("bogus");
    expect(r.prefs.reply.email).toBe("off"); // invalid value -> default
    await gradePost({ request: req("st", "/api/submissions/grade", { submissionId: "sub1", grade: 50 }), env });
    expect(sent).toHaveLength(0); // l1 turned graded email off
    expect((await inbox("s1")).notifications).toHaveLength(1); // still in the inbox
    expect(resolvePrefs(null).graded.email).toBe("immediate");
  });

  it("latest= returns only a recent unread one (for the service worker)", async () => {
    await notify(env, ["l1"], { kind: "graded", title: "Graded: x", url: "/course/C" });
    expect((await inbox("s1", "?latest=1")).notification).toMatchObject({ title: "Graded: x", url: "/course/C" });
    sql.exec("UPDATE notifications SET created_at = created_at - 3600000");
    expect((await inbox("s1", "?latest=1")).notification).toBeNull();
  });

  it("signed out gets 401", async () => {
    expect((await notifications.onRequestGet({ request: new Request("https://sikhiuni.com/api/notifications"), env })).status).toBe(401);
  });
});

describe("cron jobs", () => {
  it("due-soon: unsubmitted learners only, once per due date", async () => {
    expect(await queueDueSoon(env)).toBe(1); // l2 (l1 submitted)
    expect(await queueDueSoon(env)).toBe(0);
    expect((await inbox("s2")).notifications[0]).toMatchObject({ kind: "due_soon", title: "Due soon: Essay" });
  });

  it("retention: read after 90 days, everything after 180", async () => {
    await notify(env, ["l1"], { kind: "message", title: "old read" });
    await notify(env, ["l1"], { kind: "message", title: "old unread" });
    await notify(env, ["l1"], { kind: "message", title: "new" });
    sql.exec(`UPDATE notifications SET created_at=${Date.now() - 100 * DAY}, read_at=1 WHERE title='old read'`);
    sql.exec(`UPDATE notifications SET created_at=${Date.now() - 200 * DAY} WHERE title='old unread'`);
    expect(await pruneNotifications(env)).toBe(2);
    expect((await inbox("s1")).notifications.map((n: any) => n.title)).toEqual(["new"]);
  });

  it("a failing notify never throws into the caller", async () => {
    await expect(notify({ DB: { prepare() { throw new Error("db down"); } } }, ["l1"], { kind: "graded", title: "x" })).resolves.toBe(0);
  });
});
