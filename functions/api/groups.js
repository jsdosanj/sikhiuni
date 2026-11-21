import { json, newId, logEvent } from "./_lib.js";
import { schemaOnce } from "./_schema-once.js";
import { courseAccess, cleanText } from "./_course-auth.js";
import { getSettings, isMuted, filterText } from "./_messaging.js";
import { notify } from "./_notify.js";
import { shuffled, cryptoRand } from "./_quiz-engine.js";

// C8 groups within a course + group assignments (Moodle Groups, Canvas Groups).
// - Teachers make groups by hand or split the class into random groups of N. A learner is
//   in at most one group per course.
// - A teacher can make an assignment a group assignment: one member submits for the whole
//   group (each member gets the same submission row, so gradebook, analytics and late
//   policy keep working per learner) and grading it grades every member.
// - Each group has a private board for members and the course's teachers. Course messaging
//   settings apply: mutes, the filter, and "forum off".
//
// GET  /api/groups?courseId=    teacher: groups + members + unassigned learners + group assignments
//                               learner: my group, members, board posts, group assignments
// POST teacher: { action:"create", courseId, name } | { action:"rename", groupId, name } | { action:"delete", groupId }
//               { action:"members", groupId, userIds:[...] } | { action:"auto", courseId, size }
//               { action:"group_mode", assignmentId, on:true|false }
// POST member:  { action:"post", groupId, body }

export function ensureGroups(env) {
  return schemaOnce(env.DB, "course_groups", async () => {
    const run = (q) => env.DB.prepare(q).run();
    await run("CREATE TABLE IF NOT EXISTS course_groups (id TEXT PRIMARY KEY, course_id TEXT NOT NULL, name TEXT NOT NULL, created_by TEXT, created_at INTEGER NOT NULL)");
    await run("CREATE INDEX IF NOT EXISTS idx_course_groups_course ON course_groups(course_id)");
    await run("CREATE TABLE IF NOT EXISTS group_members (group_id TEXT NOT NULL, course_id TEXT NOT NULL, user_id TEXT NOT NULL, added_at INTEGER NOT NULL, PRIMARY KEY (group_id, user_id), UNIQUE (course_id, user_id))");
    await run("CREATE TABLE IF NOT EXISTS group_assignments (assignment_id TEXT PRIMARY KEY, course_id TEXT NOT NULL, set_by TEXT, set_at INTEGER NOT NULL)");
    await run("CREATE TABLE IF NOT EXISTS group_posts (id TEXT PRIMARY KEY, group_id TEXT NOT NULL, user_id TEXT NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL)");
    await run("CREATE INDEX IF NOT EXISTS idx_group_posts_group ON group_posts(group_id, created_at)");
  });
}

/** The learner's group in a course, with member ids, or null. */
export async function groupOf(env, courseId, userId) {
  await ensureGroups(env);
  const g = await env.DB.prepare("SELECT g.id, g.name FROM group_members m JOIN course_groups g ON g.id=m.group_id WHERE m.course_id=? AND m.user_id=?").bind(courseId, userId).first();
  if (!g) return null;
  const members = ((await env.DB.prepare("SELECT user_id FROM group_members WHERE group_id=?").bind(g.id).all()).results || []).map((r) => r.user_id);
  return { ...g, members };
}

/** Is this assignment a group assignment? */
export async function isGroupAssignment(env, assignmentId) {
  await ensureGroups(env);
  return !!(await env.DB.prepare("SELECT 1 AS x FROM group_assignments WHERE assignment_id=?").bind(assignmentId).first());
}

async function learnersOf(env, courseId) {
  return ((await env.DB.prepare("SELECT u.id, u.name, u.email FROM enrollments e JOIN users u ON u.id=e.user_id WHERE e.kind='course' AND e.target_id=? ORDER BY u.name LIMIT 5000").bind(courseId).all()).results) || [];
}

