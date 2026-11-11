import { json, getUser, sessionCookie, logEvent } from "../_lib.js";

// POST /api/account/delete { confirm: "DELETE" } -> permanently erase the signed-in
// user's account and personal data, then clear their session.
// Append-only audit `events` are intentionally retained (they hold only an opaque
// user id + action, no profile data) for security/audit integrity.
export async function onRequestPost({ request, env }) {
  const user = await getUser(env, request);
  if (!user) return json({ error: "unauthorized" }, 401);
  let b; try { b = await request.json(); } catch (e) { b = {}; }
  if (b.confirm !== "DELETE") return json({ error: "confirmation required" }, 400);

  // Log before we delete the user row, so the action is still attributable.
  await logEvent(env, user, "account_deleted", null, null);

  // Delete the actual R2 objects before the rows that reference them: every
  // media_objects key this user owns, plus their approved profile photo copy
  // (teacher_profiles.photo_key), which lives outside media_objects (it's the
  // public media/teachers/ copy made on admin approval, not the original upload).
  try {
    const { results } = await env.DB.prepare("SELECT key FROM media_objects WHERE owner_id=?").bind(user.id).all();
    for (const row of results || []) await env.MEDIA.delete(row.key).catch(() => {});
  } catch (e) {}
  try {
    const profile = await env.DB.prepare("SELECT photo_key FROM teacher_profiles WHERE user_id=?").bind(user.id).first();
    if (profile && profile.photo_key) await env.MEDIA.delete(profile.photo_key).catch(() => {});
  } catch (e) {}

  const wipe = async (sql) => { try { await env.DB.prepare(sql).bind(user.id).run(); } catch (e) {} };
  await wipe("DELETE FROM media_objects WHERE owner_id=?");
  await wipe("DELETE FROM progress WHERE user_id=?");
  await wipe("DELETE FROM enrollments WHERE user_id=?");
  await wipe("DELETE FROM certificates WHERE user_id=?");
  await wipe("DELETE FROM ratings WHERE user_id=?");
  await wipe("DELETE FROM discussions WHERE user_id=?");
  await wipe("DELETE FROM discussion_reports WHERE user_id=?");
  // A teacher's own assignments are NOT deleted here on purpose: an assignment
  // belongs to a course, and other students' grade/submission history on it must
  // survive the teacher's account deletion. teacher_id becomes a dangling opaque
  // id, same tradeoff already accepted for events.user_id.
  await wipe("DELETE FROM submissions WHERE user_id=?");
  // A published draft's content already lives in courses.json (git history) —
  // deleting the D1 workflow row here doesn't touch the live catalogue.
  try {
    const { results } = await env.DB.prepare("SELECT id FROM course_drafts WHERE author_id=?").bind(user.id).all();
    for (const row of results || []) {
      await env.DB.prepare("DELETE FROM draft_lessons WHERE draft_id=?").bind(row.id).run();
      await env.DB.prepare("DELETE FROM draft_quiz WHERE draft_id=?").bind(row.id).run();
    }
  } catch (e) {}
  await wipe("DELETE FROM course_drafts WHERE author_id=?");
  await wipe("DELETE FROM feedback WHERE user_id=?");
  await wipe("DELETE FROM teacher_applications WHERE user_id=?");
  await wipe("DELETE FROM grade_overrides WHERE user_id=?");
  await wipe("DELETE FROM course_teachers WHERE user_id=?");
  await wipe("DELETE FROM sessions WHERE user_id=?");
  await wipe("DELETE FROM password_reset_codes WHERE user_id=?");
  await wipe("DELETE FROM cohort_members WHERE user_id=?");
  await wipe("DELETE FROM push_subs WHERE user_id=?");
  await wipe("DELETE FROM user_mfa WHERE user_id=?");
  await wipe("DELETE FROM mfa_backup_codes WHERE user_id=?");
  await wipe("DELETE FROM mfa_trusted_devices WHERE user_id=?");
  // LMS Phase 1 (plan Part D.10). Anonymous poll answers hold no user id, so they
  // are not personal data and stay in the tallies; named answers are erased.
  await wipe("DELETE FROM journal_entries WHERE user_id=?");
  await wipe("DELETE FROM assignment_extensions WHERE user_id=?");
  await wipe("DELETE FROM course_accommodations WHERE user_id=?");
  await wipe("DELETE FROM poll_responses WHERE user_id=?");
  await wipe("DELETE FROM poll_participants WHERE user_id=?");
  await wipe("DELETE FROM user_flags WHERE user_id=?");
  await wipe("DELETE FROM teacher_profiles WHERE user_id=?");
  await wipe("DELETE FROM professor_claims WHERE user_id=?");
  await wipe("DELETE FROM users WHERE id=?");

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json", "Set-Cookie": sessionCookie("", 0) },
  });
}
