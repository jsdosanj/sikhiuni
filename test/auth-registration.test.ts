// The 2026-09-06 username + emailed-code registration
// (functions/api/auth/register-{start,complete}.js).
//
// Registration is a LIFECYCLE — start writes a pending row, complete reads it
// back, a wrong code increments a counter in it, a ninth attempt destroys it —
// so test/helpers.ts's scripted-row mock (which can't remember what was
// written) is the wrong tool. This file uses a small stateful in-memory D1
// mock in the same prepare -> bind -> first/run/all shape the handlers expect.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { onRequestPost as registerStart } from "../functions/api/auth/register-start.js";
import { onRequestPost as registerComplete } from "../functions/api/auth/register-complete.js";
import { onRequestPost as signupPost } from "../functions/api/auth/signup.js";

type Row = Record<string, any>;

/** Stateful enough for these handlers' exact queries; anything unrecognised
 *  throws loudly rather than silently returning null, so a query that drifts
 *  fails the test instead of quietly passing. */
function statefulEnv(seed: { users?: Row[] } = {}) {
  const tables: Record<string, Row[]> = {
    users: seed.users ? [...seed.users] : [],
    pending_registrations: [],
    sessions: [],
    events: [],
  };

  const DB = {
    prepare(sql: string) {
      const stmt: any = {
        _args: [] as any[],
        bind(...args: any[]) { stmt._args = args; return stmt; },
        async first() {
          const a = stmt._args;
          if (sql.includes("FROM users WHERE email")) return tables.users.find((u) => u.email === a[0]) ?? null;
          if (sql.includes("FROM users WHERE username")) return tables.users.find((u) => u.username === a[0]) ?? null;
          if (sql.includes("FROM pending_registrations WHERE rsid")) {
            return tables.pending_registrations.find((p) => p.rsid === a[0] && p.expires_at > a[1]) ?? null;
          }
          if (sql.includes("FROM user_mfa")) return null;
          throw new Error("statefulEnv: unhandled first() SQL: " + sql);
        },
        async run() {
          const a = stmt._args;
          if (sql.startsWith("INSERT INTO users")) {
            const cols = sql.slice(sql.indexOf("(") + 1, sql.indexOf(")")).split(",").map((c) => c.trim());
            const row: Row = {};
            cols.forEach((c, i) => { row[c] = a[i]; });
            // Emulate the UNIQUE indexes the real schema carries; without
            // these the username-race path is untestable.
            if (row.username != null && tables.users.some((u) => u.username === row.username)) {
              throw new Error("D1_ERROR: UNIQUE constraint failed: users.username");
            }
            if (tables.users.some((u) => u.email === row.email)) {
              throw new Error("D1_ERROR: UNIQUE constraint failed: users.email");
            }
            tables.users.push(row);
            return { success: true };
          }
          if (sql.startsWith("INSERT INTO pending_registrations")) {
            tables.pending_registrations.push({
              rsid: a[0], email: a[1], username: a[2], code: a[3],
              attempts: 0, marketing: a[4], expires_at: a[5], created_at: a[6],
            });
            return { success: true };
          }
          if (sql.startsWith("DELETE FROM pending_registrations WHERE email")) {
            tables.pending_registrations = tables.pending_registrations.filter((p) => p.email !== a[0]);
            return { success: true };
          }
          if (sql.startsWith("DELETE FROM pending_registrations WHERE rsid")) {
            tables.pending_registrations = tables.pending_registrations.filter((p) => p.rsid !== a[0]);
            return { success: true };
          }
          if (sql.startsWith("UPDATE pending_registrations SET attempts")) {
            const p = tables.pending_registrations.find((r) => r.rsid === a[0]);
            if (p) p.attempts += 1;
            return { success: true };
          }
          if (sql.startsWith("INSERT INTO sessions")) {
            tables.sessions.push({ id: a[0], user_id: a[1], expires_at: a[2], mfa_ok: a[3] ?? 1 });
            return { success: true };
          }
          // logEvent creates/inserts into events, best-effort by design.
          if (sql.includes("events")) return { success: true };
          throw new Error("statefulEnv: unhandled run() SQL: " + sql);
        },
        async all() { return { results: [] }; },
      };
      return stmt;
    },
  };

  return { env: { DB, ADMIN_EMAILS: "", SITE_URL: "https://sikhiuni.com" } as any, tables };
}

