// Cross-domain SSO consumer tests -- see
// .cc/plan-sso-receiver-punjabiuni-sikhiuni.md, Task 4, in the sikhi.io repo.
//
// Two layers: (1) fixture-driven assertions against verifySsoToken itself
// (functions/_sso.js), proving this repo's copy of the verifier agrees with
// the canonical vectors generated in sikhi.io -- the same crypto function is
// duplicated in three separate repos with no shared package, so nothing else
// pins them to stay in sync; (2) route-level tests against
// functions/api/auth/sso.js's onRequestGet, with a small self-contained D1
// mock (this route's query shape -- users/sessions/user_mfa lookups keyed by
// email/id -- doesn't overlap enough with test/helpers.ts's existing
// certificate/cohort-oriented mock to be worth extending there).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { verifySsoToken } from "../functions/_sso.js";
import { onRequestGet } from "../functions/api/auth/sso.js";
import vectors from "./fixtures/sso-test-vectors.json";

describe("verifySsoToken (canonical fixture, matches sikhi.io's issuer + punjabiuni's copy)", () => {
  const secretByName: Record<string, string> = { secret: vectors.secret, wrongSecret: vectors.wrongSecret };

  for (const v of vectors.vectors) {
    it(`${v.name}: ${v.expected}`, async () => {
      vi.useFakeTimers();
      vi.setSystemTime(v.verifyAt);
      const secret = secretByName[v.verifyWith];
      const result = await verifySsoToken(v.token, secret);
      vi.useRealTimers();

      if (v.expected === "null") {
        expect(result).toBeNull();
      } else {
        expect(result).not.toBeNull();
        expect(result).toEqual(v.payload);
      }
    });
  }
});

// --- Route-level: a small self-contained D1 mock scoped to this file. ---

type UsersRow = { id: string; email: string; name: string | null; role: string };
type SessionsRow = { id: string; user_id: string; expires_at: number; mfa_ok: number };

function makeDb(opts: { users?: UsersRow[]; mfaEnrolledUserIds?: string[] } = {}) {
  const users: UsersRow[] = opts.users ? [...opts.users] : [];
  const sessions: SessionsRow[] = [];
  const mfaEnrolled = new Set(opts.mfaEnrolledUserIds || []);

  function stmt(sql: string) {
    let bound: any[] = [];
    return {
      bind(...args: any[]) {
        bound = args;
        return this;
      },
      async first() {
        if (sql.includes("FROM users WHERE email")) {
          const [email] = bound;
          const u = users.find((x) => x.email === email);
          return u ? { id: u.id, role: u.role } : null;
        }
        if (sql.includes("FROM user_mfa WHERE user_id")) {
          const [userId] = bound;
          return mfaEnrolled.has(userId) ? { enabled_at: 1 } : null;
        }
        return null;
      },
      async run() {
        if (sql.includes("INSERT INTO users")) {
          const [id, email, name, role] = bound;
          users.push({ id, email, name: name ?? null, role });
        } else if (sql.includes("INSERT INTO sessions")) {
          const [id, user_id, expires_at, mfa_ok] = bound;
          sessions.push({ id, user_id, expires_at, mfa_ok });
        } else if (sql.includes("UPDATE users SET role=")) {
          const [id] = bound;
          const u = users.find((x) => x.id === id);
          if (u) u.role = sql.includes("'admin'") ? "admin" : "learner";
        }
        // CREATE TABLE / events insert / anything else: no-op.
        return { success: true };
      },
      async all() {
        return { results: [] };
      },
    };
  }

  return { DB: { prepare: (sql: string) => stmt(sql) }, _users: users, _sessions: sessions };
}

function makeEnv(overrides: Partial<{ SSO_SHARED_SECRET: string; ADMIN_EMAILS: string; SITE_URL: string }> = {}, dbOpts?: Parameters<typeof makeDb>[0]) {
  const { DB, _users, _sessions } = makeDb(dbOpts);
  return {
    env: { DB, SSO_SHARED_SECRET: vectors.secret, ADMIN_EMAILS: "", SITE_URL: "https://sikhiuni.com", ...overrides },
    _users,
    _sessions,
  };
}

function ssoUrl(token: string, ret?: string) {
  const u = new URL("https://sikhiuni.com/api/auth/sso");
  u.searchParams.set("sso_token", token);
  if (ret !== undefined) u.searchParams.set("return", ret);
  return u.toString();
}

