import { json, requireUser, logEvent, parseBody } from "../../_lib.js";
import { decryptSecret, verifyTotp, generateBackupCodes, sha256Hex } from "../../_totp.js";

// POST /api/auth/mfa/backup-codes { code } -> replace ALL backup codes with 10 new
// ones (returned once, in plaintext; only hashes are stored). Requires a current
// authenticator code, so a hijacked session can't mint fresh recovery codes.
// Old codes stop working immediately.
export async function onRequestPost({ request, env }) {
  const { user, error } = await requireUser(env, request);
  if (error) return error;
  const { body, error: bodyError } = await parseBody(request);
  if (bodyError) return bodyError;

  const mfa = await env.DB.prepare("SELECT secret_enc, enabled_at FROM user_mfa WHERE user_id=?").bind(user.id).first();
  if (!mfa || !mfa.enabled_at) return json({ error: "mfa not enabled" }, 400);
  if (user.mfa_ok !== 1) return json({ error: "mfa_required" }, 403);

  const secret = await decryptSecret(env.MFA_ENC_KEY, mfa.secret_enc);
  const ok = await verifyTotp(secret, String(body.code == null ? "" : body.code).trim(), { window: 1 });
  if (!ok) return json({ error: "invalid code" }, 400);

  await env.DB.prepare("DELETE FROM mfa_backup_codes WHERE user_id=?").bind(user.id).run();
  const codes = generateBackupCodes(10, 8);
  for (const code of codes) {
    await env.DB.prepare("INSERT INTO mfa_backup_codes (user_id, code_hash, used_at) VALUES (?,?,NULL)")
      .bind(user.id, await sha256Hex(code)).run();
  }
  await logEvent(env, user, "mfa_backup_regenerated", user.id, null);
  return json({ ok: true, backupCodes: codes });
}
