// Audit logging (plan Part A, approved 2026-11-11). Real SQLite (node:sqlite) so
// the actual SQL in _lib.js logEvent, _audit.js, admin/events.js, account/activity.js
// and auth/login.js runs. The events table starts in its OLD shape to prove the
// in-place upgrade (ensureAuditSchema) works on the production table.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { logEvent } from "../functions/api/_lib.js";
import { verifyChain, pruneAudit, rowHash, maskIp, deviceSummary } from "../functions/api/_audit.js";
import { onRequestGet as adminEvents } from "../functions/api/admin/events.js";
import { onRequestGet as activityGet, onRequestPost as activityPost } from "../functions/api/account/activity.js";
import { onRequestPost as login } from "../functions/api/auth/login.js";
import { hashPassword } from "../functions/_password.js";

const DAY = 24 * 3600 * 1000;
let sql: DatabaseSync, env: any;

function makeEnv() {
  sql = new DatabaseSync(":memory:");
  sql.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, username TEXT, name TEXT, country TEXT, languages TEXT, role TEXT, marketing_optin INTEGER DEFAULT 0, password_hash TEXT, email_verified INTEGER DEFAULT 1);
    CREATE TABLE sessions (id TEXT PRIMARY KEY, user_id TEXT, expires_at INTEGER, mfa_ok INTEGER NOT NULL DEFAULT 1, mfa_fail_count INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE user_mfa (user_id TEXT PRIMARY KEY, secret_enc TEXT NOT NULL, enabled_at INTEGER, created_at INTEGER NOT NULL);
    CREATE TABLE rate_limits (k TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL);
    CREATE TABLE events (id TEXT PRIMARY KEY, ts INTEGER NOT NULL, user_id TEXT, role TEXT, action TEXT NOT NULL, target TEXT, detail TEXT);
    INSERT INTO users (id, email, username, role) VALUES ('admin1','admin@x.com','admin','admin'), ('l1','learner@x.com','learner','learner'), ('l2','other@x.com','other','learner');
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
  return { DB };
}
const session = (sid: string, uid: string) => sql.prepare("INSERT INTO sessions (id, user_id, expires_at, mfa_ok) VALUES (?,?,?,1)").run(sid, uid, Date.now() + 1e6);
const reqAs = (sid: string, url = "https://sikhiuni.com/api/x", init: any = {}) =>
  new Request(url, { ...init, headers: { cookie: `su_session=${sid}`, "CF-Connecting-IP": "203.0.113.42", "User-Agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0", "cf-ray": "ray-1", "CF-IPCountry": "CA", "content-type": "application/json", ...(init.headers || {}) } });
const events = () => sql.prepare("SELECT * FROM events ORDER BY ts, rowid").all() as any[];

beforeEach(() => { env = makeEnv(); });
afterEach(() => vi.unstubAllGlobals());

