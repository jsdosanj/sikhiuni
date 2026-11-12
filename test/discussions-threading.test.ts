// Threaded discussions: depth-1 replies, instructor/verified badges, pin/lock/
// hide moderation, and reports. Uses a stateful fake D1 since the flows need
// real state across calls (post root -> reply -> moderate -> re-fetch).
import { describe, it, expect, beforeEach } from "vitest";
import { onRequestGet as discGet, onRequestPost as discPost } from "../functions/api/discussions.js";
import { onRequestGet as modGet, onRequestPost as modPost } from "../functions/api/discussions/moderate.js";
import { onRequestPost as reportPost } from "../functions/api/discussions/report.js";
import { req } from "./helpers";

function fakeDB() {
  const users = new Map<string, any>();
  const sessions = new Map<string, any>();
  const rows = new Map<string, any>(); // discussions, by id
  const courseTeachers = new Set<string>(); // `${userId}|${courseId}`
  const teacherProfiles = new Map<string, any>(); // user_id -> {verification_level, is_public}
  const reports = new Map<string, any>(); // `${message_id}|${user_id}`
  let seq = 0;

  function handleFirst(sql: string, b: any[]) {
    if (sql.includes("FROM sessions s JOIN users u")) {
      const [sid, now] = b;
      const s = sessions.get(sid);
      if (!s || s.expires_at <= now) return null;
      const u = users.get(s.user_id);
      return u ? { id: u.id, email: u.email, name: u.name, role: u.role, mfa_ok: 1 } : null;
    }
    if (sql.includes("SELECT id, course_id, parent_id, locked, hidden, user_id FROM discussions WHERE id=?")) {
      const r = rows.get(b[0]);
      return r ? { id: r.id, course_id: r.course_id, parent_id: r.parent_id, locked: r.locked, hidden: r.hidden, user_id: r.user_id } : null;
    }
    if (sql.includes("SELECT course_id, parent_id FROM discussions WHERE id=?")) {
      const r = rows.get(b[0]);
      return r ? { course_id: r.course_id, parent_id: r.parent_id } : null;
    }
    if (sql.includes("SELECT id FROM discussions WHERE id=?")) {
      const r = rows.get(b[0]);
      return r ? { id: r.id } : null;
    }
    if (sql.includes("SELECT 1 FROM course_teachers")) {
      const [uid, cid] = b;
      return courseTeachers.has(`${uid}|${cid}`) ? { x: 1 } : null;
    }
    return null;
  }
  function handleRun(sql: string, b: any[]) {
    if (sql.startsWith("CREATE TABLE") || sql.startsWith("ALTER TABLE")) return { success: true };
    if (sql.includes("INSERT INTO discussions")) {
      const [id, course_id, user_id, name, message, created_at, parent_id, author_role] = b;
      rows.set(id, { id, course_id, user_id, name, message, created_at, parent_id, author_role, pinned: 0, locked: 0, hidden: 0 });
      return { success: true };
    }
    if (sql.startsWith("UPDATE discussions SET pinned=1")) { rows.get(b[0]).pinned = 1; return { success: true }; }
    if (sql.startsWith("UPDATE discussions SET pinned=0")) { rows.get(b[0]).pinned = 0; return { success: true }; }
    if (sql.startsWith("UPDATE discussions SET locked=1")) { rows.get(b[0]).locked = 1; return { success: true }; }
    if (sql.startsWith("UPDATE discussions SET locked=0")) { rows.get(b[0]).locked = 0; return { success: true }; }
    if (sql.startsWith("UPDATE discussions SET hidden=1")) { rows.get(b[0]).hidden = 1; return { success: true }; }
    if (sql.startsWith("UPDATE discussions SET hidden=0")) { rows.get(b[0]).hidden = 0; return { success: true }; }
    if (sql.includes("INSERT INTO discussion_reports")) {
      const [message_id, user_id, reason, created_at] = b;
      reports.set(`${message_id}|${user_id}`, { message_id, user_id, reason, created_at, status: "open" });
      return { success: true };
    }
    return { success: true };
  }
  function handleAll(sql: string, b: any[]) {
    if (sql.includes("FROM discussions WHERE course_id=? AND parent_id IS NULL AND hidden=0")) {
      const courseId = b[0];
      const list = [...rows.values()].filter((r) => r.course_id === courseId && !r.parent_id && !r.hidden)
        .sort((a, c) => (c.pinned - a.pinned) || (c.created_at - a.created_at));
      return { results: list };
    }
    if (sql.includes("WHERE parent_id IN") && sql.includes("AND hidden=0")) {
      const parentIds = b;
      const list = [...rows.values()].filter((r) => r.parent_id && parentIds.includes(r.parent_id) && !r.hidden)
        .sort((a, c) => a.created_at - c.created_at);
      return { results: list };
    }
    if (sql.includes("FROM teacher_profiles WHERE is_public=1 AND user_id IN")) {
      const ids = b;
      const list = ids.filter((id: string) => teacherProfiles.has(id)).map((id: string) => ({ user_id: id, verification_level: teacherProfiles.get(id).verification_level }));
      return { results: list };
    }
    if (sql.includes("FROM discussion_reports dr JOIN discussions d")) {
      const list = [...reports.values()].filter((r) => r.status === "open").map((r) => {
        const d = rows.get(r.message_id);
        return { message_id: r.message_id, user_id: r.user_id, reason: r.reason, created_at: r.created_at, course_id: d.course_id, name: d.name, message: d.message, hidden: d.hidden };
      });
      return { results: list };
    }
    return { results: [] };
  }
  function prepare(sql: string) {
    let bound: any[] = [];
    const self = {
      bind(...args: any[]) { bound = args; return self; },
      async first() { return handleFirst(sql, bound); },
      async run() { return handleRun(sql, bound); },
      async all() { return handleAll(sql, bound); },
    };
    return self;
  }
  return { prepare, users, sessions, rows, courseTeachers, teacherProfiles, reports };
}

