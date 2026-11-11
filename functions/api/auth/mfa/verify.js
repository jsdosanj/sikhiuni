import { json, requireUser, logEvent, parseBody, readCookie, sessionCookie } from "../../_lib.js";
import { decryptSecret, verifyTotp, sha256Hex } from "../../_totp.js";
import { issueTrustedDevice } from "../_trusted-device.js";

// POST /api/auth/mfa/verify { code } -> accepts a current TOTP code or an unused
// backup code, marks THIS session's mfa_ok=1. 5 failed attempts on one session
// invalidates it (forces a fresh magic-link sign-in) — closes the 6-digit
// brute-force window that a rate limit alone doesn't fully close.
export async function onRequestPost({ request, env }) {
  const { user, error } = await requireUser(env, request);
  if (error) return error;
  const { body, error: bodyError } = await parseBody(request);
  if (bodyError) return bodyError;

  const sid = readCookie(request, "su_session");
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
    if (backup) {
      await env.DB.prepare("UPDATE mfa_backup_codes SET used_at=? WHERE user_id=? AND code_hash=?")
        .bind(Date.now(), user.id, hash).run();
      ok = true;
      await logEvent(env, user, "mfa_backup_code_used", user.id, null);
    }
  }

  if (!ok) {
    const row = await env.DB.prepare("UPDATE sessions SET mfa_fail_count = mfa_fail_count + 1 WHERE id=? RETURNING mfa_fail_count")
      .bind(sid).first();
    const fails = row ? row.mfa_fail_count : 1;
    if (fails >= 5) {
      await env.DB.prepare("DELETE FROM sessions WHERE id=?").bind(sid).run();
      await logEvent(env, user, "mfa_session_locked", user.id, null);
      return json({ error: "too many failed attempts, please sign in again" }, 401, {
        "Set-Cookie": sessionCookie("", 0),
      });
    }
    return json({ error: "invalid code" }, 400);
  }

  await env.DB.prepare("UPDATE sessions SET mfa_ok=1, mfa_fail_count=0 WHERE id=?").bind(sid).run();
  await logEvent(env, user, "mfa_verified", user.id, null);
  // "Remember this device for 30 days": only after a successful code, only when asked.
  if (body.remember === true) {
    const cookie = await issueTrustedDevice(env, user.id, request);
    await logEvent(env, user, "mfa_device_remembered", user.id, null);
    return json({ ok: true, remembered: true }, 200, { "Set-Cookie": cookie });
  }
  return json({ ok: true });
}
