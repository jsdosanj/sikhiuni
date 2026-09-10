// mergeAccount() + the /api/admin/users { action:'merge' } guards, exercised
// against a small stateful fake D1. Like mfa-authz.test.ts's fake, this one
// keeps real rows rather than scripted answers — the whole point of a merge is
// what the tables look like afterwards, which a substring-matched mock can't
// express.
import { describe, it, expect, beforeEach } from "vitest";
import { mergeAccount } from "../functions/api/admin/_merge-account.js";
import { onRequestPost as usersPost } from "../functions/api/admin/users.js";
import { req } from "./helpers";

// Uniqueness constraints for the tables these tests assert on. mergeAccount
// touches every table in its OWNED/ACTOR lists, so any table not named here is
// created on demand as empty and unconstrained — that is what makes the merge a
// no-op for the ones a given test doesn't care about.
const UNIQUE_KEY: Record<string, string[]> = {
  users: ["id"],
  progress: ["user_id", "course_id"],
  certificates: ["user_id", "course_id"],
  daily_activity: ["user_id", "day"],
  user_flags: ["user_id", "flag"],
  teacher_profiles: ["user_id"],
  course_drafts: ["id"],
  discussions: [],
  sessions: ["id"],
  user_mfa: ["user_id"],
  magic_tokens: ["token"],
};

function fakeDB(seed: Record<string, any[]>) {
  const tables: Record<string, any[]> = {};
  for (const name of Object.keys(UNIQUE_KEY)) tables[name] = (seed[name] || []).map((r) => ({ ...r }));

  const rowsFor = (table: string) => (tables[table] ||= []);

  const keyOf = (table: string, row: any) => {
    const cols = UNIQUE_KEY[table] || [];
    return cols.length ? cols.map((c) => String(row[c])).join(" ") : null;
  };

  function run(sql: string, bound: any[]) {
    let m = sql.match(/^UPDATE (OR IGNORE )?(\w+) SET (\w+)=\? WHERE (\w+)=\?$/);
    if (m) {
      const [, ignore, table, setCol, whereCol] = m;
      const [next, prev] = bound;
      const rows = rowsFor(table);
      let changes = 0;
      for (const row of rows) {
        if (row[whereCol] !== prev) continue;
        const candidate = { ...row, [setCol]: next };
        const key = keyOf(table, candidate);
        const collides = key !== null && rows.some((other) => other !== row && keyOf(table, other) === key);
        if (collides) {
          if (ignore) continue;
          throw new Error("UNIQUE constraint failed: " + table);
        }
        row[setCol] = next;
        changes++;
      }
      return { meta: { changes } };
    }
    m = sql.match(/^DELETE FROM (\w+) WHERE (\w+)=\?$/);
    if (m) {
      const [, table, whereCol] = m;
      const rows = rowsFor(table);
      const before = rows.length;
      tables[table] = rows.filter((row) => row[whereCol] !== bound[0]);
      return { meta: { changes: before - tables[table].length } };
    }
    throw new Error("fakeDB got an unrecognised statement: " + sql);
  }

  function first(sql: string, bound: any[]) {
    if (/^SELECT id, email FROM users WHERE id=\?$/.test(sql)) {
      return tables.users.find((u) => u.id === bound[0]) || null;
    }
    if (sql.includes("FROM sessions s JOIN users u")) {
      const s = tables.sessions.find((x) => x.id === bound[0]);
      if (!s) return null;
      const u = tables.users.find((x) => x.id === s.user_id);
      return u ? { ...u, mfa_ok: s.mfa_ok ?? 1 } : null;
    }
    if (sql.includes("SELECT enabled_at FROM user_mfa")) {
      const row = tables.user_mfa.find((x) => x.user_id === bound[0]);
      return row ? { enabled_at: row.enabled_at } : null;
    }
    throw new Error("fakeDB got an unrecognised query: " + sql);
  }

  return {
    tables,
    prepare(sql: string) {
      const trimmed = sql.trim();
      let bound: any[] = [];
      const stmt = {
        bind(...args: any[]) { bound = args; return stmt; },
        async run() { return run(trimmed, bound); },
        async first() { return first(trimmed, bound); },
        async all() { return { results: [] }; },
      };
      return stmt;
    },
  };
}

const SRC = { id: "src", email: "old@example.com" };
const DST = { id: "dst", email: "new@example.com" };

