import { schemaOnce } from "./_schema-once.js";
import { json, getUser, newId, logEvent, isCourseTeacher } from "./_lib.js";

// Cohort mode: a teacher (or admin) creates a cohort for a course and shares an
// invite code; learners join with the code (which also enrols them); the owner
// sees a roster with each member's progress. Tables auto-create so no manual
// migration is required (they are also in schema.sql).
async function ensure(env) {
  return schemaOnce(env.DB, "cohorts", async () => {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS cohorts (id TEXT PRIMARY KEY, course_id TEXT NOT NULL, name TEXT NOT NULL, invite_code TEXT NOT NULL UNIQUE, owner_id TEXT NOT NULL, created_at INTEGER NOT NULL)"
  ).run();
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS cohort_members (cohort_id TEXT NOT NULL, user_id TEXT NOT NULL, joined_at INTEGER NOT NULL, PRIMARY KEY (cohort_id, user_id))"
  ).run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS enrollments (user_id TEXT NOT NULL, kind TEXT NOT NULL, target_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (user_id, kind, target_id))").run();
  });
}

async function ownsCourse(env, user, courseId) {
  if (user.role === "admin") return true;
  return await isCourseTeacher(env, user.id, courseId);
}

// A user counts as "teacher-like" for cohort access if they hold the teacher role,
// are an admin, or have been assigned as a course's teacher of record regardless of
// their `users.role` (course_teachers assignment is independent of role — see _lib.js).
async function isTeacherLike(env, user) {
  return user.role === "admin" || user.role === "teacher" || (await isCourseTeacher(env, user.id));
}

// GET /api/cohorts            -> cohorts owned by this teacher (admin: all), with member counts
// GET /api/cohorts?id=COHORT  -> roster for one cohort (owner/admin only)
export async function onRequestGet({ request, env }) {
  const user = await getUser(env, request);
  if (!user || !(await isTeacherLike(env, user))) return json({ error: "forbidden" }, 403);
  await ensure(env);
  const id = new URL(request.url).searchParams.get("id");

  if (!id) {
    const sql = user.role === "admin"
      ? "SELECT c.*, (SELECT COUNT(*) FROM cohort_members m WHERE m.cohort_id=c.id) AS members FROM cohorts c ORDER BY c.created_at DESC"
      : "SELECT c.*, (SELECT COUNT(*) FROM cohort_members m WHERE m.cohort_id=c.id) AS members FROM cohorts c WHERE c.owner_id=? ORDER BY c.created_at DESC";
    const stmt = user.role === "admin" ? env.DB.prepare(sql) : env.DB.prepare(sql).bind(user.id);
    const { results } = await stmt.all();
    return json({ cohorts: results || [] });
  }

  const cohort = await env.DB.prepare("SELECT * FROM cohorts WHERE id=?").bind(id).first();
  if (!cohort) return json({ error: "not found" }, 404);
  if (user.role !== "admin" && cohort.owner_id !== user.id) return json({ error: "forbidden" }, 403);

  const { results } = await env.DB.prepare(
    "SELECT cm.user_id, u.name, u.email, p.done, p.passed_score FROM cohort_members cm " +
    "JOIN users u ON u.id = cm.user_id " +
    "LEFT JOIN progress p ON p.user_id = cm.user_id AND p.course_id = ? " +
    "WHERE cm.cohort_id = ? ORDER BY cm.joined_at"
  ).bind(cohort.course_id, id).all();

  const roster = (results || []).map((r) => {
    let lessonsDone = 0;
    try { const d = JSON.parse(r.done || "[]"); if (Array.isArray(d)) lessonsDone = d.length; } catch (e) {}
    return {
      name: r.name || "Learner", email: r.email, lessonsDone,
      score: r.passed_score, passed: typeof r.passed_score === "number" && r.passed_score >= 80,
    };
  });
  return json({ cohort: { id: cohort.id, name: cohort.name, courseId: cohort.course_id, inviteCode: cohort.invite_code }, roster });
}

// POST /api/cohorts { action: 'create', courseId, name }  (teacher owns course / admin)
// POST /api/cohorts { action: 'join',   code }            (any signed-in learner)
export async function onRequestPost({ request, env }) {
  const user = await getUser(env, request);
  if (!user) return json({ error: "Please sign in." }, 401);
  await ensure(env);
  let b; try { b = await request.json(); } catch (e) { return json({ error: "bad request" }, 400); }
  const action = (b.action || "").toString();

  if (action === "create") {
    if (!(await isTeacherLike(env, user))) return json({ error: "forbidden" }, 403);
    const courseId = (b.courseId || "").toString().slice(0, 120);
    const name = (b.name || "").toString().trim().slice(0, 120);
    if (!courseId || !name) return json({ error: "courseId and name required" }, 400);
    if (!(await ownsCourse(env, user, courseId))) return json({ error: "You don't teach that course." }, 403);

    // Unique, human-typable invite code; retry on the (rare) collision.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = newId().slice(0, 6).toUpperCase();
      try {
        const id = newId();
        await env.DB.prepare("INSERT INTO cohorts (id, course_id, name, invite_code, owner_id, created_at) VALUES (?,?,?,?,?,?)")
          .bind(id, courseId, name, code, user.id, Date.now()).run();
        await logEvent(env, user, "cohort_created", courseId, "cohort=" + id);
        return json({ ok: true, id, inviteCode: code });
      } catch (e) { if (!String(e).includes("UNIQUE constraint failed: cohorts.invite_code")) throw e; }
    }
    return json({ error: "Could not create a cohort right now — please try again." }, 500);
  }

  if (action === "join") {
    const code = (b.code || "").toString().trim().toUpperCase().slice(0, 12);
    if (!code) return json({ error: "Enter an invite code." }, 400);
    const cohort = await env.DB.prepare("SELECT id, course_id, name FROM cohorts WHERE invite_code=?").bind(code).first();
    if (!cohort) return json({ error: "That code doesn't match a cohort." }, 404);
    const now = Date.now();
    // D1 batch is transactional: membership and enrollment succeed together.
    const [membership] = await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO cohort_members (cohort_id, user_id, joined_at) VALUES (?,?,?)").bind(cohort.id, user.id, now),
      env.DB.prepare("INSERT OR IGNORE INTO enrollments (user_id, kind, target_id, created_at) VALUES (?,?,?,?)").bind(user.id, "course", cohort.course_id, now),
    ]);
    if (membership.meta?.changes > 0) await logEvent(env, user, "cohort_joined", cohort.course_id, "cohort=" + cohort.id);
    return json({ ok: true, courseId: cohort.course_id, cohortName: cohort.name });
  }

  return json({ error: "unknown action" }, 400);
}
