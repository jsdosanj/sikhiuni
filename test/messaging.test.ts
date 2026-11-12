// C18 forums + classmate DMs on real SQLite, against the approved design: message
// requests (accept / decline is silent / block), teacher course settings, mutes,
// the filter, teacher read access only when switched on, reports, forum categories,
// follows and blocks hiding posts, plus data lifecycle and IDOR.
import { describe, it, expect, beforeEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import * as messages from "../functions/api/messages.js";
import * as settingsApi from "../functions/api/messaging-settings.js";
import * as discussions from "../functions/api/discussions.js";
import { onRequestPost as deletePost } from "../functions/api/account/delete.js";
import { filterText } from "../functions/api/_messaging.js";

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
    CREATE TABLE teacher_profiles (user_id TEXT PRIMARY KEY, is_public INTEGER, verification_level TEXT);
    INSERT INTO users (id, email, name, role) VALUES ('t','t@x.com','Teacher','teacher'), ('tB','tb@x.com','Other Teacher','teacher'), ('adm','a@x.com','Admin','admin'),
      ('amar','amar@x.com','Amar','learner'), ('bal','bal@x.com','Baljit','learner'), ('cha','cha@x.com','Charan','learner'), ('out','out@x.com','Outsider','learner');
    INSERT INTO course_teachers VALUES ('C','t',0), ('D','tB',0);
    INSERT INTO enrollments VALUES ('amar','course','C',0), ('bal','course','C',0), ('cha','course','C',0), ('out','course','D',0), ('amar','course','D',0);
  `);
  for (const [sid, uid] of [["st", "t"], ["stB", "tB"], ["sadm", "adm"], ["sa", "amar"], ["sb", "bal"], ["sc", "cha"], ["so", "out"]])
    sql.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?,?,?)").run(sid, uid, now + 1e7);
  const DB = { prepare(q: string) { let a: any[] = []; const st = { bind(...v: any[]) { a = v; return st; }, async run() { const r = sql.prepare(q).run(...a); return { success: true, meta: { changes: Number(r.changes) } }; }, async first() { return (sql.prepare(q).get(...a) as any) || null; }, async all() { return { results: sql.prepare(q).all(...a) }; } }; return st; } };
  return { DB, MEDIA: { delete: async () => {} } };
}
const req = (sid: string, path: string, body?: any) => new Request("https://sikhiuni.com" + path, body === undefined
  ? { headers: { cookie: `su_session=${sid}` } }
  : { method: "POST", body: JSON.stringify(body), headers: { cookie: `su_session=${sid}`, "content-type": "application/json" } });
const P = async (mod: any, sid: string, body: any) => { const r = await mod.onRequestPost({ request: req(sid, "/api/x", body), env }); return { status: r.status, body: await r.json() }; };
const G = async (mod: any, sid: string, path: string) => { const r = await mod.onRequestGet({ request: req(sid, path), env }); return { status: r.status, body: await r.json() }; };
const audit = (a: string) => sql.prepare("SELECT * FROM events WHERE action=?").all(a) as any[];
const request = (from = "sa", to = "bal", body = "Sat Sri Akal, want to study together?") => P(messages, from, { action: "request", courseId: "C", toUserId: to, body });

beforeEach(() => { env = makeEnv(); });

describe("message requests", () => {
  it("nothing more can be sent until the recipient accepts; then both can talk", async () => {
    const r = await request();
    expect(r.body.status).toBe("pending");
    const id = r.body.conversationId;
    expect((await P(messages, "sa", { action: "send", conversationId: id, body: "hello?" })).status).toBe(403);
    // The recipient sees sender, course and the first message, and can decide.
    const inbox = await G(messages, "sb", "/api/messages");
    expect(inbox.body.conversations[0]).toMatchObject({ incoming: true, status: "pending", other: "Amar", course_id: "C" });
    const conv = await G(messages, "sb", "/api/messages?conversation=" + id);
    expect(conv.body.messages[0].body).toMatch(/study together/);
    expect((await P(messages, "sa", { action: "accept", conversationId: id })).status).toBe(400); // only the recipient
    expect((await P(messages, "sb", { action: "accept", conversationId: id })).status).toBe(200);
    expect((await P(messages, "sb", { action: "send", conversationId: id, body: "Yes, Sunday?" })).status).toBe(200);
    expect((await P(messages, "sa", { action: "send", conversationId: id, body: "Great" })).status).toBe(200);
    expect((await G(messages, "sa", "/api/messages?conversation=" + id)).body.messages).toHaveLength(3);
    expect(audit("dm_request")).toHaveLength(1);
    expect(audit("dm_send")).toHaveLength(2);
    expect(JSON.stringify(audit("dm_send"))).not.toContain("Sunday"); // audit carries no message text
    // The recipient got a message_request notification without the message text.
    const n = sql.prepare("SELECT * FROM notifications WHERE user_id='bal'").all() as any[];
    expect(n[0]).toMatchObject({ kind: "message_request" });
    expect(String(n[0].body || "")).not.toContain("study");
  });

  it("decline is silent: the sender still sees 'pending' and can't re-send or re-notify", async () => {
    const id = (await request()).body.conversationId;
    await P(messages, "sb", { action: "decline", conversationId: id });
    expect((await G(messages, "sa", "/api/messages")).body.conversations[0].status).toBe("pending");
    expect((await G(messages, "sb", "/api/messages")).body.conversations).toHaveLength(0);
    const again = await request("sa", "bal", "please?");
    expect(again.body).toMatchObject({ existing: true, status: "pending" });
    expect((sql.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id='bal'").get() as any).n).toBe(1);
  });

  it("block stops requests in every course, declines a pending one, and hides each from the other", async () => {
    const id = (await request()).body.conversationId;
    await P(messages, "sb", { action: "block", userId: "amar" });
    expect((sql.prepare("SELECT status FROM dm_conversations WHERE id=?").get(id) as any).status).toBe("declined");
    expect((await request("sb", "amar", "hi")).status).toBe(403); // either direction
    expect((await G(messages, "sa", "/api/messages?classmates=C")).body.classmates.map((c: any) => c.id)).not.toContain("bal");
    await P(messages, "sb", { action: "unblock", userId: "amar" });
    expect((await G(messages, "sb", "/api/messages")).body.blocked).toEqual([]);
  });

  it("each course needs its own request", async () => {
    sql.exec("INSERT INTO enrollments VALUES ('bal','course','D',0)");
    const c = (await request()).body.conversationId;
    await P(messages, "sb", { action: "accept", conversationId: c });
    const d = await P(messages, "sa", { action: "request", courseId: "D", toUserId: "bal", body: "also here?" });
    expect(d.body.status).toBe("pending");
    expect(d.body.conversationId).not.toBe(c);
  });

  it("only course members, only classmates in that course, only when DMs are on", async () => {
    expect((await P(messages, "so", { action: "request", courseId: "C", toUserId: "bal", body: "hi" })).status).toBe(403); // not in C
    expect((await request("sa", "out")).status).toBe(400); // Outsider isn't in C
    await P(settingsApi, "st", { courseId: "C", settings: { dms_enabled: false } });
    expect((await request()).status).toBe(403);
    expect((await G(messages, "sa", "/api/messages?classmates=C")).body.classmates).toEqual([]);
  });

  it("teachers-only starting, mutes and the filter are enforced", async () => {
    await P(settingsApi, "st", { courseId: "C", settings: { dm_starters: "teachers" } });
    expect((await request()).status).toBe(403);
    expect((await P(messages, "st", { action: "request", courseId: "C", toUserId: "bal", body: "Checking in" })).status).toBe(200);
    await P(settingsApi, "st", { courseId: "C", settings: { dm_starters: "learners" } });
    await P(settingsApi, "st", { courseId: "C", action: "mute", userId: "cha" });
    expect((await request("sc", "bal")).status).toBe(403);
    expect((await request("sa", "cha", "see https://spam.example.com")).status).toBe(400);
    expect((await request("sa", "cha", "this is shit")).status).toBe(400);
    await P(settingsApi, "st", { courseId: "C", settings: { filter_enabled: false } });
    expect((await request("sa", "cha", "see www.sikhiuni.com")).status).toBe(200);
    expect(filterText("Shiv and Ashish")).toBeNull(); // no false positive on names
  });

  it("caps new requests per day", async () => {
    await G(messages, "sa", "/api/messages"); // creates the tables
    for (let i = 0; i < 20; i++) sql.prepare("INSERT INTO dm_conversations (id, course_id, pair_key, requester_id, recipient_id, status, created_at, last_message_at) VALUES (?,?,?,?,?,?,?,?)")
      .run("x" + i, "Z" + i, "p" + i, "amar", "bal", "pending", Date.now(), Date.now());
    expect((await request()).status).toBe(429);
  });
});

describe("who can read a conversation", () => {
  async function accepted() {
    const id = (await request()).body.conversationId;
    await P(messages, "sb", { action: "accept", conversationId: id });
    await P(messages, "sb", { action: "send", conversationId: id, body: "reply" });
    return id;
  }
  it("a classmate, another course's teacher and an admin can't read it; the course teacher only when switched on", async () => {
    const id = await accepted();
    expect((await G(messages, "sc", "/api/messages?conversation=" + id)).status).toBe(403);
    expect((await G(messages, "stB", "/api/messages?conversation=" + id)).status).toBe(403);
    expect((await G(messages, "sadm", "/api/messages?conversation=" + id)).status).toBe(403);
    expect((await G(messages, "st", "/api/messages?conversation=" + id)).status).toBe(403);
    await P(settingsApi, "st", { courseId: "C", settings: { teachers_read_dms: true } });
    const t = await G(messages, "st", "/api/messages?conversation=" + id);
    expect(t.status).toBe(200);
    expect(t.body.conversation.viewer).toBe("teacher");
    // Learners are told.
    expect((await G(messages, "sa", "/api/messages?conversation=" + id)).body.conversation.teachers_can_read).toBe(true);
  });

  it("a report opens the conversation to moderators; resolving can hide the message", async () => {
    const id = await accepted();
    const msgId = (sql.prepare("SELECT id FROM dm_messages WHERE sender_id='bal'").get() as any).id;
    expect((await P(messages, "sb", { action: "report", messageId: msgId })).status).toBe(400); // own message
    expect((await P(messages, "sc", { action: "report", messageId: msgId })).status).toBe(404); // not a participant
    expect((await P(messages, "sa", { action: "report", messageId: msgId, reason: "rude" })).status).toBe(200);
    expect((await G(messages, "sadm", "/api/messages?conversation=" + id)).body.conversation.viewer).toBe("moderator");
    const q = await G(messages, "st", "/api/messages?reports=C");
    expect(q.body.reports[0]).toMatchObject({ body: "reply", sender: "Baljit", reason: "rude" });
    expect((await G(messages, "stB", "/api/messages?reports=C")).status).toBe(403);
    expect((await G(messages, "st", "/api/messages?reports=all")).status).toBe(403);
    expect((await G(messages, "sadm", "/api/messages?reports=all")).body.reports).toHaveLength(1);
    expect((await P(messages, "stB", { action: "resolve", reportId: q.body.reports[0].id, hideMessage: true })).status).toBe(403);
    await P(messages, "st", { action: "resolve", reportId: q.body.reports[0].id, hideMessage: true });
    expect((await G(messages, "sa", "/api/messages?conversation=" + id)).body.messages.map((m: any) => m.body)).not.toContain("reply");
    expect(audit("dm_report")).toHaveLength(1);
    expect(audit("dm_report_resolved")).toHaveLength(1);
  });
});

describe("course settings", () => {
  it("only the course's teachers (and admins) change settings; changes are audited", async () => {
    expect((await P(settingsApi, "sa", { courseId: "C", settings: { dms_enabled: false } })).status).toBe(403);
    expect((await P(settingsApi, "stB", { courseId: "C", settings: { dms_enabled: false } })).status).toBe(403);
    expect((await P(settingsApi, "sadm", { courseId: "C", settings: { forum_locked: true, dm_starters: "nonsense" } })).body.settings).toMatchObject({ forum_locked: 1, dm_starters: "learners" });
    expect(JSON.parse(audit("messaging_settings_changed")[0].detail)).toMatchObject({ before: { forum_locked: 0 }, after: { forum_locked: 1 } });
    const learner = await G(settingsApi, "sa", "/api/messaging-settings?courseId=C");
    expect(learner.body).not.toHaveProperty("mutes");
  });
});

describe("course forum", () => {
  const post = (sid: string, body: any) => P(discussions, sid, { courseId: "C", ...body });
  const list = async (sid = "sa") => (await G(discussions, sid, "/api/discussions?courseId=C")).body;

  it("categories: only teachers start Announcements threads", async () => {
    expect((await post("sa", { message: "Question about ਸੇਵਾ", category: "qa" })).status).toBe(200);
    expect((await post("sa", { message: "Big news", category: "announcements" })).status).toBe(403);
    expect((await post("st", { message: "Class on Sunday", category: "announcements" })).status).toBe(200);
    expect((await list()).messages.map((m: any) => m.category).sort()).toEqual(["announcements", "qa"]);
  });

  it("forum off, locked, muted and filtered posts are refused", async () => {
    await P(settingsApi, "st", { courseId: "C", action: "mute", userId: "cha" });
    expect((await post("sc", { message: "hi" })).status).toBe(403);
    expect((await post("sa", { message: "what the fuck" })).status).toBe(400);
    await P(settingsApi, "st", { courseId: "C", settings: { forum_locked: true } });
    expect((await post("sa", { message: "hi" })).status).toBe(403);
    await P(settingsApi, "st", { courseId: "C", settings: { forum_locked: false, forums_enabled: false } });
    expect((await post("sa", { message: "hi" })).status).toBe(403);
    expect((await list()).forum.enabled).toBe(false);
  });

  it("followers and the author are notified of replies; a block hides the blocked person's posts", async () => {
    await post("sa", { message: "Root thread" });
    const root = (await list()).messages[0];
    expect(root.following).toBe(true); // authors follow their own threads
    await P(discussions, "sc", { action: "follow", threadId: root.id });
    await post("sb", { message: "A reply", parentId: root.id });
    const notified = (sql.prepare("SELECT user_id FROM notifications WHERE kind='reply'").all() as any[]).map((r) => r.user_id).sort();
    expect(notified).toEqual(["amar", "cha"]);
    await P(messages, "sa", { action: "block", userId: "bal" });
    expect((await list("sa")).messages[0].replies).toHaveLength(0);
    expect((await list("sc")).messages[0].replies).toHaveLength(1);
  });
});

describe("account deletion", () => {
  it("removes the person's conversations (with both sides), blocks, follows and mutes", async () => {
    const id = (await request()).body.conversationId;
    await P(messages, "sb", { action: "accept", conversationId: id });
    await P(messages, "sb", { action: "send", conversationId: id, body: "reply" });
    await P(messages, "sa", { action: "block", userId: "cha" });
    expect((await deletePost({ request: req("sa", "/api/account/delete", { confirm: "DELETE" }), env } as any)).status).toBe(200);
    for (const t of ["dm_conversations", "dm_messages", "user_blocks"]) expect((sql.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as any).n, t).toBe(0);
  });
});
