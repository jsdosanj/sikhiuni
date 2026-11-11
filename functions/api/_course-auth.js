// One authorisation helper for every LMS endpoint (plan Part D.1). Before this,
// each handler copied its own "owns the course" / "is enrolled" check, so they
// could drift apart. New LMS endpoints MUST use courseAccess(); every refusal is
// written to the audit log as authz_denied (throttled, see logDenied in _lib.js).
import { json, getUser, logDenied } from "./_lib.js";

/** Teacher of this course (course_teachers row) or an admin. */
export async function canTeach(env, user, courseId) {
  if (!user || !courseId) return false;
  if (user.role === "admin") return true;
  const r = await env.DB.prepare("SELECT 1 AS x FROM course_teachers WHERE user_id=? AND course_id=?").bind(user.id, courseId).first();
  return !!r;
}

/** Explicitly enrolled in this course (the enrolments table; cohort joins also write it). */
export async function isEnrolled(env, user, courseId) {
  if (!user || !courseId) return false;
  try {
    const r = await env.DB.prepare("SELECT 1 AS x FROM enrollments WHERE user_id=? AND kind='course' AND target_id=?").bind(user.id, courseId).first();
    return !!r;
  } catch { return false; }
}

/** Course id shape guard (same rule as /api/progress). */
export const validCourseId = (id) => typeof id === "string" && /^[a-zA-Z0-9_-]{1,120}$/.test(id);

/**
 * Resolve the caller's access to a course.
 *   need: "member"  -> teacher/admin OR enrolled learner
 *         "teacher" -> teacher of the course or admin
 *         "user"    -> any signed-in user (still validates courseId)
 * Returns { user, teach, enrolled } or { error: Response }.
 */
export async function courseAccess(env, request, courseId, need = "member") {
  const user = await getUser(env, request);
  if (!user) return { error: json({ error: "Please sign in." }, 401) };
  if (!validCourseId(courseId)) return { error: json({ error: "valid courseId required" }, 400) };
  const teach = await canTeach(env, user, courseId);
  const enrolled = teach ? false : await isEnrolled(env, user, courseId);
  const ok = need === "user" || (need === "teacher" ? teach : teach || enrolled);
  if (!ok) {
    await logDenied(env, user, request, `course:${courseId}:${need}`);
    return { error: json({ error: "forbidden" }, 403) };
  }
  return { user, teach, enrolled };
}

/** Plain-text field: trimmed, length-capped, control characters removed (keeps newlines/tabs). */
export function cleanText(v, max) {
  return String(v == null ? "" : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
}
