// MFA route handlers (enroll/confirm/verify/disable) + the requireMfa/hasFlag/
// requireReviewer authz helpers, exercised against a small stateful fake D1 (not
// the generic scripted mockEnv in helpers.ts — these flows need real state
// transitions across calls: enroll -> confirm -> verify, backup-code single-use,
// and the per-session fail counter).
import { describe, it, expect, beforeEach } from "vitest";
import { onRequestPost as enrollPost } from "../functions/api/auth/mfa/enroll.js";
import { onRequestPost as confirmPost } from "../functions/api/auth/mfa/confirm.js";
import { onRequestPost as verifyPost } from "../functions/api/auth/mfa/verify.js";
import { onRequestPost as disablePost } from "../functions/api/auth/mfa/disable.js";
import { requireMfa, requireReviewer, hasFlag } from "../functions/api/_lib.js";
import { totp } from "../functions/api/_totp.js";
import { req } from "./helpers";

const MFA_ENC_KEY = (() => {
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) bytes[i] = i * 7 + 1; // fixed, deterministic test key
  let s = ""; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
})();

function fakeDB() {
  const users = new Map<string, any>();
  const sessions = new Map<string, any>();
  const userMfa = new Map<string, any>();
  const backupCodes = new Map<string, any>();
  const userFlags = new Map<string, any>();

  function handleFirst(sql: string, b: any[]) {
    if (sql.includes("FROM sessions s JOIN users u")) {
      const [sid, now] = b;
      const s = sessions.get(sid);
      if (!s || s.expires_at <= now) return null;
      const u = users.get(s.user_id);
      if (!u) return null;
      return { id: u.id, email: u.email, name: u.name, role: u.role, mfa_ok: s.mfa_ok };
    }
    if (sql.includes("SELECT secret_enc, enabled_at FROM user_mfa")) {
      const row = userMfa.get(b[0]);
      return row ? { secret_enc: row.secret_enc, enabled_at: row.enabled_at } : null;
    }
    if (sql.includes("SELECT enabled_at FROM user_mfa")) {
      const row = userMfa.get(b[0]);
      return row ? { enabled_at: row.enabled_at } : null;
    }
    if (sql.includes("SELECT code_hash FROM mfa_backup_codes")) {
      const [uid, hash] = b;
      const row = backupCodes.get(uid + "|" + hash);
      return row && row.used_at == null ? { code_hash: hash } : null;
    }
    if (sql.includes("UPDATE sessions SET mfa_fail_count = mfa_fail_count + 1")) {
      const s = sessions.get(b[0]);
      if (!s) return null;
      s.mfa_fail_count = (s.mfa_fail_count || 0) + 1;
      return { mfa_fail_count: s.mfa_fail_count };
    }
    if (sql.includes("SELECT 1 FROM user_flags")) {
      const [uid, flag] = b;
      return userFlags.has(uid + "|" + flag) ? { x: 1 } : null;
    }
    return null;
  }

  function handleRun(sql: string, b: any[]) {
    if (sql.startsWith("CREATE TABLE")) return { success: true };
    if (sql.includes("INSERT INTO user_mfa")) {
      const [user_id, secret_enc, created_at] = b;
      const existing = userMfa.get(user_id);
      userMfa.set(user_id, { secret_enc, enabled_at: existing ? existing.enabled_at : null, created_at });
      return { success: true };
    }
    if (sql.includes("UPDATE user_mfa SET enabled_at")) {
      const [enabled_at, user_id] = b;
      const row = userMfa.get(user_id);
      if (row) row.enabled_at = enabled_at;
      return { success: true };
    }
    if (sql.includes("DELETE FROM user_mfa")) { userMfa.delete(b[0]); return { success: true }; }
    if (sql.includes("INSERT INTO mfa_backup_codes")) {
      const [user_id, code_hash] = b;
      backupCodes.set(user_id + "|" + code_hash, { user_id, code_hash, used_at: null });
      return { success: true };
    }
    if (sql.includes("UPDATE mfa_backup_codes SET used_at")) {
      const [used_at, user_id, code_hash] = b;
      const row = backupCodes.get(user_id + "|" + code_hash);
      if (row) row.used_at = used_at;
      return { success: true };
    }
    if (sql.includes("DELETE FROM mfa_backup_codes")) {
      for (const k of [...backupCodes.keys()]) if (k.startsWith(b[0] + "|")) backupCodes.delete(k);
      return { success: true };
    }
    if (sql.includes("UPDATE sessions SET mfa_ok=1")) {
      const s = sessions.get(b[0]);
      if (s) { s.mfa_ok = 1; s.mfa_fail_count = 0; }
      return { success: true };
    }
    if (sql.includes("DELETE FROM sessions WHERE id")) { sessions.delete(b[0]); return { success: true }; }
    return { success: true };
  }

  function prepare(sql: string) {
    let bound: any[] = [];
    const self = {
      bind(...args: any[]) { bound = args; return self; },
      async first() { return handleFirst(sql, bound); },
      async run() { return handleRun(sql, bound); },
      async all() { return { results: [] }; },
    };
    return self;
  }

  return { prepare, users, sessions, userMfa, backupCodes, userFlags };
}

