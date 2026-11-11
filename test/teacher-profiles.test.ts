// Teacher identity: profile upsert, publish-request/approval lifecycle,
// professor-string claims, and the public whitelisted read paths. Uses a small
// stateful fake D1 (like test/mfa-authz.test.ts) because these flows need real
// state across calls: create -> edit -> request publish -> admin approve.
import { describe, it, expect, beforeEach } from "vitest";
import { onRequestGet as profileGet, onRequestPost as profilePost } from "../functions/api/teacher/profile.js";
import { onRequestGet as teachersGet } from "../functions/api/teachers.js";
import { onRequestGet as claimGet, onRequestPost as claimPost } from "../functions/api/teacher/claim.js";
import { onRequestGet as adminProfilesGet, onRequestPost as adminProfilesPost } from "../functions/api/admin/teacher-profiles.js";
import { onRequestGet as adminClaimsGet, onRequestPost as adminClaimsPost } from "../functions/api/admin/claims.js";
import { req } from "./helpers";

function fakeDB() {
  const users = new Map<string, any>();
  const sessions = new Map<string, any>();
  const userMfa = new Map<string, any>();
  const profiles = new Map<string, any>(); // by user_id
  let claims: any[] = [];
  const courseTeachers = new Map<string, string[]>(); // user_id -> course ids

  function handleFirst(sql: string, b: any[]) {
    if (sql.includes("FROM sessions s JOIN users u")) {
      const [sid, now] = b;
      const s = sessions.get(sid);
      if (!s || s.expires_at <= now) return null;
      const u = users.get(s.user_id);
      return u ? { id: u.id, email: u.email, name: u.name, role: u.role, mfa_ok: s.mfa_ok } : null;
    }
    if (sql.includes("SELECT enabled_at FROM user_mfa")) {
      const row = userMfa.get(b[0]);
      return row ? { enabled_at: row.enabled_at } : null;
    }
    if (sql.includes("SELECT slug, is_public, publish_requested_at FROM teacher_profiles")) {
      const row = profiles.get(b[0]);
      return row ? { slug: row.slug, is_public: row.is_public, publish_requested_at: row.publish_requested_at } : null;
    }
    if (sql.includes("SELECT * FROM teacher_profiles WHERE user_id")) {
      return profiles.get(b[0]) || null;
    }
    if (sql.includes("SELECT 1 FROM teacher_profiles WHERE slug")) {
      for (const p of profiles.values()) if (p.slug === b[0]) return { x: 1 };
      return null;
    }
    if (sql.includes("SELECT user_id FROM teacher_profiles WHERE claimed_professor")) {
      const [prof, excludeUserId] = b;
      for (const p of profiles.values()) if (p.claimed_professor === prof && p.user_id !== excludeUserId) return { user_id: p.user_id };
      return null;
    }
    if (sql.includes("SELECT user_id FROM teacher_profiles WHERE user_id")) {
      const row = profiles.get(b[0]);
      return row ? { user_id: row.user_id } : null;
    }
    if (sql.match(/SELECT [\w, ]+FROM teacher_profiles WHERE slug=\? AND is_public=1/)) {
      for (const p of profiles.values()) if (p.slug === b[0] && p.is_public) return { ...p };
      return null;
    }
    if (sql.includes("FROM teacher_profiles WHERE claimed_professor=? AND is_public=1")) {
      for (const p of profiles.values()) if (p.claimed_professor === b[0] && p.is_public) return { ...p };
      return null;
    }
    if (sql.includes("SELECT user_id, approved_at FROM teacher_profiles WHERE user_id")) {
      const row = profiles.get(b[0]);
      return row ? { user_id: row.user_id, approved_at: row.approved_at } : null;
    }
    if (sql.includes("SELECT verification_level FROM teacher_profiles WHERE user_id")) {
      const row = profiles.get(b[0]);
      return row ? { verification_level: row.verification_level } : null;
    }
    if (sql.includes("FROM professor_claims WHERE user_id=? AND professor_name=? AND status='pending'")) {
      const [uid, name] = b;
      return claims.find((c) => c.user_id === uid && c.professor_name === name && c.status === "pending") || null;
    }
    if (sql.includes("SELECT user_id, professor_name, status FROM professor_claims WHERE id")) {
      const c = claims.find((c) => c.id === b[0]);
      return c ? { user_id: c.user_id, professor_name: c.professor_name, status: c.status } : null;
    }
    return null;
  }

  function handleRun(sql: string, b: any[]) {
    if (sql.startsWith("CREATE TABLE")) return { success: true };
    if (sql.includes("INSERT INTO teacher_profiles")) {
      const [user_id, slug, display_name, bio, credentials, areas, languages_taught, links, publish_requested_at, created_at, updated_at] = b;
      profiles.set(user_id, {
        user_id, slug, display_name, bio, credentials, areas, languages_taught, links, photo_key: null,
        claimed_professor: null, verification_level: "none", verified_by: null, verified_at: null, verification_note: null,
        is_public: 0, publish_requested_at, approved_at: null, approved_by: null, created_at, updated_at,
      });
      return { success: true };
    }
    if (sql.includes("UPDATE teacher_profiles SET display_name")) {
      const [display_name, bio, credentials, areas, languages_taught, links, publish_requested_at, updated_at, user_id] = b;
      const row = profiles.get(user_id);
      if (row) Object.assign(row, { display_name, bio, credentials, areas, languages_taught, links, publish_requested_at, updated_at });
      return { success: true };
    }
    if (sql.includes("UPDATE teacher_profiles SET is_public=1")) {
      const [now, adminId, userId] = b;
      const row = profiles.get(userId);
      if (row) { row.is_public = 1; if (!row.approved_at) row.approved_at = now; row.approved_by = adminId; }
      return { success: true };
    }
    if (sql.includes("UPDATE teacher_profiles SET is_public=0")) {
      const row = profiles.get(b[0]);
      if (row) row.is_public = 0;
      return { success: true };
    }
    if (sql.includes("UPDATE teacher_profiles SET verification_level")) {
      const [level, verifiedBy, verifiedAt, note, userId] = b;
      const row = profiles.get(userId);
      if (row) Object.assign(row, { verification_level: level, verified_by: verifiedBy, verified_at: verifiedAt, verification_note: note });
      return { success: true };
    }
    if (sql.includes("UPDATE teacher_profiles SET claimed_professor")) {
      const [prof, updatedAt, userId] = b;
      const row = profiles.get(userId);
      if (row) { row.claimed_professor = prof; row.updated_at = updatedAt; }
      return { success: true };
    }
    if (sql.includes("INSERT INTO professor_claims")) {
      const [id, user_id, professor_name, statement, created_at] = b;
      claims.push({ id, user_id, professor_name, statement, status: "pending", created_at, decided_by: null, decided_at: null });
      return { success: true };
    }
    if (sql.includes("UPDATE professor_claims SET status")) {
      const [status, decidedBy, decidedAt, id] = b;
      const c = claims.find((c) => c.id === id);
      if (c) Object.assign(c, { status, decided_by: decidedBy, decided_at: decidedAt });
      return { success: true };
    }
    return { success: true };
  }

  function handleAll(sql: string, b: any[]) {
    if (sql.includes("FROM course_teachers WHERE user_id")) {
      return { results: (courseTeachers.get(b[0]) || []).map((id) => ({ course_id: id })) };
    }
    if (sql.match(/FROM teacher_profiles WHERE is_public=1 ORDER BY display_name/)) {
      return { results: [...profiles.values()].filter((p) => p.is_public).sort((a, b2) => a.display_name.localeCompare(b2.display_name)) };
    }
    if (sql.includes("FROM teacher_profiles tp JOIN users u ON u.id=tp.user_id") && sql.includes("publish_requested_at IS NOT NULL")) {
      return { results: [...profiles.values()].filter((p) => !p.is_public && p.publish_requested_at != null).map((p) => ({ ...p, email: users.get(p.user_id)?.email })) };
    }
    if (sql.includes("FROM teacher_profiles tp JOIN users u ON u.id=tp.user_id")) {
      return { results: [...profiles.values()].map((p) => ({ ...p, email: users.get(p.user_id)?.email })) };
    }
    if (sql.includes("FROM professor_claims WHERE user_id=?")) {
      return { results: claims.filter((c) => c.user_id === b[0]) };
    }
    if (sql.includes("FROM professor_claims pc JOIN users u ON u.id=pc.user_id WHERE pc.status='pending'")) {
      return { results: claims.filter((c) => c.status === "pending").map((c) => ({ ...c, email: users.get(c.user_id)?.email, name: users.get(c.user_id)?.name })) };
    }
    return { results: [] };
  }

  function prepare(sql: string) {
    let bound: any[] = [];
    const self = {
      bind(...args: any[]) { bound = args; return self; },
      async first() { return handleFirst(sql, bound); },
      async run() { return handleRun(sql, bound); },
      async all() { return handleAll(sql, bound); },
    };
    return self;
  }

  return { prepare, users, sessions, userMfa, profiles, claims, courseTeachers };
}

