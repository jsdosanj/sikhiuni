import { json } from "./_lib.js";
import { courseAccess } from "./_course-auth.js";
import { courseOutline } from "./_course-store.js";
import { ensurePolicies } from "./course-policies.js";
import { ensureQuizzes } from "./lms-quizzes.js";

// C6 teacher analytics (Canvas New Analytics, Moodle reports), from data the platform
// already holds. Teachers of the course (and admins) only; a learner never sees another
// learner's data (plan Part D.6). Nothing here is a grade, credit or ranking.
//
// GET /api/analytics?courseId=  ->
//   summary:     enrolled, active in 7/30 days, lesson completion, course-quiz pass rate
//   lessons:     how many learners finished each lesson (where to look for drop-off)
//   assignments: submitted / graded / missing-after-due / average grade
//   quizzes:     attempts, average best %, hardest questions
//   at_risk:     learners with signals worth a check-in, each with its reasons

const DAY = 24 * 60 * 60 * 1000;
const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);

export async function onRequestGet({ request, env }) {
  const courseId = new URL(request.url).searchParams.get("courseId");
  const { error } = await courseAccess(env, request, courseId, "teacher");
  if (error) return error;
  const now = Date.now();

  let lessonCount = null;
  try {
    const c = env.MEDIA ? (await courseOutline(env.MEDIA)).courses.find((x) => x.id === courseId) : null;
    if (c) lessonCount = (Array.isArray(c.lessons) && c.lessons.length) || c.nLessons || null; // the outline lists lesson titles
  } catch { lessonCount = null; }

  const learners = (await env.DB.prepare(
    "SELECT u.id, u.name, u.email, e.created_at AS enrolled_at, p.done, p.passed_score, p.updated_at AS last_progress " +
    "FROM enrollments e JOIN users u ON u.id=e.user_id LEFT JOIN progress p ON p.user_id=e.user_id AND p.course_id=e.target_id " +
    "WHERE e.kind='course' AND e.target_id=? LIMIT 5000").bind(courseId).all()).results || [];
  const doneOf = (l) => { try { return l.done ? JSON.parse(l.done) : []; } catch { return []; } };

  const perLesson = {};
  let completedAll = 0, passed = 0, active7 = 0, active30 = 0;
  for (const l of learners) {
    const d = doneOf(l);
    for (const i of d) perLesson[i] = (perLesson[i] || 0) + 1;
    if (lessonCount && d.length >= lessonCount) completedAll++;
    if (l.passed_score != null) passed++;
    if (l.last_progress && now - l.last_progress < 7 * DAY) active7++;
    if (l.last_progress && now - l.last_progress < 30 * DAY) active30++;
  }
  const lessonIdx = Object.keys(perLesson).map(Number);
  const maxIdx = Math.max(lessonCount ? lessonCount - 1 : -1, ...(lessonIdx.length ? lessonIdx : [-1]));
  const lessons = maxIdx >= 0 ? Array.from({ length: maxIdx + 1 }, (_, i) => ({ lesson: i + 1, completed: perLesson[i] || 0, percent: pct(perLesson[i] || 0, learners.length) })) : [];

  await ensurePolicies(env);
  const assignmentRows = (await env.DB.prepare(
    "SELECT a.id, a.title, a.due_at, a.points, (SELECT COUNT(*) FROM submissions s WHERE s.assignment_id=a.id) AS submitted, " +
    "(SELECT COUNT(*) FROM submissions s WHERE s.assignment_id=a.id AND s.status='graded') AS graded, " +
    "(SELECT AVG(s.grade * 100.0 / a.points) FROM submissions s WHERE s.assignment_id=a.id AND s.status='graded') AS avg_pct " +
    "FROM assignments a WHERE a.course_id=? AND a.status<>'draft' ORDER BY a.due_at IS NULL, a.due_at").bind(courseId).all().catch(() => ({ results: [] }))).results || [];
  // Who is missing what (extensions respected).
  const subs = (await env.DB.prepare("SELECT s.assignment_id, s.user_id FROM submissions s JOIN assignments a ON a.id=s.assignment_id WHERE a.course_id=?").bind(courseId).all().catch(() => ({ results: [] }))).results || [];
  const submitted = new Set(subs.map((s) => `${s.assignment_id}:${s.user_id}`));
  const ext = Object.fromEntries((((await env.DB.prepare("SELECT x.assignment_id, x.user_id, x.due_at FROM assignment_extensions x JOIN assignments a ON a.id=x.assignment_id WHERE a.course_id=?").bind(courseId).all()).results) || []).map((x) => [`${x.assignment_id}:${x.user_id}`, x.due_at]));
  const missingBy = {};
  const assignments = assignmentRows.map((a) => {
    let missing = 0;
    for (const l of learners) {
      const k = `${a.id}:${l.id}`, due = ext[k] || a.due_at;
      if (due && due < now && !submitted.has(k)) { missing++; (missingBy[l.id] = missingBy[l.id] || []).push(a.title); }
    }
    return { id: a.id, title: a.title, due_at: a.due_at, submitted: a.submitted, graded: a.graded, missing, average_percent: a.avg_pct == null ? null : Math.round(a.avg_pct * 10) / 10 };
  });

  await ensureQuizzes(env);
  const quizRows = (await env.DB.prepare("SELECT id, title FROM lms_quizzes WHERE course_id=? AND status<>'draft'").bind(courseId).all()).results || [];
  const attempts = (await env.DB.prepare("SELECT quiz_id, user_id, score, max_score, results FROM lms_quiz_attempts WHERE course_id=? AND status='submitted'").bind(courseId).all()).results || [];
  const qText = Object.fromEntries((((await env.DB.prepare("SELECT q.id, q.prompt FROM lms_quiz_questions q JOIN lms_quizzes z ON z.id=q.quiz_id WHERE z.course_id=?").bind(courseId).all()).results) || []).map((q) => [q.id, q.prompt]));
  const quizBest = {};
  const quizzes = quizRows.map((q) => {
    const best = {}, items = {};
    for (const a of attempts.filter((x) => x.quiz_id === q.id)) {
      const p = a.max_score ? (a.score / a.max_score) * 100 : 0;
      best[a.user_id] = Math.max(best[a.user_id] ?? 0, p);
      for (const [qid, g] of Object.entries(JSON.parse(a.results || "{}"))) { items[qid] = items[qid] || { e: 0, m: 0 }; items[qid].e += g.earned; items[qid].m += g.max; }
    }
    for (const [u, p] of Object.entries(best)) (quizBest[u] = quizBest[u] || []).push(p);
    const vals = Object.values(best);
    const hardest = Object.entries(items).filter(([, s]) => s.m).map(([qid, s]) => ({ prompt: qText[qid] || "(removed)", percent: pct(s.e, s.m) }))
      .sort((x, y) => x.percent - y.percent).slice(0, 3);
    return { id: q.id, title: q.title, learners: vals.length, average_best: vals.length ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10 : null, hardest };
  });

  // At-risk signals: worth a friendly check-in, never shown to other learners.
  const at_risk = [];
  for (const l of learners) {
    const reasons = [];
    const enrolledFor = now - (l.enrolled_at || now);
    if (!l.last_progress && enrolledFor > 7 * DAY) reasons.push("hasn't started");
    else if (l.last_progress && now - l.last_progress > 14 * DAY) reasons.push(`no activity for ${Math.floor((now - l.last_progress) / DAY)} days`);
    if (missingBy[l.id]) reasons.push(`missing ${missingBy[l.id].length} assignment${missingBy[l.id].length === 1 ? "" : "s"}`);
    const qb = quizBest[l.id];
    if (qb && qb.length && qb.reduce((s, v) => s + v, 0) / qb.length < 50) reasons.push("quiz scores under 50%");
    if (reasons.length) at_risk.push({ id: l.id, name: l.name || l.email, lessons_done: doneOf(l).length, reasons });
  }

  return json({
    summary: {
      enrolled: learners.length, active_7d: active7, active_30d: active30, lesson_count: lessonCount,
      completed_all: lessonCount ? completedAll : null, completion_percent: lessonCount ? pct(completedAll, learners.length) : null,
      quiz_passed: passed, quiz_pass_percent: pct(passed, learners.length),
    },
    lessons, assignments, quizzes, at_risk: at_risk.slice(0, 500),
  });
}
