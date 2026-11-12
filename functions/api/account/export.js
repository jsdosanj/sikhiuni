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
    cohort_memberships: await all("SELECT cohort_id, joined_at FROM cohort_members WHERE user_id=?", user.id),
    courses_taught: await all("SELECT course_id, assigned_at FROM course_teachers WHERE user_id=?", user.id),
    grade_overrides: await all("SELECT course_id, score, reason, overridden_at FROM grade_overrides WHERE user_id=?", user.id),
    push_subscriptions: await all("SELECT created_at FROM push_subs WHERE user_id=?", user.id),
    // LMS Phase 1 (plan Part D.10: export covers every new table).
    journal_entries: await all("SELECT course_id, body, shared, created_at, updated_at FROM journal_entries WHERE user_id=?", user.id),
    assignment_extensions: await all("SELECT assignment_id, due_at, reason, created_at FROM assignment_extensions WHERE user_id=?", user.id),
    course_accommodations: await all("SELECT course_id, extra_time_pct, note, updated_at FROM course_accommodations WHERE user_id=?", user.id),
    // Named poll answers only; anonymous answers are stored without any user id.
    poll_participation: await all("SELECT poll_id FROM poll_participants WHERE user_id=?", user.id),
    poll_responses: await all("SELECT poll_id, answers, created_at FROM poll_responses WHERE user_id=?", user.id),
    notifications: await all("SELECT kind, course_id, title, body, url, created_at, read_at FROM notifications WHERE user_id=?", user.id),
    notification_prefs: await all("SELECT prefs, updated_at FROM notification_prefs WHERE user_id=?", user.id),
    grading_comments: await all("SELECT text, created_at FROM grading_comments WHERE user_id=?", user.id),
    submission_marking: await all("SELECT g.submission_id, g.rubric_scores, g.raw_grade, g.penalty_pct FROM submission_grading g JOIN submissions s ON s.id=g.submission_id WHERE s.user_id=?", user.id),
    dm_conversations: await all("SELECT id, course_id, status, created_at FROM dm_conversations WHERE requester_id=? OR recipient_id=?", user.id, user.id),
    dm_messages_sent: await all("SELECT conversation_id, body, created_at FROM dm_messages WHERE sender_id=?", user.id),
    blocks: await all("SELECT blocked_id, created_at FROM user_blocks WHERE blocker_id=?", user.id),
    forum_follows: await all("SELECT thread_id, created_at FROM forum_subscriptions WHERE user_id=?", user.id),
    course_mutes: await all("SELECT course_id, created_at FROM course_mutes WHERE user_id=?", user.id),
    calendar_feed: await all("SELECT created_at, last_used_at FROM calendar_feeds WHERE user_id=?", user.id),
    quiz_attempts: await all("SELECT quiz_id, course_id, started_at, submitted_at, score, max_score, status FROM lms_quiz_attempts WHERE user_id=?", user.id),
    peer_reviews_written: await all("SELECT assignment_id, comment, rubric_scores, submitted_at FROM peer_reviews WHERE reviewer_id=?", user.id),
    trusted_devices: await all("SELECT created_at, expires_at, last_used_at, ua FROM mfa_trusted_devices WHERE user_id=?", user.id),
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