const startReq = (body: unknown) =>
  new Request("https://sikhiuni.com/api/auth/register-start", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
const completeReq = (body: unknown, rsid?: string) =>
  new Request("https://sikhiuni.com/api/auth/register-complete", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(rsid ? { Cookie: `sikhiuni_reg_rsid=${rsid}` } : {}),
    },
    body: JSON.stringify(body),
  });

const rsidFrom = (res: Response) =>
  (res.headers.get("Set-Cookie") || "").match(/sikhiuni_reg_rsid=([^;]+)/)?.[1] ?? "";

const PW = "correct-horse-battery";

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); });

const codeSends = () =>
  fetchMock.mock.calls.filter(([url, init]: any[]) =>
    String(url).includes("api.resend.com") && /confirmation code/i.test(String(init?.body ?? "")));

describe("POST /api/auth/register-start", () => {
  it("writes a pending row and sets an httpOnly rsid cookie — and creates NO user", async () => {
    const { env, tables } = statefulEnv();
    const res = await registerStart({ request: startReq({ username: "Harjit", email: "H@Example.com" }), env } as any);

    expect(res.status).toBe(200);
    expect(tables.users).toHaveLength(0);
    expect(tables.pending_registrations).toHaveLength(1);
    expect(tables.pending_registrations[0].email).toBe("h@example.com"); // normalized
    expect(tables.pending_registrations[0].username).toBe("harjit");
    expect(tables.pending_registrations[0].code).toMatch(/^\d{6}$/);

    const cookie = res.headers.get("Set-Cookie")!;
    expect(cookie).toContain("sikhiuni_reg_rsid=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Max-Age=900");
  });

  it("never returns the code in the response body", async () => {
    const { env, tables } = statefulEnv();
    const res = await registerStart({ request: startReq({ username: "harjit", email: "h@example.com" }), env } as any);
    const body = await res.text();
    expect(body).not.toContain(tables.pending_registrations[0].code);
  });

  it("emails exactly one code when a key is configured", async () => {
    const { env } = statefulEnv();
    env.RESEND_API_KEY = "re_test";
    await registerStart({ request: startReq({ username: "harjit", email: "h@example.com" }), env } as any);
    expect(codeSends()).toHaveLength(1);
  });

  it("no key -> no send, no crash, still ok (an outage degrades to 'resend')", async () => {
    const { env } = statefulEnv();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const res = await registerStart({ request: startReq({ username: "harjit", email: "h@example.com" }), env } as any);
    expect(res.status).toBe(200);
    expect(codeSends()).toHaveLength(0);
    log.mockRestore();
  });

  it("uses waitUntil when the Pages context provides one", async () => {
    const { env } = statefulEnv();
    env.RESEND_API_KEY = "re_test";
    const waitUntil = vi.fn();
    await registerStart({ request: startReq({ username: "harjit", email: "h@example.com" }), env, waitUntil } as any);
    expect(waitUntil).toHaveBeenCalledTimes(1);
  });

  it("409s a taken email or username, and writes nothing", async () => {
    const { env, tables } = statefulEnv({ users: [{ id: "u1", email: "taken@b.com", username: "taken" }] });
    const a = await registerStart({ request: startReq({ username: "fresh", email: "taken@b.com" }), env } as any);
    expect(a.status).toBe(409);
    expect(await a.json()).toMatchObject({ code: "email_taken" });

    const b = await registerStart({ request: startReq({ username: "taken", email: "fresh@b.com" }), env } as any);
    expect(b.status).toBe(409);
    expect(await b.json()).toMatchObject({ code: "username_taken" });

    expect(tables.pending_registrations).toHaveLength(0);
  });

  it("400s a bad username or email", async () => {
    const { env } = statefulEnv();
    const cases: Array<[unknown, string]> = [
      [{ username: "chutiya", email: "a@b.com" }, "profanity"],
      [{ username: "has space", email: "a@b.com" }, "invalid"],
      [{ username: "waytoolongusernamehere", email: "a@b.com" }, "too_long"],
      [{ username: "", email: "a@b.com" }, "too_short"],
      [{ username: "ok", email: "notanemail" }, "invalid_email"],
    ];
    for (const [body, code] of cases) {
      const res = await registerStart({ request: startReq(body), env } as any);
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ code });
    }
  });

  it("a second start for the same email replaces the first code", async () => {
    const { env, tables } = statefulEnv();
    const first = await registerStart({ request: startReq({ username: "harjit", email: "h@example.com" }), env } as any);
    const firstCode = tables.pending_registrations[0].code;
    const firstRsid = rsidFrom(first);

    await registerStart({ request: startReq({ username: "harjit", email: "h@example.com" }), env } as any);
    expect(tables.pending_registrations).toHaveLength(1);

    const stale = await registerComplete({ request: completeReq({ code: firstCode, password: PW }, firstRsid), env } as any);
    expect(stale.status).toBe(400);
    expect(tables.users).toHaveLength(0);
  });
});