export async function onRequestGet({ request, env }) {
  const courseId = new URL(request.url).searchParams.get("courseId");
  const { user, teach, error } = await courseAccess(env, request, courseId, "member");
  if (error) return error;
  await ensureGroups(env);
  const groupAssignments = ((await env.DB.prepare("SELECT ga.assignment_id AS id, a.title FROM group_assignments ga JOIN assignments a ON a.id=ga.assignment_id WHERE ga.course_id=?").bind(courseId).all().catch(() => ({ results: [] }))).results) || [];
  if (teach) {
    const groups = ((await env.DB.prepare("SELECT id, name FROM course_groups WHERE course_id=? ORDER BY name").bind(courseId).all()).results) || [];
    const members = ((await env.DB.prepare("SELECT m.group_id, u.id, u.name, u.email FROM group_members m JOIN users u ON u.id=m.user_id WHERE m.course_id=? ORDER BY u.name").bind(courseId).all()).results) || [];
    const placed = new Set(members.map((m) => m.id));
    const unassigned = (await learnersOf(env, courseId)).filter((l) => !placed.has(l.id));
    return json({ scope: "teacher", groups: groups.map((g) => ({ ...g, members: members.filter((m) => m.group_id === g.id).map(({ group_id, ...m }) => m) })), unassigned, group_assignments: groupAssignments });
  }
  const g = await groupOf(env, courseId, user.id);
  if (!g) return json({ scope: "learner", group: null, group_assignments: groupAssignments });
  const names = ((await env.DB.prepare(`SELECT id, name FROM users WHERE id IN (${g.members.map(() => "?").join(",")})`).bind(...g.members).all()).results) || [];
  const posts = ((await env.DB.prepare("SELECT p.id, p.body, p.created_at, p.user_id, u.name FROM group_posts p LEFT JOIN users u ON u.id=p.user_id WHERE p.group_id=? ORDER BY p.created_at DESC LIMIT 200").bind(g.id).all()).results) || [];
  return json({ scope: "learner", group: { id: g.id, name: g.name, members: names.map((n) => ({ name: n.name || "Learner", me: n.id === user.id })) },
    posts: posts.map((p) => ({ id: p.id, body: p.body, created_at: p.created_at, name: p.name || "Learner", mine: p.user_id === user.id })), group_assignments: groupAssignments });
}

