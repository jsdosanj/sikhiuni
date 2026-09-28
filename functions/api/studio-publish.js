// POST /api/studio-publish — the Sikhi Studio publish protocol, v1 receiver.
// Spec: sikhi.io's docs/studio/publish-protocol.md. Auth is the HMAC signature
// (see _studio-publish-verify.js) — there is no session/MFA on this route.
//
// A Studio item never goes live here directly. It lands as a `submitted`
// course_drafts row in the EXISTING review queue (functions/api/review/*.js) —
// a scholar (or admin) must approve it, same as any teacher-authored draft.
// See docs/DEPLOY.md "Sikhi Studio publishing" for the STUDIO_PUBLISH_SECRET /
// STUDIO_PUBLISH_TOPIC setup and the migration this route needs.
import { json, newId, logEvent } from "./_lib.js";
import { verifyStudioRequest } from "./_studio-publish-verify.js";
import { sanitizeLessonHtml } from "./_sanitize-html.js";

// Generic Sikhi topic for Studio-published courses (books/audio/video from any
// org, not necessarily doctrine-specific) — chosen from the live topic list
// (web/src/data.../courses.json `topics`) rather than invented. Overridable
// per-deploy via STUDIO_PUBLISH_TOPIC.
const DEFAULT_TOPIC = "spirituality";
const LEVEL = 100; // validateDraft requires a hundred-level integer; Studio items are all intro-level for now.
// Per-course URL (web/src/pages/course/[id].astro exists), preferred over the
// bare catalogue link the protocol doc offers as a fallback.
const COURSE_URL_BASE = "https://sikhiuni.com/course/";
const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const MAX_LESSON_HTML_BYTES = 1.5 * 1024 * 1024;

// Drafts we may safely overwrite in place on a re-publish (never touched a
// human reviewer's decision, or never reached one) — as opposed to 'approved'
// or 'published', which get a NEW draft instead so a decided/live course is
// never silently rewritten. 'withdrawn' is included: it means OUR own earlier
// unpublish set it aside pre-publish (see handleUnpublish below), so reviving
// it in place is the same case as 'draft'/'changes_requested', not the
// approved/published one.
const REPLACEABLE_STATUSES = new Set(["draft", "submitted", "in_review", "changes_requested", "withdrawn"]);

async function ensure(env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS studio_inbound (publication_id TEXT PRIMARY KEY, org_id TEXT NOT NULL, org_name TEXT, " +
    "item_id TEXT, draft_id TEXT, course_id TEXT, seq INTEGER NOT NULL, revision INTEGER, content_sha256 TEXT, " +
    "state TEXT NOT NULL DEFAULT 'active', last_status TEXT, received_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)"
  ).run();
}

