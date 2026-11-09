import { json, getUser, logEvent, parseBody } from "./_lib.js";
import programsData from "../../site/assets/data/programs.json";

// Program exam passes live in `progress` under course_id = <program id> (see program-exam.js).
// They are flagged so UIs can keep them out of course enrolment / completion tallies.
const PROGRAM_IDS = new Set(programsData.programs.map((p) => p.id));

// course_teachers maps a teacher to the courses they teach (admin-assigned).
// grade_overrides lets a teacher/admin set a final score that wins over the
// computed quiz score. Both auto-create so no manual migration is needed.
async function ensure(env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS course_teachers (course_id TEXT NOT NULL, user_id TEXT NOT NULL, assigned_at INTEGER NOT NULL, PRIMARY KEY (course_id, user_id))"
  ).run();
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS grade_overrides (user_id TEXT NOT NULL, course_id TEXT NOT NULL, score INTEGER, reason TEXT, overridden_by TEXT, overridden_at INTEGER NOT NULL, PRIMARY KEY (user_id, course_id))"
  ).run();
}

async function assignedCourseIds(env, userId) {
  const { results } = await env.DB.prepare("SELECT course_id FROM course_teachers WHERE user_id=?").bind(userId).all();
  return (results || []).map((r) => r.course_id);
}

// GET /api/gradebook[?course=ID][&format=csv]
// Teacher: only their assigned courses. Admin: all courses with enrolments.
// The roster spine is the progress table (a progress row = an enrolment).
export async function onRequestGet({ request, env }) {
  const user = await getUser(env, request);
  if (!user || (user.role !== "teacher" && user.role !== "admin")) return json({ error: "forbidden" }, 403);
  await ensure(env);

  const url = new URL(request.url);
  const course = url.searchParams.get("course");
  const isAdmin = user.role === "admin";
  let scopeIds = null;
  if (!isAdmin) {
    scopeIds = await assignedCourseIds(env, user.id);
    if (course && !scopeIds.includes(course)) return json({ error: "forbidden" }, 403);
    if (!scopeIds.length) return json({ scope: "teacher", courses: [], rows: [] });
  }

  let sql =
    "SELECT p.course_id, p.user_id, u.email, u.name, p.done, p.passed_score, p.updated_at, " +
    "o.score AS override_score, o.reason AS override_reason " +
    "FROM progress p JOIN users u ON u.id=p.user_id " +
    "LEFT JOIN grade_overrides o ON o.user_id=p.user_id AND o.course_id=p.course_id";
  const binds = [];
  const where = [];
  if (course) { where.push("p.course_id=?"); binds.push(course); }
  if (!isAdmin) { where.push("p.course_id IN (" + scopeIds.map(() => "?").join(",") + ")"); binds.push(...scopeIds); }
  if (where.length) sql += " WHERE " + where.join(" AND ");
  sql += " ORDER BY p.course_id, u.email";

  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  const rows = (results || []).map((r) => {
    let done = 0;
    try { const a = JSON.parse(r.done || "[]"); done = Array.isArray(a) ? a.length : 0; } catch (e) {}
    const eff = (r.override_score != null) ? r.override_score : r.passed_score;
    return {
      program: PROGRAM_IDS.has(r.course_id), // a passed program exam, not a course enrolment
      course_id: r.course_id, user_id: r.user_id, email: r.email, name: r.name,
      done, score: eff, raw: r.passed_score, override: r.override_score != null,
      reason: r.override_reason || null, last_active: r.updated_at,
    };
  });
  const courses = isAdmin ? Array.from(new Set(rows.filter((r) => !r.program).map((r) => r.course_id))) : scopeIds;

  if (url.searchParams.get("format") === "csv") {
    const head = ["kind", "course_id", "student", "email", "completed_lessons", "score", "passed", "overridden", "last_active"];
    // Neutralise spreadsheet formula injection: a cell like =HYPERLINK(...) in a
    // learner-set name executes when the CSV is opened in Excel/Sheets. Prefix any
    // value starting with a formula trigger with a single quote.
    const csvCell = (c) => {
      let s = String(c);
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return `"${s.replace(/"/g, '""')}"`;
    };
    const lines = [head.join(",")];
    rows.forEach((r) => {
      const passed = (r.score != null && r.score >= 80) ? "yes" : "no";
      const cells = [r.program ? "program" : "course", r.course_id, r.name || "", r.email || "", r.done, r.score == null ? "" : r.score, passed, r.override ? "yes" : "no", new Date(r.last_active).toISOString()];
      lines.push(cells.map(csvCell).join(","));
    });
    return new Response(lines.join("\n"), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=gradebook.csv" } });
  }
  return json({ scope: isAdmin ? "admin" : "teacher", courses, rows });
}

// POST /api/gradebook { courseId, userId, score, reason }
// Set (or clear, when score is null/"") a grade override. Teacher must own the course.
export async function onRequestPost({ request, env }) {
  const user = await getUser(env, request);
  if (!user || (user.role !== "teacher" && user.role !== "admin")) return json({ error: "forbidden" }, 403);
  await ensure(env);
  const { body: b, error } = await parseBody(request);
  if (error) return error;
  if (!b.courseId || !b.userId) return json({ error: "courseId and userId required" }, 400);
  if (user.role !== "admin") {
    const ids = await assignedCourseIds(env, user.id);
    if (!ids.includes(b.courseId)) return json({ error: "forbidden" }, 403);
  }

  if (b.score == null || b.score === "") {
    await env.DB.prepare("DELETE FROM grade_overrides WHERE user_id=? AND course_id=?").bind(b.userId, b.courseId).run();
    await logEvent(env, user, "grade_override_clear", b.courseId + "/" + b.userId, null);
    return json({ ok: true, cleared: true });
  }
  const n = Number(b.score);
  if (!Number.isFinite(n)) return json({ error: "invalid score" }, 400);
  const score = Math.max(0, Math.min(100, Math.round(n)));
  await env.DB.prepare(
    "INSERT INTO grade_overrides (user_id, course_id, score, reason, overridden_by, overridden_at) VALUES (?,?,?,?,?,?) " +
    "ON CONFLICT(user_id, course_id) DO UPDATE SET score=excluded.score, reason=excluded.reason, overridden_by=excluded.overridden_by, overridden_at=excluded.overridden_at"
  ).bind(b.userId, b.courseId, score, (b.reason || "").slice(0, 500), user.id, Date.now()).run();
  await logEvent(env, user, "grade_override", b.courseId + "/" + b.userId, "score=" + score);
  return json({ ok: true, score });
}
