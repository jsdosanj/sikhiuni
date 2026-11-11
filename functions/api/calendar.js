import { json, getUser } from "./_lib.js";
import { ensurePolicies } from "./course-policies.js";
import { ensurePolls } from "./polls.js";

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
  await ensurePolicies(env);
  await ensurePolls(env);
  const sp = new URL(request.url).searchParams;
  const now = Date.now();
  const from = Number(sp.get("from")) || now - 30 * DAY;
  const to = Number(sp.get("to")) || now + 120 * DAY;

  const teaching = user.role === "admin" ? [] :
    ((await env.DB.prepare("SELECT course_id FROM course_teachers WHERE user_id=?").bind(user.id).all()).results || []).map((r) => r.course_id);
  const enrolled = ((await env.DB.prepare("SELECT target_id FROM enrollments WHERE user_id=? AND kind='course'").bind(user.id).all().catch(() => ({ results: [] }))).results || [])
    .map((r) => r.target_id).filter((c) => !teaching.includes(c));
  const all = teaching.concat(enrolled);
  if (!all.length) return json({ events: [], todo: [] });
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

  events.sort((x, y) => x.at - y.at);
  todo.sort((x, y) => (x.at || Infinity) - (y.at || Infinity));
  return json({ events, todo: todo.slice(0, 100) });
}
