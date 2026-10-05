import { describe, it, expect, beforeEach, vi } from "vitest";
import { getUser } from "../functions/api/_lib.js";
import { verifyClerkToken, resetClerkCache } from "../functions/api/_clerk.js";
import { onRequestGet as progressGet } from "../functions/api/progress.js";

// One login for all three Sikhi sites: a Clerk session token (RS256, verified against Clerk's public keys) is accepted
// as a second way to sign in. These tests build a real RSA key pair and a fake JWKS, so the signature path is genuine.

const ISS = "https://clerk.sikhi.io";
const enc = (o: any) => Buffer.from(JSON.stringify(o)).toString("base64url");
let pair: CryptoKeyPair, jwk: any;

async function makeToken(claims: any = {}, opts: { kid?: string; key?: CryptoKey; alg?: string } = {}) {
  const header = { alg: opts.alg ?? "RS256", kid: opts.kid ?? "kid-1", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: ISS, sub: "user_abc", exp: now + 60, nbf: now - 5, email: "Learner@Example.com", ...claims };
  const data = enc(header) + "." + enc(payload);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", opts.key ?? pair.privateKey, new TextEncoder().encode(data));
  return data + "." + Buffer.from(sig).toString("base64url");
}
function fakeDb(existing: any = null) {
  const calls: { sql: string; args: any[] }[] = [];
  const DB = { prepare(sql: string) { let args: any[] = []; const q: any = {
    bind(...a: any[]) { args = a; return q; },
    async first() { calls.push({ sql, args }); if (sql.includes("FROM users WHERE email")) return existing; return null; },
    async run() { calls.push({ sql, args }); return {}; },
    async all() { calls.push({ sql, args }); return { results: [] }; },
  }; return q; } };
  return { DB, calls };
}
const reqWith = (token?: string, cookie?: string) => new Request("https://sikhiuni.com/api/progress", { headers: { ...(token ? { Authorization: "Bearer " + token } : {}), ...(cookie ? { Cookie: cookie } : {}) } });

beforeEach(async () => {
  resetClerkCache();
  pair = (await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  jwk = { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid: "kid-1", alg: "RS256", use: "sig" };
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ keys: [jwk] }), { status: 200 })));
});

describe("Clerk bearer login", () => {
  it("verifies a genuine token and maps it to a learner by email, creating the account on first use", async () => {
    const { DB, calls } = fakeDb(null);
    const user = await getUser({ DB }, reqWith(await makeToken()));
    expect(user).toMatchObject({ email: "learner@example.com", role: "learner", mfa_ok: 0 });
    expect(calls.some((c) => c.sql.startsWith("INSERT INTO users") && c.args[1] === "learner@example.com")).toBe(true);
  });
  it("reuses the existing account for that email (so Sikhi University progress follows the person)", async () => {
    const { DB, calls } = fakeDb({ id: "u-existing", email: "learner@example.com", name: "L", country: null, languages: null });
    const user = await getUser({ DB }, reqWith(await makeToken()));
    expect(user?.id).toBe("u-existing");
    expect(calls.some((c) => c.sql.startsWith("INSERT INTO users"))).toBe(false);
  });
  it("never grants admin or MFA, even for an admin's email", async () => {
    const { DB } = fakeDb({ id: "u-admin", email: "learner@example.com", name: null, country: null, languages: null, role: "admin" });
    const user = await getUser({ DB, ADMIN_EMAILS: "learner@example.com" }, reqWith(await makeToken()));
    expect(user?.role).toBe("learner"); expect(user?.mfa_ok).toBe(0);
  });
  it.each([
    ["expired", { exp: Math.floor(Date.now() / 1000) - 120 }],
    ["wrong issuer", { iss: "https://evil.example" }],
    ["not yet valid", { nbf: Math.floor(Date.now() / 1000) + 600 }],
  ])("rejects an %s token", async (_n, claims) => {
    expect(await verifyClerkToken(await makeToken(claims as any))).toBeNull();
  });
  it("rejects a token signed by a different key, an unknown kid, or alg none", async () => {
    const other = (await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
    expect(await verifyClerkToken(await makeToken({}, { key: other.privateKey }))).toBeNull();
    expect(await verifyClerkToken(await makeToken({}, { kid: "nope" }))).toBeNull();
    expect(await verifyClerkToken(enc({ alg: "none", kid: "kid-1" }) + "." + enc({ iss: ISS, sub: "x", exp: 9e9 }) + ".")).toBeNull();
  });
  it("without an email claim and no secret key, stays anonymous (it never guesses an identity)", async () => {
    const { DB } = fakeDb(null);
    expect(await getUser({ DB }, reqWith(await makeToken({ email: undefined })))).toBeNull();
  });
  it("falls back to the Clerk Backend API for the email when a secret key is configured", async () => {
    const { DB } = fakeDb({ id: "u1", email: "api@example.com", name: null, country: null, languages: null });
    (fetch as any).mockImplementation(async (url: string) => url.includes("api.clerk.com")
      ? new Response(JSON.stringify({ primary_email_address_id: "e1", email_addresses: [{ id: "e1", email_address: "API@example.com", verification: { status: "verified" } }] }))
      : new Response(JSON.stringify({ keys: [jwk] })));
    const user = await getUser({ DB, CLERK_SECRET_KEY: "sk_test" }, reqWith(await makeToken({ email: undefined })));
    expect(user?.email).toBe("api@example.com");
  });
  it("a session cookie still wins and bearer is ignored when a cookie is present", async () => {
    const { DB } = fakeDb(null);
    const user = await getUser({ DB }, reqWith(await makeToken(), "su_session=abc"));
    expect(user).toBeNull();   // cookie path ran (no such session row), bearer not consulted
  });
  it("progress endpoint accepts the bearer token and returns that user's progress", async () => {
    const calls: any[] = [];
    const DB = { prepare(sql: string) { let args: any[] = []; const q: any = { bind(...a: any[]) { args = a; return q; },
      async first() { return sql.includes("FROM users WHERE email") ? { id: "u1", email: "learner@example.com", name: null, country: null, languages: null } : null; },
      async all() { calls.push(args); return { results: [{ course_id: "ten-gurus", done: "[0,1]", passed_score: null }] }; }, async run() { return {}; } }; return q; } };
    const res = await progressGet({ request: reqWith(await makeToken()), env: { DB } } as any);
    expect(res.status).toBe(200);
    expect((await res.json()).progress[0].course_id).toBe("ten-gurus");
    expect(calls[0][0]).toBe("u1");
  });
});
