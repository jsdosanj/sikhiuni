// C14 live sessions + attendance on real SQLite: https-only meeting links, the self
// check-in window (present / late), teacher marking with before/after audit, sessions in
// the calendar and iCal feed, and IDOR.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import * as live from "../functions/api/live-sessions.js";
import * as calendar from "../functions/api/calendar.js";
import { buildIcs } from "../functions/api/calendar-feed.js";

const MIN = 60000;
let sql: DatabaseSync, env: any, t0: number;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  t0 = new Date("2026-12-01T18:00:00Z").getTime(); vi.setSystemTime(t0 - 60 * MIN);
  sql = new DatabaseSync(":memory:");
  sql.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, name TEXT, country TEXT, languages TEXT, role TEXT, marketing_optin INTEGER DEFAULT 0);
    CREATE TABLE sessions (id TEXT PRIMARY KEY, user_id TEXT, expires_at INTEGER, mfa_ok INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE rate_limits (k TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL);
    CREATE TABLE course_teachers (course_id TEXT NOT NULL, user_id TEXT NOT NULL, assigned_at INTEGER NOT NULL, PRIMARY KEY (course_id, user_id));
    CREATE TABLE enrollments (user_id TEXT NOT NULL, kind TEXT NOT NULL, target_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (user_id, kind, target_id));
    CREATE TABLE progress (user_id TEXT, course_id TEXT, done TEXT, passed_score INTEGER, updated_at INTEGER);
    CREATE TABLE assignments (id TEXT PRIMARY KEY, course_id TEXT NOT NULL, teacher_id TEXT, title TEXT, instructions TEXT, due_at INTEGER, points INTEGER, allow_file INTEGER, status TEXT, created_at INTEGER, updated_at INTEGER);
    CREATE TABLE submissions (id TEXT PRIMARY KEY, assignment_id TEXT, user_id TEXT, status TEXT);
    INSERT INTO users (id, email, name, role) VALUES ('t','t@x.com','T','teacher'), ('tB','tb@x.com','TB','teacher'), ('a','a@x.com','Amar','learner'), ('b','b@x.com','Baljit','learner'), ('out','o@x.com','Out','learner');
    INSERT INTO course_teachers VALUES ('C','t',0), ('D','tB',0);
    INSERT INTO enrollments VALUES ('a','course','C',0), ('b','course','C',0), ('out','course','D',0);
  `);
  for (const [sid, uid] of [["st", "t"], ["stB", "tB"], ["sa", "a"], ["sb", "b"], ["so", "out"]]) sql.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?,?,?)").run(sid, uid, t0 + 1e9);
  const DB = { prepare(q: string) { let a: any[] = []; const st = { bind(...v: any[]) { a = v; return st; }, async run() { const r = sql.prepare(q).run(...a); return { success: true, meta: { changes: Number(r.changes) } }; }, async first() { return (sql.prepare(q).get(...a) as any) || null; }, async all() { return { results: sql.prepare(q).all(...a) }; } }; return st; } };
  env = { DB };
});
afterEach(() => vi.useRealTimers());
const req = (sid: string, path: string, body?: any) => new Request("https://sikhiuni.com" + path, body === undefined
  ? { headers: { cookie: `su_session=${sid}` } } : { method: "POST", body: JSON.stringify(body), headers: { cookie: `su_session=${sid}`, "content-type": "application/json" } });
const P = async (sid: string, body: any) => { const r = await live.onRequestPost({ request: req(sid, "/api/x", body), env }); return { status: r.status, body: await r.json() }; };
const G = async (sid: string, q: string) => { const r = await live.onRequestGet({ request: req(sid, "/api/live-sessions?" + q), env }); return { status: r.status, body: await r.json() }; };
const create = (extra: any = {}) => P("st", { action: "create", courseId: "C", title: "Katha on ਸੇਵਾ", startsAt: t0, durationMin: 60, joinUrl: "https://meet.jit.si/sikhiuni-seva", ...extra });

describe("C14 live sessions", () => {
  it("meeting links must be https without credentials", async () => {
    expect(live.cleanJoinUrl("http://zoom.us/j/1")).toBeNull();
    expect(live.cleanJoinUrl("javascript:alert(1)")).toBeNull();
    expect(live.cleanJoinUrl("https://user:pw@zoom.us/j/1")).toBeNull();
    expect((await create({ joinUrl: "ftp://x" })).status).toBe(400);
    expect((await create()).status).toBe(200);
  });

  it("self check-in: opens 10 minutes early, 'late' after 10 minutes, closes at the end", async () => {
    const id = (await create()).body.id;
    expect((await P("sa", { action: "checkin", sessionId: id })).status).toBe(400); // an hour early
    vi.setSystemTime(t0 - 5 * MIN);
    expect((await P("sa", { action: "checkin", sessionId: id })).body.status).toBe("present");
    vi.setSystemTime(t0 + 20 * MIN);
    expect((await P("sb", { action: "checkin", sessionId: id })).body.status).toBe("late");
    vi.setSystemTime(t0 + 61 * MIN);
    expect((await P("sb", { action: "checkin", sessionId: id })).status).toBe(400);
    const mine = (await G("sa", "courseId=C")).body.sessions[0];
    expect(mine).toMatchObject({ my_status: "present", join_url: "https://meet.jit.si/sikhiuni-seva" });
  });

  it("teachers mark and correct attendance (audited); the roster shows self check-ins", async () => {
    const id = (await create()).body.id;
    vi.setSystemTime(t0);
    await P("sa", { action: "checkin", sessionId: id });
    await P("st", { action: "mark", sessionId: id, userId: "b", status: "excused" });
    await P("st", { action: "mark", sessionId: id, userId: "a", status: "late" });
    const roster = (await G("st", "sessionId=" + id)).body.roster;
    expect(Object.fromEntries(roster.map((r: any) => [r.id, r.status]))).toEqual({ a: "late", b: "excused" });
    expect((await P("st", { action: "mark", sessionId: id, userId: "out", status: "present" })).status).toBe(400);
    expect((await P("st", { action: "mark", sessionId: id, userId: "a", status: "asleep" })).status).toBe(400);
    const ev = sql.prepare("SELECT detail FROM events WHERE action='attendance_marked' AND subject_user_id='a'").get() as any;
    expect(JSON.parse(ev.detail)).toMatchObject({ before: "present", after: "late" });
    expect((await G("st", "courseId=C")).body.sessions[0].counts).toEqual({ late: 1, excused: 1 });
  });

  it("sessions appear in the calendar and the iCal feed with their duration", async () => {
    await create();
    const ev = (await (await calendar.onRequestGet({ request: req("sa", "/api/calendar"), env })).json()).events.find((e: any) => e.type === "session");
    expect(ev).toMatchObject({ title: "Katha on ਸੇਵਾ", at: t0, end: t0 + 60 * MIN });
    const ics = buildIcs([ev]);
    expect(ics).toContain("SUMMARY:Live: Katha on ਸੇਵਾ");
    expect(ics).toContain("DTSTART:20261201T180000Z");
    expect(ics).toContain("DTEND:20261201T190000Z");
  });

  it("IDOR: outsiders can't see links or check in; other teachers can't manage or read rosters", async () => {
    const id = (await create()).body.id;
    expect((await G("so", "courseId=C")).status).toBe(403);
    vi.setSystemTime(t0);
    expect((await P("so", { action: "checkin", sessionId: id })).status).toBe(403);
    expect((await G("stB", "sessionId=" + id)).status).toBe(403);
    expect((await P("stB", { action: "mark", sessionId: id, userId: "a", status: "present" })).status).toBe(403);
    expect((await P("sa", { action: "delete", sessionId: id })).status).toBe(403);
  });
});
