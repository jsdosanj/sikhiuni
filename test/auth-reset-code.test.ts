// Password reset converged onto a 6-digit code + same-browser psid binding
// (task 14). Previously a clickable link — a bearer credential that signs in
// whatever device opens the email.
//
// One property beyond the happy path really matters here: the flow must
// STILL work for a legacy account with password_hash NULL, because "forgot
// password" doubling as "set my first password" is the on-ramp that made
// retiring magic-link sign-in safe.
//
// The legacy ?token grace-window branch (and its tests) were removed
// 2026-09-07, once an hour had comfortably passed since the deploy that
// converged this flow onto codes.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { onRequestPost as forgotPost } from "../functions/api/auth/forgot-password.js";
import { onRequestPost as verifyCodePost } from "../functions/api/auth/verify-reset-code.js";
import { onRequestPost as resetPost } from "../functions/api/auth/reset-password.js";

type Row = Record<string, any>;

function statefulEnv(seed: { users?: Row[] } = {}) {
  const tables: Record<string, Row[]> = {
    users: seed.users ? [...seed.users] : [],
    password_reset_codes: [],
    sessions: [],
  };

  const DB = {
    prepare(sql: string) {
      const stmt: any = {
        _args: [] as any[],
        bind(...args: any[]) { stmt._args = args; return stmt; },
        async first() {
          const a = stmt._args;
          if (sql.includes("FROM users WHERE email")) return tables.users.find((u) => u.email === a[0]) ?? null;
          if (sql.includes("FROM users WHERE id")) return tables.users.find((u) => u.id === a[0]) ?? null;
          if (sql.includes("FROM password_reset_codes WHERE psid") && sql.includes("verified = 1")) {
            return tables.password_reset_codes.find((r) => r.psid === a[0] && r.verified === 1 && r.expires_at > a[1]) ?? null;
          }
          if (sql.includes("FROM password_reset_codes WHERE psid")) {
            return tables.password_reset_codes.find((r) => r.psid === a[0] && r.expires_at > a[1]) ?? null;
          }
          if (sql.includes("FROM user_mfa")) return null;
          return null;
        },
        async run() {
          const a = stmt._args;
          if (sql.startsWith("DELETE FROM password_reset_codes WHERE user_id")) {
            tables.password_reset_codes = tables.password_reset_codes.filter((r) => r.user_id !== a[0]);
          } else if (sql.startsWith("DELETE FROM password_reset_codes WHERE psid")) {
            tables.password_reset_codes = tables.password_reset_codes.filter((r) => r.psid !== a[0]);
          } else if (sql.startsWith("INSERT INTO password_reset_codes")) {
            tables.password_reset_codes.push({
              psid: a[0], user_id: a[1], code: a[2], attempts: 0, verified: 0, expires_at: a[3], created_at: a[4],
            });
          } else if (sql.startsWith("UPDATE password_reset_codes SET attempts")) {
            const r = tables.password_reset_codes.find((x) => x.psid === a[0]);
            if (r) r.attempts += 1;
          } else if (sql.startsWith("UPDATE password_reset_codes SET verified = 1")) {
            const r = tables.password_reset_codes.find((x) => x.psid === a[1]);
            if (r) { r.verified = 1; r.expires_at = a[0]; }
          } else if (sql.startsWith("UPDATE users SET password_hash")) {
            const u = tables.users.find((x) => x.id === a[1]);
            if (u) u.password_hash = a[0];
          } else if (sql.startsWith("INSERT INTO sessions")) {
            tables.sessions.push({ id: a[0], user_id: a[1], expires_at: a[2], mfa_ok: a[3] });
          }
          return { success: true };
        },
        async all() { return { results: [] }; },
      };
      return stmt;
    },
  };
  return { env: { DB } as any, tables };
}

