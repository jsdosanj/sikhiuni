// Program-exam passes are stored in `progress` under course_id = <program id>
// (functions/api/program-exam.js). Admin tallies must not count them as course
// enrolments/completions, and the gradebook must flag them. Real SQLite, so the
// NOT IN / IN clauses are executed, not just string-matched.
import { describe, it, expect, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
vi.mock("../functions/api/_lib.js", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  requireMfa: async () => ({ user: { id: "a1", role: "admin" } }),
  getUser: async (env: any) => env.user,
}));
import { onRequestGet as stats } from "../functions/api/admin/stats.js";
import { onRequestGet as gradebook } from "../functions/api/gradebook.js";

function setup() {
  const sql = new DatabaseSync(":memory:");
  sql.exec(`CREATE TABLE progress(user_id TEXT,course_id TEXT,done TEXT,passed_score INTEGER,updated_at INTEGER,PRIMARY KEY(user_id,course_id));
    CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT,name TEXT,role TEXT,created_at INTEGER);`);
  sql.exec(`INSERT INTO users VALUES ('u1','u1@x.com','U One','learner',1);
    INSERT INTO progress VALUES ('u1','ai-foundations','[0,1]',90,1),('u1','ten-gurus','[0]',NULL,1),('u1','bass','[]',88,1),('u1','cert-sikh-history','[]',95,1);`);
  const env: any = { user: { id: "a1", role: "admin" }, DB: {} };
  env.DB.prepare = (q: string) => {
    let args: any[] = [];
    const st = {
      bind(...v: any[]) { args = v; return st; },
      async run() { sql.prepare(q).run(...args); return { success: true, meta: { changes: 1 } }; },
      async first() { return sql.prepare(q).get(...args) || null; },
      async all() { return { results: sql.prepare(q).all(...args) }; },
    };
    return st;
  };
  return env;
}

describe("program rows in admin stats and gradebook", () => {
  it("stats: course totals exclude program passes, which are counted separately", async () => {
    const d: any = await (await stats({ request: new Request("http://x/api/admin/stats"), env: setup() } as any)).json();
    expect(d.totals.enrollments).toBe(2); // ai-foundations + ten-gurus
    expect(d.totals.completions).toBe(1); // ai-foundations only
    expect(d.totals.programPasses).toBe(2); // bass + cert-sikh-history
    expect(d.popular.map((p: any) => p.course_id).sort()).toEqual(["ai-foundations", "ten-gurus"]);
  });

  it("gradebook: program rows are flagged and kept out of the course list", async () => {
    const d: any = await (await gradebook({ request: new Request("http://x/api/gradebook"), env: setup() } as any)).json();
    const flagged = d.rows.filter((r: any) => r.program).map((r: any) => r.course_id).sort();
    expect(flagged).toEqual(["bass", "cert-sikh-history"]);
    expect(d.courses.sort()).toEqual(["ai-foundations", "ten-gurus"]);
    expect(d.rows.find((r: any) => r.course_id === "ai-foundations").program).toBe(false);
  });
});
