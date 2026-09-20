// Login by username-or-email, sliding session renewal, and the logout
// regression check (tasks 12 and 15 of the three-site auth standardization).
//
// The properties that matter beyond "it works":
//   • the email path must be byte-equivalent to the pre-change behavior —
//     this is live auth with real users on it;
//   • an unknown USERNAME must run the dummy hash exactly like an unknown
//     email, or the new branch is a username-enumeration oracle;
//   • renewal must never resurrect an expired session;
//   • logout must delete the row, not just clear the cookie.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { onRequestPost as loginPost } from "../functions/api/auth/login.js";
import { onRequestGet as meGet } from "../functions/api/me.js";
import { onRequestPost as logoutPost } from "../functions/api/auth/logout.js";
import { hashPassword } from "../functions/_password.js";

type Row = Record<string, any>;

function statefulEnv(seed: { users?: Row[]; sessions?: Row[] } = {}) {
  const tables: Record<string, Row[]> = {
    users: seed.users ? [...seed.users] : [],
    sessions: seed.sessions ? [...seed.sessions] : [],
  };
  const sqlLog: string[] = [];

  const DB = {
    prepare(sql: string) {
      sqlLog.push(sql);
      const stmt: any = {
        _args: [] as any[],
        bind(...args: any[]) { stmt._args = args; return stmt; },
        async first() {
          const a = stmt._args;
          if (sql.includes("FROM users WHERE email")) return tables.users.find((u) => u.email === a[0]) ?? null;
          if (sql.includes("FROM users WHERE username")) return tables.users.find((u) => u.username === a[0]) ?? null;
          if (sql.includes("FROM sessions s JOIN users u")) {
            const s = tables.sessions.find((x) => x.id === a[0] && x.expires_at > a[1]);
            if (!s) return null;
            const u = tables.users.find((x) => x.id === s.user_id);
            return u ? { ...u, mfa_ok: s.mfa_ok } : null;
          }
          if (sql.includes("FROM sessions WHERE id")) return tables.sessions.find((s) => s.id === a[0]) ?? null;
          if (sql.includes("FROM user_mfa")) return null;
          if (sql.includes("FROM course_teachers")) return null;
          return null;
        },
        async run() {
          const a = stmt._args;
          if (sql.startsWith("INSERT INTO sessions")) {
            tables.sessions.push({ id: a[0], user_id: a[1], expires_at: a[2], mfa_ok: a[3] ?? 1 });
          } else if (sql.startsWith("UPDATE sessions SET expires_at")) {
            const s = tables.sessions.find((x) => x.id === a[1]);
            if (s) s.expires_at = a[0];
          } else if (sql.startsWith("DELETE FROM sessions")) {
            tables.sessions = tables.sessions.filter((x) => x.id !== a[0]);
          }
          return { success: true };
        },
        async all() { return { results: [] }; },
      };
      return stmt;
    },
  };
  return { env: { DB, ADMIN_EMAILS: "" } as any, tables, sqlLog };
}

const PW = "correct-horse-battery";
const DAY = 24 * 60 * 60 * 1000;

const loginReq = (body: unknown) =>
  new Request("https://sikhiuni.com/api/auth/login", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });

describe("POST /api/auth/login — username or email", () => {
  let env: any, tables: any;
  beforeEach(async () => {
    const hash = await hashPassword(PW);
    ({ env, tables } = statefulEnv({
      users: [{ id: "u1", email: "harjit@example.com", username: "harjit", role: "learner", password_hash: hash }],
    }));
  });

  it("signs in by email — the pre-existing path", async () => {
    const res = await loginPost({ request: loginReq({ identifier: "harjit@example.com", password: PW }), env } as any);
    expect(res.status).toBe(200);
    expect(tables.sessions).toHaveLength(1);
  });

  it("signs in by username", async () => {
    const res = await loginPost({ request: loginReq({ identifier: "harjit", password: PW }), env } as any);
    expect(res.status).toBe(200);
    expect(tables.sessions).toHaveLength(1);
  });

  it("still accepts the legacy { email } body shape", async () => {
    const res = await loginPost({ request: loginReq({ email: "harjit@example.com", password: PW }), env } as any);
    expect(res.status).toBe(200);
  });

  it("normalizes case and whitespace on both branches", async () => {
    expect((await loginPost({ request: loginReq({ identifier: "  Harjit@Example.COM " , password: PW }), env } as any)).status).toBe(200);
    expect((await loginPost({ request: loginReq({ identifier: " HARJIT ", password: PW }), env } as any)).status).toBe(200);
  });

  it("a wrong password fails on both branches", async () => {
    expect((await loginPost({ request: loginReq({ identifier: "harjit", password: "nope-nope-nope" }), env } as any)).status).toBe(401);
    expect((await loginPost({ request: loginReq({ identifier: "harjit@example.com", password: "nope-nope-nope" }), env } as any)).status).toBe(401);
    expect(tables.sessions).toHaveLength(0);
  });

  it("an unknown username still runs the dummy hash — same work as an unknown email", async () => {
    const spy = vi.spyOn(crypto.subtle, "deriveBits");

    spy.mockClear();
    const a = await loginPost({ request: loginReq({ identifier: "nobody", password: PW }), env } as any);
    const unknownUsernameDerives = spy.mock.calls.length;

    spy.mockClear();
    const b = await loginPost({ request: loginReq({ identifier: "nobody@example.com", password: PW }), env } as any);
    const unknownEmailDerives = spy.mock.calls.length;

    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(await a.json()).toEqual(await b.json()); // identical message: no oracle
    expect(unknownUsernameDerives).toBeGreaterThan(0);
    expect(unknownUsernameDerives).toBe(unknownEmailDerives);
    spy.mockRestore();
  });

  it("a legacy passwordless account cannot be logged into, by either identifier", async () => {
    tables.users.push({ id: "u2", email: "legacy@example.com", username: null, role: "learner", password_hash: null });
    expect((await loginPost({ request: loginReq({ identifier: "legacy@example.com", password: PW }), env } as any)).status).toBe(401);
    // ...and an empty identifier must not match that NULL username.
    expect((await loginPost({ request: loginReq({ identifier: "", password: PW }), env } as any)).status).toBe(400);
  });
});

