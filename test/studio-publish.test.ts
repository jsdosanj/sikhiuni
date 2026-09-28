// Sikhi Studio publish protocol, v1 — signature verification + the receiver
// route (functions/api/studio-publish.js). Real handlers, a hand-built
// stateful fake D1 (same pattern as test/studio-review.test.ts), and the
// protocol doc's own test vector.
import { describe, it, expect, beforeEach } from "vitest";
import { canonicalString, sign, verifyStudioRequest } from "../functions/api/_studio-publish-verify.js";
import { onRequestPost as studioPublishPost } from "../functions/api/studio-publish.js";
import { onRequestGet as reviewQueueGet } from "../functions/api/review/queue.js";

const SECRET = "test-secret-0123456789abcdef0123456789abcdef";
const URL_STR = "http://localhost/api/studio-publish";

function fakeDB() {
  const users = new Map<string, any>();
  const sessions = new Map<string, any>();
  const drafts = new Map<string, any>();
  const lessons = new Map<string, any[]>();
  const inbound = new Map<string, any>();
  const archiveRequests: any[] = [];

  function handleFirst(sql: string, b: any[]) {
    if (sql.includes("FROM sessions s JOIN users u")) {
      const [sid, now] = b;
      const s = sessions.get(sid);
      if (!s || s.expires_at <= now) return null;
      const u = users.get(s.user_id);
      return u ? { id: u.id, email: u.email, name: u.name, role: u.role, mfa_ok: s.mfa_ok } : null;
    }
    if (sql.includes("SELECT * FROM studio_inbound WHERE publication_id=?")) return inbound.get(b[0]) || null;
    if (sql.includes("SELECT * FROM course_drafts WHERE id=?")) return drafts.get(b[0]) || null;
    if (sql.includes("SELECT id FROM course_archive_requests WHERE course_id=? AND status='pending'")) {
      const found = archiveRequests.find((r) => r.course_id === b[0] && r.status === "pending");
      return found ? { id: found.id } : null;
    }
    return null;
  }

  function handleRun(sql: string, b: any[]) {
    if (sql.startsWith("CREATE TABLE")) return { success: true };
    if (sql.includes("INSERT INTO users")) {
      const [id, email, name, role, created_at] = b;
      const existing = users.get(id);
      if (existing) existing.name = name;
      else users.set(id, { id, email, name, role, created_at, email_verified: 1 });
      return { success: true };
    }
    if (sql.includes("INSERT INTO course_drafts (id, author_id, base_course_id, course_id, title, topic, level, meta, status, submitted_at, created_at, updated_at)")) {
      if (b.length === 10) {
        const [id, author_id, course_id, title, topic, level, meta, submitted_at, created_at, updated_at] = b;
        drafts.set(id, { id, author_id, base_course_id: null, course_id, title, topic, level, meta, status: "submitted", visibility: "public", review_notes: null, reviewed_by: null, reviewed_at: null, submitted_at, created_at, updated_at });
      } else {
        const [id, author_id, base_course_id, course_id, title, topic, level, meta, submitted_at, created_at, updated_at] = b;
        drafts.set(id, { id, author_id, base_course_id, course_id, title, topic, level, meta, status: "submitted", visibility: "public", review_notes: null, reviewed_by: null, reviewed_at: null, submitted_at, created_at, updated_at });
      }
      lessons.set(b[0], []);
      return { success: true };
    }
    if (sql.includes("DELETE FROM draft_lessons")) { lessons.set(b[0], []); return { success: true }; }
    if (sql.includes("INSERT INTO draft_lessons")) {
      const [draft_id, idx, title, summary, html, media, updated_at] = b;
      const arr = lessons.get(draft_id) || [];
      arr.push({ idx, title, summary, html, media, updated_at });
      lessons.set(draft_id, arr);
      return { success: true };
    }
    if (sql.includes("UPDATE course_drafts SET title=?, meta=?, status='submitted'")) {
      const [title, meta, submitted_at, updated_at, id] = b;
      Object.assign(drafts.get(id), { title, meta, status: "submitted", submitted_at, updated_at, review_notes: null, reviewed_by: null, reviewed_at: null });
      return { success: true };
    }
    if (sql.includes("UPDATE course_drafts SET status='withdrawn'")) {
      const [updated_at, id] = b;
      Object.assign(drafts.get(id), { status: "withdrawn", updated_at });
      return { success: true };
    }
    if (sql.includes("INSERT INTO course_archive_requests")) {
      const [id, course_id, teacher_id, reason, requested_at] = b;
      archiveRequests.push({ id, course_id, teacher_id, reason, status: "pending", requested_at });
      return { success: true };
    }
    if (sql.includes("INSERT INTO studio_inbound")) {
      const [publication_id, org_id, org_name, item_id, draft_id, course_id, seq, revision, content_sha256, state, last_status, received_at, updated_at] = b;
      const existing = inbound.get(publication_id);
      inbound.set(publication_id, {
        publication_id,
        org_id: org_id != null ? org_id : existing?.org_id,
        org_name: org_name != null ? org_name : existing?.org_name,
        item_id: item_id != null ? item_id : existing?.item_id,
        draft_id: draft_id != null ? draft_id : existing?.draft_id,
        course_id: course_id != null ? course_id : existing?.course_id,
        seq,
        revision: revision != null ? revision : existing?.revision,
        content_sha256: content_sha256 != null ? content_sha256 : existing?.content_sha256,
        state, last_status,
        received_at: existing ? existing.received_at : received_at,
        updated_at,
      });
      return { success: true };
    }
    return { success: true };
  }

  function handleAll(sql: string, b: any[]) {
    if (sql.includes("FROM course_drafts cd JOIN users u") && !sql.includes("reviewed_by IS NOT NULL")) {
      const list = [...drafts.values()]
        .filter((d) => d.status === "submitted" || d.status === "in_review")
        .map((d) => ({ ...d, author_email: users.get(d.author_id)?.email, author_name: users.get(d.author_id)?.name }));
      return { results: list };
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
  const DB: any = { prepare };
  DB.batch = async (statements: any[]) => { const out = []; for (const s of statements) out.push(await s.run()); return out; };
  return { DB, users, sessions, drafts, lessons, inbound, archiveRequests };
}

function makeEnv(secret: string | undefined = SECRET, topic?: string) {
  const fake = fakeDB();
  const env: any = { DB: fake.DB, STUDIO_PUBLISH_SECRET: secret };
  if (topic) env.STUDIO_PUBLISH_TOPIC = topic;
  return { env, fake };
}

function seedAdmin(fake: ReturnType<typeof fakeDB>, id = "admin1") {
  fake.users.set(id, { id, email: id + "@example.com", name: "Admin", role: "admin" });
  fake.sessions.set("sid-" + id, { user_id: id, expires_at: Date.now() + 100000, mfa_ok: 1 });
  return id;
}

type PackageOpts = {
  publicationId?: string;
  title?: string;
  summary?: string;
  lessons?: any[];
  labels?: any;
  media?: any;
  contentSha256?: string;
  sourceLanguage?: string;
};

function makePackage(opts: PackageOpts = {}) {
  const lessons = opts.lessons || [
    { index: 0, title: "Pages 1-5", units: [{ id: "u1", label: "Page 1", text: { en: "Hello world.", pa: "ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ" }, quotes: [] }] },
    { index: 1, title: "Pages 6-10", units: [{ id: "u1", label: "Page 6", text: { en: "More text here." }, quotes: [] }] },
  ];
  return {
    schema: 1,
    publicationId: opts.publicationId || "pub_test",
    revision: 1,
    target: "sikhiuni",
    org: { id: "org1", name: "Test Org", slug: "test-org" },
    item: { id: "item1", kind: "text", title: "Item" },
    work: "book",
    sourceLanguage: opts.sourceLanguage || "en",
    languages: ["en"],
    course: { title: opts.title || "A New Course", summary: opts.summary || "A short course summary.", lessons },
    media: opts.media || { youtubeId: null, url: null },
    labels: opts.labels || {
      attribution: "Contributed by Test Org via Sikhi Studio",
      licence: "CC BY-SA 4.0",
      machineTranslated: [],
      aiAssisted: true,
    },
    provenance: { note: "test" },
    contentSha256: opts.contentSha256 || "deadbeef",
  };
}

async function signedRequest(env: any, bodyObj: any, opts: { timestamp?: number; publicationIdHeader?: string; tamper?: (bytes: Uint8Array) => Uint8Array; badSig?: boolean; pathname?: string } = {}) {
  const secret = env.STUDIO_PUBLISH_SECRET;
  const bodyStr = JSON.stringify(bodyObj);
  let bytes = new TextEncoder().encode(bodyStr);
  const timestamp = opts.timestamp ?? Math.floor(Date.now() / 1000);
  const publicationIdHeader = opts.publicationIdHeader ?? bodyObj.publicationId;
  const pathname = opts.pathname ?? "/api/studio-publish";

  const bodySha256Hex = await sha256Hex(bytes);
  const canonical = canonicalString({ timestamp, method: "POST", pathname, publicationId: publicationIdHeader, bodySha256Hex });
  let signature = opts.badSig ? "v1=" + "0".repeat(64) : await sign(secret, canonical);

  if (opts.tamper) bytes = opts.tamper(bytes);

  return new Request(URL_STR, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Studio-Publication": publicationIdHeader,
      "X-Studio-Timestamp": String(timestamp),
      "X-Studio-Signature": signature,
    },
    body: bytes,
  });
}