export async function onRequestPost({ request, env }) {
  let b; try { b = await request.json(); } catch { return json({ error: "bad request" }, 400); }
  if (!b || typeof b !== "object") return json({ error: "bad request" }, 400);
  await ensureGroups(env);
  const now = Date.now();

  if (b.action === "post") {
    const g = await env.DB.prepare("SELECT id, course_id, name FROM course_groups WHERE id=?").bind(String(b.groupId || "")).first();
    if (!g) return json({ error: "not found" }, 404);
    const { user, teach, error } = await courseAccess(env, request, g.course_id, "member");
    if (error) return error;
    const inGroup = !!(await env.DB.prepare("SELECT 1 AS x FROM group_members WHERE group_id=? AND user_id=?").bind(g.id, user.id).first());
    if (!inGroup && !teach) return json({ error: "forbidden" }, 403);
    const s = await getSettings(env, g.course_id);
    if (!s.forums_enabled || s.forum_locked) return json({ error: "Group boards are closed in this course right now." }, 403);
    if (await isMuted(env, g.course_id, user.id)) return json({ error: "Your teacher has paused your posting in this course." }, 403);
    const body = cleanText(b.body, 2000);
    if (!body) return json({ error: "Write something first." }, 400);
    if (s.filter_enabled) { const f = filterText(body); if (f) return json({ error: f }, 400); }
    await env.DB.prepare("INSERT INTO group_posts (id, group_id, user_id, body, created_at) VALUES (?,?,?,?,?)").bind(newId(), g.id, user.id, body, now).run();
    await logEvent(env, user, "group_post", g.id, null, { targetType: "group" });
    return json({ ok: true });
  }

  if (b.action === "group_mode") {
    const a = await env.DB.prepare("SELECT id, course_id FROM assignments WHERE id=?").bind(String(b.assignmentId || "")).first().catch(() => null);
    if (!a) return json({ error: "assignment not found" }, 404);
    const { user, error } = await courseAccess(env, request, a.course_id, "teacher");
    if (error) return error;
    const subs = await env.DB.prepare("SELECT COUNT(*) AS n FROM submissions WHERE assignment_id=?").bind(a.id).first();
    if (subs && subs.n) return json({ error: "Learners have already submitted, so this can't switch between individual and group work." }, 409);
    if (b.on) await env.DB.prepare("INSERT OR IGNORE INTO group_assignments (assignment_id, course_id, set_by, set_at) VALUES (?,?,?,?)").bind(a.id, a.course_id, user.id, now).run();
    else await env.DB.prepare("DELETE FROM group_assignments WHERE assignment_id=?").bind(a.id).run();
    await logEvent(env, user, "group_mode_set", a.id, b.on ? "on" : "off", { targetType: "assignment" });
    return json({ ok: true });
  }

  let courseId = b.courseId;
  let g = null;
  if (b.groupId) {
    g = await env.DB.prepare("SELECT id, course_id, name FROM course_groups WHERE id=?").bind(String(b.groupId)).first();
    if (!g) return json({ error: "not found" }, 404);
    courseId = g.course_id;
  }
  const { user, error } = await courseAccess(env, request, courseId, "teacher");
  if (error) return error;

  if (b.action === "create") {
    const name = cleanText(b.name, 80);
    if (!name) return json({ error: "Name the group." }, 400);
    const id = newId();
    await env.DB.prepare("INSERT INTO course_groups (id, course_id, name, created_by, created_at) VALUES (?,?,?,?,?)").bind(id, courseId, name, user.id, now).run();
    await logEvent(env, user, "group_created", id, name, { targetType: "group" });
    return json({ ok: true, id });
  }
  if (b.action === "auto") {
    const size = Math.max(2, Math.min(20, Math.round(Number(b.size) || 4)));
    const placed = new Set(((await env.DB.prepare("SELECT user_id FROM group_members WHERE course_id=?").bind(courseId).all()).results || []).map((r) => r.user_id));
    const pool = (await learnersOf(env, courseId)).filter((l) => !placed.has(l.id));
    if (pool.length < 2) return json({ error: "Everyone is already in a group (or there's only one learner left)." }, 400);
    const order = shuffled(pool.length, cryptoRand).map((i) => pool[i]);
    const count = Math.max(1, Math.round(order.length / size));
    const existing = ((await env.DB.prepare("SELECT COUNT(*) AS n FROM course_groups WHERE course_id=?").bind(courseId).first()) || {}).n || 0;
    const ids = [];
    for (let i = 0; i < count; i++) {
      const id = newId(); ids.push(id);
      await env.DB.prepare("INSERT INTO course_groups (id, course_id, name, created_by, created_at) VALUES (?,?,?,?,?)").bind(id, courseId, `Group ${existing + i + 1}`, user.id, now).run();
    }
    for (let i = 0; i < order.length; i++) {
      await env.DB.prepare("INSERT OR IGNORE INTO group_members (group_id, course_id, user_id, added_at) VALUES (?,?,?,?)").bind(ids[i % count], courseId, order[i].id, now).run();
    }
    await logEvent(env, user, "groups_auto", courseId, `${order.length} learners into ${count} groups`, { targetType: "course" });
    return json({ ok: true, groups: count, learners: order.length });
  }
  if (!g) return json({ error: "groupId required" }, 400);
  if (b.action === "rename") {
    const name = cleanText(b.name, 80);
    if (!name) return json({ error: "Name the group." }, 400);
    await env.DB.prepare("UPDATE course_groups SET name=? WHERE id=?").bind(name, g.id).run();
    return json({ ok: true });
  }
  if (b.action === "delete") {
    await env.DB.prepare("DELETE FROM group_posts WHERE group_id=?").bind(g.id).run();
    await env.DB.prepare("DELETE FROM group_members WHERE group_id=?").bind(g.id).run();
    await env.DB.prepare("DELETE FROM course_groups WHERE id=?").bind(g.id).run();
    await logEvent(env, user, "group_deleted", g.id, g.name, { targetType: "group" });
    return json({ ok: true });
  }
  if (b.action === "members") {
    const want = [...new Set((Array.isArray(b.userIds) ? b.userIds : []).map((x) => String(x).slice(0, 64)))].slice(0, 200);
    const enrolled = new Set((await learnersOf(env, courseId)).map((l) => l.id));
    const bad = want.filter((id) => !enrolled.has(id));
    if (bad.length) return json({ error: "Only learners enrolled in this course can join its groups." }, 400);
    await env.DB.prepare("DELETE FROM group_members WHERE group_id=?").bind(g.id).run();
    // A learner moves here from any other group in this course.
    for (const id of want) {
      await env.DB.prepare("DELETE FROM group_members WHERE course_id=? AND user_id=?").bind(courseId, id).run();
      await env.DB.prepare("INSERT INTO group_members (group_id, course_id, user_id, added_at) VALUES (?,?,?,?)").bind(g.id, courseId, id, now).run();
    }
    await logEvent(env, user, "group_members_set", g.id, `${want.length} members`, { targetType: "group" });
    if (want.length) await notify(env, want, { kind: "announcement", courseId, title: `You're in ${g.name}`, url: `/course-tools?course=${courseId}#groups`, dedupe: `group:${g.id}:${now}` });
    return json({ ok: true });
  }
  return json({ error: "unknown action" }, 400);
}