describe("GET /api/me — sliding session renewal", () => {
  function envWithSession(daysLeft: number) {
    return statefulEnv({
      users: [{ id: "u1", email: "h@example.com", username: "harjit", role: "learner", marketing_optin: 0 }],
      sessions: [{ id: "SID", user_id: "u1", expires_at: Date.now() + daysLeft * DAY, mfa_ok: 1 }],
    });
  }
  const meReq = (cookie?: string) =>
    new Request("https://sikhiuni.com/api/me", cookie ? { headers: { Cookie: cookie } } : {});

  it("renews back to 30 days when below the threshold (10 days left)", async () => {
    const { env, tables } = envWithSession(10);
    const res = await meGet({ request: meReq("su_session=SID"), env } as any);
    expect(res.status).toBe(200);
    expect(res.headers.get("Set-Cookie")).toBe("su_session=SID; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000");
    const left = tables.sessions[0].expires_at - Date.now();
    expect(left).toBeGreaterThan(29.9 * DAY);
  });

  it("does NOT renew when there is plenty of life left (20 days)", async () => {
    const { env, tables } = envWithSession(20);
    const before = tables.sessions[0].expires_at;
    const res = await meGet({ request: meReq("su_session=SID"), env } as any);
    expect(res.headers.get("Set-Cookie")).toBeNull();
    expect(tables.sessions[0].expires_at).toBe(before);
  });

  it("boundary: just above 15 days no, just below yes", async () => {
    const above = envWithSession(15.1);
    expect((await meGet({ request: meReq("su_session=SID"), env: above.env } as any)).headers.get("Set-Cookie")).toBeNull();
    const below = envWithSession(14.9);
    expect((await meGet({ request: meReq("su_session=SID"), env: below.env } as any)).headers.get("Set-Cookie")).not.toBeNull();
  });

  it("an expired session is null and is never resurrected", async () => {
    const { env, tables } = envWithSession(-1);
    const before = tables.sessions[0].expires_at;
    const res = await meGet({ request: meReq("su_session=SID"), env } as any);
    expect(await res.json()).toEqual({ user: null });
    expect(res.headers.get("Set-Cookie")).toBeNull();
    expect(tables.sessions[0].expires_at).toBe(before);
  });

  it("no cookie -> null user, no renewal, no write", async () => {
    const { env } = envWithSession(10);
    const res = await meGet({ request: meReq(), env } as any);
    expect(await res.json()).toEqual({ user: null });
    expect(res.headers.get("Set-Cookie")).toBeNull();
  });

  it("a renewal failure never breaks the session read every page depends on", async () => {
    const { env } = envWithSession(10);
    const realPrepare = env.DB.prepare.bind(env.DB);
    env.DB.prepare = (sql: string) => {
      if (sql.startsWith("UPDATE sessions SET expires_at")) {
        return { bind: () => ({ run: async () => { throw new Error("D1 down"); } }) };
      }
      return realPrepare(sql);
    };
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const res = await meGet({ request: meReq("su_session=SID"), env } as any);
    expect(res.status).toBe(200);
    expect((await res.json() as any).user.id).toBe("u1");
    log.mockRestore();
  });
});

describe("POST /api/auth/logout — the row, not just the cookie", () => {
  it("a logged-out session token no longer resolves", async () => {
    const { env, tables } = statefulEnv({
      users: [{ id: "u1", email: "h@example.com", username: "harjit", role: "learner", marketing_optin: 0 }],
      sessions: [{ id: "SID", user_id: "u1", expires_at: Date.now() + 30 * DAY, mfa_ok: 1 }],
    });
    const cookie = "su_session=SID";

    const before = await meGet({ request: new Request("https://sikhiuni.com/api/me", { headers: { Cookie: cookie } }), env } as any);
    expect((await before.json() as any).user.id).toBe("u1");

    await logoutPost({ request: new Request("https://sikhiuni.com/api/auth/logout", { method: "POST", headers: { Cookie: cookie } }), env } as any);
    // The row is gone — a captured cookie is worthless, not merely un-sent.
    expect(tables.sessions).toHaveLength(0);

    const after = await meGet({ request: new Request("https://sikhiuni.com/api/me", { headers: { Cookie: cookie } }), env } as any);
    expect(await after.json()).toEqual({ user: null });
  });
});