describe("mergeAccount", () => {
  it("repoints owned rows, drops credentials, and deletes the source user", async () => {
    const env: any = { DB: fakeDB({
      users: [{ id: "src", email: "old@example.com", role: "admin" }, { id: "dst", email: "new@example.com", role: "learner" }],
      progress: [{ user_id: "src", course_id: "c1", done: "[0,1]" }, { user_id: "src", course_id: "c2", done: "[0]" }],
      certificates: [{ user_id: "src", course_id: "c1" }],
      course_drafts: [{ id: "d1", author_id: "src", reviewed_by: "src" }],
      discussions: [{ id: "m1", user_id: "src" }, { id: "m2", user_id: "dst" }],
      user_flags: [{ user_id: "src", flag: "reviewer", granted_by: "src" }],
      sessions: [{ id: "s1", user_id: "src" }, { id: "s2", user_id: "dst" }],
      user_mfa: [{ user_id: "src", enabled_at: 1 }],
      magic_tokens: [{ token: "t1", email: "old@example.com" }],
    }) };

    const { moved, dropped, skipped } = await mergeAccount(env, SRC, DST);

    const t = env.DB.tables;
    expect(t.progress.map((r: any) => r.user_id)).toEqual(["dst", "dst"]);
    expect(t.certificates[0].user_id).toBe("dst");
    expect(t.course_drafts[0].author_id).toBe("dst");
    expect(t.user_flags[0].user_id).toBe("dst");
    expect(t.discussions.map((r: any) => r.user_id)).toEqual(["dst", "dst"]);
    expect(moved).toBe(6);
    expect(skipped).toEqual({});

    // Credentials die with the retired identity; the target's own are untouched.
    expect(t.sessions).toEqual([{ id: "s2", user_id: "dst" }]);
    expect(t.user_mfa).toEqual([]);
    expect(t.magic_tokens).toEqual([]);
    expect(dropped).toBe(3);

    // Source row gone, target row untouched — role in particular is NOT inherited.
    expect(t.users).toEqual([{ id: "dst", email: "new@example.com", role: "learner" }]);
  });

  it("repoints actor columns so the retired id leaves no dangling reference", async () => {
    const env: any = { DB: fakeDB({
      users: [{ id: "src", email: "old@example.com" }, { id: "dst", email: "new@example.com" }],
      course_drafts: [{ id: "d1", author_id: "dst", reviewed_by: "src" }],
      user_flags: [{ user_id: "dst", flag: "reviewer", granted_by: "src" }],
    }) };

    await mergeAccount(env, SRC, DST);

    expect(env.DB.tables.course_drafts[0].reviewed_by).toBe("dst");
    expect(env.DB.tables.user_flags[0].granted_by).toBe("dst");
  });

  it("keeps the target's row on a key collision and reports what it could not move", async () => {
    const env: any = { DB: fakeDB({
      users: [{ id: "src", email: "old@example.com" }, { id: "dst", email: "new@example.com" }],
      // Same course on both accounts: the target's record is the one that survives.
      progress: [{ user_id: "src", course_id: "c1", done: "[0,1,2]" }, { user_id: "dst", course_id: "c1", done: "[0]" }],
      daily_activity: [{ user_id: "src", day: "2026-09-10", active_seconds: 350 }, { user_id: "dst", day: "2026-09-10", active_seconds: 25 }],
    }) };

    const { moved, skipped } = await mergeAccount(env, SRC, DST);

    expect(moved).toBe(0);
    expect(skipped).toEqual({ progress: 1, daily_activity: 1 });
    expect(env.DB.tables.progress).toEqual([{ user_id: "dst", course_id: "c1", done: "[0]" }]);
    expect(env.DB.tables.daily_activity).toEqual([{ user_id: "dst", day: "2026-09-10", active_seconds: 25 }]);
  });

  it("leaves no row behind pointing at the deleted account", async () => {
    const env: any = { DB: fakeDB({
      users: [{ id: "src", email: "old@example.com" }, { id: "dst", email: "new@example.com" }],
      progress: [{ user_id: "src", course_id: "c1" }, { user_id: "dst", course_id: "c1" }],
      teacher_profiles: [{ user_id: "src", slug: "a" }],
      discussions: [{ id: "m1", user_id: "src" }],
    }) };

    await mergeAccount(env, SRC, DST);

    for (const [name, rows] of Object.entries(env.DB.tables)) {
      const orphans = (rows as any[]).filter((r) => Object.values(r).includes("src"));
      expect(orphans, name + " still references the merged-away account").toEqual([]);
    }
  });
});

describe("POST /api/admin/users { action: 'merge' } guards", () => {
  let env: any;
  const asAdmin = (body: any) => req({ url: "http://localhost/api/admin/users", method: "POST", cookie: "sess-admin", body });

  beforeEach(() => {
    env = { DB: fakeDB({
      users: [{ id: "src", email: "old@example.com", role: "learner" }, { id: "dst", email: "new@example.com", role: "admin" }],
      sessions: [{ id: "sess-admin", user_id: "dst", mfa_ok: 1 }],
      progress: [{ user_id: "src", course_id: "c1" }],
    }) };
  });

  it("rejects a merge missing either id", async () => {
    const res = await usersPost({ request: asAdmin({ action: "merge", sourceId: "src" }), env });
    expect(res.status).toBe(400);
  });

  it("rejects merging an account into itself", async () => {
    const res = await usersPost({ request: asAdmin({ action: "merge", sourceId: "src", targetId: "src" }), env });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/itself/);
  });

  it("404s when either account does not exist", async () => {
    const res = await usersPost({ request: asAdmin({ action: "merge", sourceId: "src", targetId: "nope" }), env });
    expect(res.status).toBe(404);
    expect(env.DB.tables.users).toHaveLength(2); // nothing was touched
  });

  it("merges and reports the counts", async () => {
    const res = await usersPost({ request: asAdmin({ action: "merge", sourceId: "src", targetId: "dst" }), env });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, moved: 1, dropped: 0, skipped: {} });
    expect(env.DB.tables.users.map((u: any) => u.id)).toEqual(["dst"]);
    expect(env.DB.tables.progress[0].user_id).toBe("dst");
  });
});
