// One-click unsubscribe for notification emails (CAN-SPAM / RFC 8058): signed per-user
// links, GET never unsubscribes, POST turns every notification email off, the email
// carries List-Unsubscribe headers, the link and (when configured) the postal address.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import * as unsub from "../functions/api/unsubscribe.js";
import { notify, getPrefs } from "../functions/api/_notify.js";

let sql: DatabaseSync, env: any, sent: any[];
beforeEach(() => {
  sql = new DatabaseSync(":memory:");
  sql.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, name TEXT, role TEXT);
    INSERT INTO users VALUES ('u1','u1@x.com','One','learner'), ('u2','u2@x.com','Two','learner');`);
  const DB = { prepare(q: string) { let a: any[] = []; const st = { bind(...v: any[]) { a = v; return st; }, async run() { const r = sql.prepare(q).run(...a); return { success: true, meta: { changes: Number(r.changes) } }; }, async first() { return (sql.prepare(q).get(...a) as any) || null; }, async all() { return { results: sql.prepare(q).all(...a) }; } }; return st; } };
  env = { DB, RESEND_API_KEY: "k", MFA_ENC_KEY: "test-secret", MAIL_POSTAL_ADDRESS: "PO Box 1, Example City" };
  sent = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: any) => { if (String(url).includes("resend")) sent.push(JSON.parse(init.body)); return new Response("{}"); }));
});
afterEach(() => vi.unstubAllGlobals());

describe("one-click unsubscribe", () => {
  it("notification emails carry the link, the List-Unsubscribe headers and the postal address", async () => {
    await notify(env, ["u1"], { kind: "graded", title: "Graded: Essay", url: "/course/C" });
    expect(sent).toHaveLength(1);
    const m = sent[0];
    const link = await unsub.unsubscribeUrl(env, "u1");
    expect(m.text).toContain(`Unsubscribe from these emails: ${link}`);
    expect(m.text).toContain("PO Box 1, Example City");
    expect(m.headers).toEqual({ "List-Unsubscribe": `<${link}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
  });

  it("GET shows a confirm page and changes nothing; a one-click POST turns every email off", async () => {
    const link = (await unsub.unsubscribeUrl(env, "u1"))!;
    const g = await unsub.onRequestGet({ request: new Request(link), env });
    expect(await g.text()).toContain("Stop notification emails?");
    expect((await getPrefs(env, "u1")).graded.email).toBe("immediate");
    const p = await unsub.onRequestPost({ request: new Request(link, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click" }), env });
    expect(p.status).toBe(200);
    const prefs = await getPrefs(env, "u1");
    expect(Object.values(prefs).every((x: any) => x.email === "off")).toBe(true);
    expect((await getPrefs(env, "u2")).graded.email).toBe("immediate"); // nobody else
    await notify(env, ["u1"], { kind: "graded", title: "Graded again" });
    expect(sent).toHaveLength(0); // no email after unsubscribing (the in-app one still exists)
  });

  it("refuses a forged or someone else's link", async () => {
    const link = new URL((await unsub.unsubscribeUrl(env, "u1"))!);
    link.searchParams.set("u", "u2");
    expect((await unsub.onRequestPost({ request: new Request(link.toString(), { method: "POST" }), env })).status).toBe(400);
    expect((await unsub.onRequestPost({ request: new Request("https://sikhiuni.com/api/unsubscribe?u=u1&t=nope", { method: "POST" }), env })).status).toBe(400);
    expect(await (await unsub.onRequestGet({ request: new Request(link.toString()), env })).text()).toContain("isn't valid");
  });
});
