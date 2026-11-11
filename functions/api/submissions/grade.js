import { json, getUser, logEvent, parseBody } from "../_lib.js";
import { notify } from "../_notify.js";
import { rubricForAssignment, scoreRubric } from "../rubrics.js";
import { dueFor, latePenaltyPct } from "../course-policies.js";

async function ownsCourse(env, user, courseId) {
  if (user.role === "admin") return true;
  if (user.role !== "teacher") return false;
  const r = await env.DB.prepare("SELECT 1 FROM course_teachers WHERE user_id=? AND course_id=?").bind(user.id, courseId).first();
  return !!r;
}

// POST /api/submissions/grade { submissionId, grade, feedback, rubricScores?, applyLatePenalty? }
// -> the course's teacher (via course_teachers) or admin. grade is clamped to [0, assignment.points].
// C4: with rubricScores ({ criterionId: { points, comment? } }) and a rubric attached to the
// assignment, the grade is the rubric total scaled to the assignment's points. With
// applyLatePenalty, the course late policy's deduction is taken off. The audit row records
// the grade before and after (plan Part D.7).
export async function onRequestPost({ request, env }) {
  const user = await getUser(env, request);
  if (!user || (user.role !== "teacher" && user.role !== "admin")) return json({ error: "forbidden" }, 403);
  const { body: b, error } = await parseBody(request);
  if (error) return error;
  if (!b.submissionId) return json({ error: "submissionId required" }, 400);

  const sub = await env.DB.prepare(
    "SELECT s.assignment_id, s.user_id, s.grade AS old_grade, s.status AS old_status, s.submitted_at, s.updated_at, a.course_id, a.points, a.title, a.due_at FROM submissions s JOIN assignments a ON a.id=s.assignment_id WHERE s.id=?"
  ).bind(b.submissionId).first();
  if (!sub) return json({ error: "not found" }, 404);
  if (!(await ownsCourse(env, user, sub.course_id))) return json({ error: "forbidden" }, 403);

  let raw, rubric = null, scored = null;
  if (b.rubricScores) {
    rubric = await rubricForAssignment(env, sub.assignment_id);
    if (!rubric) return json({ error: "No rubric is attached to this assignment." }, 400);
    scored = scoreRubric(rubric.criteria, b.rubricScores);
    if (typeof scored === "string") return json({ error: scored }, 400);
    raw = scored.total ? Math.round((scored.raw / scored.total) * sub.points) : 0;
  } else {
    const n = Number(b.grade);
    if (!Number.isFinite(n)) return json({ error: "grade required" }, 400);
    raw = Math.round(n);
  }
  raw = Math.max(0, Math.min(sub.points, raw));
  let penaltyPct = 0;
  if (b.applyLatePenalty) {
    const due = await dueFor(env, { due_at: sub.due_at }, sub.assignment_id, sub.user_id);
    penaltyPct = latePenaltyPct(due, sub.updated_at || sub.submitted_at);
  }
  const grade = Math.max(0, Math.round(raw * (100 - penaltyPct) / 100));
  const feedback = String(b.feedback || "").trim().slice(0, 4000);
  const now = Date.now();
  await env.DB.prepare(
    "UPDATE submissions SET grade=?, feedback=?, graded_by=?, graded_at=?, status='graded' WHERE id=?"
  ).bind(grade, feedback, user.id, now, b.submissionId).run();
  if (rubric || penaltyPct || b.applyLatePenalty != null) {
    await rubricForAssignment(env, sub.assignment_id); // ensures the grading tables exist
    await env.DB.prepare("INSERT INTO submission_grading (submission_id, rubric_id, rubric_scores, raw_grade, penalty_pct, graded_by, updated_at) VALUES (?,?,?,?,?,?,?) " +
      "ON CONFLICT(submission_id) DO UPDATE SET rubric_id=excluded.rubric_id, rubric_scores=excluded.rubric_scores, raw_grade=excluded.raw_grade, penalty_pct=excluded.penalty_pct, graded_by=excluded.graded_by, updated_at=excluded.updated_at")
      .bind(b.submissionId, rubric ? rubric.id : null, scored ? JSON.stringify(scored.scores) : null, raw, penaltyPct, user.id, now).run();
  }
  await logEvent(env, user, "submission_graded", b.submissionId, String(grade), {
    subject: sub.user_id, targetType: "submission",
    before: { grade: sub.old_grade ?? null, status: sub.old_status }, after: { grade, raw, penaltyPct, rubric: rubric ? rubric.id : null },
  });
  await notify(env, [sub.user_id], { kind: "graded", courseId: sub.course_id, title: `Graded: ${sub.title}`, body: `${grade}/${sub.points}`, url: `/course/${sub.course_id}` });
  return json({ ok: true, grade, raw, penaltyPct });
}