function makeEnv() { return { DB: fakeDB() }; }
function seedUser(env: any, { id, role = "learner" }: any) {
  env.DB.users.set(id, { id, email: id + "@example.com", name: id, role });
  env.DB.sessions.set("sid-" + id, { user_id: id, expires_at: Date.now() + 100000 });
}
function asReq(id: string | null, body?: unknown, url = "http://localhost/api/discussions") {
  return req({ url, cookie: id ? "sid-" + id : undefined, body });
}

describe("posting and threading", () => {
  let env: any;
  beforeEach(() => { env = makeEnv(); seedUser(env, { id: "s1", role: "learner" }); seedUser(env, { id: "t1", role: "teacher" }); env.DB.courseTeachers.add("t1|course-x"); });

  it("signed-out cannot post", async () => {
    const res = await discPost({ request: asReq(null, { courseId: "course-x", message: "hi" }), env });
    expect(res.status).toBe(401);
  });

  it("a course teacher's root post is snapshotted with author_role=instructor", async () => {
    await discPost({ request: asReq("t1", { courseId: "course-x", message: "Welcome to the course" }), env });
    const res = await discGet({ request: req({ url: "http://localhost/api/discussions?courseId=course-x" }), env });
    const { messages } = await res.json();
    expect(messages[0].author_role).toBe("instructor");
  });

  it("a reply nests under its root; a reply-to-a-reply is rejected (depth cap)", async () => {
    await discPost({ request: asReq("t1", { courseId: "course-x", message: "Root" }), env });
    const { messages } = await (await discGet({ request: req({ url: "http://localhost/api/discussions?courseId=course-x" }), env })).json();
    const rootId = messages[0].id;

    const replyRes = await discPost({ request: asReq("s1", { courseId: "course-x", message: "A reply", parentId: rootId }), env });
    expect(replyRes.status).toBe(200);
    const after = await (await discGet({ request: req({ url: "http://localhost/api/discussions?courseId=course-x" }), env })).json();
    expect(after.messages[0].replies).toHaveLength(1);
    expect(after.messages[0].replies[0].message).toBe("A reply");

    const replyId = after.messages[0].replies[0].id;
    const nestedRes = await discPost({ request: asReq("s1", { courseId: "course-x", message: "too deep", parentId: replyId }), env });
    expect(nestedRes.status).toBe(400);
  });

  it("pinned roots sort before non-pinned, then newest first", async () => {
    await discPost({ request: asReq("s1", { courseId: "course-x", message: "first" }), env });
    await discPost({ request: asReq("s1", { courseId: "course-x", message: "second" }), env });
    const before = await (await discGet({ request: req({ url: "http://localhost/api/discussions?courseId=course-x" }), env })).json();
    const secondId = before.messages[0].id; // newest first by default
    await modPost({ request: asReq("t1", { id: secondId, action: "pin" }, "http://localhost/api/discussions/moderate"), env });

    const after = await (await discGet({ request: req({ url: "http://localhost/api/discussions?courseId=course-x" }), env })).json();
    expect(after.messages[0].pinned).toBe(true);
    expect(after.messages[0].id).toBe(secondId);
  });

  it("a locked root rejects new replies", async () => {
    await discPost({ request: asReq("t1", { courseId: "course-x", message: "Root" }), env });
    const { messages } = await (await discGet({ request: req({ url: "http://localhost/api/discussions?courseId=course-x" }), env })).json();
    const rootId = messages[0].id;
    await modPost({ request: asReq("t1", { id: rootId, action: "lock" }, "http://localhost/api/discussions/moderate"), env });
    const res = await discPost({ request: asReq("s1", { courseId: "course-x", message: "too late", parentId: rootId }), env });
    expect(res.status).toBe(400);
  });

  it("a hidden root disappears from GET entirely", async () => {
    await discPost({ request: asReq("s1", { courseId: "course-x", message: "spam" }), env });
    const { messages } = await (await discGet({ request: req({ url: "http://localhost/api/discussions?courseId=course-x" }), env })).json();
    const id = messages[0].id;
    await modPost({ request: asReq("t1", { id, action: "hide" }, "http://localhost/api/discussions/moderate"), env });
    const after = await (await discGet({ request: req({ url: "http://localhost/api/discussions?courseId=course-x" }), env })).json();
    expect(after.messages).toHaveLength(0);
  });

  it("a scholar-verified poster's public profile surfaces the badge", async () => {
    env.DB.teacherProfiles.set("t1", { verification_level: "scholar" });
    await discPost({ request: asReq("t1", { courseId: "course-x", message: "Root" }), env });
    const { messages } = await (await discGet({ request: req({ url: "http://localhost/api/discussions?courseId=course-x" }), env })).json();
    expect(messages[0].verified).toBe("scholar");
  });
});