describe("logEvent: context, structure, hash chain", () => {
  it("upgrades the old table in place and records request context without the raw session id", async () => {
    const e2 = Object.create(env); e2.AUDIT_REQUEST = reqAs("raw-session-id-123");
    await logEvent(e2, { id: "l1", role: "learner" }, "login", "learner", "password");
    const [r] = events();
    expect(r.ip).toBe("203.0.113.42");
    expect(r.country).toBe("CA");
    expect(r.ua).toContain("Chrome");
    expect(r.ray).toBe("ray-1");
    expect(r.session_hash).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(r)).not.toContain("raw-session-id-123");
    expect(r.outcome).toBe("ok");
    expect(r.hash).toBe(await rowHash(r));
  });

  it("chains rows (prev_hash = previous hash) and stores structure + before/after", async () => {
    await logEvent(env, { id: "admin1", role: "admin" }, "login", null, null);
    await new Promise((r) => setTimeout(r, 2));
    await logEvent(env, { id: "admin1", role: "admin" }, "role_change", "l1", "learner→teacher", { subject: "l1", targetType: "user", before: "learner", after: "teacher" });
    const [a, b] = events();
    expect(a.prev_hash).toBeNull();
    expect(b.prev_hash).toBe(a.hash);
    expect(b.subject_user_id).toBe("l1");
    expect(JSON.parse(b.detail)).toEqual({ note: "learner→teacher", before: "learner", after: "teacher" });
  });

  it("verifyChain: clean, then detects an edited row and a deleted row", async () => {
    for (let i = 0; i < 4; i++) { await logEvent(env, { id: "l1", role: "learner" }, "lesson_completed", "c" + i, null); await new Promise((r) => setTimeout(r, 2)); }
    expect((await verifyChain(env.DB)).broken).toEqual([]);
    const rows = events();
    sql.prepare("UPDATE events SET detail='tampered' WHERE id=?").run(rows[1].id);
    expect((await verifyChain(env.DB)).broken).toContain(rows[1].id);
    sql.prepare("UPDATE events SET detail=NULL WHERE id=?").run(rows[1].id);
    sql.prepare("DELETE FROM events WHERE id=?").run(rows[2].id);
    expect((await verifyChain(env.DB)).broken).toContain(rows[3].id); // its prev_hash now points at nothing
  });

  it("erasing network fields after 90 days does not break the chain", async () => {
    const e2 = Object.create(env); e2.AUDIT_REQUEST = reqAs("s");
    await logEvent(e2, { id: "l1", role: "learner" }, "login", null, null);
    sql.prepare("UPDATE events SET ip=NULL, ua=NULL, country=NULL").run();
    expect((await verifyChain(env.DB)).broken).toEqual([]);
  });
});

describe("retention", () => {
  it("learning 180d, everything 2y, network fields 90d", async () => {
    await logEvent(env, null, "login", null, null); // creates the upgraded table
    const now = Date.now();
    const ins = sql.prepare("INSERT INTO events (id, ts, action, ip, ua, country) VALUES (?,?,?,?,?,?)");
    ins.run("old-learning", now - 200 * DAY, "lesson_completed", null, null, null);
    ins.run("old-security", now - 200 * DAY, "login", "1.2.3.4", "UA", "CA");
    ins.run("ancient", now - 800 * DAY, "role_change", null, null, null);
    ins.run("recent", now - 10 * DAY, "login", "5.6.7.8", "UA", "CA");
    const out = await pruneAudit(env.DB, now);
    const ids = events().map((r) => r.id);
    expect(ids).not.toContain("old-learning");
    expect(ids).not.toContain("ancient");
    expect(ids).toContain("old-security");
    const sec: any = sql.prepare("SELECT ip, ua, country FROM events WHERE id='old-security'").get();
    expect(sec).toEqual({ ip: null, ua: null, country: null });
    const rec: any = sql.prepare("SELECT ip FROM events WHERE id='recent'").get();
    expect(rec.ip).toBe("5.6.7.8");
    expect(out.learning_deleted).toBe(1);
  });
});

describe("missing events now recorded", () => {
  it("a failed sign-in is logged against the account, never with the password", async () => {
    sql.prepare("UPDATE users SET password_hash=? WHERE id='l1'").run(await hashPassword("right-password-123"));
    const e2 = Object.create(env); e2.AUDIT_REQUEST = reqAs("none");
    const res = await login({ request: new Request("https://sikhiuni.com/api/auth/login", { method: "POST", body: JSON.stringify({ identifier: "learner", password: "wrong-password-xyz" }) }), env: e2 } as any);
    expect([401, 503]).toContain(res.status);
    const f = events().find((r) => r.action === "login_failed");
    expect(f).toBeTruthy();
    expect(f.subject_user_id).toBe("l1");
    expect(f.outcome).toBe("fail");
    expect(JSON.stringify(events())).not.toContain("wrong-password-xyz");
  });

  it("a learner hitting an admin route is logged as authz_denied, once per minute", async () => {
    session("s-l1", "l1");
    const r1 = await adminEvents({ request: reqAs("s-l1", "https://sikhiuni.com/api/admin/events"), env } as any);
    await adminEvents({ request: reqAs("s-l1", "https://sikhiuni.com/api/admin/events"), env } as any);
    expect(r1.status).toBe(403);
    const denied = events().filter((r) => r.action === "authz_denied");
    expect(denied).toHaveLength(1);
    expect(denied[0].target).toBe("/api/admin/events");
    expect(denied[0].outcome).toBe("denied");
  });
});