async function sha256Hex(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

describe("protocol test vector (docs/studio/publish-protocol.md)", () => {
  it("reproduces the documented canonical string, body hash and signature", async () => {
    const secret = "test-secret-0123456789abcdef0123456789abcdef";
    const timestamp = 1790000000;
    const bodyStr = '{"protocol":1,"action":"unpublish","publicationId":"pub_test","seq":2,"target":"sikhiuni","reason":"owner"}';
    const bytes = new TextEncoder().encode(bodyStr);
    const bodySha256Hex = await sha256Hex(bytes);
    expect(bodySha256Hex).toBe("ea2235f928d943c631ef6c5d97e52dadc77daa41145826a7e4b9122871b71e65");

    const canonical = canonicalString({ timestamp, method: "POST", pathname: "/api/studio-publish", publicationId: "pub_test", bodySha256Hex });
    const signature = await sign(secret, canonical);
    expect(signature).toBe("v1=52959b6495b6d6bbee767e5786a8744d2771d375a392338a9acb785b95ae0e03");

    const request = new Request(URL_STR, {
      method: "POST",
      headers: {
        "X-Studio-Publication": "pub_test",
        "X-Studio-Timestamp": String(timestamp),
        "X-Studio-Signature": signature,
      },
      body: bytes,
    });
    const result = await verifyStudioRequest(request, bytes, secret, timestamp);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.body.action).toBe("unpublish");
  });
});