const post = (path: string, body: unknown, cookie?: string) =>
  new Request(`https://sikhiuni.com${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });

const psidFrom = (res: Response) =>
  (res.headers.get("Set-Cookie") || "").match(/sikhiuni_pwreset_psid=([^;]+)/)?.[1] ?? "";

const NEW_PW = "brand-new-password";

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); });

const codeSends = () =>
  fetchMock.mock.calls.filter(([url, init]: any[]) =>
    String(url).includes("api.resend.com") && /reset code/i.test(String(init?.body ?? "")));

describe("POST /api/auth/forgot-password — now a code", () => {
  it("writes a code row, sets an httpOnly psid cookie, and emails the code", async () => {
    const { env, tables } = statefulEnv({ users: [{ id: "u1", email: "h@example.com", role: "learner", password_hash: "old" }] });
    env.RESEND_API_KEY = "re_test";
    const res = await forgotPost({ request: post("/api/auth/forgot-password", { email: "h@example.com" }), env } as any);

    expect(res.status).toBe(200);
    expect(tables.password_reset_codes).toHaveLength(1);
    expect(tables.password_reset_codes[0].code).toMatch(/^\d{6}$/);
    const cookie = res.headers.get("Set-Cookie")!;
    expect(cookie).toContain("sikhiuni_pwreset_psid=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("Max-Age=900");
    expect(codeSends()).toHaveLength(1);
  });

  it("never returns the code in the body", async () => {
    const { env, tables } = statefulEnv({ users: [{ id: "u1", email: "h@example.com" }] });
    const res = await forgotPost({ request: post("/api/auth/forgot-password", { email: "h@example.com" }), env } as any);
    expect(await res.text()).not.toContain(tables.password_reset_codes[0].code);
  });

  it("an unknown email is INDISTINGUISHABLE — same status, same body, still a psid", async () => {
    const { env, tables } = statefulEnv({ users: [{ id: "u1", email: "real@example.com" }] });
    env.RESEND_API_KEY = "re_test";
    const real = await forgotPost({ request: post("/api/auth/forgot-password", { email: "real@example.com" }), env } as any);
    const fake = await forgotPost({ request: post("/api/auth/forgot-password", { email: "ghost@example.com" }), env } as any);

    expect(fake.status).toBe(real.status);
    expect(await fake.json()).toEqual(await real.json());
    expect(psidFrom(fake)).not.toBe("");
    // ...but no row exists for it, so the psid can never complete.
    expect(tables.password_reset_codes.every((r) => r.user_id === "u1")).toBe(true);
    expect(codeSends()).toHaveLength(1); // only the real one was mailed
  });

  it("a re-request invalidates the previous code", async () => {
    const { env, tables } = statefulEnv({ users: [{ id: "u1", email: "h@example.com" }] });
    const first = await forgotPost({ request: post("/api/auth/forgot-password", { email: "h@example.com" }), env } as any);
    const firstCode = tables.password_reset_codes[0].code;
    const firstPsid = psidFrom(first);
    await forgotPost({ request: post("/api/auth/forgot-password", { email: "h@example.com" }), env } as any);

    expect(tables.password_reset_codes).toHaveLength(1);
    const stale = await verifyCodePost({ request: post("/api/auth/verify-reset-code", { code: firstCode }, `sikhiuni_pwreset_psid=${firstPsid}`), env } as any);
    expect(stale.status).toBe(400);
  });
});

describe("the full code journey", () => {
  async function started(user: Row) {
    const { env, tables } = statefulEnv({ users: [user] });
    const res = await forgotPost({ request: post("/api/auth/forgot-password", { email: user.email }), env } as any);
    return { env, tables, psid: psidFrom(res), code: tables.password_reset_codes[0].code };
  }

  it("code -> verified -> new password -> signed in", async () => {
    const { env, tables, psid, code } = await started({ id: "u1", email: "h@example.com", role: "learner", password_hash: "old-hash" });
    const cookie = `sikhiuni_pwreset_psid=${psid}`;

    expect((await verifyCodePost({ request: post("/api/auth/verify-reset-code", { code }, cookie), env } as any)).status).toBe(200);
    expect(tables.password_reset_codes[0].verified).toBe(1);

    const done = await resetPost({ request: post("/api/auth/reset-password", { password: NEW_PW }, cookie), env } as any);
    expect(done.status).toBe(200);
    expect(tables.users[0].password_hash).not.toBe("old-hash");
    expect(tables.sessions).toHaveLength(1);
    expect(tables.password_reset_codes).toHaveLength(0); // ticket consumed

    const cookies = done.headers.getSetCookie?.() ?? [done.headers.get("Set-Cookie")!];
    expect(cookies.some((c: string) => /^su_session=/.test(c))).toBe(true);
    expect(cookies.some((c: string) => /^sikhiuni_pwreset_psid=;/.test(c) && c.includes("Max-Age=0"))).toBe(true);
  });

  it("WORKS FOR A LEGACY PASSWORDLESS ACCOUNT — this is the 'set my first password' on-ramp", async () => {
    // The property that made retiring magic-link sign-in safe. Nothing in the
    // flow looks at password_hash, so a NULL is treated like any other.
    const { env, tables, psid, code } = await started({ id: "u2", email: "legacy@example.com", role: "learner", password_hash: null });
    const cookie = `sikhiuni_pwreset_psid=${psid}`;
    await verifyCodePost({ request: post("/api/auth/verify-reset-code", { code }, cookie), env } as any);
    const done = await resetPost({ request: post("/api/auth/reset-password", { password: NEW_PW }, cookie), env } as any);
    expect(done.status).toBe(200);
    expect(typeof tables.users[0].password_hash).toBe("string");
    expect(tables.sessions).toHaveLength(1);
  });

  it("no psid cookie -> cannot verify and cannot complete", async () => {
    const { env, code } = await started({ id: "u1", email: "h@example.com" });
    expect((await verifyCodePost({ request: post("/api/auth/verify-reset-code", { code }), env } as any)).status).toBe(400);
    expect((await resetPost({ request: post("/api/auth/reset-password", { password: NEW_PW }), env } as any)).status).toBe(400);
  });

  it("a code alone, from another browser, is useless", async () => {
    const { env, code } = await started({ id: "u1", email: "h@example.com" });
    const res = await verifyCodePost({
      request: post("/api/auth/verify-reset-code", { code }, "sikhiuni_pwreset_psid=SOMEONE_ELSE"), env,
    } as any);
    expect(res.status).toBe(400);
  });

  it("caps at 8 attempts, then destroys the row", async () => {
    const { env, tables, psid, code } = await started({ id: "u1", email: "h@example.com" });
    const cookie = `sikhiuni_pwreset_psid=${psid}`;
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 1; i <= 8; i++) {
      expect((await verifyCodePost({ request: post("/api/auth/verify-reset-code", { code: wrong }, cookie), env } as any)).status).toBe(400);
      expect(tables.password_reset_codes[0].attempts).toBe(i);
    }
    expect((await verifyCodePost({ request: post("/api/auth/verify-reset-code", { code: wrong }, cookie), env } as any)).status).toBe(429);
    expect(tables.password_reset_codes).toHaveLength(0);
    // Even the right code is dead now.
    expect((await verifyCodePost({ request: post("/api/auth/verify-reset-code", { code }, cookie), env } as any)).status).toBe(400);
  });

  it("an unverified psid cannot set a password", async () => {
    const { env, psid } = await started({ id: "u1", email: "h@example.com" });
    const res = await resetPost({ request: post("/api/auth/reset-password", { password: NEW_PW }, `sikhiuni_pwreset_psid=${psid}`), env } as any);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "not_verified" });
  });

  it("a weak password is refused before anything is consumed", async () => {
    const { env, tables, psid, code } = await started({ id: "u1", email: "h@example.com" });
    const cookie = `sikhiuni_pwreset_psid=${psid}`;
    await verifyCodePost({ request: post("/api/auth/verify-reset-code", { code }, cookie), env } as any);
    const res = await resetPost({ request: post("/api/auth/reset-password", { password: "short" }, cookie), env } as any);
    expect(res.status).toBe(400);
    expect(tables.password_reset_codes).toHaveLength(1); // ticket survives
  });
});