describe("admin audit API", () => {
  beforeEach(async () => {
    session("s-admin", "admin1");
    await logEvent(env, { id: "l1", role: "learner" }, "login", null, "100% done", {});
    await logEvent(env, null, "login_failed", "learner", "bad_credentials", { outcome: "fail", subject: "l1" });
    await logEvent(env, { id: "l2", role: "learner" }, "lesson_completed", "x", null);
  });
  const get = async (qs: string) => (await adminEvents({ request: reqAs("s-admin", "https://sikhiuni.com/api/admin/events?" + qs), env } as any));

  it("subject filter returns events by OR about one user (timeline)", async () => {
    const d = await (await get("subject=learner@x.com")).json();
    expect(d.events.map((e: any) => e.action).sort()).toEqual(["login", "login_failed"]);
  });
  it("failures preset", async () => {
    const d = await (await get("preset=failures")).json();
    expect(d.events.every((e: any) => e.outcome !== "ok")).toBe(true);
    expect(d.events.length).toBe(1);
  });
  it("q escapes LIKE wildcards ('%' is literal)", async () => {
    const d = await (await get("q=" + encodeURIComponent("%"))).json();
    expect(d.events.map((e: any) => e.detail)).toEqual(["100% done"]);
  });
  it("CSV export is itself audited and neutralises formulas", async () => {
    await logEvent(env, { id: "l2", role: "learner" }, "feedback_submitted", "=HYPERLINK(1)", null);
    const res = await get("format=csv");
    const text = await res.text();
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(text).toContain("'=HYPERLINK(1)");
    expect(events().some((r) => r.action === "export_audit" && r.user_id === "admin1")).toBe(true);
  });
});

describe("learner: recent activity + sign out everywhere", () => {
  it("shows only the user's own security rows, with masked IP and a device summary", async () => {
    session("s-l1", "l1");
    const e2 = Object.create(env); e2.AUDIT_REQUEST = reqAs("x");
    await logEvent(e2, { id: "l1", role: "learner" }, "login", null, null);
    await logEvent(e2, { id: "l2", role: "learner" }, "login", null, null);
    await logEvent(e2, { id: "l1", role: "learner" }, "lesson_completed", "c1", null); // not a security event
    const d = await (await activityGet({ request: reqAs("s-l1"), env } as any)).json();
    expect(d.activity).toHaveLength(1);
    expect(d.activity[0]).toMatchObject({ action: "login", label: "Signed in", ip: "203.0.113.x", device: "Chrome on Windows", country: "CA" });
  });

  it("sign out everywhere deletes every session and is logged", async () => {
    session("s-a", "l1"); session("s-b", "l1"); session("s-other", "l2");
    const res = await activityPost({ request: reqAs("s-a", "https://sikhiuni.com/api/account/activity", { method: "POST", body: JSON.stringify({ action: "sign_out_everywhere" }) }), env } as any);
    expect((await res.json()).sessions).toBe(2);
    expect((sql.prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id='l1'").get() as any).n).toBe(0);
    expect((sql.prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id='l2'").get() as any).n).toBe(1);
    expect(events().some((r) => r.action === "sessions_revoked" && r.subject_user_id === "l1")).toBe(true);
  });

  it("helpers", () => {
    expect(maskIp("2001:db8:85a3:0:0:8a2e:370:7334")).toBe("2001:db8:85a3:…");
    expect(deviceSummary("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604.1")).toBe("Safari on iOS");
  });
});

describe("alerts", () => {
  it("mfa_reset emails the team once per hour, not on every event", async () => {
    const send = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", send);
    env.CONTACT_RESEND_API_KEY = "k";
    await logEvent(env, { id: "admin1", role: "admin" }, "mfa_reset", "l1", null);
    await logEvent(env, { id: "admin1", role: "admin" }, "mfa_reset", "l2", null);
    expect(send).toHaveBeenCalledTimes(1);
    const body = JSON.parse((send.mock.calls[0] as any[])[1].body);
    expect(body.to).toEqual(["akaal@sikhi.io"]);
    expect(body.subject).toContain("mfa_reset");
  });
});
