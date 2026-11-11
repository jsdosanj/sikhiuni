import { json, getUser, logEvent } from "../_lib.js";

// GET /api/account/export -> downloads everything we hold for the signed-in user
// as a single JSON file (self-serve data portability).
export async function onRequestGet({ request, env }) {
  const user = await getUser(env, request);
  if (!user) return json({ error: "unauthorized" }, 401);

  // Best-effort per table — some tables are created lazily and may not exist yet.
  const all = async (sql, ...args) => {
    try { const r = await env.DB.prepare(sql).bind(...args).all(); return r.results || []; }
    catch (e) { return []; }
  };

  const data = {
    exported_at: Date.now(),
    account: user,
    progress: await all("SELECT course_id, done, passed_score, updated_at FROM progress WHERE user_id=?", user.id),
    enrollments: await all("SELECT kind, target_id, created_at FROM enrollments WHERE user_id=?", user.id),
    certificates: await all("SELECT id, course_id, name, score, issued_at FROM certificates WHERE user_id=?", user.id),
    ratings: await all("SELECT course_id, stars, review, updated_at FROM ratings WHERE user_id=?", user.id),
    discussions: await all("SELECT course_id, message, created_at FROM discussions WHERE user_id=?", user.id),
    feedback: await all("SELECT course_id, category, message, status, created_at FROM feedback WHERE user_id=?", user.id),
    teacher_applications: await all("SELECT background, courses, status, created_at FROM teacher_applications WHERE user_id=?", user.id),
    // The encrypted TOTP secret and backup-code hashes are not exported (they're not
    // "your data" in a portable sense, and exporting the secret would defeat MFA).
    mfa: await all("SELECT enabled_at, created_at FROM user_mfa WHERE user_id=?", user.id),
    flags: await all("SELECT flag, granted_at FROM user_flags WHERE user_id=?", user.id),
    teacher_profile: await all(
      "SELECT slug, display_name, bio, credentials, areas, languages_taught, links, claimed_professor, " +
      "verification_level, is_public, created_at, updated_at FROM teacher_profiles WHERE user_id=?", user.id
    ),
    professor_claims: await all(
      "SELECT professor_name, statement, status, created_at, decided_at FROM professor_claims WHERE user_id=?", user.id
    ),
    media_objects: await all(
      "SELECT key, kind, context, size, content_type, status, created_at FROM media_objects WHERE owner_id=?", user.id
    ),
    discussion_reports: await all(
      "SELECT message_id, reason, status, created_at FROM discussion_reports WHERE user_id=?", user.id
    ),
    submissions: await all(
      "SELECT assignment_id, text_content, file_key, submitted_at, late, grade, feedback, status FROM submissions WHERE user_id=?", user.id
    ),
    assignments_created: await all(
      "SELECT id, course_id, title, status, created_at FROM assignments WHERE teacher_id=?", user.id
    ),
    course_drafts: await all(
      "SELECT id, course_id, title, topic, level, status, submitted_at, created_at FROM course_drafts WHERE author_id=?", user.id
    ),
  };

  await logEvent(env, user, "export_account", user.id, null, { subject: user.id, targetType: "export" });
  return new Response(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "content-disposition": 'attachment; filename="sikhi-university-my-data.json"',
    },
  });
}
