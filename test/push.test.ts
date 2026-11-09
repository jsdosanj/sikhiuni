// Web Push reminders: subscribe/unsubscribe/key handlers + the daily sweep.
//
// Uses a purpose-built D1 mock (rather than test/helpers.ts) because these
// tests assert on the exact rows written/deleted, and the sweep test needs a
// scripted push_subs table plus a stubbed global fetch. The VAPID keypair is
// generated for real with WebCrypto so vapidJwt/sendPush run their actual
// signing path.
import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { onRequestPost as subscribePost } from "../functions/api/push/subscribe.js";
import { onRequestPost as unsubscribePost } from "../functions/api/push/unsubscribe.js";
import { onRequestGet as keyGet } from "../functions/api/push/key.js";
import { pushConfigured, sendDailyReminders } from "../functions/push-sender.js";

function b64url(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Minimal D1 mock: records INSERT binds and DELETE binds, serves a scripted
// SELECT result for the sweep.
function pushDb(subs: string[] = []) {
  const inserts: any[][] = [];
  const deletes: string[] = [];
  const DB = {
    _inserts: inserts,
    _deletes: deletes,
    prepare(sql: string) {
      let bound: any[] = [];
      const stmt = {
        bind(...args: any[]) { bound = args; return stmt; },
        async run() {
          if (sql.includes("INSERT INTO push_subs")) inserts.push(bound);
          if (sql.includes("DELETE FROM push_subs")) deletes.push(bound[0]);
          return { success: true };
        },
        async first() { return null; },
        async all() { return { results: subs.map((endpoint) => ({ endpoint })) }; },
      };
      return stmt;
    },
  };
  return DB;
}

const GOOD_SUB = {
  endpoint: "https://fcm.googleapis.com/fcm/send/send/abc123",
  keys: { p256dh: "BPubKeyMaterial", auth: "authSecret16" },
};

function post(body: unknown) {
  return new Request("http://localhost/api/push/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/push/subscribe", () => {
  it("stores a valid subscription (anonymous)", async () => {
    const DB = pushDb();
    const res = await subscribePost({ request: post(GOOD_SUB), env: { DB } } as any);
    expect(res.status).toBe(200);
    expect(DB._inserts.length).toBe(1);
    const [endpoint, p256dh, auth, userId] = DB._inserts[0];
    expect(endpoint).toBe(GOOD_SUB.endpoint);
    expect(p256dh).toBe(GOOD_SUB.keys.p256dh);
    expect(auth).toBe(GOOD_SUB.keys.auth);
    expect(userId).toBeNull();
  });

  it.each([
    ["non-https endpoint", { ...GOOD_SUB, endpoint: "http://push.example.com/x" }],
    ["missing keys", { endpoint: GOOD_SUB.endpoint }],
    ["missing auth", { endpoint: GOOD_SUB.endpoint, keys: { p256dh: "x" } }],
    ["oversized endpoint", { ...GOOD_SUB, endpoint: "https://fcm.googleapis.com/" + "a".repeat(1100) }],
    ["arbitrary https host (SSRF)", { ...GOOD_SUB, endpoint: "https://attacker.example/x" }],
    ["push host only as a substring", { ...GOOD_SUB, endpoint: "https://fcm.googleapis.com.attacker.example/x" }],
    ["credentials in URL", { ...GOOD_SUB, endpoint: "https://fcm.googleapis.com@attacker.example/x" }],
    ["oversized auth", { ...GOOD_SUB, keys: { p256dh: "x", auth: "a".repeat(100) } }],
  ])("rejects %s with 400", async (_name, body) => {
    const DB = pushDb();
    const res = await subscribePost({ request: post(body), env: { DB } } as any);
    expect(res.status).toBe(400);
    expect(DB._inserts.length).toBe(0);
  });

  it("returns 503 without a database", async () => {
    const res = await subscribePost({ request: post(GOOD_SUB), env: {} } as any);
    expect(res.status).toBe(503);
  });
});

describe("POST /api/push/unsubscribe", () => {
  it("deletes by endpoint", async () => {
    const DB = pushDb();
    const res = await unsubscribePost({
      request: post({ endpoint: GOOD_SUB.endpoint }),
      env: { DB },
    } as any);
    expect(res.status).toBe(200);
    expect(DB._deletes).toEqual([GOOD_SUB.endpoint]);
  });

  it("rejects a non-https endpoint", async () => {
    const DB = pushDb();
    const res = await unsubscribePost({
      request: post({ endpoint: "javascript:alert(1)" }),
      env: { DB },
    } as any);
    expect(res.status).toBe(400);
    expect(DB._deletes.length).toBe(0);
  });
});

describe("GET /api/push/key", () => {
  it("404s while VAPID is unconfigured (UI hides itself)", async () => {
    const res = await keyGet({ env: {} } as any);
    expect(res.status).toBe(404);
  });

  it("returns the public key when configured", async () => {
    const env = { VAPID_PUBLIC_KEY: "Bpub", VAPID_PRIVATE_KEY: "priv" };
    const res = await keyGet({ env } as any);
    expect(res.status).toBe(200);
    expect((await res.json()).key).toBe("Bpub");
  });
});

describe("sendDailyReminders", () => {
  // A real P-256 keypair in the base64url raw/scalar format web-push emits,
  // so the ES256 signing path actually runs.
  let VAPID_PUBLIC_KEY = "";
  let VAPID_PRIVATE_KEY = "";
  beforeAll(async () => {
    const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
    VAPID_PUBLIC_KEY = b64url(new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey)));
    const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
    VAPID_PRIVATE_KEY = jwk.d as string;
  });
  afterEach(() => vi.unstubAllGlobals());

  it("skips entirely when VAPID secrets are absent", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const r = await sendDailyReminders({ DB: pushDb(["https://fcm.googleapis.com/fcm/send/a"]) });
    expect(r).toEqual({ sent: 0, pruned: 0, skipped: true });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(pushConfigured({})).toBe(false);
  });

  it("never requests a host outside the push-service allowlist, and does not delete the row", async () => {
    const fetchSpy = vi.fn(async () => new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchSpy);
    const DB = pushDb(["https://attacker.example/steal"]);
    const r = await sendDailyReminders({ DB, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(r).toEqual({ sent: 0, pruned: 0, skipped: false });
  });

  it("sends to live endpoints and prunes dead ones", async () => {
    const live = "https://fcm.googleapis.com/fcm/send/live";
    const dead = "https://fcm.googleapis.com/fcm/send/dead";
    const seen: Array<{ url: string; headers: any }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: any) => {
      seen.push({ url, headers: init.headers });
      return new Response(null, { status: url === dead ? 410 : 201 });
    }));
    const DB = pushDb([live, dead]);
    const r = await sendDailyReminders({ DB, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY });
    expect(r).toEqual({ sent: 1, pruned: 1, skipped: false });
    expect(DB._deletes).toEqual([dead]);
    // VAPID header shape: `vapid t=<jwt>, k=<public key>` with a 3-part JWT.
    const auth = seen[0].headers.Authorization as string;
    expect(auth.startsWith("vapid t=")).toBe(true);
    expect(auth.endsWith(`k=${VAPID_PUBLIC_KEY}`)).toBe(true);
    expect(auth.slice(8).split(",")[0].split(".").length).toBe(3);
  });

  it("one failing endpoint never stops the sweep", async () => {
    const boom = "https://fcm.googleapis.com/fcm/send/boom";
    const ok = "https://fcm.googleapis.com/fcm/send/ok";
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === boom) throw new Error("network");
      return new Response(null, { status: 201 });
    }));
    const r = await sendDailyReminders({ DB: pushDb([boom, ok]), VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY });
    expect(r).toEqual({ sent: 1, pruned: 0, skipped: false });
  });
});