function makeEnv() { return { DB: fakeDB(), ADMIN_EMAILS: "" }; }

function seedUser(env: any, { id, role = "teacher", mfaOk = 1 }: any) {
  env.DB.users.set(id, { id, email: id + "@example.com", name: id, role });
  env.DB.sessions.set("sid-" + id, { user_id: id, expires_at: Date.now() + 100000, mfa_ok: mfaOk, mfa_fail_count: 0 });
}
function asReq(id: string, body?: unknown, url = "http://localhost/api/x") {
  return req({ url, cookie: "sid-" + id, body });
}

describe("teacher profile upsert + publish lifecycle", () => {
  let env: any;
  beforeEach(() => { env = makeEnv(); seedUser(env, { id: "t1" }); });

  it("creates a profile with a generated slug on first save", async () => {
    const res = await profilePost({ request: asReq("t1", { displayName: "Bhai Test Singh" }), env });
    expect(res.status).toBe(200);
    const { profile } = await res.json();
    expect(profile.slug).toBe("bhai-test-singh");
    expect(profile.is_public).toBe(0);
  });

  it("editing does not change the slug even if display name changes", async () => {
    await profilePost({ request: asReq("t1", { displayName: "First Name" }), env });
    const res = await profilePost({ request: asReq("t1", { displayName: "Totally Different Name" }), env });
    const { profile } = await res.json();
    expect(profile.slug).toBe("first-name");
    expect(profile.display_name).toBe("Totally Different Name");
  });

  // MFA is optional for every role (owner decision 2026-11-11): publishing no longer requires it.
  it("requestPublish WITHOUT MFA enrollment now flags publish (MFA optional)", async () => {
    const res = await profilePost({ request: asReq("t1", { displayName: "T1", bio: "hi", requestPublish: true }), env });
    const body = await res.json();
    expect(body.error).toBeUndefined();
    expect(body.profile.bio).toBe("hi");
    expect(body.profile.publish_requested_at).not.toBeNull();
  });

  it("requestPublish with MFA enrollment sets publish_requested_at", async () => {
    env.DB.userMfa.set("t1", { enabled_at: Date.now() });
    const res = await profilePost({ request: asReq("t1", { displayName: "T1", requestPublish: true }), env });
    const body = await res.json();
    expect(body.error).toBeUndefined();
    expect(body.profile.publish_requested_at).not.toBeNull();
  });

  it("non-teacher/admin is forbidden", async () => {
    seedUser(env, { id: "l1", role: "learner" });
    const res = await profilePost({ request: asReq("l1", { displayName: "x" }), env });
    expect(res.status).toBe(403);
  });
});

