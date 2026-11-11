// Plan Part D.10: account export, account delete and account merge must cover every
// table that holds a user's rows. This test reads schema.sql, so a new table with a
// user_id column fails here until it is added to all three, or to an exemption list
// below with a reason. It then runs the real handlers on the full schema (node:sqlite).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { onRequestGet as exportGet } from "../functions/api/account/export.js";
import { onRequestPost as deletePost } from "../functions/api/account/delete.js";
import { mergeAccount } from "../functions/api/admin/_merge-account.js";

const schema = readFileSync("schema.sql", "utf8");
const src = (p: string) => readFileSync(p, "utf8");
const userTables = [...schema.matchAll(/CREATE TABLE IF NOT EXISTS (\w+) \(([\s\S]*?)\);/g)]
  .filter((m) => /\buser_id\b/.test(m[2])).map((m) => m[1]);

// Exemptions, each with its reason.
const NOT_EXPORTED: Record<string, string> = {
  password_reset_codes: "short-lived secret",
  sessions: "secret session ids",
  mfa_backup_codes: "secret (hashed) codes",
  events: "append-only audit log; the account's own security events are shown at /api/account/activity",
};
const NOT_DELETED: Record<string, string> = {
  events: "append-only audit log, kept for integrity (opaque id only; network fields erased at 90 days)",
};
const NOT_MERGED: Record<string, string> = {
  events: "append-only audit log: rewriting who did what would falsify it",
};

describe("every user table is covered by export, delete and merge", () => {
  it("finds the user tables in schema.sql", () => {
    expect(userTables).toEqual(expect.arrayContaining(["progress", "journal_entries", "poll_responses", "mfa_trusted_devices"]));
  });
  for (const t of userTables) {
    it(t, () => {
      if (!NOT_EXPORTED[t]) expect(src("functions/api/account/export.js"), `export misses ${t}`).toMatch(new RegExp(`FROM ${t}\\b`));
      if (!NOT_DELETED[t]) expect(src("functions/api/account/delete.js"), `delete misses ${t}`).toMatch(new RegExp(`DELETE FROM ${t} WHERE user_id`));
      if (!NOT_MERGED[t]) expect(src("functions/api/admin/_merge-account.js"), `merge misses ${t}`).toContain(`"${t}"`);
    });
  }
});

function makeEnv() {
  const sql = new DatabaseSync(":memory:");
  sql.exec(schema);
  const DB = {
    prepare(q: string) {
      let args: any[] = [];
      const st = {
        bind(...v: any[]) { args = v; return st; },
        async run() { const r = sql.prepare(q).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; },
        async first() { return (sql.prepare(q).get(...args) as any) || null; },
        async all() { return { results: sql.prepare(q).all(...args) }; },
      };
      return st;
    },
  };
  const now = Date.now();
  sql.exec(`
    INSERT INTO users (id, email, username, name, role, created_at) VALUES ('u1','u1@x.com','u1','One','learner',${now}), ('u2','u2@x.com','u2','Two','learner',${now});
    INSERT INTO sessions (id, user_id, expires_at) VALUES ('s1','u1',${now + 1e7});
    INSERT INTO journal_entries VALUES ('j1','C','u1','my private reflection',0,${now},${now});
    INSERT INTO assignment_extensions VALUES ('a1','u1',${now + 1e6},'family','t1',${now});
    INSERT INTO course_accommodations VALUES ('C','u1',50,null,'t1',${now});
    INSERT INTO poll_participants VALUES ('p1','u1'), ('p2','u1');
    INSERT INTO poll_responses VALUES ('r1','p1','u1','[1]',${now}), ('r2','p2',NULL,'[0]',${now});
    INSERT INTO mfa_trusted_devices (token_hash, user_id, created_at, expires_at) VALUES ('h','u1',${now},${now + 1e6});
    INSERT INTO cohort_members VALUES ('co1','u1',${now});
    INSERT INTO push_subs (endpoint, p256dh, auth, user_id, created_at) VALUES ('https://push/x','k','a','u1',${now});
  `);
  return { sql, env: { DB, MEDIA: { delete: async () => {} } } };
}
const req = (path: string, body?: any) => new Request("https://sikhiuni.com" + path, body
  ? { method: "POST", body: JSON.stringify(body), headers: { cookie: "su_session=s1", "content-type": "application/json" } }
  : { headers: { cookie: "su_session=s1" } });

describe("handlers on the full schema", () => {
  it("export includes the new tables, without anonymous answers or device tokens", async () => {
    const { env } = makeEnv();
    const d = await (await exportGet({ request: req("/api/account/export"), env } as any)).json();
    expect(d.journal_entries[0].body).toBe("my private reflection");
    expect(d.assignment_extensions).toHaveLength(1);
    expect(d.course_accommodations[0].extra_time_pct).toBe(50);
    expect(d.poll_participation).toHaveLength(2);
    expect(d.poll_responses).toEqual([expect.objectContaining({ poll_id: "p1" })]); // the anonymous r2 is not linkable
    expect(d.trusted_devices).toHaveLength(1);
    expect(JSON.stringify(d)).not.toContain('"h"'); // token hash never exported
    expect(d.cohort_memberships).toHaveLength(1);
  });

  it("delete erases the user's rows and keeps anonymous answers", async () => {
    const { sql, env } = makeEnv();
    const r = await deletePost({ request: req("/api/account/delete", { confirm: "DELETE" }), env } as any);
    expect(r.status).toBe(200);
    const n = (q: string) => (sql.prepare(q).get() as any).n;
    for (const t of ["journal_entries", "assignment_extensions", "course_accommodations", "poll_participants", "mfa_trusted_devices", "cohort_members", "push_subs"])
      expect(n(`SELECT COUNT(*) AS n FROM ${t} WHERE user_id='u1'`), t).toBe(0);
    expect(n("SELECT COUNT(*) AS n FROM poll_responses")).toBe(1); // r2, anonymous
    expect(n("SELECT COUNT(*) AS n FROM users WHERE id='u1'")).toBe(0);
  });

  it("merge moves the new tables and drops trusted devices (credentials never move)", async () => {
    const { sql, env } = makeEnv();
    await mergeAccount(env, { id: "u1", email: "u1@x.com" }, { id: "u2", email: "u2@x.com" });
    const n = (q: string) => (sql.prepare(q).get() as any).n;
    expect(n("SELECT COUNT(*) AS n FROM journal_entries WHERE user_id='u2'")).toBe(1);
    expect(n("SELECT COUNT(*) AS n FROM poll_participants WHERE user_id='u2'")).toBe(2);
    expect(n("SELECT COUNT(*) AS n FROM course_accommodations WHERE user_id='u2'")).toBe(1);
    expect(n("SELECT COUNT(*) AS n FROM mfa_trusted_devices")).toBe(0);
  });

  it("merge tolerates tables that do not exist yet", async () => {
    const { sql, env } = makeEnv();
    sql.exec("DROP TABLE journal_entries; DROP TABLE polls;");
    await expect(mergeAccount(env, { id: "u1", email: "u1@x.com" }, { id: "u2", email: "u2@x.com" })).resolves.toBeTruthy();
  });
});
