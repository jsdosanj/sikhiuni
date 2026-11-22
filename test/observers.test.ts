// C13 observers on real SQLite: consent comes only from the learner's single-use invite
// code; the learner is told and can remove the observer; the observer sees scores and
// statuses but never submission text, feedback or journals; nobody else can read the
// summary; codes expire and can't be reused.
import { describe, it, expect, beforeEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import * as obs from "../functions/api/observers.js";

let sql: DatabaseSync, env: any;
beforeEach(() => {
  sql = new DatabaseSync(":memory:");
  const now = Date.now();
  sql.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, name TEXT, country TEXT, languages TEXT, role TEXT, marketing_optin INTEGER DEFAULT 0);
    CREATE TABLE sessions (id TEXT PRIMARY KEY, user_id TEXT, expires_at INTEGER, mfa_ok INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE rate_limits (k TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL);
    CREATE TABLE enrollments (user_id TEXT NOT NULL, kind TEXT NOT NULL, target_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (user_id, kind, target_id));
    CREATE TABLE progress (user_id TEXT NOT NULL, course_id TEXT NOT NULL, done TEXT, passed_score INTEGER, updated_at INTEGER NOT NULL, PRIMARY KEY (user_id, course_id));
    CREATE TABLE assignments (id TEXT PRIMARY KEY, course_id TEXT NOT NULL, teacher_id TEXT NOT NULL, title TEXT NOT NULL, instructions TEXT NOT NULL, due_at INTEGER, points INTEGER NOT NULL DEFAULT 100, allow_file INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE submissions (id TEXT PRIMARY KEY, assignment_id TEXT NOT NULL, user_id TEXT NOT NULL, text_content TEXT, file_key TEXT, submitted_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, late INTEGER NOT NULL DEFAULT 0, grade INTEGER, feedback TEXT, graded_by TEXT, graded_at INTEGER, status TEXT NOT NULL DEFAULT 'submitted', UNIQUE (assignment_id, user_id));
    INSERT INTO users (id, email, name, role) VALUES ('kid','kid@x.com','Simran Kaur','learner'), ('mum','mum@x.com','Mum','learner'), ('other','o@x.com','Other','learner');
    INSERT INTO enrollments VALUES ('kid','course','C',0);
    INSERT INTO progress VALUES ('kid','C','[0,1]',85,${now});
    INSERT INTO assignments VALUES ('a1','C','t','Essay','Write',NULL,20,0,'open',0,0), ('a2','C','t','Draft only','x',NULL,10,0,'draft',0,0);
    INSERT INTO submissions VALUES ('s1','a1','kid','MY PRIVATE ESSAY TEXT',NULL,${now},${now},1,17,'PRIVATE FEEDBACK','t',${now},'graded');
  `);
  for (const [sid, uid] of [["sk", "kid"], ["sm", "mum"], ["so", "other"]]) sql.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?,?,?)").run(sid, uid, now + 1e9);
  const DB = { prepare(q: string) { let a: any[] = []; const st = { bind(...v: any[]) { a = v; return st; }, async run() { const r = sql.prepare(q).run(...a); return { success: true, meta: { changes: Number(r.changes) } }; }, async first() { return (sql.prepare(q).get(...a) as any) || null; }, async all() { return { results: sql.prepare(q).all(...a) }; } }; return st; } };
  env = { DB };
});
const req = (sid: string, path: string, body?: any) => new Request("https://sikhiuni.com" + path, body === undefined
  ? { headers: sid ? { cookie: `su_session=${sid}` } : {} } : { method: "POST", body: JSON.stringify(body), headers: { cookie: `su_session=${sid}`, "content-type": "application/json" } });
const P = async (sid: string, body: any) => { const r = await obs.onRequestPost({ request: req(sid, "/api/observers", body), env }); return { status: r.status, body: await r.json() }; };
const G = async (sid: string, q = "") => { const r = await obs.onRequestGet({ request: req(sid, "/api/observers" + q), env }); return { status: r.status, body: await r.json() }; };

describe("C13 observers", () => {
  it("links only through the learner's code, tells the learner, and shows scores but never private work", async () => {
    expect((await G("sm", "?learner=kid")).status).toBe(403); // no consent yet
    const inv = await P("sk", { action: "invite" });
    expect(inv.body.code).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
    expect(JSON.stringify(sql.prepare("SELECT * FROM observer_invites").all())).not.toContain(inv.body.code.replace("-", "")); // only a hash is stored
    expect((await P("sm", { action: "redeem", code: inv.body.code.toLowerCase() })).status).toBe(200);
    expect((sql.prepare("SELECT title FROM notifications WHERE user_id='kid'").get() as any).title).toBe("Mum can now see your progress");
    const s = await G("sm", "?learner=kid");
    expect(s.status).toBe(200);
    expect(s.body.courses[0]).toMatchObject({ course_id: "C", lessons_done: 2, course_test_passed: true });
    expect(s.body.courses[0].assignments).toEqual([{ title: "Essay", due_at: null, points: 20, submitted: true, late: true, graded: true, grade: 17 }]); // drafts hidden
    const raw = JSON.stringify(s.body);
    expect(raw).not.toContain("PRIVATE"); // no essay text, no feedback
    expect(raw).not.toContain("kid@x.com");
    expect((await G("so", "?learner=kid")).status).toBe(403); // nobody else
    expect(sql.prepare("SELECT COUNT(*) AS n FROM events WHERE action='observer_viewed'").get()).toEqual({ n: 1 }); // every view is audited
    expect((await G("sk")).body.observers.map((o: any) => o.name)).toEqual(["Mum"]);
    expect((await G("sm")).body.observing.map((o: any) => o.name)).toEqual(["Simran Kaur"]);
  });

  it("codes are single use, expire, and can't be used on yourself", async () => {
    const { code } = (await P("sk", { action: "invite" })).body;
    expect((await P("sk", { action: "redeem", code })).status).toBe(400); // own code
    expect((await P("sm", { action: "redeem", code })).status).toBe(200);
    expect((await P("so", { action: "redeem", code })).status).toBe(400); // used
    const second = (await P("sk", { action: "invite" })).body.code;
    sql.exec("UPDATE observer_invites SET expires_at = 1");
    expect((await P("so", { action: "redeem", code: second })).status).toBe(400); // expired
    expect((await P("so", { action: "redeem", code: "AAAAA-AAAAA" })).status).toBe(400);
  });

  it("a new code replaces the unused one, and cancelling removes it", async () => {
    const first = (await P("sk", { action: "invite" })).body.code;
    await P("sk", { action: "invite" });
    expect((await P("sm", { action: "redeem", code: first })).status).toBe(400);
    await P("sk", { action: "cancel-invite" });
    expect((await G("sk")).body.invite).toBeNull();
  });

  it("the learner can remove an observer and an observer can leave; access ends at once", async () => {
    await P("sm", { action: "redeem", code: (await P("sk", { action: "invite" })).body.code });
    await P("so", { action: "redeem", code: (await P("sk", { action: "invite" })).body.code });
    expect((await P("sk", { action: "remove", observerId: "mum" })).status).toBe(200);
    expect((await G("sm", "?learner=kid")).status).toBe(403);
    expect((await P("so", { action: "leave", learnerId: "kid" })).status).toBe(200);
    expect((await G("so", "?learner=kid")).status).toBe(403);
    expect((await P("so", { action: "leave", learnerId: "kid" })).status).toBe(404);
    const actions = sql.prepare("SELECT action FROM events ORDER BY rowid").all().map((r: any) => r.action);
    expect(actions).toEqual(expect.arrayContaining(["observer_invite_created", "observer_linked", "observer_removed"]));
  });

  it("caps observers at five and needs sign-in", async () => {
    await obs.ensureObservers(env);
    for (let i = 0; i < 5; i++) sql.prepare("INSERT INTO observer_links VALUES ('kid', ?, 0)").run("o" + i);
    expect((await P("sk", { action: "invite" })).status).toBe(400);
    expect((await G("")).status).toBe(401);
    expect((await P("", { action: "invite" })).status).toBe(401);
  });
});