describe("admin publish approval + verification + public read", () => {
  let env: any;
  beforeEach(async () => {
    env = makeEnv();
    seedUser(env, { id: "t1" });
    seedUser(env, { id: "admin1", role: "admin", mfaOk: 1 });
    env.DB.userMfa.set("admin1", { enabled_at: Date.now() });
    await profilePost({ request: asReq("t1", { displayName: "Public Teacher" }), env });
  });

  it("teachers.js public directory excludes unpublished profiles", async () => {
    const res = await teachersGet({ request: req({ url: "http://localhost/api/teachers" }), env });
    const { teachers } = await res.json();
    expect(teachers).toEqual([]);
  });

  it("admin approve_publish makes the profile public and readable by slug", async () => {
    const approve = await adminProfilesPost({ request: asReq("admin1", { userId: "t1", action: "approve_publish" }), env });
    expect(approve.status).toBe(200);

    const dir = await teachersGet({ request: req({ url: "http://localhost/api/teachers" }), env });
    expect((await dir.json()).teachers).toHaveLength(1);

    const bySlug = await teachersGet({ request: req({ url: "http://localhost/api/teachers?slug=public-teacher" }), env });
    const body = await bySlug.json();
    expect(body.teacher.displayName).toBe("Public Teacher");
    // Only whitelisted fields — no user_id, no internal review metadata.
    expect(body.teacher.user_id).toBeUndefined();
  });

  it("admin unpublish takes it back down", async () => {
    await adminProfilesPost({ request: asReq("admin1", { userId: "t1", action: "approve_publish" }), env });
    await adminProfilesPost({ request: asReq("admin1", { userId: "t1", action: "unpublish" }), env });
    const dir = await teachersGet({ request: req({ url: "http://localhost/api/teachers" }), env });
    expect((await dir.json()).teachers).toEqual([]);
  });

  it("admin sets verification level; rejects an invalid level", async () => {
    const ok = await adminProfilesPost({ request: asReq("admin1", { userId: "t1", action: "set_verification", level: "scholar", note: "board review 2026-01-01" }), env });
    expect(ok.status).toBe(200);
    expect(env.DB.profiles.get("t1").verification_level).toBe("scholar");

    const bad = await adminProfilesPost({ request: asReq("admin1", { userId: "t1", action: "set_verification", level: "bogus" }), env });
    expect(bad.status).toBe(400);
  });

  it("non-admin cannot approve publish", async () => {
    const res = await adminProfilesPost({ request: asReq("t1", { userId: "t1", action: "approve_publish" }), env });
    expect(res.status).toBe(403);
  });
});

