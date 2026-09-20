// The first-landing branch of GET /api/auth/sso must persist the marketing
// opt-in and send exactly one welcome email, and must do neither on any other
// path.
//
// 2026-09-06: this file also covered POST /api/auth/signup. That route is now
// a 410 — registration is the two-step register-start/register-complete pair —
// and its opt-in + email coverage moved to test/auth-registration.test.ts.
// SSO provisioning is the OTHER path that can still create a user, and it
// still sends welcomeTemplate(), because an SSO arrival never sees a
// registration code (Q2 of the plan: one email per account per lifetime,
// never per login).
//
// test/helpers.ts's mockEnv resolves scripted rows but doesn't record the SQL
// it was handed, and what matters here IS the SQL and its bound values. So
// this file uses its own recording DB mock in the same shape (prepare -> bind
// -> first/run/all) that the handlers already expect.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type Call = { sql: string; args: unknown[] };

function recordingEnv(opts: {
  existingUser?: unknown;
  resendKey?: string;
  failOnOptinColumn?: boolean;
} = {}) {
  const calls: Call[] = [];
  const DB = {
    prepare(sql: string) {
      const stmt = {
        _args: [] as unknown[],
        bind(...args: unknown[]) { stmt._args = args; return stmt; },
        async first() {
          calls.push({ sql, args: stmt._args });
          if (sql.includes("FROM users WHERE email")) return opts.existingUser ?? null;
          if (sql.includes("FROM user_mfa")) return null; // never MFA-enrolled in these tests
          return null;
        },
        async run() {
          calls.push({ sql, args: stmt._args });
          if (opts.failOnOptinColumn && sql.includes("marketing_optin")) {
            throw new Error("D1_ERROR: table users has no column named marketing_optin");
          }
          return { success: true };
        },
        async all() { calls.push({ sql, args: stmt._args }); return { results: [] }; },
      };
      return stmt;
    },
  };
  const env: Record<string, unknown> = { DB, ADMIN_EMAILS: "", SITE_URL: "https://sikhiuni.com" };
  if (opts.resendKey) env.RESEND_API_KEY = opts.resendKey;
  return { env, calls, DB };
}

const userInsert = (calls: Call[]) => calls.find((c) => c.sql.startsWith("INSERT INTO users"));
const optinUpdates = (calls: Call[]) => calls.filter((c) => /UPDATE users[\s\S]*marketing_optin/i.test(c.sql));

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); });

const welcomeSends = () =>
  fetchMock.mock.calls.filter(([url, init]: any[]) =>
    String(url).includes("api.resend.com") && String(init?.body ?? "").includes("Welcome to Sikhi University"));

// ── POST /api/auth/signup — RETIRED 2026-09-06 ──────────────────────────────
// The instant-signup route this file used to cover is now a 410. Its opt-in
// and welcome-email coverage moved to test/auth-registration.test.ts, against
// the register-start/register-complete pair that replaced it. What is left
// here is the SSO provisioning branch, which is unchanged and still the other
// path that can create a user.

// ── GET /api/auth/sso ───────────────────────────────────────────────────────
// The token is verified by _sso.js; these tests mock that boundary so they can
// exercise the provision-vs-existing branching directly, which is the part
// this task changed. Token verification itself is covered by the canonical
// vectors in the existing SSO tests and is untouched here.

describe("GET /api/auth/sso — provision branch only", () => {
  const ssoReq = () => new Request("https://sikhiuni.com/api/auth/sso?sso_token=t&return=/dashboard.html");

  it("a token WITH the claim seeds marketing_optin on first landing", async () => {
    vi.resetModules();
    vi.doMock("../functions/_sso.js", () => ({ verifySsoToken: async () => ({ email: "new@b.com", name: "New", iss: "sikhi.io", marketingOptIn: true }) }));
    const { onRequestGet } = await import("../functions/api/auth/sso.js");
    const { env, calls } = recordingEnv({ resendKey: "re_test" });
    env.SSO_SHARED_SECRET = "a".repeat(64);
    const res = await onRequestGet({ request: ssoReq(), env } as any);
    expect(res.status).toBe(302);
    const insert = userInsert(calls)!;
    expect(insert.sql).toContain("marketing_optin");
    expect(insert.args.at(-1)).toBe(1);
    vi.doUnmock("../functions/_sso.js");
  });

  it("a token WITHOUT the claim provisions with 0 — absence is not consent", async () => {
    vi.resetModules();
    vi.doMock("../functions/_sso.js", () => ({ verifySsoToken: async () => ({ email: "new@b.com", name: null, iss: "sikhi.io" }) }));
    const { onRequestGet } = await import("../functions/api/auth/sso.js");
    const { env, calls } = recordingEnv();
    env.SSO_SHARED_SECRET = "a".repeat(64);
    await onRequestGet({ request: ssoReq(), env } as any);
    expect(userInsert(calls)!.args.at(-1)).toBe(0);
    vi.doUnmock("../functions/_sso.js");
  });

  it("sends the welcome on first landing", async () => {
    vi.resetModules();
    vi.doMock("../functions/_sso.js", () => ({ verifySsoToken: async () => ({ email: "new@b.com", name: null, iss: "sikhi.io" }) }));
    const { onRequestGet } = await import("../functions/api/auth/sso.js");
    const { env } = recordingEnv({ resendKey: "re_test" });
    env.SSO_SHARED_SECRET = "a".repeat(64);
    await onRequestGet({ request: ssoReq(), env } as any);
    expect(welcomeSends()).toHaveLength(1);
    vi.doUnmock("../functions/_sso.js");
  });

  it("an EXISTING user: no optin write, no INSERT, no welcome", async () => {
    // The whole point of the provision-only rule: a local choice must not be
    // clobbered by the hub's echo on every subsequent login, and a returning
    // user must not be welcomed again.
    vi.resetModules();
    vi.doMock("../functions/_sso.js", () => ({ verifySsoToken: async () => ({ email: "old@b.com", name: null, iss: "sikhi.io", marketingOptIn: true }) }));
    const { onRequestGet } = await import("../functions/api/auth/sso.js");
    const { env, calls } = recordingEnv({ existingUser: { id: "u1", role: "learner" }, resendKey: "re_test" });
    env.SSO_SHARED_SECRET = "a".repeat(64);
    const res = await onRequestGet({ request: ssoReq(), env } as any);
    expect(res.status).toBe(302);
    expect(userInsert(calls)).toBeUndefined();
    expect(optinUpdates(calls)).toHaveLength(0);
    expect(welcomeSends()).toHaveLength(0);
    vi.doUnmock("../functions/_sso.js");
  });

  it("an invalid token still fails closed — no user, no mail", async () => {
    vi.resetModules();
    vi.doMock("../functions/_sso.js", () => ({ verifySsoToken: async () => null }));
    const { onRequestGet } = await import("../functions/api/auth/sso.js");
    const { env, calls } = recordingEnv({ resendKey: "re_test" });
    env.SSO_SHARED_SECRET = "a".repeat(64);
    const res = await onRequestGet({ request: ssoReq(), env } as any);
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toContain("login.html?error=");
    expect(userInsert(calls)).toBeUndefined();
    expect(welcomeSends()).toHaveLength(0);
    vi.doUnmock("../functions/_sso.js");
  });
});