function makeEnv() {
  const DB = fakeDB();
  return { DB, MFA_ENC_KEY, ADMIN_EMAILS: "" };
}

function seedUser(env: any, { id, role = "learner", mfaOk = 1 }: any) {
  env.DB.users.set(id, { id, email: id + "@example.com", name: id, role });
  env.DB.sessions.set("sid-" + id, { user_id: id, expires_at: Date.now() + 100000, mfa_ok: mfaOk, mfa_fail_count: 0 });
}

function asReq(id: string, body?: unknown) {
  return req({ url: "http://localhost/api/x", cookie: "sid-" + id, body });
}

describe("MFA enroll -> confirm -> verify -> disable", () => {
  let env: any;
  beforeEach(() => { env = makeEnv(); seedUser(env, { id: "u1" }); });

  it("enroll issues a pending secret; confirm with the wrong code fails and leaves it unconfirmed", async () => {
    const enrollRes = await enrollPost({ request: asReq("u1"), env });
    expect(enrollRes.status).toBe(200);
    const { secret } = await enrollRes.json();
    expect(typeof secret).toBe("string");
    expect(env.DB.userMfa.get("u1").enabled_at).toBeNull();

    const badConfirm = await confirmPost({ request: asReq("u1", { code: "000000" }), env });
    expect(badConfirm.status).toBe(400);
    expect(env.DB.userMfa.get("u1").enabled_at).toBeNull();
  });

  it("confirm with the correct code enables MFA and issues 10 one-time backup codes", async () => {
    const { secret } = await (await enrollPost({ request: asReq("u1"), env })).json();
    const code = await totp(secret, Date.now());
    const res = await confirmPost({ request: asReq("u1", { code }), env });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.backupCodes).toHaveLength(10);
    expect(env.DB.userMfa.get("u1").enabled_at).not.toBeNull();
  });

  it("confirm twice (already enabled) -> 409", async () => {
    const { secret } = await (await enrollPost({ request: asReq("u1"), env })).json();
    await confirmPost({ request: asReq("u1", { code: await totp(secret, Date.now()) }), env });
    const again = await confirmPost({ request: asReq("u1", { code: await totp(secret, Date.now()) }), env });
    expect(again.status).toBe(409);
  });

  it("verify: correct TOTP code sets this session's mfa_ok=1", async () => {
    const { secret } = await (await enrollPost({ request: asReq("u1"), env })).json();
    await confirmPost({ request: asReq("u1", { code: await totp(secret, Date.now()) }), env });
    env.DB.sessions.get("sid-u1").mfa_ok = 0; // simulate a fresh unverified login
    const res = await verifyPost({ request: asReq("u1", { code: await totp(secret, Date.now()) }), env });
    expect(res.status).toBe(200);
    expect(env.DB.sessions.get("sid-u1").mfa_ok).toBe(1);
  });

  it("verify: a backup code works once, then is rejected on reuse", async () => {
    const { secret } = await (await enrollPost({ request: asReq("u1"), env })).json();
    const confirmRes = await confirmPost({ request: asReq("u1", { code: await totp(secret, Date.now()) }), env });
    const { backupCodes } = await confirmRes.json();
    const code = backupCodes[0];

    env.DB.sessions.get("sid-u1").mfa_ok = 0;
    const first = await verifyPost({ request: asReq("u1", { code }), env });
    expect(first.status).toBe(200);

    env.DB.sessions.get("sid-u1").mfa_ok = 0;
    const second = await verifyPost({ request: asReq("u1", { code }), env });
    expect(second.status).toBe(400);
  });

  it("verify: 5 failed attempts on one session invalidates it (re-login required)", async () => {
    const { secret } = await (await enrollPost({ request: asReq("u1"), env })).json();
    await confirmPost({ request: asReq("u1", { code: await totp(secret, Date.now()) }), env });
    env.DB.sessions.get("sid-u1").mfa_ok = 0;

    let lastStatus = 0;
    for (let i = 0; i < 5; i++) {
      const res = await verifyPost({ request: asReq("u1", { code: "000000" }), env });
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(401);
    expect(env.DB.sessions.has("sid-u1")).toBe(false);

    // The session is gone, so even the correct code can no longer be used on it.
    const after = await verifyPost({ request: asReq("u1", { code: await totp(secret, Date.now()) }), env });
    expect(after.status).toBe(401); // requireUser: no session -> "Please sign in."
  });

  it("disable requires a valid current code, then clears enrollment", async () => {
    const { secret } = await (await enrollPost({ request: asReq("u1"), env })).json();
    await confirmPost({ request: asReq("u1", { code: await totp(secret, Date.now()) }), env });

    const badDisable = await disablePost({ request: asReq("u1", { code: "000000" }), env });
    expect(badDisable.status).toBe(400);
    expect(env.DB.userMfa.get("u1")).toBeDefined();

    const okDisable = await disablePost({ request: asReq("u1", { code: await totp(secret, Date.now()) }), env });
    expect(okDisable.status).toBe(200);
    expect(env.DB.userMfa.get("u1")).toBeUndefined();
  });
});