describe("professor claims", () => {
  let env: any;
  beforeEach(async () => {
    env = makeEnv();
    seedUser(env, { id: "t1" });
    seedUser(env, { id: "t2" });
    seedUser(env, { id: "admin1", role: "admin", mfaOk: 1 });
    env.DB.userMfa.set("admin1", { enabled_at: Date.now() });
  });

  it("files a claim, rejects a duplicate pending claim on the same name", async () => {
    const first = await claimPost({ request: asReq("t1", { professorName: "Prof. Example" }), env });
    expect(first.status).toBe(200);
    const dup = await claimPost({ request: asReq("t1", { professorName: "Prof. Example" }), env });
    expect(dup.status).toBe(409);
  });

  it("approving a claim requires the teacher to already have a profile", async () => {
    await claimPost({ request: asReq("t1", { professorName: "Prof. Example" }), env });
    const { claims } = await (await claimGet({ request: asReq("t1"), env })).json();
    const claimId = claims[0].id;
    const res = await adminClaimsPost({ request: asReq("admin1", { id: claimId, decision: "approve" }), env });
    expect(res.status).toBe(400); // no teacher_profiles row for t1 yet
  });

  it("approving a claim binds claimed_professor; a second claim on the same name from another teacher is rejected", async () => {
    await profilePost({ request: asReq("t1", { displayName: "T1" }), env });
    await profilePost({ request: asReq("t2", { displayName: "T2" }), env });
    await claimPost({ request: asReq("t1", { professorName: "Prof. Example" }), env });
    const { claims: t1claims } = await (await claimGet({ request: asReq("t1"), env })).json();
    await adminClaimsPost({ request: asReq("admin1", { id: t1claims[0].id, decision: "approve" }), env });
    expect(env.DB.profiles.get("t1").claimed_professor).toBe("Prof. Example");

    await claimPost({ request: asReq("t2", { professorName: "Prof. Example" }), env });
    const { claims: t2claims } = await (await claimGet({ request: asReq("t2"), env })).json();
    const secondDecision = await adminClaimsPost({ request: asReq("admin1", { id: t2claims[0].id, decision: "approve" }), env });
    expect(secondDecision.status).toBe(409);
  });

  it("GET /api/admin/claims lists only pending claims with claimant context", async () => {
    await claimPost({ request: asReq("t1", { professorName: "Prof. A" }), env });
    const res = await adminClaimsGet({ request: asReq("admin1"), env });
    const { claims } = await res.json();
    expect(claims).toHaveLength(1);
    expect(claims[0].email).toBe("t1@example.com");
  });
});