describe("POST /api/auth/register-complete", () => {
  async function startedFlow(marketing?: boolean) {
    const { env, tables } = statefulEnv();
    const res = await registerStart({ request: startReq({ username: "harjit", email: "h@example.com", marketing }), env } as any);
    return { env, tables, rsid: rsidFrom(res), code: tables.pending_registrations[0].code };
  }

  it("happy path: creates the user with the username, a password hash, and a session", async () => {
    const { env, tables, rsid, code } = await startedFlow(true);
    const res = await registerComplete({ request: completeReq({ code, password: PW }, rsid), env } as any);

    expect(res.status).toBe(200);
    expect(tables.users).toHaveLength(1);
    expect(tables.users[0].username).toBe("harjit");
    expect(tables.users[0].email).toBe("h@example.com");
    expect(tables.users[0].marketing_optin).toBe(1);
    expect(String(tables.users[0].password_hash).length).toBeGreaterThan(20);
    expect(tables.sessions).toHaveLength(1);
    expect(tables.sessions[0].mfa_ok).toBe(1); // a brand-new account has no MFA
    expect(tables.pending_registrations).toHaveLength(0); // ticket consumed

    const cookies = res.headers.getSetCookie?.() ?? [res.headers.get("Set-Cookie")!];
    expect(cookies.some((c: string) => /^su_session=/.test(c) && c.includes("HttpOnly"))).toBe(true);
    expect(cookies.some((c: string) => /^sikhiuni_reg_rsid=;/.test(c) && c.includes("Max-Age=0"))).toBe(true);
  });

  it("marketing consent: only an explicit true counts", async () => {
    for (const [value, expected] of [[true, 1], [false, 0], [undefined, 0], ["true", 0], [1, 0]] as const) {
      const { env, tables } = statefulEnv();
      const res = await registerStart({ request: startReq({ username: "harjit", email: "h@example.com", marketing: value }), env } as any);
      await registerComplete({
        request: completeReq({ code: tables.pending_registrations[0].code, password: PW }, rsidFrom(res)), env,
      } as any);
      expect(tables.users[0].marketing_optin).toBe(expected);
    }
  });

  it("no rsid cookie -> 400, and the lib is never reached", async () => {
    const { env, tables, code } = await startedFlow();
    const res = await registerComplete({ request: completeReq({ code, password: PW }), env } as any);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "no_pending_registration" });
    expect(tables.users).toHaveLength(0);
  });

  it("the rsid comes from the cookie only — a body-supplied one is ignored", async () => {
    const { env, tables, rsid, code } = await startedFlow();
    const res = await registerComplete({
      request: completeReq({ code, password: PW, rsid: "ATTACKER" }, rsid), env,
    } as any);
    expect(res.status).toBe(200);
    expect(tables.users).toHaveLength(1);
  });

  it("a wrong code increments attempts; the 9th destroys the pending record", async () => {
    const { env, tables, rsid, code } = await startedFlow();
    const wrong = code === "000000" ? "111111" : "000000";

    for (let i = 1; i <= 8; i++) {
      const res = await registerComplete({ request: completeReq({ code: wrong, password: PW }, rsid), env } as any);
      expect(res.status).toBe(400);
      expect(tables.pending_registrations[0].attempts).toBe(i);
    }
    const capped = await registerComplete({ request: completeReq({ code: wrong, password: PW }, rsid), env } as any);
    expect(capped.status).toBe(429);
    expect(tables.pending_registrations).toHaveLength(0);

    // Even the RIGHT code is useless now.
    const after = await registerComplete({ request: completeReq({ code, password: PW }, rsid), env } as any);
    expect(after.status).toBe(400);
    expect(tables.users).toHaveLength(0);
  });

  it("a weak password is refused WITHOUT burning an attempt", async () => {
    const { env, tables, rsid, code } = await startedFlow();
    const res = await registerComplete({ request: completeReq({ code, password: "short" }, rsid), env } as any);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "weak_password" });
    expect(tables.pending_registrations[0].attempts).toBe(0);
  });

  it("an expired pending record is rejected", async () => {
    const { env, tables, rsid, code } = await startedFlow();
    tables.pending_registrations[0].expires_at = Date.now() - 1000;
    const res = await registerComplete({ request: completeReq({ code, password: PW }, rsid), env } as any);
    expect(res.status).toBe(400);
    expect(tables.users).toHaveLength(0);
  });

  it("username race: the loser gets a retryable 409 and keeps its pending record", async () => {
    const { env, tables } = statefulEnv();
    const a = await registerStart({ request: startReq({ username: "sameone", email: "a@b.com" }), env } as any);
    const aRow = tables.pending_registrations.find((p) => p.email === "a@b.com")!;
    const b = await registerStart({ request: startReq({ username: "sameone", email: "b@b.com" }), env } as any);
    const bRow = tables.pending_registrations.find((p) => p.email === "b@b.com")!;

    const first = await registerComplete({ request: completeReq({ code: aRow.code, password: PW }, rsidFrom(a)), env } as any);
    expect(first.status).toBe(200);

    const second = await registerComplete({ request: completeReq({ code: bRow.code, password: PW }, rsidFrom(b)), env } as any);
    expect(second.status).toBe(409);
    expect(await second.json()).toMatchObject({ code: "username_taken" });
    // Still there, so they can pick another name without a fresh email.
    expect(tables.pending_registrations.some((p) => p.email === "b@b.com")).toBe(true);
    expect(tables.users).toHaveLength(1);
  });

  it("sends NO email — the code email at start already carried the welcome", async () => {
    const { env, tables, rsid, code } = await startedFlow();
    env.RESEND_API_KEY = "re_test";
    fetchMock.mockClear();
    await registerComplete({ request: completeReq({ code, password: PW }, rsid), env } as any);
    expect(fetchMock.mock.calls.filter(([u]: any[]) => String(u).includes("api.resend.com"))).toHaveLength(0);
    expect(tables.users).toHaveLength(1);
  });
});

describe("POST /api/auth/signup — retired", () => {
  it("returns 410 naming its replacement, and can never create an account", async () => {
    const res = await signupPost({} as any);
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: "gone", use: "/api/auth/register-start" });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
