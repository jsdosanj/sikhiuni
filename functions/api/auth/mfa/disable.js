import { json, requireUser, logEvent, parseBody } from "../../_lib.js";
import { decryptSecret, verifyTotp, sha256Hex } from "../../_totp.js";
import { revokeTrustedDevices } from "../_trusted-device.js";

// POST /api/auth/mfa/disable { code } -> requires a current code (TOTP or an
// unused backup code) before turning MFA off, so a hijacked (but not
// MFA-verified) session can't disable protection on its own.
export async function onRequestPost({ request, env }) {
  const { user, error } = await requireUser(env, request);
  if (error) return error;
  const { body, error: bodyError } = await parseBody(request);
  if (bodyError) return bodyError;

  const mfa = await env.DB.prepare("SELECT secret_enc, enabled_at FROM user_mfa WHERE user_id=?").bind(user.id).first();
  if (!mfa || !mfa.enabled_at) return json({ error: "mfa not enabled" }, 400);

  const code = String(body.code == null ? "" : body.code).trim();
  const secret = await decryptSecret(env.MFA_ENC_KEY, mfa.secret_enc);
  let ok = await verifyTotp(secret, code, { window: 1 });
  if (!ok && code) {
    const hash = await sha256Hex(code.toUpperCase());
    const backup = await env.DB.prepare(
      "SELECT code_hash FROM mfa_backup_codes WHERE user_id=? AND code_hash=? AND used_at IS NULL"
    ).bind(user.id, hash).first();
    if (backup) ok = true;
  }
  if (!ok) return json({ error: "invalid code" }, 400);

  await env.DB.prepare("DELETE FROM user_mfa WHERE user_id=?").bind(user.id).run();
  await env.DB.prepare("DELETE FROM mfa_backup_codes WHERE user_id=?").bind(user.id).run();
  await revokeTrustedDevices(env, user.id);
  await logEvent(env, user, "mfa_disabled", user.id, null);
  return json({ ok: true });
}
