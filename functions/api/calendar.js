import { json, getUser } from "./_lib.js";
import { ensurePolicies } from "./course-policies.js";
import { ensurePolls } from "./polls.js";
import { courseRules, learnerProgress, lockReason } from "./release-rules.js";

// C1 Calendar + To-Do (Canvas Calendar / To-Do list, Moodle Timeline).
// One read-only feed across every course the caller teaches or is enrolled in:
//   learner: assignment due dates (their own, extensions applied) and poll closing dates;
//            todo = unsubmitted assignments + open polls they haven't answered.
//   teacher: the same dates for their courses; todo = submissions waiting to be graded.
// GET /api/calendar?from=&to=   (ms; default: 30 days back .. 120 days ahead)

const DAY = 24 * 60 * 60 * 1000;

export async function onRequestGet({ request, env }) {
  const user = await getUser(env, request);
  if (!user) return json({ error: "Please sign in." }, 401);
  const sp = new URL(request.url).searchParams;
  const now = Date.now();
  return json(await calendarFor(env, user, Number(sp.get("from")) || now - 30 * DAY, Number(sp.get("to")) || now + 120 * DAY));
}

/** { events, todo } for one user (also used by the private iCal feed, calendar-feed.js). */
export async function calendarFor(env, user, from, to) {
  await ensurePolicies(env);
  await ensurePolls(env);
  const now = Date.now();

  const teaching = user.role === "admin" ? [] :
    ((await env.DB.prepare("SELECT course_id FROM course_teachers WHERE user_id=?").bind(user.id).all()).results || []).map((r) => r.course_id);
  const enrolled = ((await env.DB.prepare("SELECT target_id FROM enrollments WHERE user_id=? AND kind='course'").bind(user.id).all().catch(() => ({ results: [] }))).results || [])
    .map((r) => r.target_id).filter((c) => !teaching.includes(c));
  const all = teaching.concat(enrolled);
  if (!all.length) return { events: [], todo: [] };
  const ph = (a) => a.map(() => "?").join(",");

  const events = [];
  const todo = [];
  const assignments = (await env.DB.prepare(
    `SELECT a.id, a.course_id, a.title, a.due_at, s.status AS my_status FROM assignments a ` +
    `LEFT JOIN submissions s ON s.assignment_id=a.id AND s.user_id=? WHERE a.course_id IN (${ph(all)}) AND a.status != 'draft'`
  ).bind(user.id, ...all).all().catch(() => ({ results: [] }))).results || [];

  // One query for this learner's extensions instead of one per assignment.
  const ext = Object.fromEntries((((await env.DB.prepare("SELECT assignment_id, due_at FROM assignment_extensions WHERE user_id=?").bind(user.id).all()).results) || []).map((r) => [r.assignment_id, r.due_at]));
  for (const a of assignments) {
    const teach = teaching.includes(a.course_id);
    const due = !teach && ext[a.id] ? { dueAt: ext[a.id], extended: true } : { dueAt: a.due_at, extended: false };
    if (due.dueAt && due.dueAt >= from && due.dueAt <= to) {
      events.push({ type: "assignment", id: a.id, course_id: a.course_id, title: a.title, at: due.dueAt, extended: !!due.extended, done: !teach && !!a.my_status });
    }
    if (!teach && !a.my_status) todo.push({ type: "assignment", id: a.id, course_id: a.course_id, title: a.title, at: due.dueAt || null, overdue: !!(due.dueAt && due.dueAt < now) });
  }

  if (teaching.length) {
    const { results } = await env.DB.prepare(
      `SELECT a.id, a.course_id, a.title, COUNT(s.id) AS n FROM assignments a JOIN submissions s ON s.assignment_id=a.id AND s.status='submitted' ` +
      `WHERE a.course_id IN (${ph(teaching)}) GROUP BY a.id`
    ).bind(...teaching).all().catch(() => ({ results: [] }));
    for (const r of results || []) todo.push({ type: "grade", id: r.id, course_id: r.course_id, title: r.title, count: r.n });
  }

  const polls = (await env.DB.prepare(
    `SELECT p.id, p.course_id, p.title, p.kind, p.status, p.closes_at, EXISTS(SELECT 1 FROM poll_participants x WHERE x.poll_id=p.id AND x.user_id=?) AS answered ` +
    `FROM polls p WHERE p.course_id IN (${ph(all)}) AND p.status='open'`
  ).bind(user.id, ...all).all()).results || [];
  for (const p of polls) {
    const teach = teaching.includes(p.course_id);
    if (p.closes_at && p.closes_at >= from && p.closes_at <= to) events.push({ type: "poll", id: p.id, course_id: p.course_id, title: p.title, kind: p.kind, at: p.closes_at, done: !teach && !!p.answered });
    if (!teach && !p.answered && !(p.closes_at && p.closes_at < now)) todo.push({ type: "poll", id: p.id, course_id: p.course_id, title: p.title, kind: p.kind, at: p.closes_at || null });
  }

  // C3: items still locked by a release rule stay off the learner's to-do list.
  const lockCache = new Map();
  const isLocked = async (type, it) => {
    if (teaching.includes(it.course_id)) return false;
    if (!lockCache.has(it.course_id)) lockCache.set(it.course_id, { rules: await courseRules(env, it.course_id), progress: await learnerProgress(env, user.id, it.course_id) });
    const c = lockCache.get(it.course_id);
    return !!lockReason(c.rules[`${type}:${it.id}`], c.progress, now);
  };
  const kept = [];
  for (const it of todo) if (it.type === "grade" || !(await isLocked(it.type, it))) kept.push(it);
  todo.length = 0; todo.push(...kept);
  events.sort((x, y) => x.at - y.at);
  todo.sort((x, y) => (x.at || Infinity) - (y.at || Infinity));
  return { events, todo: todo.slice(0, 100) };
}