describe("requireMfa enrollment-state matrix", () => {
  let env: any;
  beforeEach(() => { env = makeEnv(); });

  it("admin, not enrolled -> passes (enrollment is encouraged, not enforced)", async () => {
    seedUser(env, { id: "a1", role: "admin", mfaOk: 1 });
    const { user, error } = await requireMfa(env, asReq("a1"), ["admin"]);
    expect(error).toBeUndefined();
    expect(user.id).toBe("a1");
  });

  it("teacher, not enrolled -> passes (grace period)", async () => {
    seedUser(env, { id: "t1", role: "teacher", mfaOk: 1 });
    const { user, error } = await requireMfa(env, asReq("t1"), ["teacher"]);
    expect(error).toBeUndefined();
    expect(user.id).toBe("t1");
  });

  it("enrolled but this session hasn't cleared /mfa (mfa_ok=0) -> mfa_required, regardless of role", async () => {
    seedUser(env, { id: "t2", role: "teacher", mfaOk: 0 });
    env.DB.userMfa.set("t2", { secret_enc: "x", enabled_at: Date.now(), created_at: Date.now() });
    const { error } = await requireMfa(env, asReq("t2"), ["teacher"]);
    expect(error).toBeDefined();
    expect((await error!.json()).error).toBe("mfa_required");
  });

  it("enrolled and session verified -> passes", async () => {
    seedUser(env, { id: "a2", role: "admin", mfaOk: 1 });
    env.DB.userMfa.set("a2", { secret_enc: "x", enabled_at: Date.now(), created_at: Date.now() });
    const { user, error } = await requireMfa(env, asReq("a2"), ["admin"]);
    expect(error).toBeUndefined();
    expect(user.id).toBe("a2");
  });

  it("wrong role still rejected even if MFA is satisfied", async () => {
    seedUser(env, { id: "l1", role: "learner", mfaOk: 1 });
    const { error } = await requireMfa(env, asReq("l1"), ["admin"]);
    expect(error).toBeDefined();
    expect(error!.status).toBe(403);
  });
});

describe("hasFlag / requireReviewer", () => {
  let env: any;
  beforeEach(() => { env = makeEnv(); });

  it("hasFlag reflects the user_flags table", async () => {
    seedUser(env, { id: "r1", role: "teacher" });
    expect(await hasFlag(env, "r1", "reviewer")).toBe(false);
    env.DB.userFlags.set("r1|reviewer", true);
    expect(await hasFlag(env, "r1", "reviewer")).toBe(true);
  });

  it("requireReviewer: admin always passes, even without the flag", async () => {
    seedUser(env, { id: "a3", role: "admin" });
    const { error } = await requireReviewer(env, asReq("a3"));
    expect(error).toBeUndefined();
  });

  it("requireReviewer: flagged teacher passes, unflagged teacher is forbidden", async () => {
    seedUser(env, { id: "r2", role: "teacher" });
    const before = await requireReviewer(env, asReq("r2"));
    expect(before.error).toBeDefined();
    expect(before.error!.status).toBe(403);

    env.DB.userFlags.set("r2|reviewer", true);
    const after = await requireReviewer(env, asReq("r2"));
    expect(after.error).toBeUndefined();
  });
});
