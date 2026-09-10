// Merge one duplicate user account into another (admin action; see users.js).
//
// The problem this solves: the same human ends up with two rows in `users`
// because they signed up once with one email and later arrived under another
// (a second Apple private-relay address, an SSO email that differs from the
// one they registered with). Their coursework is then split across two ids and
// neither account shows the whole picture.
//
// Rules, applied uniformly to every table below — no per-table special cases:
//   1. Rows OWNED by the source are repointed at the target.
//   2. Where that would collide with a row the target already has for the same
//      key, the TARGET's row is kept and the source's is dropped. Every drop is
//      counted and returned, so a merge never quietly loses data without saying
//      so. (`UPDATE OR IGNORE` skips the colliding rows; the DELETE that follows
//      clears whatever could not move.)
//   3. Credentials are NOT merged. Passwords, MFA enrolment, backup codes,
//      reset codes and sessions belong to the identity being retired and die
//      with it — carrying a password across identities would mean a secret set
//      for one email silently starts working for another. The target keeps
//      exactly the sign-in methods it already had.
//   4. `events` is left alone. It is an append-only audit log: rewriting whose
//      id performed a past action would falsify it. The merge writes its own
//      event instead, recording source id + email -> target id, which is what
//      makes the old rows traceable after the source row is gone.
//   5. `users.role` is NOT copied. Admin is conferred by the ADMIN_EMAILS
//      allowlist, never by inheritance — see users.js.

// (table, column) pairs where the column means "this row belongs to that user".
const OWNED = [
  ["progress", "user_id"], ["enrollments", "user_id"], ["certificates", "user_id"],
  ["ratings", "user_id"], ["submissions", "user_id"], ["daily_activity", "user_id"],
  ["grade_overrides", "user_id"], ["cohort_members", "user_id"], ["course_teachers", "user_id"],
  ["discussions", "user_id"], ["discussion_reports", "user_id"], ["teacher_applications", "user_id"],
  ["professor_claims", "user_id"], ["feedback", "user_id"], ["push_subs", "user_id"],
  ["user_flags", "user_id"], ["teacher_profiles", "user_id"],
  ["course_drafts", "author_id"], ["announcements", "author_id"],
  ["course_archive_requests", "teacher_id"], ["assignments", "teacher_id"],
  ["cohorts", "owner_id"], ["media_objects", "owner_id"],
];

// (table, column) pairs where the column records WHO ACTED on a row rather than
// who owns it. Repointed so the retired id leaves no dangling reference behind;
// none of these is part of a unique key, so a plain UPDATE always succeeds.
const ACTOR = [
  ["user_flags", "granted_by"], ["grade_overrides", "overridden_by"],
  ["submissions", "graded_by"], ["media_objects", "reviewed_by"],
  ["course_drafts", "reviewed_by"], ["course_archive_requests", "decided_by"],
  ["professor_claims", "decided_by"],
  ["teacher_profiles", "verified_by"], ["teacher_profiles", "approved_by"],
];

// Credential + transient state keyed by user_id: dropped, never moved (rule 3).
const DROP_BY_USER = ["sessions", "user_mfa", "mfa_backup_codes", "password_reset_codes"];

// Same, but keyed by email rather than id.
const DROP_BY_EMAIL = ["magic_tokens", "pending_registrations"];

const changes = (r) => (r && r.meta && r.meta.changes) || 0;

// Merge `source` into `target` (both are rows with at least { id, email }).
// Returns { moved, dropped, skipped } — `skipped` lists only the tables where a
// collision meant a source row could not be carried over.
export async function mergeAccount(env, source, target) {
  let moved = 0, dropped = 0;
  const skipped = {};

  for (const [table, col] of OWNED) {
    moved += changes(await env.DB.prepare(
      `UPDATE OR IGNORE ${table} SET ${col}=? WHERE ${col}=?`
    ).bind(target.id, source.id).run());
    const lost = changes(await env.DB.prepare(
      `DELETE FROM ${table} WHERE ${col}=?`
    ).bind(source.id).run());
    if (lost) skipped[table] = (skipped[table] || 0) + lost;
  }

  for (const [table, col] of ACTOR) {
    await env.DB.prepare(`UPDATE ${table} SET ${col}=? WHERE ${col}=?`).bind(target.id, source.id).run();
  }

  for (const table of DROP_BY_USER) {
    dropped += changes(await env.DB.prepare(`DELETE FROM ${table} WHERE user_id=?`).bind(source.id).run());
  }
  for (const table of DROP_BY_EMAIL) {
    dropped += changes(await env.DB.prepare(`DELETE FROM ${table} WHERE email=?`).bind(source.email).run());
  }

  await env.DB.prepare("DELETE FROM users WHERE id=?").bind(source.id).run();

  return { moved, dropped, skipped };
}
