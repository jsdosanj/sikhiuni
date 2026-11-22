// C17 H5P activities on real SQLite: only h5p.com / h5p.org links are accepted and are
// normalised to the publisher's embed player; rights must be confirmed; new activities
// are drafts that learners can't see; only the course's teachers manage them; and the
// page CSP allows H5P frames on the course tools page only.
import { describe, it, expect, beforeEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import * as embeds from "../functions/api/embeds.js";
import worker from "../worker.js";

let sql: DatabaseSync, env: any;
beforeEach(() => {
  sql = new DatabaseSync(":memory:");
  const now = Date.now();
  sql.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, name TEXT, country TEXT, languages TEXT, role TEXT, marketing_optin INTEGER DEFAULT 0);
    CREATE TABLE sessions (id TEXT PRIMARY KEY, user_id TEXT, expires_at INTEGER, mfa_ok INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE rate_limits (k TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL);
    CREATE TABLE course_teachers (course_id TEXT NOT NULL, user_id TEXT NOT NULL, assigned_at INTEGER NOT NULL, PRIMARY KEY (course_id, user_id));
    CREATE TABLE enrollments (user_id TEXT NOT NULL, kind TEXT NOT NULL, target_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (user_id, kind, target_id));
    INSERT INTO users (id, email, name, role) VALUES ('t','t@x.com','T','teacher'), ('tD','td@x.com','TD','teacher'), ('l','l@x.com','L','learner'), ('out','o@x.com','O','learner');
    INSERT INTO course_teachers VALUES ('C','t',0), ('D','tD',0);
    INSERT INTO enrollments VALUES ('l','course','C',0);
  `);
  for (const [sid, uid] of [["st", "t"], ["sD", "tD"], ["sl", "l"], ["so", "out"]]) sql.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?,?,?)").run(sid, uid, now + 1e9);
  const DB = { prepare(q: string) { let a: any[] = []; const st = { bind(...v: any[]) { a = v; return st; }, async run() { const r = sql.prepare(q).run(...a); return { success: true, meta: { changes: Number(r.changes) } }; }, async first() { return (sql.prepare(q).get(...a) as any) || null; }, async all() { return { results: sql.prepare(q).all(...a) }; } }; return st; } };
  env = { DB };
});
const req = (sid: string, path: string, body?: any) => new Request("https://sikhiuni.com" + path, body === undefined
  ? { headers: sid ? { cookie: `su_session=${sid}` } : {} } : { method: "POST", body: JSON.stringify(body), headers: { cookie: `su_session=${sid}`, "content-type": "application/json" } });
const P = async (sid: string, body: any) => { const r = await embeds.onRequestPost({ request: req(sid, "/api/embeds", body), env }); return { status: r.status, body: await r.json() }; };
const G = async (sid: string, c = "C") => { const r = await embeds.onRequestGet({ request: req(sid, "/api/embeds?courseId=" + c), env }); return { status: r.status, body: await r.json() }; };

describe("C17 H5P activities", () => {
  it("accepts only h5p.com / h5p.org activity links and normalises them to the embed player", () => {
    expect(embeds.h5pEmbedUrl("https://sikhi.h5p.com/content/1292345678")).toBe("https://sikhi.h5p.com/content/1292345678/embed");
    expect(embeds.h5pEmbedUrl("https://sikhi.h5p.com/content/1292345678/embed")).toBe("https://sikhi.h5p.com/content/1292345678/embed");
    expect(embeds.h5pEmbedUrl("https://h5p.org/node/617")).toBe("https://h5p.org/h5p/embed/617");
    expect(embeds.h5pEmbedUrl("https://h5p.org/node/617?x=<script>#y")).toBe("https://h5p.org/h5p/embed/617"); // query and hash are dropped
    for (const bad of ["http://sikhi.h5p.com/content/1", "https://h5p.com.evil.io/content/1", "https://evil.io/?u=https://h5p.org/node/1",
      "https://user:pw@sikhi.h5p.com/content/1", "https://sikhi.h5p.com/content/1/../../admin", "javascript:alert(1)", ""]) {
      expect(embeds.h5pEmbedUrl(bad)).toBeNull();
    }
  });

  it("teachers add activities as drafts after confirming rights; learners see only open ones", async () => {
    expect((await P("st", { action: "create", courseId: "C", title: "Ik Onkar quiz", url: "https://h5p.org/node/617" })).body.error).toMatch(/right to use/);
    const c = await P("st", { action: "create", courseId: "C", title: "Ik Onkar quiz", url: "https://h5p.org/node/617", attribution: "By A. Author, CC BY 4.0", rightsConfirmed: true });
    expect(c.body.src).toBe("https://h5p.org/h5p/embed/617");
    expect((await G("sl")).body.embeds).toEqual([]); // draft
    expect((await G("st")).body.embeds[0]).toMatchObject({ status: "draft", attribution: "By A. Author, CC BY 4.0" });
    await P("st", { action: "status", id: c.body.id, status: "open" });
    expect((await G("sl")).body.embeds.map((e: any) => e.title)).toEqual(["Ik Onkar quiz"]);
    expect((await P("st", { action: "create", courseId: "C", title: "x", url: "https://example.com/h5p/1", rightsConfirmed: true })).status).toBe(400);
  });

  it("only the course's teachers manage activities; outsiders can't list them", async () => {
    const c = await P("st", { action: "create", courseId: "C", title: "A", url: "https://h5p.org/node/1", rightsConfirmed: true });
    expect((await P("sD", { action: "status", id: c.body.id, status: "open" })).status).toBe(403);
    expect((await P("sl", { action: "delete", id: c.body.id })).status).toBe(403);
    expect((await P("sl", { action: "create", courseId: "C", title: "A", url: "https://h5p.org/node/1", rightsConfirmed: true })).status).toBe(403);
    expect((await G("so")).status).toBe(403);
    expect((await P("st", { action: "delete", id: c.body.id })).status).toBe(200);
    expect(sql.prepare("SELECT action FROM events WHERE action LIKE 'embed_%' ORDER BY rowid").all().map((r: any) => r.action)).toEqual(["embed_created", "embed_deleted"]);
  });

  it("the page CSP frames H5P on the course tools page only", async () => {
    const assets = { fetch: async () => new Response("<!doctype html>ok", { headers: { "content-type": "text/html" } }) };
    const csp = async (path: string) => (await worker.fetch(new Request("https://sikhiuni.com" + path), { ASSETS: assets } as any)).headers.get("content-security-policy") || "";
    expect(await csp("/course-tools")).toMatch(/frame-src [^;]*https:\/\/\*\.h5p\.com https:\/\/h5p\.org/);
    expect(await csp("/")).not.toContain("h5p");
    expect(await csp("/course/x")).not.toContain("h5p");
  });
});
