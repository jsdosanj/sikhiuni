import { json, getUser, logEvent, parseBody } from "../_lib.js";
import { notify } from "../_notify.js";

async function ownsCourse(env, user, courseId) {
  if (user.role === "admin") return true;
  if (user.role !== "teacher") return false;
  const r = await env.DB.prepare("SELECT 1 FROM course_teachers WHERE user_id=? AND course_id=?").bind(user.id, courseId).first();
  return !!r;
}

// POST /api/submissions/grade { submissionId, grade, feedback } -> the course's
// teacher (via course_teachers) or admin. grade is clamped to [0, assignment.points].
export async function onRequestPost({ request, env }) {
  const user = await getUser(env, request);
  if (!user || (user.role !== "teacher" && user.role !== "admin")) return json({ error: "forbidden" }, 403);
  const { body: b, error } = await parseBody(request);
  if (error) return error;
  if (!b.submissionId) return json({ error: "submissionId required" }, 400);

  const sub = await env.DB.prepare(
    "SELECT s.assignment_id, s.user_id, a.course_id, a.points, a.title FROM submissions s JOIN assignments a ON a.id=s.assignment_id WHERE s.id=?"
  ).bind(b.submissionId).first();
  if (!sub) return json({ error: "not found" }, 404);
  if (!(await ownsCourse(env, user, sub.course_id))) return json({ error: "forbidden" }, 403);

  const n = Number(b.grade);
  if (!Number.isFinite(n)) return json({ error: "grade required" }, 400);
  const grade = Math.max(0, Math.min(sub.points, Math.round(n)));
  const feedback = String(b.feedback || "").trim().slice(0, 4000);
  const now = Date.now();
  await env.DB.prepare(
    "UPDATE submissions SET grade=?, feedback=?, graded_by=?, graded_at=?, status='graded' WHERE id=?"
  ).bind(grade, feedback, user.id, now, b.submissionId).run();
  await logEvent(env, user, "submission_graded", b.submissionId, String(grade));
  await notify(env, [sub.user_id], { kind: "graded", courseId: sub.course_id, title: `Graded: ${sub.title}`, body: `${grade}/${sub.points}`, url: `/course/${sub.course_id}` });
  return json({ ok: true, grade });
}
