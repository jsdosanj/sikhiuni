import { json, requireRole, logEvent, parseBody } from "../_lib.js";
import { cleanBio, cleanCredentials, cleanAreas, cleanLanguages, cleanLinks, AREAS, LANGUAGES } from "../_profile-options.js";
import { uniqueSlug } from "./_shared.js";

async function ensure(env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS teacher_profiles (" +
    "user_id TEXT PRIMARY KEY, slug TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL, bio TEXT, " +
    "credentials TEXT, areas TEXT, languages_taught TEXT, links TEXT, photo_key TEXT, " +
    "claimed_professor TEXT, verification_level TEXT NOT NULL DEFAULT 'none', " +
    "verified_by TEXT, verified_at INTEGER, verification_note TEXT, is_public INTEGER NOT NULL DEFAULT 0, " +
    "publish_requested_at INTEGER, approved_at INTEGER, approved_by TEXT, " +
    "created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)"
  ).run();
}

function cleanDisplayName(raw) {
  const s = String(raw == null ? "" : raw).replace(/[<>]/g, "").replace(/\p{Cc}/gu, "").trim().slice(0, 80);
  return s || null;
}

// GET /api/teacher/profile -> the signed-in teacher/admin's own profile (or an
// empty shell if they haven't created one yet), plus the fixed option lists the
// edit form needs (avoids the COUNTRIES/LANGUAGES-style client-side duplication).
export async function onRequestGet({ request, env }) {
  const { user, error } = await requireRole(env, request, ["teacher", "admin"]);
  if (error) return error;
  await ensure(env);

  const row = await env.DB.prepare("SELECT * FROM teacher_profiles WHERE user_id=?").bind(user.id).first();
  const mfaRow = await env.DB.prepare("SELECT enabled_at FROM user_mfa WHERE user_id=?").bind(user.id).first();
  return json({
    profile: row || null,
    mfaEnrolled: !!(mfaRow && mfaRow.enabled_at),
    options: { areas: AREAS, languages: LANGUAGES },
  });
}

// POST /api/teacher/profile { displayName, bio, credentials, areas, languagesTaught,
// links, requestPublish? } -> upsert the signed-in teacher/admin's own profile.
// The slug is generated once at first save and never changes afterward. Setting
// requestPublish requires MFA enrollment (a precondition for this high-trust
// action); the rest of the edit still saves even if that specific gate fails.
export async function onRequestPost({ request, env }) {
  const { user, error } = await requireRole(env, request, ["teacher", "admin"]);
  if (error) return error;
  await ensure(env);
  const { body: b, error: bodyError } = await parseBody(request);
  if (bodyError) return bodyError;

  const displayName = cleanDisplayName(b.displayName) || user.name || user.email.split("@")[0];
  const bio = cleanBio(b.bio);
  const credentials = cleanCredentials(b.credentials);
  const areas = cleanAreas(b.areas);
  const languagesTaught = cleanLanguages(b.languagesTaught);
  const links = cleanLinks(b.links);
  const now = Date.now();

  const existing = await env.DB.prepare("SELECT slug, is_public, publish_requested_at FROM teacher_profiles WHERE user_id=?").bind(user.id).first();

  // MFA is optional for every role (owner decision 2026-11-11): asking to publish
  // a profile no longer requires an enrolled authenticator. Still recommended;
  // the GET response keeps `mfaEnrolled` so the dashboard can say so.
  const requestPublishError = null;
  let publishRequestedAt = existing ? existing.publish_requested_at : null;
  if (b.requestPublish) publishRequestedAt = now;

  if (!existing) {
    const slug = await uniqueSlug(displayName, async (candidate) => {
      const hit = await env.DB.prepare("SELECT 1 FROM teacher_profiles WHERE slug=?").bind(candidate).first();
      return !!hit;
    });
    await env.DB.prepare(
      "INSERT INTO teacher_profiles (user_id, slug, display_name, bio, credentials, areas, languages_taught, links, publish_requested_at, is_public, created_at, updated_at) " +
      "VALUES (?,?,?,?,?,?,?,?,?,0,?,?)"
    ).bind(user.id, slug, displayName, bio, credentials, areas, languagesTaught, links, publishRequestedAt, now, now).run();
  } else {
    await env.DB.prepare(
      "UPDATE teacher_profiles SET display_name=?, bio=?, credentials=?, areas=?, languages_taught=?, links=?, publish_requested_at=?, updated_at=? WHERE user_id=?"
    ).bind(displayName, bio, credentials, areas, languagesTaught, links, publishRequestedAt, now, user.id).run();
  }
  await logEvent(env, user, "teacher_profile_update", user.id, existing && existing.is_public ? "live edit" : "draft edit");

  const row = await env.DB.prepare("SELECT * FROM teacher_profiles WHERE user_id=?").bind(user.id).first();
  return json({ profile: row, error: requestPublishError || undefined });
}