const validVector = vectors.vectors.find((v) => v.name === "valid")!;
const foreignIssVector = vectors.vectors.find((v) => v.name === "foreign-iss")!;
const expiredVector = vectors.vectors.find((v) => v.name === "expired")!;

describe("GET /api/auth/sso (route)", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("valid token + brand-new email: creates a user row, creates a session, sets su_session, redirects to the return path", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(validVector.verifyAt);
    const { env, _users, _sessions } = makeEnv();
    const req = { request: new Request(ssoUrl(validVector.token, "/dashboard.html")), env };
    const res = await onRequestGet(req as any);
    vi.useRealTimers();

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("https://sikhiuni.com/dashboard.html");
    expect(res.headers.get("Set-Cookie")).toMatch(/^su_session=/);
    expect(_users).toHaveLength(1);
    expect(_users[0].email).toBe(validVector.payload!.email);
    expect(_sessions).toHaveLength(1);
  });

  it("valid token + EXISTING email: no new user row, a session is still created", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(validVector.verifyAt);
    const existing: UsersRow = { id: "existing-1", email: validVector.payload!.email, name: "Person", role: "learner" };
    const { env, _users, _sessions } = makeEnv({}, { users: [existing] });
    const req = { request: new Request(ssoUrl(validVector.token, "/dashboard.html")), env };
    const res = await onRequestGet(req as any);
    vi.useRealTimers();

    expect(res.status).toBe(302);
    expect(_users).toHaveLength(1); // unchanged -- no duplicate
    expect(_sessions).toHaveLength(1);
    expect(_sessions[0].user_id).toBe("existing-1");
  });

  it("foreign-iss vector (cryptographically valid, iss !== sikhi.io): login-error redirect, no session created", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(foreignIssVector.verifyAt);
    const { env, _sessions } = makeEnv();
    const req = { request: new Request(ssoUrl(foreignIssVector.token, "/dashboard.html")), env };
    const res = await onRequestGet(req as any);
    vi.useRealTimers();

    expect(res.status).toBe(302);
    const loc = res.headers.get("Location")!;
    expect(loc).toContain("/login.html?error=");
    expect(loc).not.toContain("dashboard.html");
    expect(_sessions).toHaveLength(0);
  });

  it("expired token: login-error redirect, no session", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(expiredVector.verifyAt);
    const { env, _sessions } = makeEnv();
    const req = { request: new Request(ssoUrl(expiredVector.token, "/dashboard.html")), env };
    const res = await onRequestGet(req as any);
    vi.useRealTimers();

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toContain("/login.html?error=");
    expect(_sessions).toHaveLength(0);
  });

  it("return=//evil.com and return=https://evil.com both fall back to /dashboard.html", async () => {
    for (const ret of ["//evil.com", "https://evil.com"]) {
      vi.useFakeTimers();
      vi.setSystemTime(validVector.verifyAt);
      const { env } = makeEnv();
      const req = { request: new Request(ssoUrl(validVector.token, ret)), env };
      const res = await onRequestGet(req as any);
      vi.useRealTimers();
      expect(res.headers.get("Location")).toBe("https://sikhiuni.com/dashboard.html");
    }
  });

  it("missing SSO_SHARED_SECRET: 'not configured' error redirect, no session", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(validVector.verifyAt);
    const { env, _sessions } = makeEnv({ SSO_SHARED_SECRET: undefined as any });
    const req = { request: new Request(ssoUrl(validVector.token, "/dashboard.html")), env };
    const res = await onRequestGet(req as any);
    vi.useRealTimers();

    expect(res.status).toBe(302);
    expect(decodeURIComponent(res.headers.get("Location")!)).toContain("not configured");
    expect(_sessions).toHaveLength(0);
  });

  it("MFA-enrolled user: redirected to /mfa.html with an mfa_ok=0 session", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(validVector.verifyAt);
    const existing: UsersRow = { id: "mfa-user-1", email: validVector.payload!.email, name: "Person", role: "learner" };
    const { env, _sessions } = makeEnv({}, { users: [existing], mfaEnrolledUserIds: ["mfa-user-1"] });
    const req = { request: new Request(ssoUrl(validVector.token, "/dashboard.html")), env };
    const res = await onRequestGet(req as any);
    vi.useRealTimers();

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("https://sikhiuni.com/mfa.html");
    expect(_sessions).toHaveLength(1);
    expect(_sessions[0].mfa_ok).toBe(0);
  });
});
