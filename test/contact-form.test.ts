import { describe, it, expect, vi, afterEach } from "vitest";
vi.mock("../functions/api/_lib.js", () => ({
  json: (body: any, status = 200) => Response.json(body, { status }),
  getUser: async () => null, newId: () => "contact-id", logEvent: async () => {},
}));
import { onRequestPost } from "../functions/api/contact.js";
import { isResendUrl } from "./helpers";

afterEach(() => vi.unstubAllGlobals());
const makeEnv = (extra: any = {}) => {
  const inserts: any[][] = [];
  const stmt = (sql: string) => ({ run: async () => ({ success: true }), bind: (...a: any[]) => ({ run: async () => { if (/INSERT INTO feedback/.test(sql)) inserts.push(a); return { success: true }; } }) });
  return { env: { DB: { prepare: (sql: string) => stmt(sql) }, CONTACT_RESEND_API_KEY: "k", ...extra }, inserts };
};
const post = (body: any, env: any) => onRequestPost({ request: new Request("https://sikhiuni.com/api/contact", { method: "POST", body: JSON.stringify(body) }), env } as any);
const good = { name: "Harjit Kaur", email: "Reader@Example.com", topic: "account", message: "I can't finish creating my account." };

describe("POST /api/contact", () => {
  it("stores the message and emails akaal@sikhi.io with the visitor as reply-to", async () => {
    const send = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", send);
    const { env, inserts } = makeEnv();
    const res = await post(good, env);
    expect(await res.json()).toEqual({ ok: true, notified: true, reference: "contact-id" });
    expect(inserts).toHaveLength(1);
    expect(inserts[0][4]).toBe("contact:account");
    const [url, init] = send.mock.calls[0] as any[];
    expect(isResendUrl(url)).toBe(true);
    const body = JSON.parse(init.body);
    expect(body.to).toEqual(["akaal@sikhi.io"]);
    expect(body.reply_to).toBe("reader@example.com");
    expect(body.text).toContain("I can't finish creating my account.");
  });

  it("reports notified:false (but keeps the message) when the provider refuses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 403 })));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { env, inserts } = makeEnv();
    expect((await (await post(good, env)).json()).notified).toBe(false);
    expect(inserts).toHaveLength(1);
    err.mockRestore();
  });

  it("validates name, email and message", async () => {
    const { env } = makeEnv();
    expect((await post({ ...good, name: "" }, env)).status).toBe(400);
    expect((await post({ ...good, email: "nope" }, env)).status).toBe(400);
    expect((await post({ ...good, message: "hi" }, env)).status).toBe(400);
  });

  it("strips newlines from the name so it can't inject into the subject", async () => {
    const send = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", send);
    const { env } = makeEnv();
    await post({ ...good, name: "Eve\r\nBcc: x@y.z" }, env);
    expect(JSON.parse((send.mock.calls[0] as any[])[1].body).subject).not.toMatch(/[\r\n]/);
  });

  it("honeypot submissions are silently dropped (no store, no email)", async () => {
    const send = vi.fn();
    vi.stubGlobal("fetch", send);
    const { env, inserts } = makeEnv();
    const res = await post({ ...good, website: "http://spam.example" }, env);
    expect(res.status).toBe(200);
    expect(inserts).toHaveLength(0);
    expect(send).not.toHaveBeenCalled();
  });
});