describe("verifyStudioRequest", () => {
  it("missing secret -> 503 not_configured", async () => {
    const bytes = new TextEncoder().encode("{}");
    const res = await verifyStudioRequest(new Request(URL_STR, { method: "POST", body: bytes }), bytes, undefined as any);
    expect(res).toMatchObject({ ok: false, status: 503, code: "not_configured" });
  });
  it("short secret -> 503 not_configured", async () => {
    const bytes = new TextEncoder().encode("{}");
    const res = await verifyStudioRequest(new Request(URL_STR, { method: "POST", body: bytes }), bytes, "short");
    expect(res).toMatchObject({ ok: false, status: 503, code: "not_configured" });
  });
  it("stale timestamp -> 401 stale_timestamp", async () => {
    const body = { protocol: 1, action: "unpublish", publicationId: "p1", seq: 1, target: "sikhiuni" };
    const req = await signedRequest({ STUDIO_PUBLISH_SECRET: SECRET }, body, { timestamp: Math.floor(Date.now() / 1000) - 10000 });
    const bytes = new Uint8Array(await req.clone().arrayBuffer());
    const res = await verifyStudioRequest(req, bytes, SECRET);
    expect(res).toMatchObject({ ok: false, status: 401, code: "stale_timestamp" });
  });
});