// --- plain-text -> lesson HTML -----------------------------------------------
// Builds from scratch (the package's `text` fields are plain text, per spec) so
// the escaping is ours to get right, then the WHOLE composed string still runs
// through sanitizeLessonHtml() before storage — belt and braces, and it means a
// stray literal "<" in a unit's text can never be misread as a tag.

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// One <p> per blank-line-separated paragraph; a single newline inside a
// paragraph becomes <br>. `attrs` (e.g. ' class="gur" lang="pa"') is appended
// to every <p> tag it produces.
function paragraphsHtml(text, attrs) {
  return String(text)
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p${attrs || ""}>${escapeHtml(p).replace(/\r?\n/g, "<br>")}</p>`)
    .join("");
}

// The sanitizer's allowlist has no <div>, and only accepts lang="pa" (the
// codebase's real Gurmukhi-marking convention is `<p class="gur" lang="pa">`,
// not a wrapping div — see _sanitize-html.js's own allowlist notes). Gurmukhi
// is rendered that way here rather than the div the protocol doc's prose
// mentions, since a div would simply be unwrapped by the sanitizer and lose
// the "own block" framing entirely.
function unitBodyHtml(unit, sourceLanguage) {
  const text = (unit && unit.text) || {};
  const english = typeof text.en === "string" ? text.en.trim() : "";
  const gurmukhiSrc = typeof text.pa === "string"
    ? text.pa
    : (sourceLanguage === "pa" && typeof text[sourceLanguage] === "string" ? text[sourceLanguage] : "");
  const gurmukhi = gurmukhiSrc.trim();
  let html = "";
  if (english) html += paragraphsHtml(english, "");
  if (gurmukhi) html += paragraphsHtml(gurmukhi, ' class="gur" lang="pa"');
  if (!english && !gurmukhi) {
    const source = typeof text[sourceLanguage] === "string" ? text[sourceLanguage].trim() : "";
    // The sanitizer only preserves lang="pa"; any other language code is
    // dropped by _sanitize-html.js's own allowlist, so this can't carry a
    // per-language lang attribute the way the protocol doc's prose suggests —
    // the text still shows, just without that marking.
    if (source) html += paragraphsHtml(source, "");
  }
  return html;
}

function unitHtml(unit, sourceLanguage) {
  const body = unitBodyHtml(unit, sourceLanguage);
  if (!body) return "";
  const label = unit && unit.label ? String(unit.label).trim() : "";
  return (label ? `<h4>${escapeHtml(label)}</h4>` : "") + body;
}

function unitHasText(unit) {
  const t = (unit && unit.text) || {};
  return Object.keys(t).some((k) => typeof t[k] === "string" && t[k].trim());
}

// Lesson 1's honesty notice: "Created by AI-assisted tools" plus attribution,
// licence, the optional source label (transcription/OCR), and one line per
// machine-translated language.
function noticeHtml(labels) {
  const parts = ["<p><strong>Created by AI-assisted tools.</strong></p>"];
  if (labels.attribution) parts.push(`<p>${escapeHtml(labels.attribution)}</p>`);
  if (labels.licence) parts.push(`<p>${escapeHtml(labels.licence)}</p>`);
  if (labels.source) parts.push(`<p>${escapeHtml(labels.source)}</p>`);
  for (const mt of Array.isArray(labels.machineTranslated) ? labels.machineTranslated : []) {
    if (mt && mt.label) parts.push(`<p>${escapeHtml(mt.label)}</p>`);
  }
  return parts.join("");
}

// --- ids ----------------------------------------------------------------

function slug(s, max) {
  return (
    String(s || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, max) || "x"
  );
}

// A short, stable (non-cryptographic) suffix from the publicationId, so the
// same publication always maps to the same course_id across every revision.
function stableSuffix(s) {
  let h = 0;
  const str = String(s || "");
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// One service (author) user per org — never a real person's login. `.invalid`
// (RFC 2606) is deliberate: it can never be a deliverable mailbox, so a
// password-reset or notification email can never reach anyone by accident.
async function ensureServiceUser(env, org) {
  const org2 = org || {};
  const id = `studio-${slug(org2.id || org2.slug || org2.name, 80)}`;
  const email = `${id}@sikhi-studio.invalid`;
  const name = `${String(org2.name || org2.id || "Sikhi Studio").trim().slice(0, 150)} (via Sikhi Studio)`;
  await env.DB.prepare(
    "INSERT INTO users (id, email, name, role, created_at, email_verified) VALUES (?,?,?,?,?,1) " +
    "ON CONFLICT(id) DO UPDATE SET name=excluded.name"
  ).bind(id, email, name, "teacher", Date.now()).run();
  return id;
}

function buildRecord(draft) {
  return { id: draft.id, courseId: draft.course_id, reviewStatus: draft.status, url: COURSE_URL_BASE + encodeURIComponent(draft.course_id) };
}

// Upserts the idempotency row. Fields not known on this call (e.g. org_id on
// an unpublish, which carries no package) are passed as null/undefined and
// COALESCEd against the existing row rather than overwriting it with NULL —
// studio_inbound.org_id is NOT NULL, so a bare overwrite would fail the very
// first unpublish.
async function upsertInbound(env, row) {
  const now = Date.now();
  await env.DB.prepare(
    "INSERT INTO studio_inbound (publication_id, org_id, org_name, item_id, draft_id, course_id, seq, revision, content_sha256, state, last_status, received_at, updated_at) " +
    "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) " +
    "ON CONFLICT(publication_id) DO UPDATE SET " +
    "org_id=COALESCE(excluded.org_id, studio_inbound.org_id), org_name=COALESCE(excluded.org_name, studio_inbound.org_name), " +
    "item_id=COALESCE(excluded.item_id, studio_inbound.item_id), draft_id=COALESCE(excluded.draft_id, studio_inbound.draft_id), " +
    "course_id=COALESCE(excluded.course_id, studio_inbound.course_id), seq=excluded.seq, " +
    "revision=COALESCE(excluded.revision, studio_inbound.revision), content_sha256=COALESCE(excluded.content_sha256, studio_inbound.content_sha256), " +
    "state=excluded.state, last_status=excluded.last_status, updated_at=excluded.updated_at"
  ).bind(
    row.publicationId, row.orgId || null, row.orgName || null, row.itemId || null, row.draftId || null,
    row.courseId || null, row.seq, row.revision != null ? row.revision : null, row.contentSha256 || null,
    row.state, row.lastStatus, now, now
  ).run();
}

export async function onRequestPost({ request, env }) {
  const secret = env.STUDIO_PUBLISH_SECRET;
  const raw = new Uint8Array(await request.arrayBuffer());
  const verified = await verifyStudioRequest(request, raw, secret);
  if (!verified.ok) return json({ code: verified.code }, verified.status);
  const body = verified.body;

  const seq = Number(body.seq);
  if (!Number.isFinite(seq) || seq < 0 || (body.action !== "publish" && body.action !== "unpublish")) {
    return json({ code: "invalid_body" }, 400);
  }

  await ensure(env);
  const publicationId = body.publicationId;
  const row = await env.DB.prepare("SELECT * FROM studio_inbound WHERE publication_id=?").bind(publicationId).first();

  // Idempotency, before anything else: a retry of the exact same (publicationId, seq)
  // is a no-op regardless of action, per the protocol's response table.
  if (row && seq === row.seq) {
    const draft = row.draft_id ? await env.DB.prepare("SELECT * FROM course_drafts WHERE id=?").bind(row.draft_id).first() : null;
    return json({ ok: true, status: "unchanged", ...(draft ? { record: buildRecord(draft) } : {}) });
  }
  if (row && seq < row.seq) {
    return json({ code: "stale_seq", currentSeq: row.seq }, 409);
  }

  const priorDraft = row && row.draft_id ? await env.DB.prepare("SELECT * FROM course_drafts WHERE id=?").bind(row.draft_id).first() : null;

  if (body.action === "unpublish") return handleUnpublish(env, body, row, priorDraft, publicationId, seq);
  return handlePublish(env, body, row, priorDraft, publicationId, seq);
}

async function handleUnpublish(env, body, row, draft, publicationId, seq) {
  if (!row || !draft) {
    if (row) await upsertInbound(env, { publicationId, seq, state: "withdrawn", lastStatus: "not_found" });
    return json({ ok: true, status: "not_found" });
  }

  const now = Date.now();
  let status;
  if (draft.status === "published") {
    const dup = await env.DB.prepare(
      "SELECT id FROM course_archive_requests WHERE course_id=? AND status='pending'"
    ).bind(draft.course_id).first();
    if (!dup) {
      const reasonSuffix = body.reason ? `: ${String(body.reason).trim().slice(0, 500)}` : "";
      await env.DB.prepare(
        "INSERT INTO course_archive_requests (id, course_id, teacher_id, reason, status, requested_at) VALUES (?,?,?,?,'pending',?)"
      ).bind(newId(), draft.course_id, draft.author_id, `Withdrawn from Sikhi Studio${reasonSuffix}`, now).run();
    }
    status = "archive_requested";
  } else {
    await env.DB.prepare("UPDATE course_drafts SET status='withdrawn', updated_at=? WHERE id=?").bind(now, draft.id).run();
    status = "withdrawn";
  }

  await logEvent(env, null, "studio_unpublish", draft.id, publicationId);
  await upsertInbound(env, { publicationId, seq, state: "withdrawn", lastStatus: status, draftId: draft.id, courseId: draft.course_id });
  const fresh = await env.DB.prepare("SELECT * FROM course_drafts WHERE id=?").bind(draft.id).first();
  return json({ ok: true, status, record: buildRecord(fresh) });
}

async function handlePublish(env, body, row, priorDraft, publicationId, seq) {
  const pkg = body.package;
  if (!pkg || typeof pkg !== "object" || !pkg.org || !pkg.course) {
    return json({ code: "invalid_package", errors: ["package, package.org and package.course are required"] }, 422);
  }

  const sourceLanguage = typeof pkg.sourceLanguage === "string" ? pkg.sourceLanguage : "en";
  const lessonsIn = Array.isArray(pkg.course.lessons) ? pkg.course.lessons : [];
  const errors = [];
  if (lessonsIn.length === 0) errors.push("package.course.lessons must be a non-empty array");
  lessonsIn.forEach((lesson, i) => {
    const units = Array.isArray(lesson.units) ? lesson.units : [];
    if (!units.some(unitHasText)) errors.push(`lesson ${i + 1} has no text`);
  });
  if (errors.length) return json({ code: "invalid_package", errors }, 422);

  // Same content re-sent at a higher seq is a no-op — UNLESS the publication
  // was previously withdrawn (see REPLACEABLE_STATUSES): that's a genuine
  // republish and must revive the draft, not just bump the counter.
  const sameContent = !!(
    priorDraft && priorDraft.status !== "withdrawn" &&
    row.content_sha256 && pkg.contentSha256 && row.content_sha256 === pkg.contentSha256
  );
  if (sameContent) {
    await upsertInbound(env, { publicationId, seq, state: "active", lastStatus: "unchanged", revision: pkg.revision, contentSha256: pkg.contentSha256 });
    return json({ ok: true, status: "unchanged", record: buildRecord(priorDraft) });
  }

  const labels = pkg.labels || {};
  const notice = noticeHtml(labels);
  const youtubeId = pkg.media && typeof pkg.media.youtubeId === "string" && YOUTUBE_ID_RE.test(pkg.media.youtubeId)
    ? pkg.media.youtubeId
    : null;

  const lessons = lessonsIn.map((lesson, i) => {
    const units = Array.isArray(lesson.units) ? lesson.units : [];
    const bodyHtml = units.map((u) => unitHtml(u, sourceLanguage)).join("");
    const prefix = i === 0 ? notice + (youtubeId ? `<p>[[youtube:${youtubeId}]]</p>` : "") : "";
    const html = sanitizeLessonHtml(prefix + bodyHtml);
    const title = String(lesson.title || `Lesson ${i + 1}`).trim().slice(0, 200) || `Lesson ${i + 1}`;
    return { title, html };
  });
  lessons.forEach((ls, i) => {
    if (!ls.html.trim()) errors.push(`lesson ${i + 1} has no text`);
    else if (new TextEncoder().encode(ls.html).length > MAX_LESSON_HTML_BYTES) {
      errors.push(`lesson ${i + 1} html exceeds 1.5MB after sanitization`);
    }
  });
  if (errors.length) return json({ code: "invalid_package", errors }, 422);

  const authorId = await ensureServiceUser(env, pkg.org);
  const now = Date.now();
  const title = String(pkg.course.title || "Untitled course").trim().slice(0, 200) || "Untitled course";
  const topic = env.STUDIO_PUBLISH_TOPIC || DEFAULT_TOPIC;
  const meta = JSON.stringify({
    summary: String(pkg.course.summary || "").trim().slice(0, 1000),
    outcomes: [], terms: [], references: [],
    aiAssisted: true,
    source: "sikhi-studio",
    attribution: labels.attribution || null,
    licence: labels.licence || null,
    machineTranslated: Array.isArray(labels.machineTranslated) ? labels.machineTranslated : [],
    studio: {
      publicationId, orgId: pkg.org.id, orgName: pkg.org.name,
      itemId: pkg.item && pkg.item.id, revision: pkg.revision, seq,
      provenance: pkg.provenance || null,
    },
  });

  let draftId, courseId, statusOut;

  if (!row) {
    // Publish, new publicationId.
    courseId = `studio-${slug(pkg.org.slug || pkg.org.id, 40)}-${slug(pkg.course.title, 40)}-${stableSuffix(publicationId)}`.slice(0, 120);
    draftId = newId();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO course_drafts (id, author_id, base_course_id, course_id, title, topic, level, meta, status, submitted_at, created_at, updated_at) " +
        "VALUES (?,?,NULL,?,?,?,?,?,'submitted',?,?,?)"
      ).bind(draftId, authorId, courseId, title, topic, LEVEL, meta, now, now, now),
      ...lessons.map((ls, i) =>
        env.DB.prepare(
          "INSERT INTO draft_lessons (draft_id, idx, title, summary, html, media, updated_at) VALUES (?,?,?,?,?,?,?)"
        ).bind(draftId, i, ls.title, null, ls.html, null, now)
      ),
    ]);
    statusOut = "created";
  } else if (priorDraft && REPLACEABLE_STATUSES.has(priorDraft.status)) {
    // Publish, higher seq, still pre-decision: replace in place.
    draftId = priorDraft.id;
    courseId = priorDraft.course_id;
    await env.DB.batch([
      env.DB.prepare("DELETE FROM draft_lessons WHERE draft_id=?").bind(draftId),
      ...lessons.map((ls, i) =>
        env.DB.prepare(
          "INSERT INTO draft_lessons (draft_id, idx, title, summary, html, media, updated_at) VALUES (?,?,?,?,?,?,?)"
        ).bind(draftId, i, ls.title, null, ls.html, null, now)
      ),
      env.DB.prepare(
        "UPDATE course_drafts SET title=?, meta=?, status='submitted', submitted_at=?, updated_at=?, review_notes=NULL, reviewed_by=NULL, reviewed_at=NULL WHERE id=?"
      ).bind(title, meta, now, now, draftId),
    ]);
    statusOut = "updated";
  } else {
    // Already 'approved' or 'published' (or the draft this row pointed at is
    // gone) — a decided/live course must never be silently rewritten, so this
    // is a NEW draft, a revision of the same course_id (the repo's existing
    // revision model: base_course_id points at the course being edited, and
    // its course_id matches so an approved revision replaces it in place —
    // see functions/api/admin/drafts-export.js + scripts/import_drafts.py).
    courseId = priorDraft ? priorDraft.course_id : row.course_id;
    draftId = newId();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO course_drafts (id, author_id, base_course_id, course_id, title, topic, level, meta, status, submitted_at, created_at, updated_at) " +
        "VALUES (?,?,?,?,?,?,?,?,'submitted',?,?,?)"
      ).bind(draftId, authorId, courseId, courseId, title, topic, LEVEL, meta, now, now, now),
      ...lessons.map((ls, i) =>
        env.DB.prepare(
          "INSERT INTO draft_lessons (draft_id, idx, title, summary, html, media, updated_at) VALUES (?,?,?,?,?,?,?)"
        ).bind(draftId, i, ls.title, null, ls.html, null, now)
      ),
    ]);
    statusOut = "updated";
  }

  await logEvent(env, null, "studio_publish", draftId, publicationId);
  await upsertInbound(env, {
    publicationId, seq, state: "active", lastStatus: statusOut, draftId, courseId,
    orgId: pkg.org.id, orgName: pkg.org.name, itemId: pkg.item && pkg.item.id,
    revision: pkg.revision, contentSha256: pkg.contentSha256,
  });

  const fresh = await env.DB.prepare("SELECT * FROM course_drafts WHERE id=?").bind(draftId).first();
  return json({ ok: true, status: statusOut, record: buildRecord(fresh) });
}
