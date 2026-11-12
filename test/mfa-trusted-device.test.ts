// Optional MFA (plan Part B, owner decision 2026-11-11): "Remember this device
// for 30 days" and backup-code regeneration. Real SQLite (node:sqlite) so the
// actual SQL in login.js / verify.js / disable.js / backup-codes.js and
// _trusted-device.js runs, end to end through password sign-in.
import { describe, it, expect, beforeEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { onRequestPost as login } from "../functions/api/auth/login.js";
import { onRequestPost as verify } from "../functions/api/auth/mfa/verify.js";
import { onRequestPost as disable } from "../functions/api/auth/mfa/disable.js";
import { onRequestPost as backupCodes } from "../functions/api/auth/mfa/backup-codes.js";
import { onRequestPost as resetPassword } from "../functions/api/auth/reset-password.js";
import { sessionNeedsMfa, issueTrustedDevice, revokeTrustedDevices, DEVICE_COOKIE } from "../functions/api/auth/_trusted-device.js";
import { hashPassword } from "../functions/_password.js";
import { encryptSecret, generateSecret, totp, sha256Hex } from "../functions/api/_totp.js";

const KEY = Buffer.from(new Uint8Array(32).map((_, i) => i + 1)).toString("base64");
const PW = "correct-horse-battery";

function makeEnv() {
  const sql = new DatabaseSync(":memory:");
  sql.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, username TEXT, name TEXT, country TEXT, languages TEXT, role TEXT, marketing_optin INTEGER DEFAULT 0, password_hash TEXT, email_verified INTEGER DEFAULT 1);
    CREATE TABLE sessions (id TEXT PRIMARY KEY, user_id TEXT, expires_at INTEGER, mfa_ok INTEGER NOT NULL DEFAULT 0, mfa_fail_count INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE user_mfa (user_id TEXT PRIMARY KEY, secret_enc TEXT NOT NULL, enabled_at INTEGER, created_at INTEGER NOT NULL);
    CREATE TABLE mfa_backup_codes (user_id TEXT NOT NULL, code_hash TEXT NOT NULL, used_at INTEGER, PRIMARY KEY (user_id, code_hash));
    CREATE TABLE password_reset_codes (psid TEXT PRIMARY KEY, user_id TEXT, code TEXT, attempts INTEGER DEFAULT 0, verified INTEGER DEFAULT 0, expires_at INTEGER, created_at INTEGER);
  `);
  const DB = {
    prepare(q: string) {
      let args: any[] = [];
      const st = {
        bind(...v: any[]) { args = v; return st; },
        async run() { const r = sql.prepare(q).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; },
        async first() { return (sql.prepare(q).get(...args) as any) || null; },
        async all() { return { results: sql.prepare(q).all(...args) }; },
      };
      return st;
    },
  };
  return { sql, env: { DB, MFA_ENC_KEY: KEY } as any };
}

const req = (url: string, body: any, cookie = "") =>
  new Request("https://sikhiuni.com" + url, { method: "POST", headers: { "content-type": "application/json", cookie, "user-agent": "vitest" }, body: JSON.stringify(body) });
const cookieValue = (res: Response, name: string) => {
  const all = (res.headers as any).getSetCookie ? (res.headers as any).getSetCookie() : [res.headers.get("Set-Cookie") || ""];
  for (const c of all) { const m = c.match(new RegExp(name + "=([^;]*)")); if (m) return m[1]; }
  return null;
};

let sql: DatabaseSync, env: any, secret: string;
beforeEach(async () => {
  ({ sql, env } = makeEnv());
  sql.prepare("INSERT INTO users (id, email, username, role, password_hash) VALUES ('u1','h@example.com','harjit','teacher',?)").run(await hashPassword(PW));
  secret = generateSecret();
  sql.prepare("INSERT INTO user_mfa (user_id, secret_enc, enabled_at, created_at) VALUES ('u1', ?, ?, ?)").run(await encryptSecret(KEY, secret), Date.now(), Date.now());
  for (const c of ["AAAA1111", "BBBB2222"]) sql.prepare("INSERT INTO mfa_backup_codes VALUES ('u1', ?, NULL)").run(await sha256Hex(c));
});

async function signIn(cookie = "") {
  const res = await login({ request: req("/api/auth/login", { identifier: "harjit", password: PW }, cookie), env } as any);
  return { res, body: await res.json(), sid: cookieValue(res, "su_session") };
}

describe("remember this device (30 days)", () => {
  it("an enrolled user is challenged on a new device, then a remembered device skips the code", async () => {
    const first = await signIn();
    expect(first.body.mfaRequired).toBe(true);

    const code = await totp(secret);
    const v = await verify({ request: req("/api/auth/mfa/verify", { code, remember: true }, `su_session=${first.sid}`), env } as any);
    expect((await v.json()).remembered).toBe(true);
    const device = cookieValue(v, DEVICE_COOKIE);
    expect(device).toMatch(/^[0-9a-f]{64}$/);
    // Only the hash is stored.
    const row: any = sql.prepare("SELECT token_hash, user_id, expires_at FROM mfa_trusted_devices").get();
    expect(row.token_hash).not.toBe(device);
    expect(row.user_id).toBe("u1");
    expect(row.expires_at - Date.now()).toBeGreaterThan(29 * 24 * 3600 * 1000);

    const second = await signIn(`${DEVICE_COOKIE}=${device}`);
    expect(second.body.mfaRequired).toBe(false);
    const s: any = sql.prepare("SELECT mfa_ok FROM sessions WHERE id=?").get(second.sid);
    expect(s.mfa_ok).toBe(1);
  });

  it("without the checkbox, no device cookie is issued", async () => {
    const first = await signIn();
    const v = await verify({ request: req("/api/auth/mfa/verify", { code: await totp(secret) }, `su_session=${first.sid}`), env } as any);
    expect(cookieValue(v, DEVICE_COOKIE)).toBeNull();
  });

  it("a token is bound to its user, expires, and rejects junk", async () => {
    sql.prepare("INSERT INTO users (id, email, role) VALUES ('u2','other@example.com','learner')").run();
    sql.prepare("INSERT INTO user_mfa (user_id, secret_enc, enabled_at, created_at) VALUES ('u2','x',1,1)").run();
    const set = await issueTrustedDevice(env, "u1", req("/", {}));
    const token = set.match(/=([0-9a-f]{64})/)![1];
    const asCookie = (t: string) => req("/", {}, `${DEVICE_COOKIE}=${t}`);
    expect(await sessionNeedsMfa(env, asCookie(token), "u1")).toBe(false);
    expect(await sessionNeedsMfa(env, asCookie(token), "u2")).toBe(true); // someone else's token
    expect(await sessionNeedsMfa(env, asCookie("not-a-token"), "u1")).toBe(true);
    sql.prepare("UPDATE mfa_trusted_devices SET expires_at=?").run(Date.now() - 1);
    expect(await sessionNeedsMfa(env, asCookie(token), "u1")).toBe(true); // expired
  });

  it("a user without MFA never needs the step", async () => {
    sql.prepare("DELETE FROM user_mfa").run();
    expect((await signIn()).body.mfaRequired).toBe(false);
  });

  it("turning MFA off revokes remembered devices", async () => {
    await issueTrustedDevice(env, "u1", req("/", {}));
    const s = await signIn();
    await verify({ request: req("/api/auth/mfa/verify", { code: await totp(secret) }, `su_session=${s.sid}`), env } as any);
    const res = await disable({ request: req("/api/auth/mfa/disable", { code: await totp(secret) }, `su_session=${s.sid}`), env } as any);
    expect(res.status).toBe(200);
    expect((sql.prepare("SELECT COUNT(*) AS n FROM mfa_trusted_devices").get() as any).n).toBe(0);
  });

  it("revokeTrustedDevices removes every token for that user only", async () => {
    await issueTrustedDevice(env, "u1", req("/", {}));
    await issueTrustedDevice(env, "u1", req("/", {}));
    await issueTrustedDevice(env, "u9", req("/", {}));
    await revokeTrustedDevices(env, "u1");
    const rows: any[] = sql.prepare("SELECT user_id FROM mfa_trusted_devices").all() as any;
    expect(rows.map((r) => r.user_id)).toEqual(["u9"]);
  });

  it("a password reset revokes remembered devices", async () => {
    await issueTrustedDevice(env, "u1", req("/", {}));
    sql.prepare("INSERT INTO password_reset_codes (psid, user_id, code, verified, expires_at, created_at) VALUES ('ps1','u1','123456',1,?,?)").run(Date.now() + 60000, Date.now());
    const res = await resetPassword({ request: req("/api/auth/reset-password", { password: "a-brand-new-password-1" }, "sikhiuni_pwreset_psid=ps1"), env } as any);
    if (res.status === 200) expect((sql.prepare("SELECT COUNT(*) AS n FROM mfa_trusted_devices").get() as any).n).toBe(0);
    else throw new Error("reset-password returned " + res.status + " " + (await res.text()));
  });
});

describe("POST /api/auth/mfa/backup-codes", () => {
  async function verifiedSession() {
    const s = await signIn();
    await verify({ request: req("/api/auth/mfa/verify", { code: await totp(secret) }, `su_session=${s.sid}`), env } as any);
    return s.sid;
  }

  it("replaces all backup codes with 10 new ones when given a current code", async () => {
    const sid = await verifiedSession();
    const res = await backupCodes({ request: req("/api/auth/mfa/backup-codes", { code: await totp(secret) }, `su_session=${sid}`), env } as any);
    const body = await res.json();
    expect(body.backupCodes).toHaveLength(10);
    const stored: any[] = sql.prepare("SELECT code_hash FROM mfa_backup_codes WHERE user_id='u1'").all() as any;
    expect(stored).toHaveLength(10);
    expect(stored.map((r) => r.code_hash)).not.toContain(await sha256Hex("AAAA1111")); // old codes are gone
  });

  it("refuses a wrong code and leaves the old codes alone", async () => {
    const sid = await verifiedSession();
    const res = await backupCodes({ request: req("/api/auth/mfa/backup-codes", { code: "000000" }, `su_session=${sid}`), env } as any);
    expect(res.status).toBe(400);
    expect((sql.prepare("SELECT COUNT(*) AS n FROM mfa_backup_codes").get() as any).n).toBe(2);
  });

  it("refuses a session that has not passed the MFA step", async () => {
    const s = await signIn();
    const res = await backupCodes({ request: req("/api/auth/mfa/backup-codes", { code: await totp(secret) }, `su_session=${s.sid}`), env } as any);
    expect(res.status).toBe(403);
  });
});