describe("POST /api/studio-publish", () => {
  let env: any, fake: ReturnType<typeof fakeDB>;
  beforeEach(() => { ({ env, fake } = makeEnv()); });

  it("missing/short secret -> 503, never accepts an unsigned request", async () => {
    const { env: noSecretEnv } = makeEnv(""); // "" is falsy but not `undefined`, so the default-param never masks it
    const body = { protocol: 1, action: "publish", publicationId: "p1", seq: 1, target: "sikhiuni", package: makePackage() };
    const req = await signedRequest({ STUDIO_PUBLISH_SECRET: SECRET }, body); // signed with a real secret the receiver doesn't have
    const res = await studioPublishPost({ request: req, env: noSecretEnv });
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("not_configured");
  });

  it("tampered body -> 401 bad_signature", async () => {
    const body = { protocol: 1, action: "publish", publicationId: "p1", seq: 1, target: "sikhiuni", package: makePackage({ publicationId: "p1" }) };
    const req = await signedRequest(env, body, { tamper: (bytes) => new TextEncoder().encode(new TextDecoder().decode(bytes).replace("A New Course", "Evil Course")) });
    const res = await studioPublishPost({ request: req, env });
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("bad_signature");
  });

  it("tampered path (signature computed for a different pathname) -> 401 bad_signature", async () => {
    const body = { protocol: 1, action: "unpublish", publicationId: "p1", seq: 1, target: "sikhiuni" };
    const req = await signedRequest(env, body, { pathname: "/api/other-path" });
    const res = await studioPublishPost({ request: req, env });
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("bad_signature");
  });

  it("tampered publication id (header doesn't match what was signed) -> 401 bad_signature", async () => {
    // Signed for X-Studio-Publication: p1, but the request actually sent
    // carries p2 -- the canonical string verify() recomputes is built from
    // the REAL header, so it can never match a signature made for a
    // different one. Request objects have immutable headers once
    // constructed, so this is built directly rather than mutating a Request.
    const body = { protocol: 1, action: "unpublish", publicationId: "p1", seq: 1, target: "sikhiuni" };
    const bytes = new TextEncoder().encode(JSON.stringify(body));
    const timestamp = Math.floor(Date.now() / 1000);
    const bodySha256Hex = await sha256Hex(bytes);
    const canonical = canonicalString({ timestamp, method: "POST", pathname: "/api/studio-publish", publicationId: "p1", bodySha256Hex });
    const signature = await sign(env.STUDIO_PUBLISH_SECRET, canonical);
    const req = new Request(URL_STR, {
      method: "POST",
      headers: { "X-Studio-Publication": "p2", "X-Studio-Timestamp": String(timestamp), "X-Studio-Signature": signature },
      body: bytes,
    });
    const res = await studioPublishPost({ request: req, env });
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("bad_signature");
  });

  it("bad signature -> 401 bad_signature", async () => {
    const body = { protocol: 1, action: "unpublish", publicationId: "p1", seq: 1, target: "sikhiuni" };
    const req = await signedRequest(env, body, { badSig: true });
    const res = await studioPublishPost({ request: req, env });
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("bad_signature");
  });

  it("body.publicationId mismatching the signed header -> 400 invalid_body", async () => {
    const publicationIdHeader = "p1";
    const body = { protocol: 1, action: "unpublish", publicationId: "p2", seq: 1, target: "sikhiuni" };
    // Sign correctly for the header value p1 (a legitimate signer would never
    // do this — it proves the check is on the BODY field, not just the header).
    const req = await signedRequest(env, body, { publicationIdHeader });
    const res = await studioPublishPost({ request: req, env });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("invalid_body");
  });

  it("publish creates a submitted draft + lessons + service user, and it shows up in /api/review/queue", async () => {
    const pkg = makePackage({ publicationId: "pub_a" });
    const body = { protocol: 1, action: "publish", publicationId: "pub_a", seq: 1, target: "sikhiuni", package: pkg };
    const req = await signedRequest(env, body);
    const res = await studioPublishPost({ request: req, env });
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out).toMatchObject({ ok: true, status: "created" });
    expect(out.record.reviewStatus).toBe("submitted");

    const draft = fake.drafts.get(out.record.id);
    expect(draft).toBeTruthy();
    expect(draft.status).toBe("submitted");
    expect(draft.author_id).toBe("studio-org1");
    expect(fake.users.get("studio-org1").email).toBe("studio-org1@sikhi-studio.invalid");
    expect(fake.lessons.get(out.record.id)).toHaveLength(2);

    // Shows up in the review queue.
    const adminId = seedAdmin(fake);
    const queueRes = await reviewQueueGet({ request: new Request("http://localhost/api/review/queue", { headers: { Cookie: `su_session=sid-${adminId}` } }), env });
    const queue = await queueRes.json();
    expect(queue.drafts.map((d: any) => d.id)).toContain(out.record.id);
  });

  it("youtube token + labels land in lesson 1, and a <script> in unit text is neutralised", async () => {
    const pkg = makePackage({
      publicationId: "pub_b",
      media: { youtubeId: "dQw4w9WgXcQ", url: null },
      labels: {
        attribution: "Contributed by Test Org via Sikhi Studio",
        licence: "CC BY-SA 4.0",
        source: "Machine transcribed, reviewed by Test Org",
        machineTranslated: [{ language: "hi", label: "Machine translated, reviewed by Test Org" }],
        aiAssisted: true,
      },
      lessons: [
        { index: 0, title: "L1", units: [{ id: "u1", label: "Page 1", text: { en: "<script>alert(1)</script> Hello" }, quotes: [] }] },
        { index: 1, title: "L2", units: [{ id: "u1", label: "Page 2", text: { en: "Second lesson body." }, quotes: [] }] },
      ],
    });
    const body = { protocol: 1, action: "publish", publicationId: "pub_b", seq: 1, target: "sikhiuni", package: pkg };
    const req = await signedRequest(env, body);
    const res = await studioPublishPost({ request: req, env });
    const out = await res.json();
    expect(res.status).toBe(200);

    const ls = fake.lessons.get(out.record.id)!;
    const lesson1 = ls.find((l) => l.idx === 0)!;
    // Neutralised, not deleted: the literal text survives as inert, escaped
    // text (a real <script> tag -- one the sanitizer's parser would recognise
    // as markup -- is what must never appear; "alert(1)" as plain prose is
    // harmless and legitimately preserved).
    expect(lesson1.html).not.toMatch(/<script[\s>]/i);
    expect(lesson1.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(lesson1.html).toContain("Hello");
    expect(lesson1.html).toContain("Created by AI-assisted tools.");
    expect(lesson1.html).toContain("CC BY-SA 4.0");
    expect(lesson1.html).toContain("Machine transcribed, reviewed by Test Org");
    expect(lesson1.html).toContain("Machine translated, reviewed by Test Org");
    expect(lesson1.html).toContain("[[youtube:dQw4w9WgXcQ]]");
  });

  it("re-sending the same seq is a no-op (unchanged), no second draft", async () => {
    const pkg = makePackage({ publicationId: "pub_c" });
    const body = { protocol: 1, action: "publish", publicationId: "pub_c", seq: 1, target: "sikhiuni", package: pkg };
    const req1 = await signedRequest(env, body);
    const first = await (await studioPublishPost({ request: req1, env })).json();
    expect(first.status).toBe("created");
    const draftCountBefore = fake.drafts.size;

    const req2 = await signedRequest(env, body); // same seq=1 again
    const res2 = await studioPublishPost({ request: req2, env });
    const second = await res2.json();
    expect(res2.status).toBe(200);
    expect(second.status).toBe("unchanged");
    expect(second.record.id).toBe(first.record.id);
    expect(fake.drafts.size).toBe(draftCountBefore);
  });

  it("a lower seq is refused with 409 stale_seq", async () => {
    const pkg = makePackage({ publicationId: "pub_d" });
    const body1 = { protocol: 1, action: "publish", publicationId: "pub_d", seq: 3, target: "sikhiuni", package: pkg };
    await studioPublishPost({ request: await signedRequest(env, body1), env });

    const body2 = { protocol: 1, action: "publish", publicationId: "pub_d", seq: 2, target: "sikhiuni", package: pkg };
    const res = await studioPublishPost({ request: await signedRequest(env, body2), env });
    expect(res.status).toBe(409);
    const out = await res.json();
    expect(out).toMatchObject({ code: "stale_seq", currentSeq: 3 });
  });

  it("higher seq with changed content updates the SAME draft in place while it's still pre-decision", async () => {
    const pkg1 = makePackage({ publicationId: "pub_e", title: "Original Title", contentSha256: "hash1" });
    const create = await studioPublishPost({ request: await signedRequest(env, { protocol: 1, action: "publish", publicationId: "pub_e", seq: 1, target: "sikhiuni", package: pkg1 }), env });
    const created = await create.json();
    const draftId = created.record.id;
    const draftCountBefore = fake.drafts.size;

    const pkg2 = makePackage({ publicationId: "pub_e", title: "Updated Title", contentSha256: "hash2" });
    const update = await studioPublishPost({ request: await signedRequest(env, { protocol: 1, action: "publish", publicationId: "pub_e", seq: 2, target: "sikhiuni", package: pkg2 }), env });
    const updated = await update.json();
    expect(updated.status).toBe("updated");
    expect(updated.record.id).toBe(draftId); // same draft, not a new one
    expect(fake.drafts.size).toBe(draftCountBefore);
    expect(fake.drafts.get(draftId).title).toBe("Updated Title");
  });

  it("higher seq with changed content creates a NEW draft when the old one was approved or published", async () => {
    const pkg1 = makePackage({ publicationId: "pub_f", title: "V1", contentSha256: "hashv1" });
    const create = await studioPublishPost({ request: await signedRequest(env, { protocol: 1, action: "publish", publicationId: "pub_f", seq: 1, target: "sikhiuni", package: pkg1 }), env });
    const created = await create.json();
    const originalDraftId = created.record.id;
    const originalCourseId = created.record.courseId;

    // Simulate the reviewer approving and publishing it (outside this route's scope).
    fake.drafts.get(originalDraftId).status = "published";

    const pkg2 = makePackage({ publicationId: "pub_f", title: "V2", contentSha256: "hashv2" });
    const update = await studioPublishPost({ request: await signedRequest(env, { protocol: 1, action: "publish", publicationId: "pub_f", seq: 2, target: "sikhiuni", package: pkg2 }), env });
    const updated = await update.json();
    expect(updated.status).toBe("updated");
    expect(updated.record.id).not.toBe(originalDraftId); // a genuinely new draft row
    expect(updated.record.courseId).toBe(originalCourseId); // same course, so an approval replaces it in place
    const newDraft = fake.drafts.get(updated.record.id);
    expect(newDraft.base_course_id).toBe(originalCourseId);
    expect(newDraft.status).toBe("submitted");
    // The original (published) draft is untouched.
    expect(fake.drafts.get(originalDraftId).status).toBe("published");
  });

  it("unpublish sets a not-yet-published draft to withdrawn", async () => {
    const pkg = makePackage({ publicationId: "pub_g" });
    const create = await studioPublishPost({ request: await signedRequest(env, { protocol: 1, action: "publish", publicationId: "pub_g", seq: 1, target: "sikhiuni", package: pkg }), env });
    const created = await create.json();

    const un = await studioPublishPost({ request: await signedRequest(env, { protocol: 1, action: "unpublish", publicationId: "pub_g", seq: 2, target: "sikhiuni", reason: "owner" }), env });
    const out = await un.json();
    expect(un.status).toBe(200);
    expect(out.status).toBe("withdrawn");
    expect(fake.drafts.get(created.record.id).status).toBe("withdrawn");
  });

  it("unpublish on an already-published course files an archive request instead", async () => {
    const pkg = makePackage({ publicationId: "pub_h" });
    const create = await studioPublishPost({ request: await signedRequest(env, { protocol: 1, action: "publish", publicationId: "pub_h", seq: 1, target: "sikhiuni", package: pkg }), env });
    const created = await create.json();
    fake.drafts.get(created.record.id).status = "published";

    const un = await studioPublishPost({ request: await signedRequest(env, { protocol: 1, action: "unpublish", publicationId: "pub_h", seq: 2, target: "sikhiuni", reason: "item_changed" }), env });
    const out = await un.json();
    expect(out.status).toBe("archive_requested");
    expect(fake.archiveRequests).toHaveLength(1);
    expect(fake.archiveRequests[0]).toMatchObject({ course_id: created.record.courseId, status: "pending" });
    expect(fake.archiveRequests[0].reason).toContain("item_changed");
    // The draft itself is untouched (still published) -- the archive workflow decides.
    expect(fake.drafts.get(created.record.id).status).toBe("published");
  });

  it("unpublish for an unknown publicationId is not_found", async () => {
    const res = await studioPublishPost({ request: await signedRequest(env, { protocol: 1, action: "unpublish", publicationId: "never-seen", seq: 1, target: "sikhiuni" }), env });
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("not_found");
  });

  it("invalid package: no lessons -> 422 invalid_package", async () => {
    const pkg = makePackage({ publicationId: "pub_i", lessons: [] });
    const res = await studioPublishPost({ request: await signedRequest(env, { protocol: 1, action: "publish", publicationId: "pub_i", seq: 1, target: "sikhiuni", package: pkg }), env });
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("invalid_package");
  });

  it("invalid package: a lesson with no text anywhere -> 422 invalid_package", async () => {
    const pkg = makePackage({
      publicationId: "pub_j",
      lessons: [{ index: 0, title: "Empty", units: [{ id: "u1", label: "Page 1", text: {}, quotes: [] }] }],
    });
    const res = await studioPublishPost({ request: await signedRequest(env, { protocol: 1, action: "publish", publicationId: "pub_j", seq: 1, target: "sikhiuni", package: pkg }), env });
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("invalid_package");
  });
});