describe("moderation authz", () => {
  let env: any;
  beforeEach(async () => {
    env = makeEnv();
    seedUser(env, { id: "t1", role: "teacher" });
    seedUser(env, { id: "t2", role: "teacher" }); // does not teach course-x
    seedUser(env, { id: "admin1", role: "admin" });
    seedUser(env, { id: "learner1", role: "learner" });
    env.DB.courseTeachers.add("t1|course-x");
    await discPost({ request: asReq("t1", { courseId: "course-x", message: "Root" }), env });
  });

  it("a teacher who doesn't teach the course cannot moderate it", async () => {
    const { messages } = await (await discGet({ request: req({ url: "http://localhost/api/discussions?courseId=course-x" }), env })).json();
    const res = await modPost({ request: asReq("t2", { id: messages[0].id, action: "pin" }, "http://localhost/api/discussions/moderate"), env });
    expect(res.status).toBe(403);
  });

  it("admin can moderate any course", async () => {
    const { messages } = await (await discGet({ request: req({ url: "http://localhost/api/discussions?courseId=course-x" }), env })).json();
    const res = await modPost({ request: asReq("admin1", { id: messages[0].id, action: "hide" }, "http://localhost/api/discussions/moderate"), env });
    expect(res.status).toBe(200);
  });

  it("a learner cannot moderate at all", async () => {
    const { messages } = await (await discGet({ request: req({ url: "http://localhost/api/discussions?courseId=course-x" }), env })).json();
    const res = await modPost({ request: asReq("learner1", { id: messages[0].id, action: "pin" }, "http://localhost/api/discussions/moderate"), env });
    expect(res.status).toBe(403);
  });

  it("pin/lock cannot target a reply", async () => {
    const { messages } = await (await discGet({ request: req({ url: "http://localhost/api/discussions?courseId=course-x" }), env })).json();
    await discPost({ request: asReq("learner1", { courseId: "course-x", message: "reply", parentId: messages[0].id }), env });
    const after = await (await discGet({ request: req({ url: "http://localhost/api/discussions?courseId=course-x" }), env })).json();
    const replyId = after.messages[0].replies[0].id;
    const res = await modPost({ request: asReq("t1", { id: replyId, action: "pin" }, "http://localhost/api/discussions/moderate"), env });
    expect(res.status).toBe(400);
  });
});

describe("reports", () => {
  let env: any;
  beforeEach(async () => {
    env = makeEnv();
    seedUser(env, { id: "s1", role: "learner" });
    seedUser(env, { id: "admin1", role: "admin" });
    await discPost({ request: asReq("s1", { courseId: "course-x", message: "Root" }), env });
  });

  it("signed-in user can report a message; it shows up in the admin queue", async () => {
    const { messages } = await (await discGet({ request: req({ url: "http://localhost/api/discussions?courseId=course-x" }), env })).json();
    const res = await reportPost({ request: asReq("s1", { id: messages[0].id, reason: "spam" }, "http://localhost/api/discussions/report"), env });
    expect(res.status).toBe(200);

    const queue = await modGet({ request: asReq("admin1", undefined, "http://localhost/api/discussions/moderate"), env });
    const { reports } = await queue.json();
    expect(reports).toHaveLength(1);
    expect(reports[0].reason).toBe("spam");
  });

  it("a non-admin cannot read the report queue", async () => {
    const res = await modGet({ request: asReq("s1", undefined, "http://localhost/api/discussions/moderate"), env });
    expect(res.status).toBe(403);
  });
});
