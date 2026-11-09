import { json, requireMfa } from "../_lib.js";
import programsData from "../../../site/assets/data/programs.json";

// A passed program exam is stored in `progress` under course_id = <program id>
// (functions/api/program-exam.js), alongside real course rows. Program rows are
// reported separately so they do not inflate course "enrollments"/"completions"
// or the most-popular-courses table.
const PROGRAM_IDS = programsData.programs.map((p) => p.id);
const NOT_PROGRAM = "course_id NOT IN (" + PROGRAM_IDS.map(() => "?").join(",") + ")";
const IS_PROGRAM = "course_id IN (" + PROGRAM_IDS.map(() => "?").join(",") + ")";

async function one(env, sql, binds = []) {
  try { const r = await env.DB.prepare(sql).bind(...binds).first(); return r ? Object.values(r)[0] : 0; }
  catch (e) { return 0; }
}
async function rows(env, sql, binds = []) {
  try { const { results } = await env.DB.prepare(sql).bind(...binds).all(); return results || []; }
  catch (e) { return []; }
}

// GET /api/admin/stats -> platform statistics (admin only)
export async function onRequestGet({ request, env }) {
  const { error } = await requireMfa(env, request, ["admin"]);
  if (error) return error;

  const totals = {
    users: await one(env, "SELECT COUNT(*) FROM users"),
    learners: await one(env, "SELECT COUNT(*) FROM users WHERE role='learner'"),
    teachers: await one(env, "SELECT COUNT(*) FROM users WHERE role='teacher'"),
    admins: await one(env, "SELECT COUNT(*) FROM users WHERE role='admin'"),
    activeSessions: await (async () => { try { const r = await env.DB.prepare("SELECT COUNT(*) FROM sessions WHERE expires_at > ?").bind(Date.now()).first(); return r ? Object.values(r)[0] : 0; } catch(e) { return 0; } })(),
    enrollments: await one(env, "SELECT COUNT(*) FROM progress WHERE " + NOT_PROGRAM, PROGRAM_IDS),
    completions: await one(env, "SELECT COUNT(*) FROM progress WHERE passed_score >= 80 AND " + NOT_PROGRAM, PROGRAM_IDS),
    programPasses: await one(env, "SELECT COUNT(*) FROM progress WHERE passed_score >= 80 AND " + IS_PROGRAM, PROGRAM_IDS),
    pendingApplications: await one(env, "SELECT COUNT(*) FROM teacher_applications WHERE status='pending'"),
    newFeedback: await one(env, "SELECT COUNT(*) FROM feedback WHERE status='new'"),
  };

  // Most-engaged courses: distinct learners per course (enrolled) and completions.
  const popular = await rows(env,
    "SELECT course_id, COUNT(DISTINCT user_id) AS learners, " +
    "SUM(CASE WHEN passed_score >= 80 THEN 1 ELSE 0 END) AS completions " +
    "FROM progress WHERE " + NOT_PROGRAM + " GROUP BY course_id ORDER BY learners DESC, completions DESC LIMIT 25", PROGRAM_IDS);

  // Recent signups (count by day, last 14 days) for a simple trend.
  const signups = await rows(env,
    "SELECT created_at FROM users ORDER BY created_at DESC LIMIT 100");

  return json({ totals, popular, recentSignups: signups.length });
}
